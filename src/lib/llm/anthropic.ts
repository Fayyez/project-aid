import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { betaZodOutputFormat, betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { config } from "@/lib/config";
import type { Tier, Usage } from "@/lib/types";
import { LlmError, type CallMeta, type Effort, type JsonRequest, type LlmProvider, type TextRequest, type ToolLoopRequest } from "./types";

/** USD per million tokens (input, output). Used only for the cost estimate shown in run traces. */
const PRICES: [prefix: string, input: number, output: number][] = [
  ["claude-fable-5-2", 8, 40],
  ["claude-opus-5-5", 4, 20],
  ["claude-opus-5", 5, 25],
  ["claude-sonnet-5", 2, 10],
  ["claude-haiku-5-5", 0.1, 0.5],
  ["claude-haiku-4-5", 1, 5],
];

/** Models that accept the server-side refusal fallback. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const supportsFallback = (model: string) => /^claude-(opus-5|sonnet-5-5|fable-5)/.test(model);
/** `output_config.effort` is rejected by a few older models. */
const supportsEffort = (model: string) => !/^claude-(haiku-4|sonnet-4-5|opus-4-[01])/.test(model);

function usageOf(model: string, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): Usage {
  const price = PRICES.find(([prefix]) => model.startsWith(prefix));
  const inputTokens = usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  const outputTokens = usage.output_tokens;
  const costUsd = price ? (inputTokens * price[1] + outputTokens * price[2]) / 1_000_000 : 0;
  return { inputTokens, outputTokens, costUsd: Math.round(costUsd * 1e6) / 1e6 };
}

function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new LlmError("The Anthropic credential was rejected.", "auth");
  }
  if (error instanceof Anthropic.RateLimitError) return new LlmError("Rate limited by the model API.", "rate_limited");
  if (error instanceof Anthropic.BadRequestError) return new LlmError(`Model request rejected: ${error.message}`, "bad_request");
  if (error instanceof Anthropic.APIConnectionError) return new LlmError("Could not reach the model API.", "unavailable");
  if (error instanceof Anthropic.APIError) return new LlmError(`Model API error ${error.status ?? ""}: ${error.message}`, "unavailable");
  // The SDK's structured-output parser throws a plain error when the text is not valid JSON for the schema.
  if (error instanceof Error && /parse|json|schema/i.test(error.message)) return new LlmError("The model returned output that could not be parsed against the schema.", "invalid_output");
  return new LlmError(error instanceof Error ? error.message : "Unknown model error", "unknown");
}

