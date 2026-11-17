import { z } from "zod";
import type { Tier } from "@/lib/types";
import { usageFor } from "./pricing";
import { LlmError, type CallMeta, type JsonRequest, type LlmProvider, type TextRequest, type ToolLoopRequest } from "./types";

/**
 * A provider that speaks the OpenAI chat-completions wire format.
 *
 * Two things use it:
 *  - LiteLLM: a gateway in front of any model vendor (Anthropic, Azure OpenAI,
 *    Bedrock, Vertex, Ollama, ...). When LiteLLM is configured, every model
 *    call in the platform goes through it, so models, budgets, fallbacks and
 *    logging are managed in one place.
 *  - A locally hosted open model (Ollama, LM Studio, vLLM) for projects whose
 *    code must not leave the network.
 */
export interface OpenAICompatibleOptions {
  /** Shown in run traces, e.g. "litellm" or "local". */
  name: string;
  /** Read lazily so configuration changes are picked up without a restart. */
  baseUrl(): string | undefined;
  apiKey(): string | undefined;
  model(tier: Tier): string;
  /** Sampling temperature; omitted when undefined (several current models reject it). */
  temperature?: number;
  /** Floors for max_tokens. Thinking models share this budget with their reasoning. */
  minTokens: { json: number; text: number };
  /** Send OpenAI-style `reasoning_effort` (LiteLLM maps it per vendor). */
  sendReasoningEffort?: boolean;
  /** Whether the server supports tool calling. */
  tools: boolean;
  timeoutMs?: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatCompletion {
  model?: string;
  choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface StreamChunk {
  model?: string;
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

interface Completed {
  body: ChatCompletion;
  costUsd?: number;
}

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

export class OpenAICompatibleProvider implements LlmProvider {
  /** Models that rejected strict JSON schema output; they get JSON mode plus the schema in the prompt. */
  private readonly noJsonSchema = new Set<string>();

  constructor(private readonly options: OpenAICompatibleOptions) {}

  get name(): string {
    return this.options.name;
  }

  model(tier: Tier): string {
    return this.options.model(tier);
  }

  private endpoint(): string {
    const base = this.options.baseUrl();
    if (!base) throw new LlmError(`No ${this.name} endpoint is configured.`, "unavailable");
    return `${base.replace(/\/$/, "")}/chat/completions`;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const key = this.options.apiKey();
    if (key) headers.authorization = `Bearer ${key}`;
    return headers;
  }

  private async post(body: Record<string, unknown>): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(this.endpoint(), { method: "POST", headers: this.headers(), signal: AbortSignal.timeout(this.options.timeoutMs ?? 120_000), body: JSON.stringify(body) });
    } catch (error) {
      if (error instanceof LlmError) throw error;
      throw new LlmError(`Could not reach the ${this.name} endpoint.`, "unavailable");
    }
    if (response.ok) return response;
    // Error bodies can echo request content; keep only a short, single-line reason.
    const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
    if (response.status === 401 || response.status === 403) throw new LlmError(`The ${this.name} credential was rejected.`, "auth");
    if (response.status === 429) throw new LlmError(`Rate limited by ${this.name}.`, "rate_limited");
    if (response.status === 400 || response.status === 404 || response.status === 422) throw new LlmError(`${this.name} rejected the request (${response.status}): ${detail}`, "bad_request");
    throw new LlmError(`${this.name} returned ${response.status}: ${detail}`, "unavailable");
  }

  private common(tier: Tier, request: { effort?: string; maxTokens?: number }, floor: number): Record<string, unknown> {
    return {
      model: this.model(tier),
      max_tokens: Math.max(request.maxTokens ?? 0, floor),
      ...(this.options.temperature !== undefined ? { temperature: this.options.temperature } : {}),
      ...(this.options.sendReasoningEffort && request.effort ? { reasoning_effort: request.effort } : {}),
    };
  }

  private async complete(body: Record<string, unknown>): Promise<Completed> {
    const response = await this.post({ ...body, stream: false });
    // LiteLLM reports what the call cost in a response header.
    const cost = Number(response.headers.get("x-litellm-response-cost"));
    return { body: (await response.json()) as ChatCompletion, costUsd: Number.isFinite(cost) && cost > 0 ? cost : undefined };
  }

  private meta(tier: Tier, completed: Completed): CallMeta {
    const model = completed.body.model ?? this.model(tier);
    return { provider: this.name, model, usage: usageFor(model, completed.body.usage?.prompt_tokens ?? 0, completed.body.usage?.completion_tokens ?? 0, completed.costUsd) };
  }

  async json<T>(request: JsonRequest<T>): Promise<{ data: T } & CallMeta> {
    const model = this.model(request.tier);
    const schema = z.toJSONSchema(request.schema);
    const schemaText = JSON.stringify(schema);
    const base = this.common(request.tier, request, this.options.minTokens.json);
    let prompt = request.prompt;
    let issue = "";
    // One repair attempt: smaller models sometimes miss a field the first time.
    for (let attempt = 0; attempt < 2; attempt++) {
      const strict = !this.noJsonSchema.has(model);
      const system = strict ? request.system : `${request.system}\n\nReply with one JSON object only, no prose and no code fences. It must validate against this JSON Schema:\n${schemaText}`;
      const body = {
        ...base,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format: strict ? { type: "json_schema", json_schema: { name: "result", strict: true, schema } } : { type: "json_object" },
      };
      let completed: Completed;
      try {
        completed = await this.complete(body);
      } catch (error) {
        // A server or model without schema-constrained output: fall back to JSON mode, once, and remember.
        if (strict && error instanceof LlmError && error.kind === "bad_request") {
          this.noJsonSchema.add(model);
          attempt -= 1;
          continue;
        }
        throw error;
      }
      const choice = completed.body.choices?.[0];
      if (choice?.finish_reason === "content_filter") throw new LlmError("The model declined this request.", "refusal");
      const content = choice?.message?.content?.trim();
      if (!content) throw new LlmError(choice?.finish_reason === "length" ? "The model ran out of output tokens." : "The model returned an empty answer.", choice?.finish_reason === "length" ? "truncated" : "invalid_output");
      try {
        const parsed = request.schema.safeParse(JSON.parse(stripFences(content)) as unknown);
        if (parsed.success) return { data: parsed.data, ...this.meta(request.tier, completed) };
        issue = parsed.error.issues.slice(0, 5).map((entry) => `${entry.path.join(".") || "root"}: ${entry.message}`).join("; ");
      } catch {
        issue = choice?.finish_reason === "length" ? "the reply was cut off" : "the reply was not valid JSON";
      }
      prompt = `${request.prompt}\n\nYour previous reply was rejected (${issue}). Reply again with a corrected JSON object.`;
    }
    throw new LlmError(`The model did not produce valid output (${issue}).`, "invalid_output");
  }

  async text(request: TextRequest): Promise<{ text: string } & CallMeta> {
    const model = this.model(request.tier);
    const body = {
      ...this.common(request.tier, request, this.options.minTokens.text),
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.prompt },
      ],
    };
    if (!request.onDelta) {
      const completed = await this.complete(body);
      const choice = completed.body.choices?.[0];
      if (choice?.finish_reason === "content_filter") throw new LlmError("The model declined this request.", "refusal");
      const text = choice?.message?.content?.trim();
      if (!text) throw new LlmError("The model returned an empty answer.", "invalid_output");
      return { text, ...this.meta(request.tier, completed) };
    }

