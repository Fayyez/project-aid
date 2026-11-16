import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStore, useFreshMemoryStore } from "@/lib/store";
import { DEFAULT_FEATURES, DEFAULT_PRIVACY, type Actor, type Person, type Project, type ProjectEvent, type Ticket } from "@/lib/types";
import { sha256 } from "@/lib/util";

vi.mock("@/lib/services/snapshot", () => ({ refreshSnapshot: vi.fn(async () => ({})) }));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const person = (id: string, name: string, role: Person["role"] = "member"): Person => ({ id, name, email: `${id}@example.com`, role, handles: {}, createdAt: ago(100 * DAY) });
const PEOPLE: Person[] = [person("u_pd", "Paula Director", "pd"), person("u_dana", "Dana Reyes"), person("u_eli", "Eli Brandt"), person("u_fay", "Fay Okafor"), person("u_gus", "Gus Lindqvist")];

const pdActor: Actor = { id: "u_pd", name: "Paula Director", role: "pd", via: "session", scopes: ["read", "write"] };
const readOnlyActor: Actor = { ...pdActor, via: "token", scopes: ["read"] };
const otherPd: Actor = { id: "u_other", name: "Other PD", role: "pd", via: "session", scopes: ["read", "write"] };

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    key: "TST",
    name: "Testbed",
    client: "Acme",
    description: "",
    status: "active",
    pdIds: ["u_pd"],
    team: [
      { personId: "u_dana", projectRole: "Backend", areas: ["payments", "checkout"] },
      { personId: "u_eli", projectRole: "Frontend", areas: ["frontend", "mobile"] },
      { personId: "u_fay", projectRole: "QA", areas: ["auth", "login"] },
      { personId: "u_gus", projectRole: "DevOps", areas: ["infra", "deploy"] },
    ],
    sources: [],
    deployTargets: [],
    features: { ...DEFAULT_FEATURES },
    privacy: { ...DEFAULT_PRIVACY },
    milestones: [],
    startDate: ago(60 * DAY),
    targetDate: new Date(Date.now() + 60 * DAY).toISOString(),
    templates: {},
    notifyChannel: "in_app",
    createdAt: ago(60 * DAY),
    updatedAt: ago(DAY),
    ...overrides,
  };
}

function makeEvent(id: string, overrides: Partial<ProjectEvent> = {}): ProjectEvent {
  return {
    id,
    projectId: "p1",
    source: "github",
    kind: "pull_request",
    title: `Change ${id}`,
    summary: `Summary of ${id}.`,
    occurredAt: ago(DAY),
    ingestedAt: ago(DAY),
    areas: [],
    tags: [],
    importance: 3,
    clarity: "clear",
    userFacing: false,
    refs: [],
    summarizedBy: { provider: "heuristic", model: "rules", mode: "heuristic" },
    ...overrides,
  };
}

function makeEvents(): ProjectEvent[] {
  return [
    makeEvent("e1", { title: "Retry failed payment captures", areas: ["payments"], actorId: "u_dana", actorName: "Dana Reyes", occurredAt: ago(1 * DAY), refs: ["TST-2"] }),
    makeEvent("e2", { title: "Refund flow for partial payments", areas: ["payments"], actorId: "u_dana", actorName: "Dana Reyes", occurredAt: ago(2 * DAY) }),
    makeEvent("e3", { title: "Payment webhook signature check", areas: ["payments"], actorId: "u_dana", actorName: "Dana Reyes", occurredAt: ago(3 * DAY) }),
    makeEvent("e4", { title: "Payment receipts by email", areas: ["payments"], actorId: "u_dana", actorName: "Dana Reyes", occurredAt: ago(4 * DAY) }),
    makeEvent("e5", { title: "Mobile checkout layout fixes", areas: ["frontend", "mobile"], actorId: "u_eli", actorName: "Eli Brandt", occurredAt: ago(2 * DAY) }),
    makeEvent("e6", { title: "Login session timeout handling", areas: ["auth"], actorId: "u_fay", actorName: "Fay Okafor", occurredAt: ago(5 * DAY) }),
    makeEvent("e7", { title: "Terraform module for staging", areas: ["infra"], actorId: "u_gus", actorName: "Gus Lindqvist", occurredAt: ago(6 * DAY) }),
    makeEvent("e8", { title: "Rework the data layer", summary: "Eli pushed a large change with the message \"misc\"; its purpose is not stated.", areas: ["database"], actorId: "u_eli", actorName: "Eli Brandt", occurredAt: ago(3 * HOUR), importance: 5, clarity: "unclear", refs: ["TST-4"] }),
    makeEvent("e9", { title: "Update README", kind: "commit", areas: ["docs"], actorId: "u_gus", actorName: "Gus Lindqvist", occurredAt: ago(9 * DAY), importance: 1 }),
    makeEvent("e10", { title: "Client asks about invoice export", kind: "message", areas: ["reporting"], occurredAt: ago(DAY), actorName: "Client" }),
  ];
}

