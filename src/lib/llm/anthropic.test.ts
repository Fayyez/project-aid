import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as activityAnalyst from "@/lib/agents/defs/activity-analyst";
import * as assistant from "@/lib/agents/defs/assistant";
import * as clarifier from "@/lib/agents/defs/clarifier";
import * as digestEditor from "@/lib/agents/defs/digest-editor";
import * as escalationDrafter from "@/lib/agents/defs/escalation-drafter";
import * as incident from "@/lib/agents/defs/incident";
import * as knowledgeDistiller from "@/lib/agents/defs/knowledge-distiller";
import * as reflector from "@/lib/agents/defs/reflector";
import * as releaseNotesWriter from "@/lib/agents/defs/release-notes-writer";
import * as reportReviewer from "@/lib/agents/defs/report-reviewer";
import * as reportWriter from "@/lib/agents/defs/report-writer";
import * as riskScout from "@/lib/agents/defs/risk-scout";
import * as summarizer from "@/lib/agents/defs/summarizer";
import * as ticketDeduper from "@/lib/agents/defs/ticket-deduper";
import * as ticketExtractor from "@/lib/agents/defs/ticket-extractor";
import { AGENT_CATALOG } from "@/lib/agents/runtime";
import { AnthropicProvider } from "./anthropic";
import { LlmError } from "./types";

/**
 * The live model path cannot be exercised in CI, so these tests pin down what
 * can be: every agent schema converts to a structured-output schema, and the
 * provider builds the requests and reads the responses the way the SDK expects.
 */

const modules = [activityAnalyst, assistant, clarifier, digestEditor, escalationDrafter, incident, knowledgeDistiller, reflector, releaseNotesWriter, reportReviewer, reportWriter, riskScout, summarizer, ticketDeduper, ticketExtractor];

interface AnyAgent {
  name: string;
  tier: string;
  schema?: z.ZodType;
}

const agents: AnyAgent[] = modules.flatMap((module) => Object.values(module)).filter((value): value is AnyAgent => typeof value === "object" && value !== null && "name" in value && "tier" in value && "system" in value);

describe("agent schemas", () => {
  it("finds every catalogued agent", () => {
    expect(agents.map((agent) => agent.name).sort()).toEqual(Array.from(AGENT_CATALOG.keys()).sort());
    expect(agents.length).toBeGreaterThanOrEqual(20);
  });

  it("converts each structured agent's schema to a strict JSON schema", () => {
    const unsupported = /"(minLength|maxLength|pattern|minimum|maximum|exclusiveMinimum|exclusiveMaximum|multipleOf|minItems|maxItems|default)"\s*:/;
    for (const agent of agents.filter((candidate) => candidate.schema)) {
      for (const convert of [zodOutputFormat, betaZodOutputFormat]) {
        const format = convert(agent.schema!) as { type: string; schema: Record<string, unknown> };
        expect(format.type, agent.name).toBe("json_schema");
        const json = JSON.stringify(format.schema);
        expect(format.schema.type, agent.name).toBe("object");
        expect(format.schema.additionalProperties, agent.name).toBe(false);
        // Constraints the structured-output grammar does not accept must not appear.
        expect(unsupported.test(json), `${agent.name}: ${json.match(unsupported)?.[0]}`).toBe(false);
      }
    }
  });
});

