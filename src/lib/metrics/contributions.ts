import type { ContributionStats, Person, Project, ProjectEvent, Thread, Ticket } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_AREAS = 4;
const MAX_HIGHLIGHTS = 3;

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Keys ordered by count descending, then alphabetically, limited to `limit`. */
function topByCount(counts: Map<string, number>, limit: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || compareStrings(a[0], b[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function activityScore(s: ContributionStats): number {
  return s.commits + 2 * s.pullRequests + s.reviews + 2 * s.ticketsClosed;
}

/**
 * Per-person activity for a project over the last `windowDays` days ending at `now`.
 * Events are attributed to people by `actorId`. Pure: no I/O, `now` is explicit.
 */
export function computeContributions(args: {
  project: Project;
  people: Person[];
  events: ProjectEvent[];
  tickets: Ticket[];
  threads: Thread[];
  windowDays: number;
  now: Date;
}): ContributionStats[] {
  const { project, people, events, tickets, threads, now } = args;
  const windowDays = Math.max(0, Math.floor(args.windowDays));
  const nowMs = now.getTime();
  const startMs = nowMs - windowDays * DAY_MS;

  const inWindow = (iso: string | undefined): boolean => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return Number.isFinite(t) && t >= startMs && t <= nowMs;
  };

  const peopleById = new Map(people.map((p) => [p.id, p]));
  const windowEvents = events.filter((e) => e.projectId === project.id && inWindow(e.occurredAt));
  const projectTickets = tickets.filter((t) => t.projectId === project.id);
  const projectThreads = threads.filter((t) => t.projectId === project.id);

  const stats: ContributionStats[] = [];
  for (const assignment of project.team) {
    const person = peopleById.get(assignment.personId);
    if (!person) continue;

    const mine = windowEvents.filter((e) => e.actorId === person.id);
    const countKind = (kind: ProjectEvent["kind"]) => mine.filter((e) => e.kind === kind).length;

    const linesChanged = mine.reduce((sum, e) => sum + (e.stats?.additions ?? 0) + (e.stats?.deletions ?? 0), 0);

    const activeDays = new Set(mine.map((e) => new Date(Date.parse(e.occurredAt)).toISOString().slice(0, 10))).size;

    let lastActiveAt: string | undefined;
    let latest = -Infinity;
    for (const e of mine) {
      const t = Date.parse(e.occurredAt);
      if (t > latest) {
        latest = t;
        lastActiveAt = e.occurredAt;
      }
    }

    const activity = new Array<number>(windowDays).fill(0);
    if (windowDays > 0) {
      for (const e of mine) {
        const index = Math.floor((Date.parse(e.occurredAt) - startMs) / DAY_MS);
        activity[Math.min(windowDays - 1, Math.max(0, index))] += 1;
      }
    }

    const areaCounts = new Map<string, number>();
    for (const e of mine) {
      for (const area of e.areas) areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
    }
    const eventAreas = topByCount(areaCounts, MAX_AREAS);
    const areas = eventAreas.length > 0 ? eventAreas : assignment.areas.slice(0, MAX_AREAS);

    const myTickets = projectTickets.filter((t) => t.assigneeId === person.id);

    // Hours from thread creation to this person's first reply, for threads assigned to them.
    const replyHours: number[] = [];
    for (const thread of projectThreads) {
      if (thread.assigneeId !== person.id) continue;
      const created = Date.parse(thread.createdAt);
      let firstReply: number | undefined;
      for (const message of thread.messages) {
        if (message.authorId !== person.id) continue;
        const at = Date.parse(message.at);
        if (Number.isFinite(at) && at >= created && (firstReply === undefined || at < firstReply)) firstReply = at;
      }
      if (firstReply !== undefined) replyHours.push((firstReply - created) / HOUR_MS);
    }

    const highlights = [...mine]
      .sort((a, b) => b.importance - a.importance || Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
      .slice(0, MAX_HIGHLIGHTS)
      .map((e) => e.title);

    stats.push({
      personId: person.id,
      name: person.name,
      projectRole: assignment.projectRole,
      commits: countKind("commit"),
      pullRequests: countKind("pull_request"),
      reviews: countKind("review"),
      ticketsClosed: myTickets.filter((t) => inWindow(t.closedAt)).length,
      ticketsInProgress: myTickets.filter((t) => t.status === "in_progress" || t.status === "in_review").length,
      linesChanged,
      medianResponseHours: median(replyHours),
      lastActiveAt,
      activeDays,
      areas,
      activity,
      highlights,
    });
  }

  return stats.sort((a, b) => activityScore(b) - activityScore(a) || compareStrings(a.name, b.name));
}
