import type { PaceMetrics, PaceStatus, Project, Ticket } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
/** Number of seven-day windows in the throughput series. */
const WINDOWS = 8;
/** Windows that form the current velocity; the windows before them form the baseline. */
const RECENT_WINDOWS = 4;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Rounds half away from zero to the given decimal places. Never returns -0 or NaN. */
function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return ((Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor) || 0;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function elapsedPct(startDate: string, targetDate: string, nowMs: number): number {
  const start = Date.parse(startDate);
  const target = Date.parse(targetDate);
  if (!Number.isFinite(start) || !Number.isFinite(target)) return 0;
  const total = target - start;
  if (total <= 0) return nowMs >= target ? 100 : 0;
  const pct = ((nowMs - start) / total) * 100;
  return roundTo(Math.min(100, Math.max(0, pct)), 0);
}

function formatDay(date: Date, nowYear: number): string {
  const day = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  return date.getUTCFullYear() === nowYear ? day : `${day} ${date.getUTCFullYear()}`;
}

function plural(count: number, word: string): string {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

interface ExplainInput {
  scopeSize: number;
  status: PaceStatus;
  velocity: number;
  velocityTrendPct: number;
  openTickets: number;
  doneTickets: number;
  blockedTickets: number;
  projected?: Date;
  slipDays: number;
  nowYear: number;
}

function explain(input: ExplainInput): string {
  const { scopeSize, status, velocity, velocityTrendPct, openTickets, doneTickets, blockedTickets } = input;

  if (scopeSize === 0) return "No tickets are in scope yet, so pace cannot be measured.";
  if (openTickets === 0) {
    return scopeSize === 1 ? "The only in-scope ticket is done." : `All ${scopeSize} in-scope tickets are done.`;
  }
  if (velocity === 0) {
    if (doneTickets === 0) {
      return "No tickets have closed in the last four weeks and none are done, so there is no pace to project.";
    }
    return `No tickets have closed in the last four weeks, with ${openTickets} still open, so no completion date can be projected.`;
  }

  let first = `Closing about ${plural(velocity, "ticket")} a week with ${openTickets} left`;
  if (input.projected) {
    const when = formatDay(input.projected, input.nowYear);
    const slip = input.slipDays;
    const timing =
      slip === 0 ? "on the target date" : `${plural(Math.abs(slip), "day")} ${slip > 0 ? "after" : "before"} the target`;
    first += `; projected to finish ${when}, ${timing}.`;
  } else {
    first += ".";
  }

  // Only mention the falling trend or blocked tickets when they contributed to an at-risk status.
  const drivers: string[] = [];
  if (status === "at_risk" && velocityTrendPct <= -30) {
    drivers.push(`throughput is down ${Math.abs(velocityTrendPct)}% on the previous four weeks`);
  }
  if (status === "at_risk" && blockedTickets >= 3) {
    drivers.push(`${blockedTickets} tickets are blocked`);
  }
  if (drivers.length === 0) return first;
  const second = drivers.join(", and ");
  return `${first} ${second.charAt(0).toUpperCase()}${second.slice(1)}.`;
}

/**
 * Pace of a project against its schedule. Pure: `now` is passed in explicitly.
 *
 * Scope is every ticket except cancelled and draft ones. Throughput counts scoped
 * tickets by their closedAt date in the eight seven-day windows ending at `now`.
 */
export function computePace(project: Project, tickets: Ticket[], now: Date): PaceMetrics {
  const nowMs = now.getTime();
  const scope = tickets.filter((t) => t.status !== "cancelled" && t.status !== "draft");
  const doneTickets = scope.filter((t) => t.status === "done").length;
  const blockedTickets = scope.filter((t) => t.status === "blocked").length;
  const openTickets = scope.length - doneTickets;
  const progressPct = scope.length === 0 ? 0 : roundTo((doneTickets / scope.length) * 100, 0);
  const timeElapsedPct = elapsedPct(project.startDate, project.targetDate, nowMs);

  // Index WINDOWS - 1 is the window ending at `now`; index 0 is the oldest.
  const weeklyThroughput: number[] = new Array<number>(WINDOWS).fill(0);
  for (const ticket of scope) {
    if (!ticket.closedAt) continue;
    const closed = Date.parse(ticket.closedAt);
    if (!Number.isFinite(closed) || closed > nowMs) continue;
    const weeksAgo = Math.floor((nowMs - closed) / WEEK_MS);
    if (weeksAgo < WINDOWS) weeklyThroughput[WINDOWS - 1 - weeksAgo] += 1;
  }

  const recentAvg = average(weeklyThroughput.slice(WINDOWS - RECENT_WINDOWS));
  const baselineAvg = average(weeklyThroughput.slice(0, WINDOWS - RECENT_WINDOWS));
  const velocity = roundTo(recentAvg, 1);
  const velocityTrendPct = baselineAvg === 0 ? 0 : roundTo(((recentAvg - baselineAvg) / baselineAvg) * 100, 0);

  let projected: Date | undefined;
  let slipDays = 0;
  if (velocity > 0) {
    const weeks = openTickets / velocity;
    projected = new Date(nowMs + weeks * WEEK_MS);
    const targetMs = Date.parse(project.targetDate);
    if (Number.isFinite(targetMs)) slipDays = roundTo((projected.getTime() - targetMs) / DAY_MS, 0);
  }

  const stalled = velocity === 0;
  let status: PaceStatus;
  if (scope.length === 0 || (stalled && doneTickets === 0)) {
    status = "unknown";
  } else if (slipDays > 14 || (stalled && openTickets > 0)) {
    status = "behind";
  } else if (slipDays > 3 || velocityTrendPct <= -30 || blockedTickets >= 3) {
    status = "at_risk";
  } else if (slipDays < -7) {
    status = "ahead";
  } else {
    status = "on_track";
  }

  const explanation = explain({
    scopeSize: scope.length,
    status,
    velocity,
    velocityTrendPct,
    openTickets,
    doneTickets,
    blockedTickets,
    projected,
    slipDays,
    nowYear: now.getUTCFullYear(),
  });

  return {
    status,
    progressPct,
    timeElapsedPct,
    weeklyThroughput,
    velocity,
    velocityTrendPct,
    openTickets,
    doneTickets,
    blockedTickets,
    projectedCompletion: projected?.toISOString(),
    slipDays,
    explanation,
  };
}
