import { beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { actorFromPerson, createApiToken } from "@/lib/auth/access";
import { seedDemoData } from "@/lib/seed";
import { useFreshMemoryStore, type Store } from "@/lib/store";
import { TOOLS, callTool } from "@/lib/tools/registry";
import type { Actor } from "@/lib/types";

/** The MCP endpoint exercised with real JSON-RPC requests, models off. */

let store: Store;
let sara: Actor;
let writeToken: string;
let readToken: string;

function rpc(token: string | null, method: string, params: unknown = {}, id: number | null = 1): Request {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(id === null ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params }),
  });
}

async function call(token: string, name: string, args: unknown): Promise<{ isError?: boolean; text: string }> {
  const response = await POST(rpc(token, "tools/call", { name, arguments: args }));
  expect(response.status).toBe(200);
  const body = (await response.json()) as { result: { isError?: boolean; content: { text: string }[] } };
  return { isError: body.result.isError, text: body.result.content[0].text };
}

beforeAll(async () => {
  store = useFreshMemoryStore();
  await seedDemoData(store);
  sara = actorFromPerson((await store.list("people")).find((p) => p.id === "per_sara")!, "session");
  writeToken = (await createApiToken(sara, "test write", ["read", "write"])).token;
  readToken = (await createApiToken(sara, "test read", ["read"])).token;
});

describe("MCP endpoint", () => {
  it("rejects callers without a valid token", async () => {
    expect((await POST(rpc(null, "tools/list"))).status).toBe(401);
    expect((await POST(rpc("pa_not-a-real-token", "tools/list"))).status).toBe(401);
  });

  it("stores only a hash of the token", async () => {
    const raw = JSON.stringify(await store.list("tokens"));
    expect(raw).not.toContain(writeToken);
    expect(raw).not.toContain(readToken);
  });

  it("initialises and lists every tool with a schema", async () => {
    const init = await POST(rpc(writeToken, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "vitest", version: "1" } }));
    expect(init.status).toBe(200);
    const initBody = (await init.json()) as { result: { serverInfo: { name: string } } };
    expect(initBody.result.serverInfo.name).toBe("project-aid");

    const list = await POST(rpc(writeToken, "tools/list"));
    const listBody = (await list.json()) as { result: { tools: { name: string; inputSchema: { type: string }; annotations?: { readOnlyHint?: boolean } }[] } };
    expect(listBody.result.tools.map((tool) => tool.name).sort()).toEqual(TOOLS.map((tool) => tool.name).sort());
    expect(listBody.result.tools.every((tool) => tool.inputSchema.type === "object")).toBe(true);
    expect(listBody.result.tools.find((tool) => tool.name === "create_tickets")?.annotations?.readOnlyHint).toBe(false);
  });

  it("answers through the multi-agent pipeline with sources", async () => {
    const portfolio = JSON.parse((await call(readToken, "get_portfolio", {})).text) as { projects: { key: string }[] };
    expect(portfolio.projects.map((p) => p.key).sort()).toEqual(["ATLAS", "HELIX", "PULSE"]);

    const answer = JSON.parse((await call(readToken, "ask_assistant", { question: "What is at risk on Helix?", project: "HELIX" })).text) as { answer: string; sources: unknown[]; grounding: { verdict: string }; runId: string };
    expect(answer.sources.length).toBeGreaterThan(0);
    expect(answer.grounding.verdict).toBe("grounded");
    const trace = JSON.parse((await call(readToken, "get_agent_run", { runId: answer.runId })).text) as { steps: { agent: string }[] };
    expect(trace.steps.map((step) => step.agent)).toContain("researcher");
  });

  it("enforces project access and token scope", async () => {
    const hidden = await call(writeToken, "get_project_status", { project: "ORBIT" });
    expect(hidden.isError).toBe(true);
    expect(hidden.text).not.toMatch(/Blue Harbor/);

    const before = (await store.list("notes")).length;
    const denied = await call(readToken, "add_note", { project: "ATLAS", body: "Should not be saved" });
    expect(denied.isError).toBe(true);
    expect((await store.list("notes")).length).toBe(before);

    const allowed = await call(writeToken, "add_note", { project: "ATLAS", body: "Saved through MCP" });
    expect(allowed.isError).toBeFalsy();
    expect((await store.list("notes")).length).toBe(before + 1);
  });

  it("drafts tickets without creating them, then creates on an explicit call", async () => {
    const count = async () => (await store.list("tickets")).filter((ticket) => ticket.projectId === "prj_atlas").length;
    const before = await count();
    const drafted = JSON.parse(
      (await call(writeToken, "draft_tickets_from_message", { project: "ATLAS", message: "1. The checkout page crashes when the basket is empty.\n2. Please add an export to CSV on the orders screen.\n3. Can we get weekly reports by email?" })).text,
    ) as { drafts: { title: string; description: string; type: string; priority: string }[] };
    expect(drafted.drafts.length).toBeGreaterThanOrEqual(2);
    expect(await count()).toBe(before);
    const created = JSON.parse((await call(writeToken, "create_tickets", { project: "ATLAS", drafts: drafted.drafts.slice(0, 2) })).text) as { created: { key: string }[] };
    expect(created.created).toHaveLength(2);
    expect(await count()).toBe(before + 2);
  });

  it("validates tool input", async () => {
    const outcome = await callTool(sara, "search_activity", { project: "ATLAS", days: 100000 });
    expect(outcome.ok).toBe(false);
    expect((await callTool(sara, "no_such_tool", {})).ok).toBe(false);
  });
});
