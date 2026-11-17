import { loadPeople, loadProjectData, type ProjectData } from "@/lib/knowledge/evidence";
import { computePace } from "@/lib/metrics";
import { getStore } from "@/lib/store";
import type { Health, PaceMetrics, Person, Project, ProjectSnapshot, Ticket } from "@/lib/types";
import { DAY, HOUR, isoDate, nowIso } from "@/lib/util";

const PRIORITY_ORDER: Record<Ticket["priority"], number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const OPEN_INCIDENT = new Set(["detected", "triaging", "fix_proposed", "awaiting_approval", "escalated"]);

/**
 * Health is decided by explicit rules, never by a model, so a director can
 * always see exactly why a project is amber or red.
 */
export function computeHealth(data: ProjectData, pace: PaceMetrics, now: Date): { health: Health; reasons: string[] } {
  const red: string[] = [];
  const amber: string[] = [];
  const openIncidents = data.incidents.filter((incident) => OPEN_INCIDENT.has(incident.status));
  for (const incident of openIncidents) {
    const line = `${incident.key} is open (${incident.severity}): ${incident.title}`;
    if (incident.severity === "SEV1" || incident.severity === "SEV2") red.push(line);
    else amber.push(line);
  }
  const latestByEnv = latestDeployments(data);
  for (const deployment of latestByEnv) {
    if (deployment.status === "failed" || deployment.status === "degraded") {
      const line = `Latest ${deployment.environment} deployment ${deployment.status === "failed" ? "failed" : "is degraded"}`;
      if (/prod/i.test(deployment.environment)) red.push(line);
      else amber.push(line);
    }
  }
  if (pace.status === "behind") red.push(`Behind schedule: ${pace.explanation}`);
  if (pace.status === "at_risk") amber.push(`Pace at risk: ${pace.explanation}`);
  if (pace.blockedTickets >= 2) amber.push(`${pace.blockedTickets} tickets are blocked`);
  for (const milestone of data.project.milestones) {
    if (milestone.status === "done") continue;
    const due = new Date(milestone.dueDate).getTime();
    if (due < now.getTime()) amber.push(`Milestone "${milestone.name}" was due ${isoDate(milestone.dueDate)} and is not done`);
    else if (milestone.status === "at_risk" && due - now.getTime() < 14 * DAY) amber.push(`Milestone "${milestone.name}" (due ${isoDate(milestone.dueDate)}) is marked at risk`);
  }
  const staleQuestions = data.threads.filter((thread) => thread.status === "open" && now.getTime() - new Date(thread.createdAt).getTime() > 48 * HOUR);
  if (staleQuestions.length) amber.push(`${staleQuestions.length} question${staleQuestions.length === 1 ? "" : "s"} to the team unanswered for over two days`);

  if (red.length) return { health: "red", reasons: [...red, ...amber].slice(0, 5) };
  if (amber.length) return { health: "amber", reasons: amber.slice(0, 5) };
  const good = [pace.status === "unknown" ? "No delivery risks recorded" : pace.explanation];
  const prod = latestByEnv.find((d) => /prod/i.test(d.environment));
  if (prod?.status === "success") good.push(`Production is healthy${prod.version ? ` on ${prod.version}` : ""}`);
  return { health: "green", reasons: good };
}

export function latestDeployments(data: ProjectData) {
  const seen = new Set<string>();
  // Deployments arrive newest first.
  return data.deployments.filter((deployment) => {
    if (seen.has(deployment.environment)) return false;
    seen.add(deployment.environment);
    return true;
  });
}

function todoReason(ticket: Ticket, now: Date): string {
  if (ticket.status === "blocked") return "Blocked";
  if (ticket.dueDate) {
    const days = Math.round((new Date(ticket.dueDate).getTime() - now.getTime()) / DAY);
    if (days < 0) return `Overdue by ${-days}d`;
    if (days <= 7) return `Due in ${days}d`;
  }
  if (ticket.priority === "P0") return "Critical priority";
  if (ticket.priority === "P1") return "High priority";
  if (!ticket.assigneeId) return "Unassigned";
  return ticket.status === "in_review" ? "Waiting for review" : "Next in queue";
}

