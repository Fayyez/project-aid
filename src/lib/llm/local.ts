import { z } from "zod";
import { config } from "@/lib/config";
import type { Tier } from "@/lib/types";
import { LlmError, type CallMeta, type JsonRequest, type LlmProvider, type TextRequest } from "./types";

interface ChatCompletion {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * A locally hosted open model (Ollama, LM Studio, vLLM, llama.cpp server) reached
 * over the OpenAI-compatible chat API those servers expose. It is used for the
 * cheap summarisation tier when proprietary code must not leave the network.
 * It is never used to reach Claude: cloud calls go through the Anthropic SDK.
 */
export class LocalProvider implements LlmProvider {
  readonly name = "local";

  model(_tier: Tier): string {
    return config.localLlmModel;
  }

  private async chat(system: string, prompt: string, json: boolean, maxTokens: number): Promise<{ content: string } & CallMeta> {
    const baseUrl = config.localLlmBaseUrl;
    if (!baseUrl) throw new LlmError("No local model endpoint is configured.", "unavailable");
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (config.localLlmApiKey) headers.authorization = `Bearer ${config.localLlmApiKey}`;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({
          model: config.localLlmModel,
          temperature: 0.2,
          max_tokens: maxTokens,
          stream: false,
          ...(json ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
      });
    } catch {
      throw new LlmError("Could not reach the local model server.", "unavailable");
    }
    if (!response.ok) throw new LlmError(`Local model server returned ${response.status}.`, "unavailable");
    const body = (await response.json()) as ChatCompletion;
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) throw new LlmError("The local model returned an empty answer.", "invalid_output");
    return {
      content,
      provider: this.name,
      model: body.model ?? config.localLlmModel,
      usage: { inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0, costUsd: 0 },
    };
  }

  async json<T>(request: JsonRequest<T>): Promise<{ data: T } & CallMeta> {
    const schema = JSON.stringify(z.toJSONSchema(request.schema));
    const system = `${request.system}\n\nReply with one JSON object only, no prose and no code fences. It must validate against this JSON Schema:\n${schema}`;
    let prompt = request.prompt;
    let lastIssue = "";
    // One repair attempt: small local models often miss a field on the first try.
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.chat(system, prompt, true, request.maxTokens ?? 2000);
      try {
        const raw = JSON.parse(result.content.replace(/^```(?:json)?\s*|\s*```$/g, "")) as unknown;
        const parsed = request.schema.safeParse(raw);
        if (parsed.success) return { data: parsed.data, provider: result.provider, model: result.model, usage: result.usage };
        lastIssue = parsed.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
      } catch {
        lastIssue = "the reply was not valid JSON";
      }
      prompt = `${request.prompt}\n\nYour previous reply was rejected (${lastIssue}). Reply again with a corrected JSON object.`;
    }
    throw new LlmError(`The local model did not produce valid output (${lastIssue}).`, "invalid_output");
  }

  async text(request: TextRequest): Promise<{ text: string } & CallMeta> {
    const result = await this.chat(request.system, request.prompt, false, request.maxTokens ?? 2000);
    request.onDelta?.(result.content);
    return { text: result.content, provider: result.provider, model: result.model, usage: result.usage };
  }
}
