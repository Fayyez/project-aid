import { beforeAll, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/store/memory";
import { sha256 } from "@/lib/util";
import { DEMO_ACCOUNTS, DEMO_IDS, seedDemoData } from "./index";
import { SCENARIOS, buildScenario, simulatedConnector, simulatedDeployMonitor } from "./simulator";

const store = new MemoryStore("");

beforeAll(async () => {
  await seedDemoData(store);
});

async function all() {
  const [people, projects, events, tickets, deployments, incidents, threads, notes, digests, reports, lessons, feedback, evals] = await Promise.all([
    store.list("people"), store.list("projects"), store.list("events"), store.list("tickets"), store.list("deployments"), store.list("incidents"),
    store.list("threads"), store.list("notes"), store.list("digests"), store.list("reports"), store.list("lessons"), store.list("feedback"), store.list("evals"),
  ]);
  return { people, projects, events, tickets, deployments, incidents, threads, notes, digests, reports, lessons, feedback, evals };
}

describe("seedDemoData", () => {
  it("creates people and accounts", async () => {
    const { people } = await all();
    expect(people.filter((p) => p.role !== "member").map((p) => p.id).sort()).toEqual(["per_admin", "per_omar", "per_sara"]);
    expect(people.filter((p) => p.role === "member").length).toBeGreaterThanOrEqual(10);
    expect(people.filter((p) => p.role === "member").every((p) => !p.passwordHash)).toBe(true);
    expect(people.find((p) => p.id === "per_sara")?.passwordHash).toBeTruthy();
    expect(DEMO_ACCOUNTS).toHaveLength(3);
    expect(DEMO_IDS.projects.helix).toBe("prj_helix");
  });

  it("keeps references valid", async () => {
    const d = await all();
    const people = new Set(d.people.map((p) => p.id));
    const projects = new Set(d.projects.map((p) => p.id));
    expect(projects.size).toBe(4);
    for (const p of d.projects) {
      for (const id of p.pdIds) expect(people.has(id)).toBe(true);
      expect(p.team.length).toBeGreaterThanOrEqual(4);
      expect(p.team.length).toBeLessThanOrEqual(6);
      for (const t of p.team) expect(people.has(t.personId)).toBe(true);
      expect(p.milestones.length).toBeGreaterThanOrEqual(3);
      expect(p.sources.filter((s) => s.enabled).map((s) => s.kind)).toEqual(["simulated"]);
    }
    expect(d.projects.filter((p) => p.pdIds.includes("per_sara"))).toHaveLength(3);
    expect(d.projects.filter((p) => p.pdIds.includes("per_omar"))).toHaveLength(2);
    const eventIds = new Set(d.events.map((e) => e.id));
    expect(eventIds.size).toBe(d.events.length);
    for (const e of d.events) {
      expect(projects.has(e.projectId)).toBe(true);
      if (e.actorId) expect(people.has(e.actorId)).toBe(true);
      expect(new Date(e.occurredAt).getTime()).toBeLessThanOrEqual(Date.now());
      expect(e.summary.length).toBeGreaterThan(20);
    }
    for (const t of d.tickets) {
      expect(projects.has(t.projectId)).toBe(true);
      if (t.assigneeId) expect(people.has(t.assigneeId)).toBe(true);
      if (t.reporterId) expect(people.has(t.reporterId)).toBe(true);
      if (t.origin.kind === "message") expect(eventIds.has(t.origin.ref ?? "")).toBe(true);
    }
    const keys = d.tickets.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const dep of d.deployments) {
      expect(projects.has(dep.projectId)).toBe(true);
      if (dep.triggeredById) expect(people.has(dep.triggeredById)).toBe(true);
    }
    for (const th of d.threads) {
      expect(projects.has(th.projectId)).toBe(true);
      expect(people.has(th.assigneeId)).toBe(true);
      for (const w of th.watcherIds) expect(people.has(w)).toBe(true);
      for (const id of th.relatedEventIds) expect(eventIds.has(id)).toBe(true);
      expect(th.replyTokenHash).toBe(sha256(`demo-reply-${th.id}`));
    }
    for (const n of d.notes) {
      expect(projects.has(n.projectId)).toBe(true);
      expect(people.has(n.authorId)).toBe(true);
    }
    for (const inc of d.incidents) {
      expect(projects.has(inc.projectId)).toBe(true);
      for (const id of inc.triage?.suspectEventIds ?? []) expect(eventIds.has(id)).toBe(true);
    }
    for (const dg of d.digests) {
      expect(projects.has(dg.projectId)).toBe(true);
      for (const c of dg.cards) for (const id of c.eventIds) expect(eventIds.has(id)).toBe(true);
      for (const c of dg.citations) expect(eventIds.has(c.id)).toBe(true);
    }
  });

  it("has the expected counts per project", async () => {
    const d = await all();
    const count = <T extends { projectId: string }>(rows: T[], id: string) => rows.filter((r) => r.projectId === id).length;
    for (const id of ["prj_atlas", "prj_helix", "prj_orbit"]) {
      expect(count(d.events, id)).toBeGreaterThanOrEqual(60);
      expect(count(d.events, id)).toBeLessThanOrEqual(90);
    }
    expect(count(d.events, "prj_pulse")).toBeGreaterThanOrEqual(20);
    expect(count(d.events, "prj_pulse")).toBeLessThanOrEqual(30);
    expect(count(d.tickets, "prj_pulse")).toBe(15);
    for (const id of ["prj_atlas", "prj_helix", "prj_orbit"]) expect(count(d.tickets, id)).toBeGreaterThanOrEqual(30);
    for (const id of d.projects.map((p) => p.id)) {
      expect(count(d.deployments, id)).toBeGreaterThanOrEqual(8);
      expect(count(d.deployments, id)).toBeLessThanOrEqual(12);
    }
    expect(d.events.filter((e) => e.clarity === "unclear" && e.importance >= 4)).toHaveLength(3);
    expect(d.lessons.filter((l) => l.status === "active")).toHaveLength(2);
    expect(d.lessons.filter((l) => l.status === "proposed")).toHaveLength(1);
    expect(d.feedback.filter((f) => !f.processed && f.rating === "down" && f.comment)).toHaveLength(1);
    expect(d.evals).toHaveLength(3);
    expect(d.digests.map((x) => x.projectId).sort()).toEqual(["prj_atlas", "prj_helix"]);
  });

  it("tells each project's story", async () => {
    const d = await all();
    const weekly = (projectId: string) => {
      const out = new Array<number>(8).fill(0);
      for (const t of d.tickets.filter((x) => x.projectId === projectId && x.closedAt)) {
        const b = Math.floor((Date.now() - new Date(t.closedAt!).getTime()) / (7 * 86_400_000));
        if (b >= 0 && b < 8) out[b]++;
      }
      return out;
    };
    const atlas = weekly("prj_atlas");
    expect(atlas.every((n) => n >= 6 && n <= 8)).toBe(true);
    const helix = weekly("prj_helix");
    expect(helix[0]).toBeLessThanOrEqual(3);
    expect(helix[7]).toBeGreaterThanOrEqual(6);
    expect(weekly("prj_orbit").every((n) => n >= 4 && n <= 5)).toBe(true);
    expect(d.tickets.filter((t) => t.projectId === "prj_helix" && t.status === "blocked")).toHaveLength(2);
    const orbitDeps = d.deployments.filter((x) => x.projectId === "prj_orbit" && x.environment === "production").sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const failedIdx = orbitDeps.findIndex((x) => x.status === "failed");
    expect(failedIdx).toBeGreaterThan(-1);
    expect(orbitDeps[failedIdx + 1].status).toBe("success");
    const inc = d.incidents[0];
    expect(inc.fix?.status).toBe("applied");
    expect(inc.reviews.map((r) => r.verdict)).toEqual(["revise", "approve"]);
    expect(d.reports[0].relatedIncidentId).toBe(inc.id);
    expect(d.projects.find((p) => p.id === "prj_helix")?.privacy.codeSummaryMode).toBe("local");
    expect(d.projects.find((p) => p.id === "prj_pulse")?.privacy.codeSummaryMode).toBe("metadata-only");
  });
});

