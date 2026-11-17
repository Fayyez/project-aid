import { AccessError, canAccessProject, requireProject, visibleProjects } from "@/lib/auth/access";
import { loadPeople, loadProjectData, searchEvents } from "@/lib/knowledge/evidence";
import { computeContributions } from "@/lib/metrics";
import { getStore } from "@/lib/store";
import type {
  Actor,
  AgentRun,
  ContributionStats,
  DailyDigest,
  Deployment,
  Incident,
  Note,
  Person,
  Project,
  ProjectEvent,
  ProjectSnapshot,
  Report,
  Thread,
  Ticket,
  TicketStatus,
} from "@/lib/types";
import { DAY, byNewest } from "@/lib/util";
import { getSnapshot } from "./snapshot";

/**
 * Read models for the dashboard, the MCP tools and the API. Every function
 * takes the caller and only returns projects that caller may see.
 */

const OPEN_INCIDENT = new Set(["detected", "triaging", "fix_proposed", "awaiting_approval", "escalated"]);

export interface PersonView {
  id: string;
  name: string;
  email: string;
  title?: string;
  role: Person["role"];
  handles: Person["handles"];
  canSignIn: boolean;
}

/** People are returned without their password hash. */
export function toPersonView(person: Person): PersonView {
  return { id: person.id, name: person.name, email: person.email, title: person.title, role: person.role, handles: person.handles, canSignIn: Boolean(person.passwordHash) };
}

export interface AttentionItem {
  projectId: string;
  projectName: string;
  kind: "incident" | "deployment" | "pace" | "question" | "approval" | "blocked";
  tone: "danger" | "warning" | "info";
  text: string;
  href: string;
}

export interface PortfolioView {
  projects: { project: Project; snapshot: ProjectSnapshot; directors: string[]; teamSize: number }[];
  totals: { projects: number; red: number; amber: number; green: number; openIncidents: number; openQuestions: number; unreadAnswers: number; eventsLast24h: number };
  attention: AttentionItem[];
  recentEvents: (ProjectEvent & { projectName: string })[];
}

