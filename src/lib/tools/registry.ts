import { z } from "zod";
import { AccessError, assertWrite, visibleProjects } from "@/lib/auth/access";
import { audit } from "@/lib/security/audit";
import * as commands from "@/lib/services/commands";
import * as learning from "@/lib/services/learning";
import * as queries from "@/lib/services/queries";
import { getStore } from "@/lib/store";
import type { Actor, Project } from "@/lib/types";
import { isoDate, truncate } from "@/lib/util";

/**
 * The platform's capabilities as tools. This one registry backs the MCP server
 * (so any MCP client - Claude, Copilot Studio, an IDE - can drive Project Aid)
 * and documents the surface in the settings page. Every tool runs as the
 * authenticated caller and goes through the same services, and therefore the
 * same access checks, as the web portal.
 */

export interface AidTool<Shape extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  /** Mutating tools need a token with the write scope. */
  mutating: boolean;
  shape: Shape;
  handler(actor: Actor, input: z.infer<z.ZodObject<Shape>>): Promise<unknown>;
}

function tool<Shape extends z.ZodRawShape>(definition: AidTool<Shape>): AidTool {
  return definition as unknown as AidTool;
}

const projectRef = z.string().describe("Project id, key (e.g. ATLAS) or name");

/** Resolves a project the caller may see by id, key or (partial) name. */
async function resolveProject(actor: Actor, ref: string): Promise<Project> {
  const wanted = ref.trim().toLowerCase();
  const projects = await visibleProjects(actor);
  const match =
    projects.find((project) => project.id.toLowerCase() === wanted || project.key.toLowerCase() === wanted) ??
    projects.find((project) => project.name.toLowerCase() === wanted) ??
    projects.find((project) => project.name.toLowerCase().includes(wanted) && wanted.length >= 3);
  if (!match) throw new AccessError(`No project matching "${truncate(ref, 40)}". Available: ${projects.map((project) => project.key).join(", ") || "none"}.`, 404);
  return match;
}

async function resolveIncidentId(actor: Actor, ref: string): Promise<string> {
  const wanted = ref.trim().toLowerCase();
  const incident = (await queries.listIncidents(actor)).find((candidate) => candidate.id.toLowerCase() === wanted || candidate.key.toLowerCase() === wanted);
  if (!incident) throw new AccessError(`No incident matching "${truncate(ref, 40)}".`, 404);
  return incident.id;
}

const draftShape = z.object({
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()).default([]),
  type: z.enum(["bug", "feature", "task", "question", "chore"]),
  priority: z.enum(["P0", "P1", "P2", "P3"]),
  labels: z.array(z.string()).default([]),
  suggestedAssigneeId: z.string().optional(),
  rationale: z.string().default(""),
});

