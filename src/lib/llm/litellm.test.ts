import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DEFAULT_PRIVACY } from "@/lib/types";
import { pickProvider, llmStatus } from "./index";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { usageFor } from "./pricing";
import { LlmError } from "./types";

/**
 * The OpenAI-compatible provider that fronts LiteLLM (and local models), with
 * the network stubbed. The same code was also run against a real LiteLLM proxy.
 */

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

const calls: Call[] = [];
let respond: (body: Record<string, unknown>, index: number) => Response;

const completion = (message: Record<string, unknown>, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ id: "c1", model: "anthropic/claude-haiku-5-5", choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: "stop" }], usage: { prompt_tokens: 1000, completion_tokens: 200 }, ...extra }), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });

function provider(overrides: Partial<ConstructorParameters<typeof OpenAICompatibleProvider>[0]> = {}) {
  return new OpenAICompatibleProvider({ name: "litellm", baseUrl: () => "http://gateway.test/", apiKey: () => "sk-gateway-key", model: (tier) => (tier === "smart" ? "smart-model" : "cheap-model"), minTokens: { json: 8000, text: 16000 }, tools: true, ...overrides });
}

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ url: String(input), headers, body });
      return respond(body, calls.length - 1);
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const schema = z.object({ category: z.enum(["a", "b"]), score: z.number() });