export async function getPortfolio(actor: Actor): Promise<PortfolioView> {
  const store = await getStore();
  const projects = await visibleProjects(actor);
  const people = await loadPeople();
  const [incidents, threads, events] = await Promise.all([store.list("incidents"), store.list("threads"), store.list("events")]);
  const rows = await Promise.all(
    projects.map(async (project) => ({
      project,
      snapshot: await getSnapshot(project),
      directors: project.pdIds.map((id) => people.get(id)?.name).filter((name): name is string => Boolean(name)),
      teamSize: project.team.length,
    })),
  );
  const visibleIds = new Set(projects.map((project) => project.id));
  const nameOf = new Map(projects.map((project) => [project.id, project.name]));
  const attention: AttentionItem[] = [];
  for (const incident of incidents.filter((i) => visibleIds.has(i.projectId) && OPEN_INCIDENT.has(i.status))) {
    const waiting = incident.status === "awaiting_approval" || (incident.fix?.status === "proposed" && incident.status !== "triaging");
    attention.push({
      projectId: incident.projectId,
      projectName: nameOf.get(incident.projectId) ?? "",
      kind: waiting ? "approval" : "incident",
      tone: incident.severity === "SEV1" || incident.severity === "SEV2" ? "danger" : "warning",
      text: waiting ? `${incident.key}: a reviewed fix is waiting for your decision` : `${incident.key} (${incident.severity}) ${incident.status.replace("_", " ")}: ${incident.title}`,
      href: `/projects/${incident.projectId}/incidents/${incident.id}`,
    });
  }
  for (const { project, snapshot } of rows) {
    if (snapshot.pace.status === "behind" || snapshot.pace.status === "at_risk") {
      attention.push({ projectId: project.id, projectName: project.name, kind: "pace", tone: snapshot.pace.status === "behind" ? "danger" : "warning", text: snapshot.pace.explanation, href: `/projects/${project.id}` });
    }
    if (snapshot.pace.blockedTickets > 0) {
      attention.push({ projectId: project.id, projectName: project.name, kind: "blocked", tone: "warning", text: `${snapshot.pace.blockedTickets} blocked ticket${snapshot.pace.blockedTickets === 1 ? "" : "s"}`, href: `/projects/${project.id}/tickets?status=blocked` });
    }
  }
  const myThreads = threads.filter((thread) => visibleIds.has(thread.projectId));
  for (const thread of myThreads.filter((t) => t.unreadForWatchers && t.watcherIds.includes(actor.id))) {
    attention.push({ projectId: thread.projectId, projectName: nameOf.get(thread.projectId) ?? "", kind: "question", tone: "info", text: `New answer: ${thread.subject}`, href: `/inbox/${thread.id}` });
  }
  const order = { danger: 0, warning: 1, info: 2 };
  attention.sort((a, b) => order[a.tone] - order[b.tone]);
  const recentEvents = events
    .filter((event) => visibleIds.has(event.projectId) && event.importance >= 3)
    .sort(byNewest((event) => event.occurredAt))
    .slice(0, 12)
    .map((event) => ({ ...event, projectName: nameOf.get(event.projectId) ?? "" }));
  return {
    projects: rows,
    totals: {
      projects: rows.length,
      red: rows.filter((r) => r.snapshot.health === "red").length,
      amber: rows.filter((r) => r.snapshot.health === "amber").length,
      green: rows.filter((r) => r.snapshot.health === "green").length,
      openIncidents: rows.reduce((sum, r) => sum + r.snapshot.openIncidents, 0),
      openQuestions: rows.reduce((sum, r) => sum + r.snapshot.openQuestions, 0),
      unreadAnswers: myThreads.filter((t) => t.unreadForWatchers && t.watcherIds.includes(actor.id)).length,
      eventsLast24h: rows.reduce((sum, r) => sum + r.snapshot.eventsLast24h, 0),
    },
    attention: attention.slice(0, 12),
    recentEvents,
  };
}

/** Data for the application shell: sidebar projects and badge counts. */
export async function getShellData(actor: Actor): Promise<{ projects: { id: string; name: string; key: string; health: ProjectSnapshot["health"] }[]; counts: { inbox: number; incidents: number } }> {
  const store = await getStore();
  const projects = await visibleProjects(actor);
  const ids = new Set(projects.map((project) => project.id));
  const [threads, incidents] = await Promise.all([store.list("threads"), store.list("incidents")]);
  const snapshots = await Promise.all(projects.map((project) => getSnapshot(project)));
  return {
    projects: projects.map((project, index) => ({ id: project.id, name: project.name, key: project.key, health: snapshots[index].health })),
    counts: {
      inbox: threads.filter((t) => ids.has(t.projectId) && t.watcherIds.includes(actor.id) && (t.unreadForWatchers || t.status === "open")).length,
      incidents: incidents.filter((i) => ids.has(i.projectId) && OPEN_INCIDENT.has(i.status)).length,
    },
  };
}

export interface TeamMemberView extends PersonView {
  projectRole: string;
  areas: string[];
  allocationPct?: number;
}

export function teamOf(project: Project, people: Map<string, Person>): TeamMemberView[] {
  const team: TeamMemberView[] = [];
  for (const member of project.team) {
    const person = people.get(member.personId);
    if (person) team.push({ ...toPersonView(person), projectRole: member.projectRole, areas: member.areas, allocationPct: member.allocationPct });
  }
  return team;
}

export interface ProjectOverview {
  project: Project;
  snapshot: ProjectSnapshot;
  team: TeamMemberView[];
  directors: PersonView[];
  latestDigest: DailyDigest | null;
  recentEvents: ProjectEvent[];
  openIncidents: Incident[];
  openThreads: Thread[];
  deployments: Deployment[];
  counts: { events: number; tickets: number; reports: number; incidents: number };
}