function checkStop(stopReason: string | null | undefined): void {
  if (stopReason === "refusal") throw new LlmError("The model declined this request.", "refusal");
  if (stopReason === "max_tokens") throw new LlmError("The model ran out of output tokens.", "truncated");
}

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private client?: Anthropic;

  /** The key is read from the environment by the SDK; it is never passed through application code. */
  private get api(): Anthropic {
    return (this.client ??= new Anthropic({ timeout: 120_000, maxRetries: 1 }));
  }

  model(tier: Tier): string {
    return tier === "smart" ? config.smartModel : config.cheapModel;
  }

  private outputConfig(model: string, effort: Effort | undefined) {
    return effort && supportsEffort(model) ? { effort } : {};
  }

  /**
   * `max_tokens` covers thinking as well as the visible answer on current
   * models, so an agent's own (small) output estimate is used as a floor only.
   */
  private budget(requested: number | undefined, floor: number): number {
    return Math.max(requested ?? 0, floor);
  }

  /** Whether the server-side refusal fallback should be requested for this call. */
  private useFallback(model: string): boolean {
    return supportsFallback(model) && !this.fallbackRejected;
  }

  /**
   * Set when the API rejects the fallback option (for example an organisation
   * without access to that beta). Later calls then go out without it instead of
   * failing and silently degrading every agent to its heuristic.
   */
  private fallbackRejected = false;

  async json<T>(request: JsonRequest<T>): Promise<{ data: T } & CallMeta> {
    const model = this.model(request.tier);
    const base = {
      model,
      max_tokens: this.budget(request.maxTokens, 16000),
      system: request.system,
      messages: [{ role: "user" as const, content: request.prompt }],
    };
    const plain = async () => {
      const response = await this.api.messages.parse({
        ...base,
        output_config: { ...this.outputConfig(model, request.effort), format: zodOutputFormat(request.schema) },
      });
      checkStop(response.stop_reason);
      if (response.parsed_output == null) throw new LlmError("The model returned output that does not match the schema.", "invalid_output");
      return { data: response.parsed_output as T, provider: this.name, model: response.model, usage: usageOf(response.model, response.usage) };
    };
    try {
      if (!this.useFallback(model)) return await plain();
      try {
        // A policy decline is re-run on the model's default fallback inside the same call.
        const response = await this.api.beta.messages.parse({
          ...base,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          output_config: { ...this.outputConfig(model, request.effort), format: betaZodOutputFormat(request.schema) },
        });
        checkStop(response.stop_reason);
        if (response.parsed_output == null) throw new LlmError("The model returned output that does not match the schema.", "invalid_output");
        return { data: response.parsed_output as T, provider: this.name, model: response.model, usage: usageOf(response.model, response.usage) };
      } catch (error) {
        if (!(error instanceof Anthropic.BadRequestError)) throw error;
        this.fallbackRejected = true;
        return await plain();
      }
    } catch (error) {
      throw toLlmError(error);
    }
  }

  async text(request: TextRequest): Promise<{ text: string } & CallMeta> {
    const model = this.model(request.tier);
    const outputConfig = this.outputConfig(model, request.effort);
    const base = {
      model,
      max_tokens: this.budget(request.maxTokens, 32000),
      system: request.system,
      messages: [{ role: "user" as const, content: request.prompt }],
      ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
    };
    // The two stream types differ only in their beta block variants; read both the same way.
    const collect = async (stream: { on(event: "text", listener: (delta: string) => void): unknown; finalMessage(): Promise<{ stop_reason: string | null; model: string; content: { type: string; text?: string }[]; usage: Anthropic.Usage }> }) => {
      let streamed = false;
      if (request.onDelta) {
        stream.on("text", (delta) => {
          streamed = true;
          request.onDelta?.(delta);
        });
      }
      try {
        return await stream.finalMessage();
      } catch (error) {
        // Only a request rejected before any text was shown may be retried on the other path.
        if (streamed && error instanceof Anthropic.BadRequestError) throw new LlmError(`Model request rejected: ${error.message}`, "bad_request");
        throw error;
      }
    };
    const plain = () => collect(this.api.messages.stream(base));
    try {
      let message: Awaited<ReturnType<typeof collect>>;
      if (!this.useFallback(model)) {
        message = await plain();
      } else {
        try {
          message = await collect(this.api.beta.messages.stream({ ...base, betas: [FALLBACK_BETA], fallbacks: "default" }));
        } catch (error) {
          if (!(error instanceof Anthropic.BadRequestError)) throw error;
          this.fallbackRejected = true;
          message = await plain();
        }
      }
      checkStop(message.stop_reason);
      const text = message.content
        .map((block) => (block.type === "text" ? (block.text ?? "") : ""))
        .join("")
        .trim();
      if (!text) throw new LlmError("The model returned an empty answer.", "invalid_output");
      return { text, provider: this.name, model: message.model, usage: usageOf(message.model, message.usage) };
    } catch (error) {
      throw toLlmError(error);
    }
  }

  async toolLoop(request: ToolLoopRequest): Promise<{ text: string } & CallMeta> {
    const model = this.model(request.tier);
    const outputConfig = this.outputConfig(model, request.effort);
    const tools = request.tools.map((tool) =>
      betaZodTool({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        run: async (input) => {
          try {
            const result = await tool.run(input as Record<string, unknown>);
            request.onToolCall?.({ name: tool.name, input, ok: true });
            return result;
          } catch (error) {
            request.onToolCall?.({ name: tool.name, input, ok: false });
            return `Tool error: ${error instanceof Error ? error.message : "unknown error"}`;
          }
        },
      }),
    );
    try {
      const message = await this.api.beta.messages.toolRunner({
        model,
        max_tokens: this.budget(request.maxTokens, 16000),
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        tools,
        max_iterations: request.maxIterations ?? 6,
        ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
      });
      checkStop(message.stop_reason);
      const text = message.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("")
        .trim();
      if (!text) throw new LlmError("The investigating agent returned no findings.", "invalid_output");
      return { text, provider: this.name, model: message.model, usage: usageOf(message.model, message.usage) };
    } catch (error) {
      throw toLlmError(error);
    }
  }
}
