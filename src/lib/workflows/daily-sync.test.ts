import { beforeEach, describe, expect, it } from "vitest";
import { runDailySync } from "@/lib/workflows/daily-sync";
import { getStore, useFreshMemoryStore } from "@/lib/store";
import { DEFAULT_FEATURES, DEFAULT_PRIVACY, type Actor, type Deployment, type Person, type Project, type ProjectEvent, type Ticket } from "@/lib/types";
import { DAY, HOUR } from "@/lib/util";

const actor: Actor = { id: "u_pd", name: "Dana Director", role: "pd", via: "system", scopes: ["read", "write"] };
const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * HOUR).toISOString();

const people: Person[] = ["Ana", "Ben", "Cy"].map((name, i) => ({ id: `p${i}`, name, email: `${name.toLowerCase()}@example.com`, role: "member", handles: {}, createdAt: iso(1000) }));

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "prj_atlas", key: "ATLAS", name: "Atlas Commerce Platform", client: "Northwind", description: "", status: "active", pdIds: [actor.id],
    team: [], sources: [], deployTargets: [], features: { ...DEFAULT_FEATURES }, privacy: { ...DEFAULT_PRIVACY },
    milestones: [{ id: "m1", name: "Beta launch", dueDate: new Date(Date.now() + 5 * DAY).toISOString(), status: "in_progress" }],
    startDate: new Date(Date.now() - 60 * DAY).toISOString(), targetDate: new Date(Date.now() + 30 * DAY).toISOString(), templates: {}, notifyChannel: "in_app",
    createdAt: iso(2000), updatedAt: iso(2000), ...overrides,
  };
}

function event(i: number, patch: Partial<ProjectEvent> = {}): ProjectEvent {
  return {
    id: `evt${i}`, projectId: "prj_atlas", source: "github", kind: i % 3 === 0 ? "pull_request" : "commit", title: `Change number ${i}`, summary: `Summary of change ${i} for the project.`,
    actorId: people[i % 3].id, actorName: people[i % 3].name, occurredAt: iso(2 + i), ingestedAt: iso(1), areas: [i % 2 ? "payments" : "auth"], tags: [], importance: ((i % 5) + 1) as ProjectEvent["importance"],
    changeType: i % 2 ? "feature" : "fix", clarity: "clear", userFacing: i % 2 === 1, refs: [], summarizedBy: { provider: "heuristic", model: "rules", mode: "heuristic" }, ...patch,
  };
}

function ticket(i: number, patch: Partial<Ticket> = {}): Ticket {
  return {
    id: `t${i}`, projectId: "prj_atlas", key: `ATLAS-${i}`, title: `Ticket ${i}`, description: "A ticket", acceptanceCriteria: [], type: "feature", priority: "P2", status: "todo", labels: [],
    origin: { kind: "manual" }, createdAt: iso(500), updatedAt: iso(500), ...patch,
  };
}

async function seed(p: Project, withEvents = true) {
  const store = await getStore();
  await store.put("projects", p);
  for (const person of people) await store.put("people", person);
  if (withEvents) for (let i = 0; i < 10; i++) await store.put("events", event(i));
  const tickets = [
    ticket(1, { status: "done", closedAt: iso(5), updatedAt: iso(5) }),
    ticket(2, { status: "done", closedAt: iso(10), updatedAt: iso(10) }),
    ticket(3, { status: "blocked", updatedAt: iso(3) }),
    ticket(4, { status: "in_progress", priority: "P1" }),
    ticket(5, { createdAt: iso(4), updatedAt: iso(4) }),
    ticket(6), ticket(7), ticket(8, { status: "done", closedAt: iso(400), updatedAt: iso(400) }),
  ];
  for (const t of tickets) await store.put("tickets", t);
  const deployments: Deployment[] = [
    { id: "d1", projectId: "prj_atlas", environment: "production", provider: "simulated", status: "success", version: "1.4.0", startedAt: iso(6), finishedAt: iso(6) },
    { id: "d2", projectId: "prj_atlas", environment: "staging", provider: "simulated", status: "failed", version: "1.5.0-rc1", startedAt: iso(3), finishedAt: iso(3), logExcerpt: "build failed" },
  ];
  for (const d of deployments) await store.put("deployments", d);
}