export async function getProjectOverview(actor: Actor, projectId: string): Promise<ProjectOverview> {
  const project = await requireProject(actor, projectId);
  const [data, people, snapshot] = await Promise.all([loadProjectData(project, actor), loadPeople(), getSnapshot(project)]);
  return {
    project,
    snapshot,
    team: teamOf(project, people),
    directors: project.pdIds.map((id) => people.get(id)).filter((p): p is Person => Boolean(p)).map(toPersonView),
    latestDigest: data.digests[0] ?? null,
    recentEvents: data.events.slice(0, 12),
    openIncidents: data.incidents.filter((incident) => OPEN_INCIDENT.has(incident.status)),
    openThreads: data.threads.filter((thread) => thread.status !== "closed").slice(0, 5),
    deployments: data.deployments.slice(0, 8),
    counts: { events: data.events.length, tickets: data.tickets.length, reports: data.reports.length, incidents: data.incidents.length },
  };
}

export interface ActivityFilters {
  q?: string;
  kind?: string;
  personId?: string;
  days?: number;
  minImportance?: number;
  limit?: number;
}

export async function listActivity(actor: Actor, projectId: string, filters: ActivityFilters = {}): Promise<{ project: Project; events: ProjectEvent[]; total: number; team: TeamMemberView[] }> {
  const project = await requireProject(actor, projectId);
  const [data, people] = await Promise.all([loadProjectData(project, actor), loadPeople()]);
  const days = filters.days && filters.days > 0 ? filters.days : 30;
  let events = filters.q
    ? searchEvents(data.events, { query: filters.q, sinceDays: days, limit: 200 })
    : data.events.filter((event) => Date.now() - new Date(event.occurredAt).getTime() <= days * DAY);
  if (filters.kind) events = events.filter((event) => event.kind === filters.kind);
  if (filters.personId) events = events.filter((event) => event.actorId === filters.personId);
  if (filters.minImportance) events = events.filter((event) => event.importance >= (filters.minImportance ?? 1));
  return { project, events: events.slice(0, filters.limit ?? 100), total: events.length, team: teamOf(project, people) };
}

export async function listTickets(actor: Actor, projectId: string, filters: { status?: string; assigneeId?: string; q?: string } = {}): Promise<{ project: Project; tickets: Ticket[]; team: TeamMemberView[]; counts: Record<TicketStatus, number> }> {
  const project = await requireProject(actor, projectId);
  const [data, people] = await Promise.all([loadProjectData(project, actor), loadPeople()]);
  const counts = { draft: 0, todo: 0, in_progress: 0, in_review: 0, blocked: 0, done: 0, cancelled: 0 } as Record<TicketStatus, number>;
  for (const ticket of data.tickets) counts[ticket.status] += 1;
  let tickets = data.tickets;
  if (filters.status === "open") tickets = tickets.filter((t) => ["todo", "in_progress", "in_review", "blocked"].includes(t.status));
  else if (filters.status) tickets = tickets.filter((t) => t.status === filters.status);
  if (filters.assigneeId) tickets = tickets.filter((t) => t.assigneeId === filters.assigneeId);
  if (filters.q) {
    const q = filters.q.toLowerCase();
    tickets = tickets.filter((t) => `${t.key} ${t.title} ${t.description} ${t.labels.join(" ")}`.toLowerCase().includes(q));
  }
  const rank: Record<string, number> = { blocked: 0, in_progress: 1, in_review: 2, todo: 3, draft: 4, done: 5, cancelled: 6 };
  tickets = [...tickets].sort((a, b) => rank[a.status] - rank[b.status] || a.priority.localeCompare(b.priority) || b.updatedAt.localeCompare(a.updatedAt));
  return { project, tickets, team: teamOf(project, people), counts };
}