export const TOOLS: AidTool[] = [
  tool({
    name: "get_portfolio",
    title: "Portfolio overview",
    description: "Health, pace, deployment status and what needs attention across every project the caller directs. Start here.",
    mutating: false,
    shape: {},
    async handler(actor) {
      const view = await queries.getPortfolio(actor);
      return {
        totals: view.totals,
        needsAttention: view.attention.map(({ projectName, kind, text }) => ({ project: projectName, kind, text })),
        projects: view.projects.map(({ project, snapshot }) => ({
          id: project.id,
          key: project.key,
          name: project.name,
          client: project.client,
          health: snapshot.health,
          headline: snapshot.headline,
          reasons: snapshot.healthReasons,
          progressPct: snapshot.pace.progressPct,
          pace: snapshot.pace.status,
          deployments: snapshot.deploy.map((d) => `${d.environment}: ${d.status}${d.version ? ` (${d.version})` : ""}`),
          openIncidents: snapshot.openIncidents,
          openQuestions: snapshot.openQuestions,
        })),
      };
    },
  }),
  tool({
    name: "get_project_status",
    title: "Project status",
    description: "Detailed status of one project: health with reasons, progress and pace, milestones, deployments, key updates, most important pending work and the team.",
    mutating: false,
    shape: { project: projectRef },
    async handler(actor, input) {
      const project = await resolveProject(actor, input.project);
      const view = await queries.getProjectOverview(actor, project.id);
      return {
        project: { id: project.id, key: project.key, name: project.name, client: project.client, targetDate: isoDate(project.targetDate) },
        health: view.snapshot.health,
        reasons: view.snapshot.healthReasons,
        pace: view.snapshot.pace,
        milestones: project.milestones.map((m) => ({ name: m.name, due: isoDate(m.dueDate), status: m.status })),
        deployments: view.snapshot.deploy,
        keyUpdates: view.snapshot.keyUpdates.map((update) => update.text),
        topTodos: view.snapshot.topTodos,
        openIncidents: view.openIncidents.map((i) => ({ key: i.key, severity: i.severity, status: i.status, title: i.title })),
        team: view.team.map((member) => ({ name: member.name, role: member.projectRole, areas: member.areas })),
        latestDailySync: view.latestDigest ? { date: view.latestDigest.date, headline: view.latestDigest.headline } : null,
      };
    },
  }),
  tool({
    name: "search_activity",
    title: "Search project activity",
    description: "Search commits, pull requests, messages, documents, deployments and ticket changes of a project. Filter by keywords, person, kind and time.",
    mutating: false,
    shape: {
      project: projectRef,
      query: z.string().optional().describe("Keywords"),
      days: z.number().int().min(1).max(365).optional().describe("How far back to look (default 30)"),
      person: z.string().optional().describe("Team member name"),
      kind: z.string().optional().describe("commit, pull_request, message, document, deployment, ticket, incident, clarification"),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async handler(actor, input) {
      const project = await resolveProject(actor, input.project);
      const base = await queries.listActivity(actor, project.id, { days: 1 });
      const personId = input.person ? base.team.find((member) => member.name.toLowerCase().includes(input.person!.toLowerCase()))?.id : undefined;
      if (input.person && !personId) throw new Error(`No team member matching "${truncate(input.person, 40)}" on ${project.name}.`);
      const view = await queries.listActivity(actor, project.id, { q: input.query, days: input.days, kind: input.kind, personId, limit: input.limit ?? 20 });
      return {
        total: view.total,
        events: view.events.map((event) => ({ id: event.id, when: event.occurredAt, kind: event.kind, who: event.actorName, title: event.title, summary: event.summary, areas: event.areas, importance: event.importance, clarity: event.clarity, url: event.url })),
      };
    },
  }),
  tool({
    name: "list_tickets",
    title: "List tickets",
    description: "Tickets of a project, optionally filtered by status (open, blocked, todo, in_progress, in_review, done) and keywords.",
    mutating: false,
    shape: { project: projectRef, status: z.string().optional(), query: z.string().optional() },
    async handler(actor, input) {
      const project = await resolveProject(actor, input.project);
      const view = await queries.listTickets(actor, project.id, { status: input.status, q: input.query });
      const names = new Map(view.team.map((member) => [member.id, member.name]));
      return {
        counts: view.counts,
        tickets: view.tickets.slice(0, 40).map((t) => ({ key: t.key, title: t.title, type: t.type, priority: t.priority, status: t.status, assignee: t.assigneeId ? names.get(t.assigneeId) : null, due: t.dueDate ? isoDate(t.dueDate) : null })),
      };
    },
  }),
  tool({
    name: "list_incidents",
    title: "List incidents",
    description: "Incidents across the caller's projects (or one project) with severity, status and whether a reviewed fix is waiting for approval.",
    mutating: false,
    shape: { project: projectRef.optional() },
    async handler(actor, input) {
      const project = input.project ? await resolveProject(actor, input.project) : undefined;
      return (await queries.listIncidents(actor, project?.id)).slice(0, 30).map((i) => ({ id: i.id, key: i.key, project: i.projectName, severity: i.severity, status: i.status, title: i.title, detectedAt: i.detectedAt, fixStatus: i.fix?.status ?? null }));
    },
  }),
  tool({
    name: "get_incident",
    title: "Incident detail",
    description: "Full detail of one incident: trigger, triage (suspected cause, confidence, impact), the proposed fix, its internal reviews, escalation and timeline.",
    mutating: false,
    shape: { incident: z.string().describe("Incident id or key, e.g. ORBIT-INC-1") },
    async handler(actor, input) {
      const detail = await queries.getIncident(actor, await resolveIncidentId(actor, input.incident));
      const { incident } = detail;
      return {
        key: incident.key,
        project: detail.project.name,
        title: incident.title,
        severity: incident.severity,
        status: incident.status,
        trigger: incident.trigger.detail,
        log: truncate(detail.deployment?.logExcerpt, 800),
        triage: incident.triage ? { summary: incident.triage.summary, suspectedCause: incident.triage.suspectedCause, confidence: incident.triage.confidence, impact: incident.triage.impact, nextSteps: incident.triage.nextSteps } : null,
        suspectChanges: detail.suspectEvents.map((event) => ({ title: event.title, author: event.actorName, when: event.occurredAt })),
        fix: incident.fix ? { kind: incident.fix.kind, status: incident.fix.status, risk: incident.fix.risk, summary: incident.fix.summary, steps: incident.fix.steps, rollbackPlan: incident.fix.rollbackPlan, testPlan: incident.fix.testPlan } : null,
        reviews: incident.reviews.map((review) => ({ round: review.round, verdict: review.verdict, concerns: review.concerns })),
        escalatedTo: detail.owner?.name ?? null,
        timeline: incident.timeline,
      };
    },
  }),
  tool({
    name: "get_daily_sync",
    title: "Daily sync",
    description: "The daily summary of a project: headline, highlights, risks, what is next and release note cards. Returns the latest unless a date is given.",
    mutating: false,
    shape: { project: projectRef, date: z.string().optional().describe("YYYY-MM-DD") },
    async handler(actor, input) {
      const project = await resolveProject(actor, input.project);
      const { digests } = await queries.listDigests(actor, project.id);
      const digest = input.date ? digests.find((candidate) => candidate.date === input.date) : digests[0];
      if (!digest) return { message: "No daily sync has been generated for that day. Use run_daily_sync to create one." };
      return { date: digest.date, headline: digest.headline, summary: digest.summary, highlights: digest.highlights, risks: digest.risks, nextUp: digest.nextUp, stats: digest.stats, releaseNotes: digest.cards.map((card) => ({ title: card.title, summary: card.summary, type: card.changeType, audience: card.audience })) };
    },
  }),
  tool({
    name: "get_team_contributions",
    title: "Team contributions",
    description: "Per-person activity on a project over a window: commits, pull requests, reviews, tickets closed, active days, areas and highlights. Activity signals, not a performance rating.",
    mutating: false,
    shape: { project: projectRef, days: z.number().int().min(1).max(90).optional() },
    async handler(actor, input) {
      const project = await resolveProject(actor, input.project);
      const view = await queries.getTeamInsights(actor, project.id, input.days ?? 14);
      if (!view.enabled) return { message: "Contribution insights are switched off for this project." };
      return { windowDays: view.windowDays, people: view.contributions.map(({ activity: _activity, personId: _id, ...rest }) => rest) };
    },
  }),
  tool({
    name: "list_team_questions",
    title: "Questions to the team",
    description: "Escalations and clarifying questions sent to team members, with their status and the latest reply.",
    mutating: false,
    shape: { project: projectRef.optional(), status: z.enum(["open", "answered", "closed"]).optional() },
    async handler(actor, input) {
      const project = input.project ? await resolveProject(actor, input.project) : undefined;
      return (await queries.listThreads(actor, { projectId: project?.id, status: input.status })).slice(0, 30).map((thread) => {
        const last = thread.messages[thread.messages.length - 1];
        return { id: thread.id, project: thread.projectName, kind: thread.kind, subject: thread.subject, askedTo: thread.assigneeName, status: thread.status, lastMessage: last ? { from: last.authorName, at: last.at, text: truncate(last.body, 400) } : null };
      });
    },
  }),
  tool({
    name: "list_reports",
    title: "List reports",
    description: "Reports generated for a project (progress, release notes, incident).",
    mutating: false,
    shape: { project: projectRef },
    async handler(actor, input) {
      const project = await resolveProject(actor, input.project);
      return (await queries.listReports(actor, project.id)).reports.map((r) => ({ id: r.id, kind: r.kind, title: r.title, createdAt: r.createdAt, grounding: r.grounding?.verdict ?? null }));
    },
  }),
  tool({
    name: "get_report",
    title: "Read a report",
    description: "The full markdown of a report, with its sources.",
    mutating: false,
    shape: { reportId: z.string() },
    async handler(actor, input) {
      const { report } = await queries.getReport(actor, input.reportId);
      return { title: report.title, kind: report.kind, markdown: report.markdown, sources: report.citations.map((c) => `[${c.ref}] ${c.title}`), grounding: report.grounding };
    },
  }),
  tool({
    name: "get_agent_run",
    title: "Agent run trace",
    description: "How a multi-agent run unfolded: each agent step, the model it ran on, whether it used the live model or the deterministic fallback, duration and cost.",
    mutating: false,
    shape: { runId: z.string() },
    async handler(actor, input) {
      const run = await queries.getRun(actor, input.runId);
      return { workflow: run.workflow, title: run.title, status: run.status, trigger: run.trigger, usage: run.usage, grounding: run.grounding, steps: run.steps.map((s) => ({ agent: s.agent, title: s.title, mode: s.mode, model: s.model, status: s.status, ms: s.durationMs, group: s.group, error: s.error })) };
    },
  }),
  tool({
    name: "ask_assistant",
    title: "Ask the project assistant",
    description: "Ask a question in plain language about one project or the whole portfolio. Runs the multi-agent pipeline (router, per-project researchers, writer, verifier) and returns a cited answer with a grounding verdict. Proposed actions are returned but never executed.",
    mutating: false,
    shape: { question: z.string().min(3).max(4000), project: projectRef.optional().describe("Limit the question to one project") },
    async handler(actor, input) {
      const project = input.project ? await resolveProject(actor, input.project) : undefined;
      const { askAssistant } = await import("@/lib/workflows/ask");
      const result = await askAssistant({ actor, question: input.question, projectId: project?.id, trigger: "mcp" });
      return {
        answer: result.answer,
        sources: result.citations.map((c) => ({ ref: c.ref, type: c.type, title: c.title, id: c.id })),
        grounding: { verdict: result.grounding.verdict, score: result.grounding.score, unsupported: result.grounding.unsupported },
        proposedActions: result.actions.map((action) => ({ kind: action.kind, label: action.label, description: action.description })),
        runId: result.run.id,
      };
    },
  }),
  tool({
    name: "draft_tickets_from_message",
    title: "Draft tickets from a message",
    description: "Turns a pasted message (for example from a client) into separate ticket drafts with type, priority, suggested assignee and duplicate detection. Creates nothing: review the drafts, then call create_tickets.",
    mutating: false,
    shape: { project: projectRef, message: z.string().min(5).max(8000) },
    async handler(actor, input) {
      const project = await resolveProject(actor, input.project);
      const { draftTicketsFromMessage } = await import("@/lib/workflows/tickets");
      const result = await draftTicketsFromMessage({ project, actor, text: input.message, trigger: "mcp" });
      return { drafts: result.drafts, questionsForSender: result.questions, runId: result.run.id };
    },
  }),
  tool({
    name: "create_tickets",
    title: "Create tickets",
    description: "Creates tickets from drafts that a person has reviewed (normally the output of draft_tickets_from_message, edited as needed).",
    mutating: true,
    shape: { project: projectRef, drafts: z.array(draftShape).min(1).max(20), originalMessage: z.string().max(8000).optional() },
    async handler(actor, input) {
      const project = await resolveProject(actor, input.project);
      const { createTickets } = await import("@/lib/workflows/tickets");
      const tickets = await createTickets({ project, actor, drafts: input.drafts, originText: input.originalMessage, originKind: "message" });
      return { created: tickets.map((ticket) => ({ key: ticket.key, title: ticket.title })) };
    },
  }),
  tool({
    name: "escalate_question",
    title: "Ask a team member",
    description: "Sends a question to the best-placed team member (or a named one) through the project's channel and opens a tracked thread. Use when the records do not answer a question.",
    mutating: true,
    shape: { project: projectRef, question: z.string().min(5).max(2000), assignee: z.string().optional().describe("Team member name; omit to route automatically") },
    async handler(actor, input) {
      const project = await resolveProject(actor, input.project);
      let assigneeId: string | undefined;
      if (input.assignee) {
        const overview = await queries.getProjectOverview(actor, project.id);
        assigneeId = overview.team.find((member) => member.name.toLowerCase().includes(input.assignee!.toLowerCase()))?.id;
        if (!assigneeId) throw new Error(`No team member matching "${truncate(input.assignee, 40)}" on ${project.name}.`);
      }
      const { escalateQuestion } = await import("@/lib/workflows/escalate");
      const thread = await escalateQuestion({ project, actor, question: input.question, assigneeId, trigger: "mcp" });
      const people = await queries.listPeople(actor);
      return { threadId: thread.id, askedTo: people.find((person) => person.id === thread.assigneeId)?.name, delivery: thread.delivery.map((d) => `${d.channel}: ${d.status}`) };
    },
  }),
  tool({
    name: "reply_to_team_question",
    title: "Reply in a team thread",
    description: "Adds the director's reply to an existing thread with a team member.",
    mutating: true,
    shape: { threadId: z.string(), message: z.string().min(1).max(4000) },
    async handler(actor, input) {
      await queries.getThread(actor, input.threadId);
      const { postThreadReply } = await import("@/lib/workflows/threads");
      const thread = await postThreadReply({ threadId: input.threadId, body: input.message, via: "portal", author: { id: actor.id, name: actor.name }, actor });
      return { threadId: thread.id, status: thread.status };
    },
  }),
  tool({
    name: "run_daily_sync",
    title: "Generate the daily sync",
    description: "Generates (or regenerates) today's daily sync for a project with the analyst, release-notes, risk and editor agents.",
    mutating: true,
    shape: { project: projectRef },
    async handler(actor, input) {
      const project = await resolveProject(actor, input.project);
      const { runDailySync } = await import("@/lib/workflows/daily-sync");
      const digest = await runDailySync({ project, actor, trigger: "mcp" });
      return { date: digest.date, headline: digest.headline, summary: digest.summary, highlights: digest.highlights, risks: digest.risks, nextUp: digest.nextUp };
    },
  }),
  tool({
    name: "generate_report",
    title: "Generate a report",
    description: "Writes a progress report, release notes or an incident report from the project's template, with citations and a grounding check.",
    mutating: true,
    shape: { project: projectRef, kind: z.enum(["progress", "release_notes", "incident"]), periodDays: z.number().int().min(1).max(120).optional(), incident: z.string().optional().describe("Incident id or key, required for incident reports") },
    async handler(actor, input) {
      const project = await resolveProject(actor, input.project);
      const incidentId = input.incident ? await resolveIncidentId(actor, input.incident) : undefined;
      const { generateReport } = await import("@/lib/workflows/report");
      const report = await generateReport({ project, actor, kind: input.kind, periodDays: input.periodDays, incidentId, trigger: "mcp" });
      return { reportId: report.id, title: report.title, markdown: report.markdown, grounding: report.grounding?.verdict };
    },
  }),
  tool({
    name: "sync_project",
    title: "Sync a project now",
    description: "Pulls every enabled source and deployment target of a project, summarises what is new and triggers follow-up workflows (incident triage, clarifying questions).",
    mutating: true,
    shape: { project: projectRef },
    async handler(actor, input) {
      const project = await resolveProject(actor, input.project);
      const result = await commands.syncNow(actor, project.id);
      return { newEvents: result.ingested, incidentsOpened: result.incidents.map((i) => i.key), clarificationsAsked: result.clarifications.length, sources: result.sources.map(({ name, status, items, detail }) => ({ name, status, items, detail })) };
    },
  }),
  tool({
    name: "decide_incident_fix",
    title: "Approve or reject a proposed fix",
    description: "Records the director's decision on the reviewed fix of an incident. Approval hands the plan to the owner; nothing is merged or deployed automatically.",
    mutating: true,
    shape: { incident: z.string(), decision: z.enum(["approved", "rejected"]), comment: z.string().max(500).optional() },
    async handler(actor, input) {
      const { decideFix } = await import("@/lib/workflows/incident");
      const incident = await decideFix({ actor, incidentId: await resolveIncidentId(actor, input.incident), decision: input.decision, comment: input.comment });
      return { key: incident.key, status: incident.status, fixStatus: incident.fix?.status };
    },
  }),
  tool({
    name: "resolve_incident",
    title: "Resolve an incident",
    description: "Marks an incident resolved and writes its incident report.",
    mutating: true,
    shape: { incident: z.string(), note: z.string().max(500).optional() },
    async handler(actor, input) {
      const { resolveIncident } = await import("@/lib/workflows/incident");
      const incident = await resolveIncident({ actor, incidentId: await resolveIncidentId(actor, input.incident), note: input.note });
      return { key: incident.key, status: incident.status, reportId: incident.reportId ?? null };
    },
  }),
  tool({
    name: "add_note",
    title: "Add a private note",
    description: "Saves a private note of the director on a project. Shared notes are used as context when this director asks the assistant questions.",
    mutating: true,
    shape: { project: projectRef, body: z.string().min(1).max(8000), title: z.string().max(120).optional(), shareWithAssistant: z.boolean().optional() },
    async handler(actor, input) {
      const project = await resolveProject(actor, input.project);
      const note = await commands.saveNote(actor, project.id, { title: input.title, body: input.body, shareWithAssistant: input.shareWithAssistant });
      return { noteId: note.id };
    },
  }),
  tool({
    name: "submit_feedback",
    title: "Rate an output",
    description: "Rates a report, daily sync or assistant answer. Negative feedback with a comment feeds the learning loop that proposes new guidance for the agents.",
    mutating: true,
    shape: { targetType: z.enum(["report", "digest", "incident", "ticket", "event"]), targetId: z.string(), rating: z.enum(["up", "down"]), comment: z.string().max(600).optional(), project: projectRef.optional() },
    async handler(actor, input) {
      const project = input.project ? await resolveProject(actor, input.project) : undefined;
      const feedback = await learning.submitFeedback(actor, { target: { type: input.targetType, id: input.targetId }, rating: input.rating, comment: input.comment, projectId: project?.id });
      return { feedbackId: feedback.id };
    },
  }),
];

export function listToolSummaries(): { name: string; title: string; description: string; mutating: boolean }[] {
  return TOOLS.map(({ name, title, description, mutating }) => ({ name, title, description, mutating }));
}

export type ToolOutcome = { ok: true; result: unknown } | { ok: false; error: string };

/** Validates input, enforces scope, runs the tool as the caller and audits mutating calls. */
export async function callTool(actor: Actor, name: string, rawInput: unknown): Promise<ToolOutcome> {
  const definition = TOOLS.find((candidate) => candidate.name === name);
  if (!definition) return { ok: false, error: `Unknown tool "${truncate(name, 60)}".` };
  const parsed = z.object(definition.shape).safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { ok: false, error: `Invalid input: ${parsed.error.issues.slice(0, 4).map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ")}` };
  }
  try {
    if (definition.mutating) assertWrite(actor);
    const result = await definition.handler(actor, parsed.data);
    if (definition.mutating) await audit(actor, `tool.${definition.name}`, { detail: `via ${actor.via}` });
    return { ok: true, result };
  } catch (error) {
    const message = error instanceof Error && error.message.length < 300 ? error.message : "The tool failed.";
    return { ok: false, error: message };
  }
}

/** Used by tests and diagnostics. */
export async function describeCaller(actor: Actor): Promise<{ name: string; role: string; projects: string[]; scopes: string[] }> {
  const store = await getStore();
  const person = await store.get("people", actor.id);
  return { name: person?.name ?? actor.name, role: actor.role, projects: (await visibleProjects(actor)).map((project) => project.key), scopes: actor.scopes };
}
