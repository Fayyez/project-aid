import { beforeEach, describe, expect, it } from "vitest";
import { formatPeriod, generateReport } from "@/lib/workflows/report";
import { getStore, useFreshMemoryStore } from "@/lib/store";
import { DEFAULT_FEATURES, DEFAULT_PRIVACY, type Actor, type Deployment, type Incident, type Person, type Project, type ProjectEvent, type Ticket } from "@/lib/types";
import { DAY, HOUR } from "@/lib/util";

const actor: Actor = { id: "u_pd", name: "Dana Director", role: "pd", via: "system", scopes: ["read", "write"] };
const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * HOUR).toISOString();
const people: Person[] = ["Ana", "Ben", "Cy"].map((name, i) => ({ id: `p${i}`, name, email: `${name.toLowerCase()}@example.com`, role: "member", handles: {}, createdAt: iso(1000) }));

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "prj_atlas", key: "ATLAS", name: "Atlas Commerce Platform", client: "Northwind", description: "", status: "active", pdIds: [actor.id], team: [], sources: [], deployTargets: [],
    features: { ...DEFAULT_FEATURES }, privacy: { ...DEFAULT_PRIVACY },
    milestones: [{ id: "m1", name: "Beta launch", dueDate: new Date(Date.now() + 5 * DAY).toISOString(), status: "in_progress" }],
    startDate: new Date(Date.now() - 60 * DAY).toISOString(), targetDate: new Date(Date.now() + 30 * DAY).toISOString(), templates: {}, notifyChannel: "in_app", createdAt: iso(2000), updatedAt: iso(2000), ...overrides,
  };
}
function event(i: number): ProjectEvent {
  return {
    id: `evt${i}`, projectId: "prj_atlas", source: "github", kind: "commit", title: `Change number ${i}`, summary: `Summary of change ${i}.`, actorId: people[i % 3].id, actorName: people[i % 3].name,
    occurredAt: iso(5 + i * 8), ingestedAt: iso(1), areas: [i % 2 ? "payments" : "auth"], tags: [], importance: ((i % 5) + 1) as ProjectEvent["importance"], changeType: i % 2 ? "feature" : "fix",
    clarity: "clear", userFacing: i % 2 === 1, refs: [], summarizedBy: { provider: "heuristic", model: "rules", mode: "heuristic" },
  };
}
function ticket(i: number, patch: Partial<Ticket> = {}): Ticket {
  return { id: `t${i}`, projectId: "prj_atlas", key: `ATLAS-${i}`, title: `Ticket ${i}`, description: "A ticket", acceptanceCriteria: [], type: i % 2 ? "feature" : "bug", priority: "P1", status: "todo", labels: [], origin: { kind: "manual" }, createdAt: iso(300), updatedAt: iso(300), ...patch };
}
const incident: Incident = {
  id: "inc1", projectId: "prj_atlas", key: "INC-7", title: "Checkout failing after release", status: "mitigated", severity: "SEV2", detectedAt: iso(30),
  trigger: { kind: "deployment", deploymentId: "d2", detail: "failed deploy" },
  triage: { summary: "Checkout errors", suspectedCause: "A payment change released in 1.5.0", confidence: 0.7, suspectEventIds: ["evt1"], impact: "Some customers could not pay for 2 hours", nextSteps: ["Add a payment regression test"], evidence: [] },
  reviews: [], timeline: [{ at: iso(30), actor: "system", text: "Incident detected" }],
};

async function seed(p: Project) {
  const store = await getStore();
  await store.put("projects", p);
  for (const person of people) await store.put("people", person);
  for (let i = 0; i < 10; i++) await store.put("events", event(i));
  const tickets = [ticket(1, { status: "done", closedAt: iso(20), updatedAt: iso(20) }), ticket(2, { status: "done", closedAt: iso(40), updatedAt: iso(40) }), ticket(3, { status: "blocked" }), ticket(4, { status: "in_progress" }), ticket(5), ticket(6), ticket(7), ticket(8, { status: "done", closedAt: iso(900), updatedAt: iso(900) })];
  for (const t of tickets) await store.put("tickets", t);
  const deployments: Deployment[] = [
    { id: "d1", projectId: "prj_atlas", environment: "production", provider: "simulated", status: "success", version: "1.4.0", startedAt: iso(50), finishedAt: iso(50) },
    { id: "d2", projectId: "prj_atlas", environment: "production", provider: "simulated", status: "failed", version: "1.5.0", startedAt: iso(31), finishedAt: iso(31) },
  ];
  for (const d of deployments) await store.put("deployments", d);
  await store.put("incidents", incident);
}