export async function listIncidents(actor: Actor, projectId?: string): Promise<(Incident & { projectName: string })[]> {
  const store = await getStore();
  const projects = projectId ? [await requireProject(actor, projectId)] : await visibleProjects(actor);
  const names = new Map(projects.map((project) => [project.id, project.name]));
  return (await store.list("incidents"))
    .filter((incident) => names.has(incident.projectId))
    .sort(byNewest((incident) => incident.detectedAt))
    .map((incident) => ({ ...incident, projectName: names.get(incident.projectId) ?? "" }));
}

export interface IncidentDetail {
  incident: Incident;
  project: Project;
  deployment: Deployment | null;
  suspectEvents: ProjectEvent[];
  owner: PersonView | null;
  thread: Thread | null;
  report: Report | null;
  run: AgentRun | null;
}

export async function getIncident(actor: Actor, incidentId: string): Promise<IncidentDetail> {
  const store = await getStore();
  const incident = await store.get("incidents", incidentId);
  if (!incident) throw new AccessError("Incident not found", 404);
  const project = await requireProject(actor, incident.projectId);
  const events = await store.list("events");
  const ownerId = incident.escalation?.personId ?? incident.triage?.suspectOwnerId;
  const [deployment, thread, report, run, owner] = await Promise.all([
    incident.trigger.deploymentId ? store.get("deployments", incident.trigger.deploymentId) : null,
    incident.escalation?.threadId ? store.get("threads", incident.escalation.threadId) : null,
    incident.reportId ? store.get("reports", incident.reportId) : null,
    incident.runId ? store.get("runs", incident.runId) : null,
    ownerId ? store.get("people", ownerId) : null,
  ]);
  return {
    incident,
    project,
    deployment,
    suspectEvents: (incident.triage?.suspectEventIds ?? []).map((id) => events.find((event) => event.id === id)).filter((event): event is ProjectEvent => Boolean(event)),
    owner: owner ? toPersonView(owner) : null,
    thread,
    report,
    run,
  };
}

export async function getTeamInsights(actor: Actor, projectId: string, windowDays = 14): Promise<{ project: Project; team: TeamMemberView[]; contributions: ContributionStats[]; windowDays: number; enabled: boolean }> {
  const project = await requireProject(actor, projectId);
  const [data, people] = await Promise.all([loadProjectData(project, actor), loadPeople()]);
  const enabled = project.features.contributionInsights;
  const contributions = enabled ? computeContributions({ project, people: Array.from(people.values()), events: data.events, tickets: data.tickets, threads: data.threads, windowDays, now: new Date() }) : [];
  return { project, team: teamOf(project, people), contributions, windowDays, enabled };
}

export async function listDigests(actor: Actor, projectId: string): Promise<{ project: Project; digests: DailyDigest[]; team: TeamMemberView[] }> {
  const project = await requireProject(actor, projectId);
  const [data, people] = await Promise.all([loadProjectData(project, actor), loadPeople()]);
  return { project, digests: data.digests.slice(0, 14), team: teamOf(project, people) };
}

export async function listReports(actor: Actor, projectId: string): Promise<{ project: Project; reports: Report[] }> {
  const project = await requireProject(actor, projectId);
  const data = await loadProjectData(project, actor);
  return { project, reports: data.reports };
}

export async function getReport(actor: Actor, reportId: string): Promise<{ report: Report; project: Project }> {
  const store = await getStore();
  const report = await store.get("reports", reportId);
  if (!report) throw new AccessError("Report not found", 404);
  return { report, project: await requireProject(actor, report.projectId) };
}

/** A director's own notes on a project. Notes are private to their author. */
export async function listNotes(actor: Actor, projectId: string): Promise<{ project: Project; notes: Note[] }> {
  const project = await requireProject(actor, projectId);
  const store = await getStore();
  const notes = (await store.list("notes"))
    .filter((note) => note.projectId === project.id && note.authorId === actor.id)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  return { project, notes };
}

