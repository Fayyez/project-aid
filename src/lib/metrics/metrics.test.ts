import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEATURES,
  DEFAULT_PRIVACY,
  type Person,
  type Project,
  type ProjectEvent,
  type Thread,
  type Ticket,
} from "../types";
import { computeContributions, computePace } from "./index";

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const NOW = new Date("2026-11-16T12:00:00.000Z");

const at = (ms: number) => new Date(ms).toISOString();
const daysAgo = (days: number) => at(NOW.getTime() - days * DAY);
const daysFromNow = (days: number) => at(NOW.getTime() + days * DAY);

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    key: "ATLAS",
    name: "Atlas",
    client: "Acme",
    description: "",
    status: "active",
    pdIds: [],
    team: [],
    sources: [],
    deployTargets: [],
    features: DEFAULT_FEATURES,
    privacy: DEFAULT_PRIVACY,
    milestones: [],
    startDate: daysAgo(100),
    targetDate: daysFromNow(60),
    templates: {},
    notifyChannel: "in_app",
    createdAt: daysAgo(100),
    updatedAt: daysAgo(0),
    ...overrides,
  };
}

let ticketCounter = 0;
function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  ticketCounter += 1;
  return {
    id: `t${ticketCounter}`,
    projectId: "p1",
    key: `ATLAS-${ticketCounter}`,
    title: `Ticket ${ticketCounter}`,
    description: "",
    acceptanceCriteria: [],
    type: "task",
    priority: "P2",
    status: "todo",
    labels: [],
    origin: { kind: "manual" },
    createdAt: daysAgo(120),
    updatedAt: daysAgo(0),
    ...overrides,
  };
}

/**
 * Done tickets closed in each window. counts[7] is the window ending at NOW,
 * counts[0] the oldest. Each ticket closed one day into its window.
 */
function closedPerWindow(counts: number[]): Ticket[] {
  const tickets: Ticket[] = [];
  counts.forEach((count, index) => {
    const weeksAgo = counts.length - 1 - index;
    for (let i = 0; i < count; i++) {
      tickets.push(makeTicket({ status: "done", closedAt: at(NOW.getTime() - weeksAgo * WEEK - DAY) }));
    }
  });
  return tickets;
}

function todoTickets(count: number): Ticket[] {
  return Array.from({ length: count }, () => makeTicket({ status: "todo" }));
}