async function checkCitations(report: Awaited<ReturnType<typeof generateReport>>) {
  const store = await getStore();
  const ids: Record<string, Set<string>> = {
    event: new Set((await store.list("events")).map((e) => e.id)),
    ticket: new Set((await store.list("tickets")).map((e) => e.id)),
    deployment: new Set((await store.list("deployments")).map((e) => e.id)),
    incident: new Set((await store.list("incidents")).map((e) => e.id)),
  };
  expect(report.citations.length).toBeGreaterThan(0);
  for (const c of report.citations) if (ids[c.type]) expect(ids[c.type].has(c.id)).toBe(true);
}

describe("generateReport", () => {
  beforeEach(() => {
    useFreshMemoryStore();
  });

  it("formats periods", () => {
    expect(formatPeriod(new Date("2026-11-09T10:00:00Z"), new Date("2026-11-16T10:00:00Z"))).toBe("9-16 Nov 2026");
    expect(formatPeriod(new Date("2026-10-28T10:00:00Z"), new Date("2026-11-04T10:00:00Z"))).toBe("28 Oct - 4 Nov 2026");
  });

  it("writes a progress report from the template with cited evidence", async () => {
    const p = project();
    await seed(p);
    const report = await generateReport({ project: p, actor, kind: "progress", trigger: "manual" });
    const store = await getStore();
    expect(await store.get("reports", report.id)).toEqual(report);
    expect(report.title).toMatch(/^Atlas Commerce Platform - Progress report, /);
    expect(report.markdown).toContain("## Executive summary");
    expect(report.markdown).toContain("Prepared by:** Dana Director");
    expect(report.markdown).not.toContain("<!--");
    expect(report.markdown).not.toContain("{{");
    expect(report.markdown).toContain("ATLAS-1");
    expect(report.markdown).toMatch(/\[[A-Z]\d+/);
    expect(report.grounding?.verdict).toBeDefined();
    expect(report.grounding?.invalidRefs).toEqual([]);
    await checkCitations(report);
    const run = await store.get("runs", report.runId ?? "");
    const agents = run!.steps.filter((s) => s.mode !== "code");
    expect(agents.map((s) => s.agent)).toEqual(["report-writer", "report-reviewer"]);
    expect(agents.every((s) => s.mode === "heuristic")).toBe(true);
    expect((await store.list("audit")).some((a) => a.action === "report.generate")).toBe(true);
  });

  it("writes release notes grouped by section", async () => {
    const p = project();
    await seed(p);
    const report = await generateReport({ project: p, actor, kind: "release_notes", trigger: "manual" });
    expect(report.kind).toBe("release_notes");
    expect(report.markdown).toContain("## New features");
    expect(report.markdown).toContain("## Fixes");
    await checkCitations(report);
  });

  it("writes an incident report and requires an incident id", async () => {
    const p = project();
    await seed(p);
    await expect(generateReport({ project: p, actor, kind: "incident", trigger: "manual" })).rejects.toThrow(/incidentId/);
    const report = await generateReport({ project: p, actor, kind: "incident", incidentId: "inc1", trigger: "manual" });
    expect(report.relatedIncidentId).toBe("inc1");
    expect(report.markdown).toContain("INC-7");
    expect(report.markdown).toContain("Some customers could not pay");
    expect(report.markdown).toContain("Add a payment regression test");
    await checkCitations(report);
  });

  it("honours a project template and says when nothing was recorded", async () => {
    const p = project({ templates: { progress: "# {{project_name}} update\n\n## Wins\n\n<!-- list wins -->\n\n## Delivered\n\n<!-- x -->\n" } });
    await seed(p);
    const report = await generateReport({ project: p, actor, kind: "progress", trigger: "manual" });
    expect(report.markdown).toContain("# Atlas Commerce Platform update");
    expect(report.markdown).toMatch(/## Wins\n\nNo recorded activity\./);
  });

  it("throws when reports are disabled", async () => {
    const p = project({ features: { ...DEFAULT_FEATURES, reports: false } });
    await expect(generateReport({ project: p, actor, kind: "progress", trigger: "manual" })).rejects.toThrow(/disabled/i);
  });
});