export interface ThreadView extends Thread {
  projectName: string;
  assigneeName: string;
}

export async function listThreads(actor: Actor, filters: { projectId?: string; status?: string } = {}): Promise<ThreadView[]> {
  const store = await getStore();
  const projects = filters.projectId ? [await requireProject(actor, filters.projectId)] : await visibleProjects(actor);
  const names = new Map(projects.map((project) => [project.id, project.name]));
  const people = await loadPeople();
  return (await store.list("threads"))
    .filter((thread) => names.has(thread.projectId) && (!filters.status || thread.status === filters.status))
    .sort((a, b) => Number(b.unreadForWatchers) - Number(a.unreadForWatchers) || b.updatedAt.localeCompare(a.updatedAt))
    .map((thread) => ({ ...thread, replyTokenHash: "", projectName: names.get(thread.projectId) ?? "", assigneeName: people.get(thread.assigneeId)?.name ?? "Unknown" }));
}

export async function getThread(actor: Actor, threadId: string): Promise<{ thread: ThreadView; project: Project; relatedEvents: ProjectEvent[]; assignee: PersonView | null }> {
  const store = await getStore();
  const thread = await store.get("threads", threadId);
  if (!thread) throw new AccessError("Conversation not found", 404);
  const project = await requireProject(actor, thread.projectId);
  const people = await loadPeople();
  const events = await store.list("events");
  const assignee = people.get(thread.assigneeId);
  return {
    thread: { ...thread, replyTokenHash: "", projectName: project.name, assigneeName: assignee?.name ?? "Unknown" },
    project,
    relatedEvents: thread.relatedEventIds.map((id) => events.find((event) => event.id === id)).filter((event): event is ProjectEvent => Boolean(event)),
    assignee: assignee ? toPersonView(assignee) : null,
  };
}

export async function listRuns(actor: Actor, filters: { projectId?: string; workflow?: string; limit?: number } = {}): Promise<(AgentRun & { projectName?: string })[]> {
  const store = await getStore();
  const projects = await visibleProjects(actor);
  const names = new Map(projects.map((project) => [project.id, project.name]));
  return (await store.list("runs"))
    .filter((run) => (run.projectId ? names.has(run.projectId) : run.userId === actor.id || actor.role === "admin"))
    .filter((run) => (!filters.projectId || run.projectId === filters.projectId) && (!filters.workflow || run.workflow === filters.workflow))
    .sort(byNewest((run) => run.startedAt))
    .slice(0, filters.limit ?? 60)
    .map((run) => ({ ...run, projectName: run.projectId ? names.get(run.projectId) : undefined }));
}

export async function getRun(actor: Actor, runId: string): Promise<AgentRun & { projectName?: string }> {
  const store = await getStore();
  const run = await store.get("runs", runId);
  if (!run) throw new AccessError("Run not found", 404);
  if (run.projectId) {
    const project = await store.get("projects", run.projectId);
    if (!project || !canAccessProject(actor, project)) throw new AccessError("Run not found", 404);
    return { ...run, projectName: project.name };
  }
  if (run.userId !== actor.id && actor.role !== "admin") throw new AccessError("Run not found", 404);
  return run;
}

export async function listPeople(actor: Actor): Promise<PersonView[]> {
  if (actor.role === "member") throw new AccessError("Not allowed");
  const store = await getStore();
  return (await store.list("people")).sort((a, b) => a.name.localeCompare(b.name)).map(toPersonView);
}

export async function getProjectSettings(actor: Actor, projectId: string): Promise<{ project: Project; people: PersonView[]; team: TeamMemberView[] }> {
  const project = await requireProject(actor, projectId);
  const people = await loadPeople();
  return { project, people: Array.from(people.values()).sort((a, b) => a.name.localeCompare(b.name)).map(toPersonView), team: teamOf(project, people) };
}