describe("computePace", () => {
  it("is unknown for an empty scope and returns zeroed metrics", () => {
    const pace = computePace(
      makeProject(),
      [makeTicket({ status: "draft" }), makeTicket({ status: "cancelled" })],
      NOW,
    );
    expect(pace.status).toBe("unknown");
    expect(pace.progressPct).toBe(0);
    expect(pace.openTickets).toBe(0);
    expect(pace.doneTickets).toBe(0);
    expect(pace.weeklyThroughput).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(pace.velocity).toBe(0);
    expect(pace.velocityTrendPct).toBe(0);
    expect(pace.projectedCompletion).toBeUndefined();
    expect(pace.slipDays).toBe(0);
    expect(pace.explanation).toContain("No tickets are in scope");
  });

  it("excludes cancelled and draft tickets from scope", () => {
    const pace = computePace(
      makeProject(),
      [
        makeTicket({ status: "done" }),
        makeTicket({ status: "todo" }),
        makeTicket({ status: "blocked" }),
        makeTicket({ status: "cancelled" }),
        makeTicket({ status: "draft" }),
      ],
      NOW,
    );
    expect(pace.doneTickets).toBe(1);
    expect(pace.blockedTickets).toBe(1);
    expect(pace.openTickets).toBe(2);
    expect(pace.progressPct).toBe(33);
  });

  it("computes time elapsed as a clamped share of the schedule", () => {
    const project = makeProject({ startDate: "2026-01-01T00:00:00.000Z", targetDate: "2027-01-01T00:00:00.000Z" });
    // 182.5 of 365 days: exactly half.
    expect(computePace(project, [], new Date("2026-07-02T12:00:00.000Z")).timeElapsedPct).toBe(50);
    expect(computePace(project, [], new Date("2025-12-01T00:00:00.000Z")).timeElapsedPct).toBe(0);
    expect(computePace(project, [], new Date("2027-06-01T00:00:00.000Z")).timeElapsedPct).toBe(100);
  });

  it("counts closures per seven-day window, oldest first, within scope and range", () => {
    const tickets = [
      ...closedPerWindow([1, 0, 0, 0, 1, 0, 0, 2]),
      makeTicket({ status: "cancelled", closedAt: daysAgo(1) }),
      makeTicket({ status: "done", closedAt: daysFromNow(2) }),
      makeTicket({ status: "done", closedAt: daysAgo(8 * 7 + 1) }),
    ];
    const pace = computePace(makeProject(), tickets, NOW);
    expect(pace.weeklyThroughput).toEqual([1, 0, 0, 0, 1, 0, 0, 2]);
  });

  it("averages the last four windows for velocity and compares with the four before", () => {
    const pace = computePace(makeProject(), closedPerWindow([2, 2, 2, 2, 3, 3, 3, 3]), NOW);
    expect(pace.velocity).toBe(3);
    expect(pace.velocityTrendPct).toBe(50);
  });

  it("rounds velocity to one decimal", () => {
    // Recent windows 1, 1, 1, 0 average 0.75, which rounds to 0.8.
    const pace = computePace(makeProject(), closedPerWindow([0, 0, 0, 0, 1, 1, 1, 0]), NOW);
    expect(pace.velocity).toBe(0.8);
  });

  it("reports a zero trend when the previous four-window average is zero", () => {
    const pace = computePace(makeProject(), closedPerWindow([0, 0, 0, 0, 1, 1, 1, 1]), NOW);
    expect(pace.velocity).toBe(1);
    expect(pace.velocityTrendPct).toBe(0);
  });

  it("projects completion from open tickets and velocity", () => {
    // 14 open at 2 a week is 7 weeks, so 49 days from now.
    const tickets = [...closedPerWindow([2, 2, 2, 2, 2, 2, 2, 2]), ...todoTickets(14)];
    const pace = computePace(makeProject({ targetDate: daysFromNow(60) }), tickets, NOW);
    expect(pace.projectedCompletion).toBe(daysFromNow(49));
    expect(pace.slipDays).toBe(-11);
  });

  it("applies the slip thresholds for behind, at risk, on track and ahead", () => {
    const tickets = [...closedPerWindow([2, 2, 2, 2, 2, 2, 2, 2]), ...todoTickets(14)];
    const cases: [number, string, number][] = [
      // [target in days from now, expected status, expected slipDays]
      [30, "behind", 19],
      [35, "at_risk", 14],
      [44, "at_risk", 5],
      [47, "on_track", 2],
      [55, "on_track", -6],
      [60, "ahead", -11],
    ];
    for (const [target, status, slip] of cases) {
      const pace = computePace(makeProject({ targetDate: daysFromNow(target) }), tickets, NOW);
      expect({ target, status: pace.status, slip: pace.slipDays }).toEqual({ target, status, slip });
    }
  });

  it("is at risk when throughput fell by 30% or more, and says so", () => {
    // Recent average 2 against a previous 4 is down 50%. Projection is well before target.
    const tickets = [...closedPerWindow([4, 4, 4, 4, 2, 2, 2, 2]), ...todoTickets(2)];
    const pace = computePace(makeProject({ targetDate: daysFromNow(100) }), tickets, NOW);
    expect(pace.velocityTrendPct).toBe(-50);
    expect(pace.status).toBe("at_risk");
    expect(pace.explanation).toContain("Throughput is down 50% on the previous four weeks.");
  });

  it("is at risk with three or more blocked tickets, and says so", () => {
    const blocked = Array.from({ length: 3 }, () => makeTicket({ status: "blocked" }));
    const tickets = [...closedPerWindow([2, 2, 2, 2, 2, 2, 2, 2]), ...blocked, ...todoTickets(11)];
    const pace = computePace(makeProject({ targetDate: daysFromNow(49) }), tickets, NOW);
    expect(pace.blockedTickets).toBe(3);
    expect(pace.slipDays).toBe(0);
    expect(pace.status).toBe("at_risk");
    expect(pace.explanation).toContain("3 tickets are blocked");
  });

  it("writes a plain explanation with the actual numbers", () => {
    // Average 6.5 a week, 14 open: about 15.1 days to finish, which is 5 days early.
    const tickets = [...closedPerWindow([6, 7, 6, 7, 6, 7, 6, 7]), ...todoTickets(14)];
    const pace = computePace(makeProject({ targetDate: daysFromNow(20) }), tickets, NOW);
    expect(pace.status).toBe("on_track");
    expect(pace.explanation).toBe(
      "Closing about 6.5 tickets a week with 14 left; projected to finish 1 Dec, 5 days before the target.",
    );
  });

  it("is unknown when nothing has closed and nothing is done", () => {
    const pace = computePace(makeProject(), todoTickets(3), NOW);
    expect(pace.status).toBe("unknown");
    expect(pace.velocity).toBe(0);
    expect(pace.projectedCompletion).toBeUndefined();
    expect(pace.explanation).toBe(
      "No tickets have closed in the last four weeks and none are done, so there is no pace to project.",
    );
  });

  it("is behind when velocity drops to zero with work still open", () => {
    const tickets = [...closedPerWindow([1, 1, 1, 1, 0, 0, 0, 0]), ...todoTickets(2)];
    const pace = computePace(makeProject(), tickets, NOW);
    expect(pace.velocity).toBe(0);
    expect(pace.status).toBe("behind");
    expect(pace.projectedCompletion).toBeUndefined();
    expect(pace.slipDays).toBe(0);
    expect(pace.explanation).toBe(
      "No tickets have closed in the last four weeks, with 2 still open, so no completion date can be projected.",
    );
  });

  it("is on track with nothing left open", () => {
    const pace = computePace(makeProject(), [makeTicket({ status: "done" })], NOW);
    expect(pace.openTickets).toBe(0);
    expect(pace.status).toBe("on_track");
    expect(pace.explanation).toBe("The only in-scope ticket is done.");
  });
});