export function buildSnapshot(data: ProjectData, people: Map<string, Person>, now: Date): ProjectSnapshot {
  const { project } = data;
  const pace = computePace(project, data.tickets, now);
  const { health, reasons } = computeHealth(data, pace, now);
  const recent = data.events.filter((event) => now.getTime() - new Date(event.occurredAt).getTime() <= 3 * DAY);
  const keyUpdates = [...(recent.length >= 3 ? recent : data.events.slice(0, 12))]
    .sort((a, b) => b.importance - a.importance || b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 5)
    .map((event, index) => ({
      text: event.title,
      citation: { ref: `E${index + 1}`, type: "event" as const, id: event.id, title: event.title, projectId: project.id, url: event.url, occurredAt: event.occurredAt },
    }));
  const open = data.tickets.filter((ticket) => ["todo", "in_progress", "in_review", "blocked"].includes(ticket.status));
  const topTodos = open
    .sort((a, b) => {
      const blocked = Number(b.status === "blocked") - Number(a.status === "blocked");
      if (blocked) return blocked;
      const priority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priority) return priority;
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    })
    .slice(0, 6)
    .map((ticket) => ({
      ticketId: ticket.id,
      key: ticket.key,
      title: ticket.title,
      priority: ticket.priority,
      status: ticket.status,
      assigneeName: ticket.assigneeId ? people.get(ticket.assigneeId)?.name : undefined,
      reason: todoReason(ticket, now),
    }));
  const deploy = project.deployTargets.length
    ? project.deployTargets.map((target) => {
        const latest = data.deployments.find((d) => d.environment === target.environment);
        return { environment: target.environment, status: latest?.status ?? ("unknown" as const), version: latest?.version, at: latest?.finishedAt ?? latest?.startedAt, deploymentId: latest?.id };
      })
    : latestDeployments(data).map((d) => ({ environment: d.environment, status: d.status, version: d.version, at: d.finishedAt ?? d.startedAt, deploymentId: d.id }));
  const openIncidents = data.incidents.filter((incident) => OPEN_INCIDENT.has(incident.status)).length;
  const openQuestions = data.threads.filter((thread) => thread.status === "open").length;
  const eventsLast24h = data.events.filter((event) => now.getTime() - new Date(event.occurredAt).getTime() <= DAY).length;
  const headline =
    health === "green"
      ? pace.status === "ahead"
        ? "Ahead of plan with no open risks"
        : "On track with no open risks"
      : reasons[0];
  return {
    id: project.id,
    projectId: project.id,
    health,
    healthReasons: reasons,
    headline,
    keyUpdates,
    topTodos,
    pace,
    deploy,
    openIncidents,
    openQuestions,
    eventsLast24h,
    updatedAt: nowIso(),
  };
}

/** Recomputes and stores the dashboard snapshot of a project. Pure rules, no model call. */
export async function refreshSnapshot(project: Project): Promise<ProjectSnapshot> {
  const store = await getStore();
  const current = (await store.get("projects", project.id)) ?? project;
  const [data, people] = await Promise.all([loadProjectData(current), loadPeople()]);
  const snapshot = buildSnapshot(data, people, new Date());
  await store.put("snapshots", snapshot);
  return snapshot;
}

/** Returns the stored snapshot, recomputing it when missing or older than ten minutes. */
export async function getSnapshot(project: Project): Promise<ProjectSnapshot> {
  const store = await getStore();
  const existing = await store.get("snapshots", project.id);
  if (existing && Date.now() - new Date(existing.updatedAt).getTime() < 10 * 60 * 1000) return existing;
  return refreshSnapshot(project);
}