describe("runDailySync", () => {
  beforeEach(() => {
    useFreshMemoryStore();
  });

  it("stores a grounded digest whose citations point at real records", async () => {
    const p = project();
    await seed(p);
    const digest = await runDailySync({ project: p, actor, trigger: "manual", date: "2026-11-16" });
    const store = await getStore();
    expect(await store.get("digests", "dig_prj_atlas_2026-11-16")).toEqual(digest);
    expect(digest.stats.events).toBe(10);
    expect(digest.stats.ticketsClosed).toBe(2);
    expect(digest.stats.deployments).toBe(2);
    expect(digest.risks.length).toBeGreaterThan(0);
    expect(digest.citations.length).toBeGreaterThan(0);
    const events = new Set((await store.list("events")).map((e) => e.id));
    const tickets = new Set((await store.list("tickets")).map((t) => t.id));
    const deps = new Set((await store.list("deployments")).map((d) => d.id));
    for (const c of digest.citations) {
      const pool = c.type === "event" ? events : c.type === "ticket" ? tickets : c.type === "deployment" ? deps : undefined;
      if (pool) expect(pool.has(c.id)).toBe(true);
      else expect(c.type).toBe("metric");
    }
    for (const card of digest.cards) {
      expect(card.eventIds.length).toBeGreaterThan(0);
      for (const id of card.eventIds) expect(events.has(id)).toBe(true);
      expect(card.contributorIds.every((id) => people.some((x) => x.id === id))).toBe(true);
    }
    const run = await store.get("runs", digest.runId ?? "");
    expect(run?.status).toBe("succeeded");
    expect(run?.grounding?.verdict).toBeDefined();
    const agents = run!.steps.filter((s) => s.mode !== "code");
    expect(agents.map((s) => s.agent).sort()).toEqual(["activity-analyst", "digest-editor", "release-notes-writer", "risk-scout"]);
    expect(agents.every((s) => s.mode === "heuristic")).toBe(true);
    expect(agents.filter((s) => s.group === "analysis")).toHaveLength(3);
    expect((await store.list("audit")).some((a) => a.action === "digest.generate")).toBe(true);
  });

  it("replaces the same digest when re-run on the same date", async () => {
    const p = project();
    await seed(p);
    const first = await runDailySync({ project: p, actor, trigger: "manual", date: "2026-11-16" });
    const second = await runDailySync({ project: p, actor, trigger: "manual", date: "2026-11-16" });
    expect(second.id).toBe(first.id);
    const store = await getStore();
    expect(await store.list("digests")).toHaveLength(1);
    expect(second.runId).not.toBe(first.runId);
  });

  it("skips the agents and says so when nothing was recorded", async () => {
    const p = project();
    await seed(p, false);
    const digest = await runDailySync({ project: p, actor, trigger: "cron" });
    expect(digest.headline).toMatch(/no recorded activity/i);
    const store = await getStore();
    const run = await store.get("runs", digest.runId ?? "");
    expect(run!.steps.some((s) => s.mode !== "code")).toBe(false);
  });

  it("produces no cards when release notes are off", async () => {
    const p = project({ features: { ...DEFAULT_FEATURES, releaseNotes: false } });
    await seed(p);
    const digest = await runDailySync({ project: p, actor, trigger: "manual" });
    expect(digest.cards).toEqual([]);
    const store = await getStore();
    const run = await store.get("runs", digest.runId ?? "");
    expect(run!.steps.some((s) => s.agent === "release-notes-writer")).toBe(false);
  });

  it("throws when daily sync is disabled", async () => {
    const p = project({ features: { ...DEFAULT_FEATURES, dailySync: false } });
    await expect(runDailySync({ project: p, actor, trigger: "manual" })).rejects.toThrow(/disabled/i);
  });
});