// ---------------------------------------------------------------------------
// computeContributions
// ---------------------------------------------------------------------------

function person(id: string, name: string): Person {
  return { id, name, email: `${id}@example.test`, role: "member", handles: {}, createdAt: daysAgo(200) };
}

let eventCounter = 0;
function makeEvent(overrides: Partial<ProjectEvent> = {}): ProjectEvent {
  eventCounter += 1;
  return {
    id: `e${eventCounter}`,
    projectId: "p1",
    source: "github",
    kind: "commit",
    title: `Event ${eventCounter}`,
    summary: "",
    occurredAt: daysAgo(1),
    ingestedAt: daysAgo(1),
    areas: [],
    tags: [],
    importance: 3,
    clarity: "clear",
    userFacing: false,
    refs: [],
    summarizedBy: { provider: "none", model: "none", mode: "none" },
    ...overrides,
  };
}

let threadCounter = 0;
function makeThread(overrides: Partial<Thread> = {}): Thread {
  threadCounter += 1;
  return {
    id: `th${threadCounter}`,
    projectId: "p1",
    kind: "escalation",
    subject: "Question",
    status: "open",
    createdById: "bob",
    assigneeId: "alice",
    watcherIds: [],
    relatedEventIds: [],
    replyTokenHash: "hash",
    delivery: [],
    messages: [],
    unreadForWatchers: false,
    createdAt: daysAgo(2),
    updatedAt: daysAgo(0),
    ...overrides,
  };
}

const hoursAfter = (base: string, hours: number) => at(Date.parse(base) + hours * 60 * 60 * 1000);