function makeTicket(n: number, title: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: `t${n}`,
    projectId: "p1",
    key: `TST-${n}`,
    title,
    description: "",
    acceptanceCriteria: [],
    type: "task",
    priority: "P2",
    status: "todo",
    labels: [],
    origin: { kind: "manual" },
    createdAt: ago(10 * DAY),
    updatedAt: ago(DAY),
    ...overrides,
  };
}

function makeTickets(): Ticket[] {
  return [
    makeTicket(1, "Set up CI pipeline", { status: "done", closedAt: ago(5 * DAY) }),
    makeTicket(2, "Retry failed payment captures", { type: "feature", assigneeId: "u_dana" }),
    makeTicket(3, "Checkout button broken on mobile Safari", { type: "bug", priority: "P1", assigneeId: "u_eli" }),
    makeTicket(4, "Document the data layer", { status: "in_progress" }),
    makeTicket(5, "Upgrade Node runtime", { type: "chore", assigneeId: "u_gus" }),
    makeTicket(12, "Dark mode for dashboard", { type: "feature", status: "blocked" }),
  ];
}

async function seed(project: Project = makeProject()): Promise<Project> {
  const store = await getStore();
  await store.putMany("people", PEOPLE);
  await store.put("projects", project);
  await store.putMany("events", makeEvents());
  await store.putMany("tickets", makeTickets());
  return project;
}
import { askClarification } from "./clarify";

const unclear = () => makeEvents().find((e) => e.id === "e8") as ProjectEvent;

async function addThread(id: string, assigneeId: string, status: "open" | "answered", createdAt = new Date().toISOString()): Promise<void> {
  await (await getStore()).put("threads", { id, projectId: "p1", kind: "clarification", subject: "s", status, createdById: "agent:clarifier", assigneeId, watcherIds: ["u_pd"], relatedEventIds: [`other_${id}`], replyTokenHash: "x", delivery: [], messages: [], unreadForWatchers: false, createdAt, updatedAt: createdAt });
}
const runsCount = async () => (await (await getStore()).list("runs")).length;

beforeEach(() => {
  useFreshMemoryStore();
});

describe("askClarification", () => {
  it("asks the author of an unclear, significant change", async () => {
    const project = await seed();
    const thread = await askClarification({ project, event: unclear(), actor: pdActor, trigger: "system" });
    expect(thread).not.toBeNull();
    expect(thread).toMatchObject({ kind: "clarification", status: "open", createdById: "agent:clarifier", assigneeId: "u_eli", watcherIds: ["u_pd"], relatedEventIds: ["e8"] });
    expect(thread?.messages[0]).toMatchObject({ authorId: "agent:clarifier", authorName: "Project Aid", via: "agent" });
    expect(thread?.messages[0].body).toMatch(/1\./);
    expect(thread?.delivery.some((d) => d.channel === "in_app")).toBe(true);
    expect(thread?.replyTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await runsCount()).toBe(1);
  });

  it("returns null without running anything when the policy fails", async () => {
    const project = await seed();
    const event = unclear();
    const off = { ...project, features: { ...project.features, clarifyingQuestions: false } };
    expect(await askClarification({ project: off, event, actor: pdActor, trigger: "system" })).toBeNull();
    expect(await askClarification({ project, event: { ...event, clarity: "clear" }, actor: pdActor, trigger: "system" })).toBeNull();
    expect(await askClarification({ project, event: { ...event, importance: 3 }, actor: pdActor, trigger: "system" })).toBeNull();
    expect(await askClarification({ project, event: { ...event, actorId: undefined }, actor: pdActor, trigger: "system" })).toBeNull();
    expect(await askClarification({ project, event: { ...event, actorId: "u_pd" }, actor: pdActor, trigger: "system" })).toBeNull();
    expect(await runsCount()).toBe(0);
  });

  it("does not ask twice about the same event", async () => {
    const project = await seed();
    expect(await askClarification({ project, event: unclear(), actor: pdActor, trigger: "system" })).not.toBeNull();
    expect(await askClarification({ project, event: unclear(), actor: pdActor, trigger: "system" })).toBeNull();
  });

  it("limits open clarifications per author to 2", async () => {
    const project = await seed();
    await addThread("a", "u_eli", "open");
    await addThread("b", "u_eli", "open");
    expect(await askClarification({ project, event: unclear(), actor: pdActor, trigger: "system" })).toBeNull();
    await (await getStore()).put("threads", { ...(await (await getStore()).get("threads", "b"))!, status: "answered" });
    expect(await askClarification({ project, event: unclear(), actor: pdActor, trigger: "system" })).not.toBeNull();
  });

  it("limits clarifications to 3 per project per 24 hours", async () => {
    const project = await seed();
    await addThread("a", "u_dana", "answered");
    await addThread("b", "u_fay", "answered");
    await addThread("c", "u_gus", "answered");
    expect(await askClarification({ project, event: unclear(), actor: pdActor, trigger: "system" })).toBeNull();
    const store = await getStore();
    for (const id of ["a", "b", "c"]) await store.put("threads", { ...(await store.get("threads", id))!, createdAt: ago(2 * DAY) });
    expect(await askClarification({ project, event: unclear(), actor: pdActor, trigger: "system" })).not.toBeNull();
  });
});