    const response = await this.post({ ...body, stream: true, stream_options: { include_usage: true } });
    if (!response.body) throw new LlmError(`${this.name} returned no stream.`, "unavailable");
    const headerCost = Number(response.headers.get("x-litellm-response-cost"));
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let served = model;
    let usage: StreamChunk["usage"];
    let finish: string | null | undefined;
    const reader = response.body.getReader();
    const handle = (line: string) => {
      if (!line.startsWith("data:")) return;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") return;
      let chunk: StreamChunk;
      try {
        chunk = JSON.parse(data) as StreamChunk;
      } catch {
        return;
      }
      if (chunk.model) served = chunk.model;
      if (chunk.usage) usage = chunk.usage;
      const choice = chunk.choices?.[0];
      if (choice?.finish_reason) finish = choice.finish_reason;
      const delta = choice?.delta?.content;
      if (delta) {
        text += delta;
        request.onDelta?.(delta);
      }
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        lines.forEach(handle);
      }
      if (buffer) handle(buffer);
    } catch {
      throw new LlmError(`The ${this.name} stream was interrupted.`, "unavailable");
    }
    if (finish === "content_filter") throw new LlmError("The model declined this request.", "refusal");
    if (!text.trim()) throw new LlmError("The model returned an empty answer.", "invalid_output");
    return { text: text.trim(), provider: this.name, model: served, usage: usageFor(served, usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0, Number.isFinite(headerCost) && headerCost > 0 ? headerCost : undefined) };
  }

  async toolLoop(request: ToolLoopRequest): Promise<{ text: string } & CallMeta> {
    if (!this.options.tools) throw new LlmError(`${this.name} does not support tool calling.`, "unavailable");
    const tools = request.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: z.toJSONSchema(tool.inputSchema) } }));
    const messages: ChatMessage[] = [
      { role: "system", content: request.system },
      { role: "user", content: request.prompt },
    ];
    const base = this.common(request.tier, request, this.options.minTokens.json);
    let inputTokens = 0;
    let outputTokens = 0;
    let costUsd = 0;
    let costKnown = false;
    let served = this.model(request.tier);
    const rounds = request.maxIterations ?? 6;
    for (let round = 0; round <= rounds; round++) {
      // On the last permitted round the tools are withheld, so the model has to conclude.
      const final = round === rounds;
      const completed = await this.complete({ ...base, messages, ...(final ? {} : { tools, tool_choice: "auto" }) });
      inputTokens += completed.body.usage?.prompt_tokens ?? 0;
      outputTokens += completed.body.usage?.completion_tokens ?? 0;
      if (completed.costUsd !== undefined) {
        costUsd += completed.costUsd;
        costKnown = true;
      }
      served = completed.body.model ?? served;
      const message = completed.body.choices?.[0]?.message;
      const calls = final ? [] : (message?.tool_calls ?? []);
      if (calls.length === 0) {
        const text = message?.content?.trim();
        if (!text) throw new LlmError("The investigating agent returned no findings.", "invalid_output");
        return { text, provider: this.name, model: served, usage: usageFor(served, inputTokens, outputTokens, costKnown ? costUsd : undefined) };
      }
      messages.push({ role: "assistant", content: message?.content ?? null, tool_calls: calls });
      for (const call of calls) {
        const tool = request.tools.find((candidate) => candidate.name === call.function.name);
        let result: string;
        let ok = false;
        let input: unknown = {};
        try {
          if (!tool) throw new Error(`Unknown tool "${call.function.name}"`);
          input = JSON.parse(call.function.arguments || "{}") as unknown;
          // Arguments are model output: validate before running anything.
          const parsed = tool.inputSchema.safeParse(input);
          if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error.issues.slice(0, 3).map((entry) => `${entry.path.join(".")}: ${entry.message}`).join("; ")}`);
          result = await tool.run(parsed.data as Record<string, unknown>);
          ok = true;
        } catch (error) {
          result = `Tool error: ${error instanceof Error ? error.message : "unknown error"}`;
        }
        request.onToolCall?.({ name: call.function.name, input, ok });
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }
    throw new LlmError("The investigating agent did not finish.", "invalid_output");
  }
}
