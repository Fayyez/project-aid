import type { z } from "zod";
import type { Tier, Usage } from "@/lib/types";

export type Effort = "low" | "medium" | "high";

export interface CallMeta {
  provider: string;
  model: string;
  usage: Usage;
}

export interface BaseRequest {
  tier: Tier;
  /** Stable instructions for the agent. */
  system: string;
  /** The task, including any (already redacted and wrapped) evidence. */
  prompt: string;
  effort?: Effort;
  maxTokens?: number;
}

export interface JsonRequest<T> extends BaseRequest {
  schema: z.ZodType<T>;
}

export interface TextRequest extends BaseRequest {
  /** Called with each chunk of text as it is generated. */
  onDelta?: (text: string) => void;
}

/** A read-only tool an investigating agent may call. */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  run(input: Record<string, unknown>): Promise<string>;
}

export interface ToolLoopRequest extends BaseRequest {
  tools: ToolSpec[];
  maxIterations?: number;
  onToolCall?: (call: { name: string; input: unknown; ok: boolean }) => void;
}

export interface LlmProvider {
  readonly name: string;
  model(tier: Tier): string;
  json<T>(request: JsonRequest<T>): Promise<{ data: T } & CallMeta>;
  text(request: TextRequest): Promise<{ text: string } & CallMeta>;
  /** Optional: providers without tool use fall back to the agent's deterministic path. */
  toolLoop?(request: ToolLoopRequest): Promise<{ text: string } & CallMeta>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: "refusal" | "truncated" | "invalid_output" | "rate_limited" | "auth" | "unavailable" | "bad_request" | "unknown",
  ) {
    super(message);
    this.name = "LlmError";
  }
}