describe("structured output", () => {
  it("asks for schema-constrained JSON and validates the reply", async () => {
    respond = () => completion({ content: '{"category":"a","score":0.4}' }, {}, { "x-litellm-response-cost": "0.00042" });
    const result = await provider().json({ tier: "cheap", system: "sys", prompt: "task", schema, effort: "low", maxTokens: 500 });
    expect(result.data).toEqual({ category: "a", score: 0.4 });
    // The gateway's own cost figure is preferred over the local price table.
    expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 200, costUsd: 0.00042 });
    const [call] = calls;
    expect(call.url).toBe("http://gateway.test/chat/completions");
    expect(call.headers.authorization).toBe("Bearer sk-gateway-key");
    expect(call.body.model).toBe("cheap-model");
    expect(call.body.max_tokens).toBe(8000);
    expect(call.body.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true, schema: { type: "object" } } });
    // Sampling and reasoning parameters are opt-in: some current models reject them.
    expect(call.body).not.toHaveProperty("temperature");
    expect(call.body).not.toHaveProperty("reasoning_effort");
  });

  it("falls back to JSON mode when the model rejects schemas, and remembers", async () => {
    respond = (body) => ((body.response_format as { type: string }).type === "json_schema" ? new Response('{"error":{"message":"json_schema unsupported"}}', { status: 400 }) : completion({ content: '```json\n{"category":"b","score":1}\n```' }));
    const gateway = provider();
    expect((await gateway.json({ tier: "smart", system: "sys", prompt: "task", schema })).data.category).toBe("b");
    expect(calls).toHaveLength(2);
    expect(String((calls[1].body.messages as { content: string }[])[0].content)).toContain("JSON Schema");
    await gateway.json({ tier: "smart", system: "sys", prompt: "task", schema });
    expect(calls).toHaveLength(3);
    expect((calls[2].body.response_format as { type: string }).type).toBe("json_object");
  });

  it("gives the model one chance to repair an invalid reply", async () => {
    respond = (_body, index) => completion({ content: index === 0 ? '{"category":"zzz"}' : '{"category":"a","score":2}' });
    const result = await provider().json({ tier: "cheap", system: "sys", prompt: "task", schema });
    expect(result.data.score).toBe(2);
    expect(String((calls[1].body.messages as { content: string }[])[1].content)).toContain("previous reply was rejected");
    respond = () => completion({ content: "not json at all" });
    await expect(provider().json({ tier: "cheap", system: "sys", prompt: "task", schema })).rejects.toMatchObject({ kind: "invalid_output" });
  });

  it("maps gateway failures to typed errors without leaking the key", async () => {
    for (const [status, kind] of [[401, "auth"], [429, "rate_limited"], [503, "unavailable"]] as const) {
      respond = () => new Response('{"error":{"message":"nope"}}', { status });
      const failure = await provider().text({ tier: "cheap", system: "s", prompt: "p" }).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(LlmError);
      expect((failure as LlmError).kind).toBe(kind);
      expect((failure as LlmError).message).not.toContain("sk-gateway-key");
    }
    await expect(provider({ baseUrl: () => undefined }).text({ tier: "cheap", system: "s", prompt: "p" })).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("streaming", () => {
  it("emits chunks as they arrive and reads usage from the final chunk", async () => {
    const chunk = (delta: Record<string, unknown>, extra: Record<string, unknown> = {}) => `data: ${JSON.stringify({ model: "anthropic/claude-opus-5-5", choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`;
    const sse = [chunk({ role: "assistant", content: "" }), chunk({ content: "Helix is " }), chunk({ content: "at risk [M1]." }), `data: ${JSON.stringify({ model: "anthropic/claude-opus-5-5", choices: [], usage: { prompt_tokens: 5000, completion_tokens: 1000 } })}\n\n`, "data: [DONE]\n\n"].join("");
    // Split mid-line to prove partial frames are buffered.
    const parts = [sse.slice(0, 137), sse.slice(137)];
    respond = () => new Response(new ReadableStream({ start: (controller) => { parts.forEach((part) => controller.enqueue(new TextEncoder().encode(part))); controller.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
    const seen: string[] = [];
    const result = await provider().text({ tier: "smart", system: "s", prompt: "p", onDelta: (text) => seen.push(text) });
    expect(seen).toEqual(["Helix is ", "at risk [M1]."]);
    expect(result.text).toBe("Helix is at risk [M1].");
    expect(calls[0].body).toMatchObject({ stream: true, stream_options: { include_usage: true }, max_tokens: 16000 });
    // No gateway cost header here, so the price table is used: 5000 * $4 + 1000 * $20 per million.
    expect(result.usage).toEqual({ inputTokens: 5000, outputTokens: 1000, costUsd: 0.04 });
  });
});

describe("tool loop", () => {
  const lookup = { name: "lookup", description: "Looks up a project", inputSchema: z.object({ key: z.string() }), run: vi.fn(async (input: Record<string, unknown>) => `status of ${String(input.key)}: green`) };

  it("runs requested tools, feeds results back and returns the final text", async () => {
    respond = (_body, index) => (index === 0 ? completion({ content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "lookup", arguments: '{"key":"ATLAS"}' } }] }) : completion({ content: "- Atlas is green [M1]" }));
    const seen: string[] = [];
    const result = await provider().toolLoop({ tier: "cheap", system: "s", prompt: "p", tools: [lookup], onToolCall: (call) => seen.push(`${call.name}:${call.ok}`) });
    expect(result.text).toBe("- Atlas is green [M1]");
    expect(seen).toEqual(["lookup:true"]);
    expect(result.usage.inputTokens).toBe(2000);
    expect((calls[0].body.tools as { type: string; function: { name: string; parameters: { type: string } } }[])[0]).toMatchObject({ type: "function", function: { name: "lookup", parameters: { type: "object" } } });
    const followUp = calls[1].body.messages as { role: string; tool_call_id?: string; content: string | null }[];
    expect(followUp.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call_1", content: "status of ATLAS: green" });
  });

  it("validates tool arguments and reports unknown tools back to the model instead of running them", async () => {
    lookup.run.mockClear();
    respond = (_body, index) =>
      index === 0
        ? completion({ content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "lookup", arguments: '{"key":42}' } }, { id: "c2", type: "function", function: { name: "delete_everything", arguments: "{}" } }] })
        : completion({ content: "Could not look that up." });
    const seen: string[] = [];
    await provider().toolLoop({ tier: "cheap", system: "s", prompt: "p", tools: [lookup], onToolCall: (call) => seen.push(`${call.name}:${call.ok}`) });
    expect(lookup.run).not.toHaveBeenCalled();
    expect(seen).toEqual(["lookup:false", "delete_everything:false"]);
    const results = (calls[1].body.messages as { role: string; content: string }[]).filter((message) => message.role === "tool").map((message) => message.content);
    expect(results[0]).toContain("Invalid arguments");
    expect(results[1]).toContain("Unknown tool");
  });

  it("withholds tools on the last round so the model must conclude", async () => {
    respond = (body) => ("tools" in body ? completion({ content: null, tool_calls: [{ id: "c", type: "function", function: { name: "lookup", arguments: '{"key":"A"}' } }] }) : completion({ content: "Final answer." }));
    const result = await provider().toolLoop({ tier: "cheap", system: "s", prompt: "p", tools: [lookup], maxIterations: 2 });
    expect(result.text).toBe("Final answer.");
    expect(calls).toHaveLength(3);
    expect(calls[2].body).not.toHaveProperty("tools");
  });
});

describe("routing", () => {
  const privacy = (codeSummaryMode: "cloud" | "local" | "metadata-only") => ({ ...DEFAULT_PRIVACY, codeSummaryMode });

  it("sends every call through LiteLLM when the gateway is configured", () => {
    vi.stubEnv("PROJECT_AID_LLM", "auto");
    vi.stubEnv("ANTHROPIC_API_KEY", "set-but-unused");
    vi.stubEnv("LITELLM_BASE_URL", "http://gateway.test");
    vi.stubEnv("LITELLM_SMART_MODEL", "azure/gpt-5");
    expect(pickProvider("smart")?.name).toBe("litellm");
    expect(pickProvider("cheap")?.name).toBe("litellm");
    expect(pickProvider("smart")?.model("smart")).toBe("azure/gpt-5");
    expect(pickProvider("cheap")?.model("cheap")).toBe("anthropic/claude-haiku-5-5");
    expect(pickProvider("cheap", { handlesCode: true, privacy: privacy("cloud") })?.name).toBe("litellm");
    expect(llmStatus().label).toBe("Live AI (LiteLLM)");
  });

  it("keeps private code off cloud models whatever the gateway", () => {
    vi.stubEnv("PROJECT_AID_LLM", "auto");
    vi.stubEnv("LITELLM_BASE_URL", "http://gateway.test");
    expect(pickProvider("cheap", { handlesCode: true, privacy: privacy("metadata-only") })).toBeNull();
    // "local" mode with no local model anywhere: rules only, never the gateway's cloud model.
    expect(pickProvider("cheap", { handlesCode: true, privacy: privacy("local") })).toBeNull();
    vi.stubEnv("LITELLM_LOCAL_MODEL", "ollama/qwen2.5-coder");
    const chosen = pickProvider("cheap", { handlesCode: true, privacy: privacy("local") });
    expect(chosen?.name).toBe("litellm-local");
    expect(chosen?.model("cheap")).toBe("ollama/qwen2.5-coder");
  });

  it("uses Anthropic directly without a gateway, and nothing when switched off", () => {
    vi.stubEnv("PROJECT_AID_LLM", "auto");
    vi.stubEnv("LITELLM_BASE_URL", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "set");
    expect(pickProvider("smart")?.name).toBe("anthropic");
    vi.stubEnv("PROJECT_AID_LLM", "off");
    expect(pickProvider("smart")).toBeNull();
  });
});

describe("pricing", () => {
  it("recognises models behind a gateway prefix and leaves unknown models at zero", () => {
    expect(usageFor("anthropic/claude-haiku-5-5", 1_000_000, 1_000_000).costUsd).toBeCloseTo(0.6);
    expect(usageFor("claude-opus-5-5", 1_000_000, 0).costUsd).toBe(4);
    expect(usageFor("ollama/llama3", 1_000_000, 1_000_000).costUsd).toBe(0);
    expect(usageFor("azure/gpt-5", 10, 10, 0.123).costUsd).toBe(0.123);
  });
});