describe("computeContributions", () => {
  const people = [person("alice", "Alice"), person("bob", "Bob"), person("carol", "Carol"), person("dave", "Dave")];
  const project = makeProject({
    team: [
      { personId: "alice", projectRole: "Backend", areas: ["api", "billing"] },
      { personId: "ghost", projectRole: "Unknown", areas: ["x"] },
      { personId: "dave", projectRole: "Ops", areas: [] },
      { personId: "bob", projectRole: "QA", areas: ["web"] },
      { personId: "carol", projectRole: "Design", areas: ["ui"] },
    ],
  });

  const events: ProjectEvent[] = [
    // Alice, inside the 7-day window
    makeEvent({ actorId: "alice", kind: "commit", occurredAt: daysAgo(1), stats: { additions: 10, deletions: 5 }, areas: ["api"], importance: 2, title: "Fix token refresh" }),
    makeEvent({ actorId: "alice", kind: "commit", occurredAt: daysAgo(1.5), stats: { additions: 3 }, areas: ["api"], importance: 4, title: "Add retry" }),
    makeEvent({ actorId: "alice", kind: "pull_request", occurredAt: daysAgo(2), stats: { additions: 100, deletions: 20 }, areas: ["api", "billing"], importance: 5, title: "Billing v2" }),
    makeEvent({ actorId: "alice", kind: "review", occurredAt: daysAgo(3), importance: 3, title: "Review: cache" }),
    // Alice, outside the window and on another project: both ignored
    makeEvent({ actorId: "alice", kind: "commit", occurredAt: daysAgo(8), stats: { additions: 999 }, title: "Old" }),
    makeEvent({ actorId: "alice", kind: "commit", occurredAt: daysAgo(1), projectId: "p2", title: "Other project" }),
    // Bob: reviews, one commit with no areas
    makeEvent({ actorId: "bob", kind: "review", occurredAt: daysAgo(0.5), title: "QA pass" }),
    makeEvent({ actorId: "bob", kind: "review", occurredAt: daysAgo(4), title: "QA pass 2" }),
    makeEvent({ actorId: "bob", kind: "commit", occurredAt: daysAgo(4), stats: { additions: 1, deletions: 1 }, importance: 1, title: "Typo" }),
  ];

  const tickets: Ticket[] = [
    makeTicket({ assigneeId: "alice", status: "done", closedAt: daysAgo(3) }),
    makeTicket({ assigneeId: "alice", status: "done", closedAt: daysAgo(10) }), // closed outside window
    makeTicket({ assigneeId: "alice", status: "in_progress" }),
    makeTicket({ assigneeId: "alice", status: "in_review" }),
    makeTicket({ assigneeId: "bob", status: "in_progress" }),
    makeTicket({ assigneeId: "bob", status: "done", closedAt: daysAgo(2) }),
  ];

  const threads: Thread[] = [
    // Alice replies after 3h, 9h and 1h. A thread with no reply from her is skipped.
    makeThread({ createdAt: daysAgo(2), messages: [{ id: "m1", authorId: "alice", authorName: "Alice", body: "", at: hoursAfter(daysAgo(2), 3), via: "portal" }] }),
    makeThread({ createdAt: daysAgo(1), messages: [{ id: "m2", authorId: "alice", authorName: "Alice", body: "", at: hoursAfter(daysAgo(1), 9), via: "portal" }] }),
    makeThread({ createdAt: daysAgo(3), messages: [{ id: "m3", authorId: "alice", authorName: "Alice", body: "", at: hoursAfter(daysAgo(3), 1), via: "portal" }] }),
    makeThread({ createdAt: daysAgo(5), messages: [] }),
    // Assigned to Bob, so not counted for Alice
    makeThread({ assigneeId: "bob", createdAt: daysAgo(2), messages: [{ id: "m4", authorId: "bob", authorName: "Bob", body: "", at: hoursAfter(daysAgo(2), 5), via: "portal" }] }),
  ];

  const stats = computeContributions({ project, people, events, tickets, threads, windowDays: 7, now: NOW });
  const byName = (name: string) => {
    const found = stats.find((s) => s.name === name);
    if (!found) throw new Error(`no entry for ${name}`);
    return found;
  };

  it("has one entry per known team member, skipping unknown ids", () => {
    expect(stats.map((s) => s.name).sort()).toEqual(["Alice", "Bob", "Carol", "Dave"]);
    expect(byName("Alice").projectRole).toBe("Backend");
  });

  it("counts commits, pull requests, reviews and lines changed inside the window", () => {
    const alice = byName("Alice");
    expect(alice.commits).toBe(2);
    expect(alice.pullRequests).toBe(1);
    expect(alice.reviews).toBe(1);
    expect(alice.linesChanged).toBe(15 + 3 + 120);
  });

  it("counts distinct UTC active days and the latest event time", () => {
    const alice = byName("Alice");
    // Events fall on 15, 14 and 13 November (UTC).
    expect(alice.activeDays).toBe(3);
    expect(alice.lastActiveAt).toBe(daysAgo(1));
  });

  it("builds a per-day activity series, oldest first", () => {
    const alice = byName("Alice");
    expect(alice.activity).toHaveLength(7);
    expect(alice.activity).toEqual([0, 0, 0, 0, 1, 2, 1]);
    expect(alice.activity.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("counts tickets closed in the window and tickets in progress or in review", () => {
    const alice = byName("Alice");
    expect(alice.ticketsClosed).toBe(1);
    expect(alice.ticketsInProgress).toBe(2);
    expect(byName("Bob").ticketsInProgress).toBe(1);
  });

  it("takes the top four areas from events, falling back to team assignment areas", () => {
    expect(byName("Alice").areas).toEqual(["api", "billing"]);
    expect(byName("Bob").areas).toEqual(["web"]);
    expect(byName("Carol").areas).toEqual(["ui"]);
  });

  it("computes the median hours to first reply on threads assigned to the person", () => {
    // Replies after 3, 9 and 1 hours: the median is 3.
    expect(byName("Alice").medianResponseHours).toBe(3);
    expect(byName("Bob").medianResponseHours).toBe(5);
    expect(byName("Carol").medianResponseHours).toBeUndefined();
  });

  it("lists up to three highlights by importance, newest first among equals", () => {
    expect(byName("Alice").highlights).toEqual(["Billing v2", "Add retry", "Review: cache"]);
  });

  it("sorts by activity score descending, then by name", () => {
    // Score is commits + 2 * pull requests + reviews + 2 * tickets closed.
    // Alice 2 + 2 + 1 + 2 = 7, Bob 1 + 2 + 2 = 5, then Carol and Dave tie at 0.
    expect(stats.map((s) => s.name)).toEqual(["Alice", "Bob", "Carol", "Dave"]);
  });

  it("gives empty activity and no response time to people without events", () => {
    const dave = byName("Dave");
    expect(dave.commits + dave.pullRequests + dave.reviews).toBe(0);
    expect(dave.lastActiveAt).toBeUndefined();
    expect(dave.activeDays).toBe(0);
    expect(dave.activity).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(dave.highlights).toEqual([]);
    expect(dave.areas).toEqual([]);
  });
});