describe("simulator", () => {
  it("builds every scenario with unique ids and valid actors", async () => {
    const d = await all();
    const project = d.projects.find((p) => p.id === "prj_atlas")!;
    const handles = new Map(d.people.map((p) => [p.handles.github, p]));
    const now = new Date();
    for (const s of SCENARIOS) {
      const items = buildScenario(project, d.people, s.id, now);
      expect(items.length).toBeGreaterThan(0);
      const ids = items.map((i) => i.externalId);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toContain(String(now.getTime()));
      for (const i of items) {
        expect(i.source).toBe("simulated");
        if (i.actor?.handle && i.meta?.author !== "client") expect(handles.has(i.actor.handle)).toBe(true);
      }
    }
    const failed = buildScenario(project, d.people, "failed-deploy", now);
    const risky = failed.find((i) => i.diff && i.diff.split("\n").length >= 30)!;
    expect(risky.diff!.split("\n").length).toBeLessThanOrEqual(60);
    expect(failed[failed.length - 1].deployment?.status).toBe("failed");
    expect(buildScenario(project, d.people, "unclear-change", now)[0].stats?.filesChanged).toBeGreaterThanOrEqual(40);
  });

  it("simulated connector is deterministic within an hour", async () => {
    const d = await all();
    const project = d.projects[0];
    const source = project.sources[0];
    const now = new Date("2026-05-04T10:05:00Z");
    const ctx = { project, secret: () => undefined, since: "2026-05-01T00:00:00Z", now };
    const a = await simulatedConnector.fetch(source, ctx);
    const b = await simulatedConnector.fetch(source, { ...ctx, now: new Date("2026-05-04T10:50:00Z") });
    expect(a.items.length).toBeGreaterThanOrEqual(2);
    expect(a.items.length).toBeLessThanOrEqual(5);
    expect(a.items.map((i) => i.externalId)).toEqual(b.items.map((i) => i.externalId));
    const c = await simulatedConnector.fetch(source, { ...ctx, now: new Date("2026-05-04T11:05:00Z") });
    expect(c.items[0].externalId).not.toBe(a.items[0].externalId);
    const monitor = await simulatedDeployMonitor.check(project.deployTargets[0], ctx, 5);
    expect(monitor.status).toBe("ok");
    expect(monitor.deployments).toEqual([]);
  });
});