describe("AnthropicProvider request and response handling", () => {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  let respond: (body: Record<string, unknown>) => Response;

  function message(content: unknown[], extra: Record<string, unknown> = {}) {
    return { id: "msg_1", type: "message", role: "assistant", model: "claude-test", content, stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 120, output_tokens: 30 }, ...extra };
  }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": "req_test" } });

  beforeEach(() => {
    calls.length = 0;
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-real");
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://api.anthropic.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers: Record<string, string> = {};
        new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        calls.push({ url: String(input), headers, body });
        return respond(body);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const schema = z.object({ category: z.enum(["a", "b"]), score: z.number() });

  it("sends a schema-constrained request on the reasoning tier with the refusal fallback", async () => {
    respond = () => json(message([{ type: "text", text: '{"category":"a","score":0.5}' }], { model: "claude-opus-5-5" }));
    const result = await new AnthropicProvider().json({ tier: "smart", system: "sys", prompt: "task", schema, effort: "medium", maxTokens: 500 });
    expect(result.data).toEqual({ category: "a", score: 0.5 });
    expect(result.usage).toMatchObject({ inputTokens: 120, outputTokens: 30 });
    expect(result.usage.costUsd).toBeGreaterThan(0);
    const [call] = calls;
    expect(call.url).toContain("/v1/messages");
    // The SDK decides which header carries the credential; it must be sent, and only by the SDK.
    expect(`${call.headers["x-api-key"] ?? ""} ${call.headers.authorization ?? ""}`).toContain("test-key-not-real");
    expect(JSON.stringify(call.body)).not.toContain("test-key-not-real");
    expect(call.headers["anthropic-beta"]).toContain("server-side-fallback");
    expect(call.body.model).toBe("claude-opus-5-5");
    expect(call.body.fallbacks).toBe("default");
    expect(call.body.system).toBe("sys");
    // Thinking shares max_tokens, so the agent's small estimate is raised to a safe floor.
    expect(call.body.max_tokens).toBe(16000);
    expect(call.body.output_config).toMatchObject({ effort: "medium", format: { type: "json_schema" } });
    expect(call.body).not.toHaveProperty("temperature");
    expect(call.body).not.toHaveProperty("tool_choice");
  });

  it("uses the plain endpoint for the summarising tier", async () => {
    respond = () => json(message([{ type: "text", text: '{"category":"b","score":1}' }], { model: "claude-haiku-5-5" }));
    await new AnthropicProvider().json({ tier: "cheap", system: "sys", prompt: "task", schema, effort: "low" });
    expect(calls[0].body.model).toBe("claude-haiku-5-5");
    expect(calls[0].body).not.toHaveProperty("fallbacks");
    expect(calls[0].headers["anthropic-beta"] ?? "").not.toContain("server-side-fallback");
  });

  it("retries without the fallback option when the API rejects it, and remembers", async () => {
    respond = (body) => ("fallbacks" in body ? json({ type: "error", error: { type: "invalid_request_error", message: "fallbacks: unknown field" } }, 400) : json(message([{ type: "text", text: '{"category":"a","score":0.1}' }])));
    const provider = new AnthropicProvider();
    const first = await provider.json({ tier: "smart", system: "s", prompt: "p", schema });
    expect(first.data.category).toBe("a");
    expect(calls).toHaveLength(2);
    await provider.json({ tier: "smart", system: "s", prompt: "p", schema });
    expect(calls).toHaveLength(3);
    expect(calls[2].body).not.toHaveProperty("fallbacks");
  });

  it("turns refusals, truncation and bad output into typed errors", async () => {
    const provider = new AnthropicProvider();
    respond = () => json(message([], { stop_reason: "refusal" }));
    await expect(provider.json({ tier: "cheap", system: "s", prompt: "p", schema })).rejects.toMatchObject({ kind: "refusal" });
    respond = () => json(message([{ type: "text", text: '{"category":"a","score":1}' }], { stop_reason: "max_tokens" }));
    await expect(provider.json({ tier: "cheap", system: "s", prompt: "p", schema })).rejects.toMatchObject({ kind: "truncated" });
    // Output cut off mid-object cannot be parsed at all.
    respond = () => json(message([{ type: "text", text: '{"category":"a"' }], { stop_reason: "max_tokens" }));
    await expect(provider.json({ tier: "cheap", system: "s", prompt: "p", schema })).rejects.toMatchObject({ kind: "invalid_output" });
    respond = () => json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401);
    const failure = await provider.json({ tier: "cheap", system: "s", prompt: "p", schema }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(LlmError);
    expect((failure as LlmError).kind).toBe("auth");
    // The credential never appears in the error surfaced to traces.
    expect((failure as LlmError).message).not.toContain("test-key-not-real");
  });

  it("streams text and reports the chunks", async () => {
    const events = [
      { type: "message_start", message: message([], { model: "claude-haiku-5-5", stop_reason: null, usage: { input_tokens: 50, output_tokens: 0 } }) },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Helix is " } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "at risk [M1]." } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 9 } },
      { type: "message_stop" },
    ];
    respond = () => new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
    const chunks: string[] = [];
    const result = await new AnthropicProvider().text({ tier: "cheap", system: "s", prompt: "p", onDelta: (text) => chunks.push(text) });
    expect(result.text).toBe("Helix is at risk [M1].");
    expect(chunks).toEqual(["Helix is ", "at risk [M1]."]);
    expect(calls[0].body.stream).toBe(true);
    expect(result.usage.outputTokens).toBe(9);
  });

  it("runs a tool loop: executes the requested tool and returns the final text", async () => {
    let turn = 0;
    respond = () => {
      turn += 1;
      return turn === 1
        ? json(message([{ type: "tool_use", id: "toolu_1", name: "lookup", input: { key: "ATLAS" } }], { stop_reason: "tool_use" }))
        : json(message([{ type: "text", text: "- Atlas is green [M1]" }]));
    };
    const seen: string[] = [];
    const result = await new AnthropicProvider().toolLoop({
      tier: "cheap",
      system: "s",
      prompt: "p",
      tools: [{ name: "lookup", description: "Looks up a project", inputSchema: z.object({ key: z.string() }), run: async (input) => `status of ${String(input.key)}: green` }],
      onToolCall: (call) => seen.push(`${call.name}:${call.ok}`),
    });
    expect(result.text).toBe("- Atlas is green [M1]");
    expect(seen).toEqual(["lookup:true"]);
    expect(calls).toHaveLength(2);
    const tools = calls[0].body.tools as { name: string; input_schema: { type: string } }[];
    expect(tools[0]).toMatchObject({ name: "lookup", input_schema: { type: "object" } });
    const followUp = calls[1].body.messages as { role: string; content: { type: string; content?: unknown }[] }[];
    expect(followUp.at(-1)?.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
  });
});
