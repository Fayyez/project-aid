import fs from "node:fs";
import { afterAll, expect, it, vi } from "vitest";
import { actorFromPerson } from "@/lib/auth/access";
import { seedDemoData } from "@/lib/seed";
import { buildScenario } from "@/lib/seed/simulator";
import * as commands from "@/lib/services/commands";
import * as learning from "@/lib/services/learning";
import { useFreshMemoryStore } from "@/lib/store";
import type { AgentRun } from "@/lib/types";
import { askAssistant } from "@/lib/workflows/ask";
import { runDailySync } from "@/lib/workflows/daily-sync";
import { escalateQuestion } from "@/lib/workflows/escalate";
import { resolveIncident } from "@/lib/workflows/incident";
import { generateReport } from "@/lib/workflows/report";
import { postThreadReply } from "@/lib/workflows/threads";
import { draftTicketsFromMessage } from "@/lib/workflows/tickets";

/**
 * Measures the real prompt each agent sends, per workflow, on the demo data.
 * Every agent is routed to a gateway stub that records the request and then
 * fails, so the agent builds its actual prompt and its fallback completes the
 * workflow. Two uses:
 *  - a guard against prompt bloat (the ceilings at the end);
 *  - the input figures behind docs/COSTS.md. Print them with
 *      PRINT_SIZES=1 npx vitest run tests/prompt-sizes.test.ts
 */

interface Row {
  n: number;
  chars: number;
  tier: string;
}

const sizes: number[] = [];

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("keeps every agent prompt within its budget", async () => {
  vi.stubEnv("PROJECT_AID_LLM", "auto");
  vi.stubEnv("LITELLM_BASE_URL", "http://measure.test");
  vi.stubEnv("LITELLM_LOCAL_MODEL", "local-model");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: { content?: string }[] };
      sizes.push((body.messages ?? []).reduce((sum, message) => sum + (message.content?.length ?? 0), 0));
      return new Response("{}", { status: 503 });
    }),
  );

  const store = useFreshMemoryStore();
  await seedDemoData(store);
  const people = await store.list("people");
  const sara = actorFromPerson(people.find((person) => person.id === "per_sara")!, "session");
  const project = async (id: string) => (await store.get("projects", id))!;
  const rows: Record<string, Record<string, Row>> = {};

  const run = async (label: string, fn: () => Promise<unknown>) => {
    const before = new Set((await store.list("runs")).map((entry) => entry.id));
    sizes.length = 0;
    await fn();
    const runs = (await store.list("runs")).filter((entry) => !before.has(entry.id)).sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
    // Requests are issued in the order steps begin, so they pair up one to one.
    const steps = runs.flatMap((entry: AgentRun) => entry.steps).filter((step) => step.mode !== "code" && step.provider !== "heuristic");
    const taken = sizes.splice(0, sizes.length);
    const table = (rows[label] ??= {});
    steps.forEach((step, index) => {
      const row = (table[step.agent] ??= { n: 0, chars: 0, tier: String(step.tier) });
      row.n += 1;
      row.chars += taken[index] ?? 0;
    });
    expect(taken.length, `requests vs model-backed steps in "${label}"`).toBe(steps.length);
  };

  await run("ask: one project", () => askAssistant({ actor: sara, question: "What is blocking the lab results milestone on Helix and who owns it?", projectId: "prj_helix", trigger: "chat" }));
  await run("ask: portfolio (3 projects)", () => askAssistant({ actor: sara, question: "Which of my projects need attention this week?", trigger: "chat" }));
  await run("ingest: feature burst", () => commands.runScenario(sara, "prj_atlas", "feature-burst"));
  let incidentId = "";
  await run("incident: detection to reviewed fix", async () => {
    incidentId = (await commands.runScenario(sara, "prj_atlas", "failed-deploy")).incidents[0].id;
  });
  await run("incident: report on resolution", () => resolveIncident({ actor: sara, incidentId }));
  await run("daily sync", async () => runDailySync({ project: await project("prj_helix"), actor: sara, trigger: "manual" }));
  await run("report: progress", async () => generateReport({ project: await project("prj_helix"), actor: sara, kind: "progress", trigger: "manual" }));
  await run("message to tickets", async () => {
    const atlas = await project("prj_atlas");
    return draftTicketsFromMessage({ project: atlas, actor: sara, text: buildScenario(atlas, people, "client-message", new Date())[0].body!, trigger: "manual" });
  });
  let threadId = "";
  await run("clarifying question", async () => {
    threadId = (await commands.runScenario(sara, "prj_atlas", "unclear-change")).clarifications[0]?.id ?? "";
  });
  await run("escalation", async () => escalateQuestion({ project: await project("prj_atlas"), actor: sara, question: "Will the 3-D Secure work make the release?", trigger: "manual" }));
  expect(threadId).not.toBe("");
  await run("developer reply stored as knowledge", async () => {
    const thread = (await store.get("threads", threadId))!;
    return postThreadReply({ threadId, body: "It replaces the legacy session store; no client-visible change.", via: "reply_link", author: { id: thread.assigneeId, name: "Developer" } });
  });
  await run("learn from feedback", () => learning.reflect(sara));

  const flat = Object.entries(rows).flatMap(([workflow, table]) => Object.entries(table).map(([agent, row]) => ({ workflow, agent, tier: row.tier, calls: row.n, avgChars: Math.round(row.chars / Math.max(row.n, 1)) })));
  if (process.env.PRINT_SIZES) {
    const lines = flat.map((row) => `${row.workflow.padEnd(38)} ${row.agent.padEnd(24)} ${row.tier.padEnd(6)} calls=${String(row.calls).padStart(2)}  avg input ${String(row.avgChars).padStart(6)} chars (~${Math.round(row.avgChars / 3.5)} tokens)`);
    const text = `${lines.join("\n")}\n`;
    if (process.env.PRINT_SIZES === "1") process.stdout.write(`\n${text}`);
    else fs.writeFileSync(process.env.PRINT_SIZES, text);
  }

  // Ceilings: a summariser reads one item; no other call should exceed the evidence cap plus its instructions.
  for (const row of flat) {
    expect(row.avgChars, `${row.agent} in "${row.workflow}"`).toBeGreaterThan(200);
    expect(row.avgChars, `${row.agent} in "${row.workflow}"`).toBeLessThan(row.agent === "summarizer" ? 20_000 : 40_000);
  }
  expect(flat.map((row) => row.agent)).toEqual(expect.arrayContaining(["router", "researcher", "composer", "verifier", "summarizer", "incident-investigator", "fix-reviewer", "digest-editor", "report-writer", "ticket-extractor", "clarifier", "reflector"]));
});
