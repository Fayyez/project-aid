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
import { AccessError } from "@/lib/auth/access";
import { inAppMessenger } from "@/lib/connectors/messengers";
import { askClarification } from "./clarify";
import { escalateQuestion } from "./escalate";
import { closeThread, getThreadForReply, markThreadRead, postThreadReply } from "./threads";

const sent: { replyUrl?: string }[] = [];
const tokenOf = (url: string | undefined) => new URL(url ?? "http://x/").searchParams.get("t") ?? "";
const dana = { id: "u_dana", name: "Dana Reyes" };

beforeEach(() => {
  useFreshMemoryStore();
  sent.length = 0;
  vi.restoreAllMocks();
  vi.spyOn(inAppMessenger, "send").mockImplementation(async (message) => {
    sent.push(message);
    return { channel: "in_app", status: "sent" };
  });
});

async function clarification() {
  const project = await seed();
  const thread = await askClarification({ project, event: makeEvents().find((e) => e.id === "e8") as ProjectEvent, actor: pdActor, trigger: "system" });
  if (!thread) throw new Error("no thread");
  return { project, thread };
}

describe("postThreadReply", () => {
  it("marks the thread answered, stores a clarification event and clears the unclear flag", async () => {
    const { thread } = await clarification();
    const updated = await postThreadReply({ threadId: thread.id, body: "I moved the repository layer to the new ORM so that the March migration can ship. It touches invoices, so release testing is needed.", via: "reply_link", author: { id: "u_eli", name: "Eli Brandt" } });
    expect(updated.status).toBe("answered");
    expect(updated.unreadForWatchers).toBe(true);
    expect(updated.messages).toHaveLength(2);
    const store = await getStore();
    const events = await store.list("events");
    const knowledge = events.find((e) => e.kind === "clarification");
    expect(knowledge).toMatchObject({ source: "system", actorId: "u_eli", importance: 3, clarity: "clear" });
    expect(knowledge?.refs).toContain("TST-4");
    expect(knowledge?.summary).toMatch(/ORM/);
    const original = events.find((e) => e.id === "e8");
    expect(original?.clarity).toBe("clear");
    expect(original?.summary).toContain("Author's explanation:");
  });

  it("keeps the event unclear when the reply does not resolve the question", async () => {
    const { thread } = await clarification();
    await postThreadReply({ threadId: thread.id, body: "not sure, will check", via: "reply_link", author: { id: "u_eli", name: "Eli" } });
    expect((await (await getStore()).get("events", "e8"))?.clarity).toBe("unclear");
  });

  it("redacts secrets, caps the length and rejects empty replies", async () => {
    const { thread } = await clarification();
    await expect(postThreadReply({ threadId: thread.id, body: "   ", via: "portal", author: dana })).rejects.toThrow(/empty/i);
    const updated = await postThreadReply({ threadId: thread.id, body: `It was for the sync job. password=hunter2hunter2 ${"x".repeat(5000)}`, via: "reply_link", author: { id: "u_eli", name: "Eli" } });
    const body = updated.messages[1].body;
    expect(body).not.toContain("hunter2hunter2");
    expect(body.length).toBeLessThanOrEqual(4000);
  });

  it("lets a director follow up, reopens the thread and delivers it to the assignee", async () => {
    const project = await seed();
    const thread = await escalateQuestion({ project, actor: pdActor, question: "Why are payment refunds failing?", trigger: "manual" });
    await postThreadReply({ threadId: thread.id, body: "Because the provider changed its API last week.", via: "reply_link", author: dana });
    sent.length = 0;
    const updated = await postThreadReply({ threadId: thread.id, body: "Thanks, which version?", via: "portal", author: { id: "u_pd", name: "Paula Director" }, actor: pdActor });
    expect(updated.status).toBe("open");
    expect(updated.messages).toHaveLength(3);
    expect(sent).toHaveLength(1);
    expect(await getThreadForReply(thread.id, tokenOf(sent[0].replyUrl))).not.toBeNull();
  });

  it("rejects replies from strangers, outside directors and read-only credentials", async () => {
    const project = await seed();
    const thread = await escalateQuestion({ project, actor: pdActor, question: "Why are payment refunds failing?", trigger: "manual" });
    await expect(postThreadReply({ threadId: thread.id, body: "hi", via: "portal", author: { id: "u_eli", name: "Eli" } })).rejects.toBeInstanceOf(AccessError);
    await expect(postThreadReply({ threadId: thread.id, body: "hi", via: "portal", author: { id: "u_other", name: "Other" }, actor: otherPd })).rejects.toBeInstanceOf(AccessError);
    await expect(postThreadReply({ threadId: thread.id, body: "hi", via: "portal", author: { id: "u_pd", name: "P" }, actor: readOnlyActor })).rejects.toBeInstanceOf(AccessError);
  });
});

describe("thread access", () => {
  it("getThreadForReply returns null for a bad or missing token, unknown threads and closed threads", async () => {
    const project = await seed();
    const thread = await escalateQuestion({ project, actor: pdActor, question: "Why are payment refunds failing?", trigger: "manual" });
    const token = tokenOf(sent[0].replyUrl);
    const ok = await getThreadForReply(thread.id, token);
    expect(ok?.assignee.id).toBe("u_dana");
    expect(ok?.project.id).toBe("p1");
    expect(await getThreadForReply(thread.id, "wrong")).toBeNull();
    expect(await getThreadForReply(thread.id, undefined)).toBeNull();
    expect(await getThreadForReply("thr_missing", token)).toBeNull();
    await closeThread({ actor: pdActor, threadId: thread.id });
    expect(await getThreadForReply(thread.id, token)).toBeNull();
    await expect(postThreadReply({ threadId: thread.id, body: "late", via: "reply_link", author: dana })).rejects.toThrow(/closed/i);
  });

  it("accepts the seeded demo token", async () => {
    await seed();
    const store = await getStore();
    await store.put("threads", { id: "thr_demo", projectId: "p1", kind: "escalation", subject: "s", status: "open", createdById: "u_pd", assigneeId: "u_dana", watcherIds: ["u_pd"], relatedEventIds: [], replyTokenHash: sha256("demo-reply-thr_demo"), delivery: [], messages: [], unreadForWatchers: false, createdAt: ago(DAY), updatedAt: ago(DAY) });
    expect(await getThreadForReply("thr_demo", "demo-reply-thr_demo")).not.toBeNull();
  });

  it("markThreadRead and closeThread require project access", async () => {
    const { thread } = await clarification();
    const answered = await postThreadReply({ threadId: thread.id, body: "It was for the sync job, and it has no client impact.", via: "reply_link", author: { id: "u_eli", name: "Eli" } });
    expect(answered.unreadForWatchers).toBe(true);
    await expect(markThreadRead({ actor: otherPd, threadId: thread.id })).rejects.toBeInstanceOf(AccessError);
    expect((await markThreadRead({ actor: pdActor, threadId: thread.id })).unreadForWatchers).toBe(false);
    await expect(closeThread({ actor: otherPd, threadId: thread.id })).rejects.toBeInstanceOf(AccessError);
    expect((await closeThread({ actor: pdActor, threadId: thread.id })).status).toBe("closed");
  });
});
