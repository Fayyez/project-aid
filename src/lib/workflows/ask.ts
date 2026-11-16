import { z } from "zod";
import { composer, heuristicRoute, researcher, router, verifier, type Intent, type Route } from "@/lib/agents/defs/assistant";
import { codeStep, finishRun, runAgent, runTextAgent, runToolAgent, startRun, failRun, type RunContext, type RunEvent } from "@/lib/agents/runtime";
import { visibleProjects } from "@/lib/auth/access";
import { EvidenceBag, checkGrounding, loadPeople, loadProjectData, searchEvents, searchTickets, stripInvalidRefs, type ProjectData } from "@/lib/knowledge/evidence";
import type { ToolSpec } from "@/lib/llm";
import { computeContributions } from "@/lib/metrics";
import { buildSnapshot } from "@/lib/services/snapshot";
import type { Actor, AgentRun, Citation, GroundingResult, Person, Project, ProposedAction, RunTrigger } from "@/lib/types";
import { isoDate, newId, truncate } from "@/lib/util";

export interface AskArgs {
  actor: Actor;
  question: string;
  /** Scope the question to one project (project chat). Omit for the portfolio assistant. */
  projectId?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  trigger: RunTrigger;
  onEvent?: (event: RunEvent) => void;
}

export interface AskResult {
  answer: string;
  citations: Citation[];
  actions: ProposedAction[];
  grounding: GroundingResult;
  run: AgentRun;
  projectIds: string[];
  intent: Intent;
}

const MAX_PROJECTS = 5;
const OPEN_TICKET = new Set(["todo", "in_progress", "in_review", "blocked"]);
const OPEN_INCIDENT = new Set(["detected", "triaging", "fix_proposed", "awaiting_approval", "escalated"]);

/** Baseline retrieval: what a specialist would look at first for this kind of question. */
function gather(bag: EvidenceBag, data: ProjectData, people: Map<string, Person>, route: Route, personIds: string[], now: Date): void {
  const { project } = data;
  const snapshot = buildSnapshot(data, people, now);
  const nextMilestone = project.milestones.filter((m) => m.status !== "done").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  bag.addMetric(
    `status:${project.id}`,
    `${project.name} status`,
    `${project.name} (client ${project.client}) health is ${snapshot.health}: ${snapshot.healthReasons.join("; ")}. Progress ${snapshot.pace.progressPct}% of scoped tickets done with ${snapshot.pace.timeElapsedPct}% of the schedule elapsed; pace is ${snapshot.pace.status.replace("_", " ")}. ${snapshot.pace.explanation} Open tickets ${snapshot.pace.openTickets}, blocked ${snapshot.pace.blockedTickets}. Target date ${isoDate(project.targetDate)}.${nextMilestone ? ` Next milestone "${nextMilestone.name}" due ${isoDate(nextMilestone.dueDate)} (${nextMilestone.status.replace("_", " ")}).` : ""}`,
    project.id,
  );
  const latestDeploys = data.deployments.filter((d, i, all) => all.findIndex((x) => x.environment === d.environment) === i);
  const intent = route.intent;
  const wide = intent === "status" || intent === "risk" || intent === "compare" || intent === "other";

  if (wide || intent === "deployment" || intent === "incident") latestDeploys.forEach((d) => bag.addDeployment(d));
  if (intent === "deployment" || intent === "incident") {
    data.deployments.slice(0, 6).forEach((d) => bag.addDeployment(d));
    data.incidents.slice(0, 3).forEach((i) => bag.addIncident(i));
    searchEvents(data.events, { sinceDays: route.timeframeDays, minImportance: 4, limit: 6, now }).forEach((e) => bag.addEvent(e));
  }
  if (wide) {
    data.incidents.filter((i) => OPEN_INCIDENT.has(i.status)).forEach((i) => bag.addIncident(i));
    searchEvents(data.events, { sinceDays: route.timeframeDays, limit: 8, now }).forEach((e) => bag.addEvent(e));
    data.tickets.filter((t) => t.status === "blocked").slice(0, 4).forEach((t) => bag.addTicket(t));
    data.tickets.filter((t) => OPEN_TICKET.has(t.status) && (t.priority === "P0" || t.priority === "P1")).slice(0, 4).forEach((t) => bag.addTicket(t));
    data.threads.filter((t) => t.status === "open").slice(0, 3).forEach((t) => bag.addThread(t));
    if (data.digests[0]) bag.addDigest(data.digests[0]);
  }
  if (intent === "activity") {
    searchEvents(data.events, { query: route.searchQuery, sinceDays: route.timeframeDays, limit: 10, now }).forEach((e) => bag.addEvent(e));
    searchEvents(data.events, { sinceDays: route.timeframeDays, limit: 8, now }).forEach((e) => bag.addEvent(e));
    if (data.digests[0]) bag.addDigest(data.digests[0]);
  }
  if (intent === "tickets") {
    searchTickets(data.tickets, route.searchQuery, 6).forEach((t) => bag.addTicket(t));
    data.tickets
      .filter((t) => OPEN_TICKET.has(t.status))
      .sort((a, b) => Number(b.status === "blocked") - Number(a.status === "blocked") || a.priority.localeCompare(b.priority))
      .slice(0, 8)
      .forEach((t) => bag.addTicket(t));
  }
  if (intent === "people" && project.features.contributionInsights) {
    const stats = computeContributions({ project, people: Array.from(people.values()), events: data.events, tickets: data.tickets, threads: data.threads, windowDays: Math.max(7, route.timeframeDays), now });
    const wanted = personIds.length ? stats.filter((s) => personIds.includes(s.personId)) : stats.slice(0, 6);
    for (const s of wanted) {
      bag.addMetric(
        `contrib:${project.id}:${s.personId}`,
        `${s.name} on ${project.name}`,
        `${s.name} (${s.projectRole}) on ${project.name} over the last ${Math.max(7, route.timeframeDays)} days: ${s.commits} commits, ${s.pullRequests} pull requests, ${s.reviews} reviews, ${s.ticketsClosed} tickets closed, ${s.ticketsInProgress} in progress, active on ${s.activeDays} days${s.areas.length ? `, mainly in ${s.areas.join(", ")}` : ""}.`,
        project.id,
      );
    }
    for (const personId of personIds) {
      searchEvents(data.events, { personId, sinceDays: Math.max(7, route.timeframeDays), limit: 8, now }).forEach((e) => bag.addEvent(e));
      data.tickets.filter((t) => t.assigneeId === personId && OPEN_TICKET.has(t.status)).slice(0, 4).forEach((t) => bag.addTicket(t));
    }
  }
  // Always add the best lexical matches so specific questions find specific records.
  if (route.searchQuery) {
    searchEvents(data.events, { query: route.searchQuery, limit: 6, now }).forEach((e) => bag.addEvent(e));
    searchTickets(data.tickets, route.searchQuery, 3).forEach((t) => bag.addTicket(t));
  }
  data.notes.slice(0, 3).forEach((n) => bag.addNote(n));
}

/** Read-only lookups a researcher may call. Results are added to the shared evidence bag. */
function researchTools(bag: EvidenceBag, data: ProjectData, people: Map<string, Person>, now: Date): ToolSpec[] {
  const render = (refs: string[]) =>
    refs.length
      ? refs
          .map((ref) => {
            const item = bag.get(ref);
            return item ? `[${item.ref}] ${item.occurredAt ? isoDate(item.occurredAt) : ""}${item.actorName ? ` · ${item.actorName}` : ""} · ${item.text}` : "";
          })
          .join("\n")
      : "No matching records.";
  const personByName = (name: unknown) => {
    if (typeof name !== "string" || !name.trim()) return undefined;
    const wanted = name.toLowerCase();
    return data.project.team.map((member) => people.get(member.personId)).find((person) => person && person.name.toLowerCase().includes(wanted))?.id;
  };
  return [
    {
      name: "search_activity",
      description: "Search this project's activity (commits, pull requests, messages, documents, deployments) by keywords. Returns matching records with references.",
      inputSchema: z.object({
        query: z.string().describe("Keywords"),
        days: z.number().describe("How many days back to search"),
        person: z.string().nullable().describe("Limit to one team member by name, or null"),
      }),
      async run(input) {
        const days = typeof input.days === "number" && input.days > 0 ? Math.min(input.days, 180) : 30;
        const found = searchEvents(data.events, { query: String(input.query ?? ""), sinceDays: days, personId: personByName(input.person), limit: 8, now });
        return render(found.map((event) => bag.addEvent(event).ref));
      },
    },
    {
      name: "list_tickets",
      description: "List this project's tickets, optionally filtered by status and keywords.",
      inputSchema: z.object({
        status: z.enum(["open", "blocked", "in_progress", "done", "any"]),
        query: z.string().nullable().describe("Keywords, or null for all"),
      }),
      async run(input) {
        const status = String(input.status ?? "open");
        let tickets = data.tickets.filter((t) => (status === "any" ? true : status === "open" ? OPEN_TICKET.has(t.status) : status === "in_progress" ? t.status === "in_progress" || t.status === "in_review" : t.status === status));
        if (typeof input.query === "string" && input.query.trim()) tickets = searchTickets(tickets, input.query, 8);
        return render(tickets.slice(0, 8).map((ticket) => bag.addTicket(ticket).ref));
      },
    },
    {
      name: "get_deployments",
      description: "Get the most recent deployments of this project, optionally for one environment.",
      inputSchema: z.object({ environment: z.string().nullable().describe("e.g. production or staging, or null for all") }),
      async run(input) {
        const env = typeof input.environment === "string" ? input.environment.toLowerCase() : "";
        return render(data.deployments.filter((d) => !env || d.environment.toLowerCase().includes(env)).slice(0, 6).map((d) => bag.addDeployment(d).ref));
      },
    },
    {
      name: "get_incidents",
      description: "Get this project's incidents with their triage and fix status.",
      inputSchema: z.object({ openOnly: z.boolean() }),
      async run(input) {
        return render(data.incidents.filter((i) => !input.openOnly || OPEN_INCIDENT.has(i.status)).slice(0, 5).map((i) => bag.addIncident(i).ref));
      },
    },
    {
      name: "get_team_questions",
      description: "Get the open and recently answered questions between the director (or the system) and the team.",
      inputSchema: z.object({ openOnly: z.boolean() }),
      async run(input) {
        return render(data.threads.filter((t) => !input.openOnly || t.status === "open").slice(0, 5).map((t) => bag.addThread(t).ref));
      },
    },
  ];
}

function proposeActions(route: Route, question: string, projects: Project[], grounding: GroundingResult, owner: { person: Person; reason: string } | undefined): ProposedAction[] {
  const actions: ProposedAction[] = [];
  const project = projects.length === 1 ? projects[0] : undefined;
  if (!project) return actions;
  if (route.action === "create_tickets" && project.features.ticketing) {
    actions.push({ id: newId("act"), kind: "create_tickets", label: "Review ticket drafts", description: "Turn this message into tickets. You confirm each draft before anything is created.", projectId: project.id, payload: { text: question }, status: "proposed" });
  }
  if (route.action === "generate_report" && project.features.reports) {
    const kind = route.reportKind ?? "progress";
    actions.push({ id: newId("act"), kind: "generate_report", label: `Generate ${kind.replace("_", " ")} report`, projectId: project.id, payload: { kind, periodDays: route.timeframeDays }, status: "proposed" });
  }
  const weak = grounding.verdict === "no_evidence" || grounding.verdict === "ungrounded";
  if ((route.action === "escalate" || weak) && project.features.escalations && owner) {
    actions.push({
      id: newId("act"),
      kind: "escalate",
      label: `Ask ${owner.person.name}`,
      description: weak ? `The records do not fully answer this. ${owner.reason}.` : owner.reason,
      projectId: project.id,
      payload: { question, assigneeId: owner.person.id, assigneeName: owner.person.name },
      status: "proposed",
    });
  }
  return actions;
}

/**
 * The assistant workflow: router -> parallel per-project researchers ->
 * composer -> verifier. The answer is returned with its citations, a grounding
 * verdict and any actions the director can confirm with one click.
 */
export async function askAssistant(args: AskArgs): Promise<AskResult> {
  const question = args.question.trim().slice(0, 6000);
  if (!question) throw new Error("Ask a question first.");
  const now = new Date();
  const allVisible = await visibleProjects(args.actor);
  const scoped = args.projectId ? allVisible.filter((project) => project.id === args.projectId) : allVisible;
  if (args.projectId && scoped.length === 0) throw new Error("Project not found");
  if (args.projectId && !scoped[0].features.chat) throw new Error("Project chat is switched off for this project.");
  const people = await loadPeople();
  const history = args.history ?? [];

  const ctx: RunContext = await startRun({
    workflow: "ask",
    title: truncate(question, 80),
    actor: args.actor,
    project: args.projectId ? scoped[0] : undefined,
    trigger: args.trigger,
    input: question,
    onEvent: args.onEvent,
  });

  try {
    const teamNames = Array.from(new Set(scoped.flatMap((project) => project.team.map((member) => people.get(member.personId)?.name).filter((name): name is string => Boolean(name)))));
    const routerInput = { question, projects: scoped.map(({ id, key, name, client }) => ({ id, key, name, client })), currentProjectId: args.projectId, people: teamNames, history };
    let route = await runAgent(ctx, router, routerInput);
    // The router may only choose from projects the caller can see.
    const chosen = scoped.filter((project) => route.projectKeys.map((key) => key.toUpperCase()).includes(project.key.toUpperCase()));
    if (route.projectKeys.length && chosen.length === 0) route = { ...route, projectKeys: heuristicRoute(routerInput).projectKeys };
    const targets = (chosen.length ? chosen : args.projectId ? scoped : scoped.filter((project) => project.status === "active")).slice(0, MAX_PROJECTS);
    const personIds = Array.from(people.values())
      .filter((person) => route.people.some((name) => name.toLowerCase() === person.name.toLowerCase()))
      .map((person) => person.id);

    const bag = new EvidenceBag(people);
    const datasets = await codeStep(
      ctx,
      "retrieve",
      "Gather project records",
      `${targets.map((p) => p.key).join(", ") || "no projects"} · ${route.intent} · last ${route.timeframeDays}d`,
      async () => {
        const loaded = await Promise.all(targets.map((project) => loadProjectData(project, args.actor)));
        loaded.forEach((data) => gather(bag, data, people, route, personIds, now));
        return loaded;
      },
      () => `${bag.size} records from ${targets.length} project${targets.length === 1 ? "" : "s"}`,
    );

    const findings = await Promise.all(
      datasets.map(async (data) => {
        const text = await runToolAgent(
          ctx,
          researcher,
          { question, projectName: data.project.name, intent: route.intent, timeframeDays: route.timeframeDays, evidence: bag.list().filter((item) => item.projectId === data.project.id), tools: researchTools(bag, data, people, now) },
          { group: "research", title: `Research ${data.project.name}` },
        );
        return { projectName: data.project.name, text };
      }),
    );

    // Suggest who to ask before composing, so the answer can name the right person.
    let owner: { person: Person; reason: string } | undefined;
    if (targets.length === 1) {
      const { suggestOwner } = await import("./escalate");
      const data = datasets[0];
      const suggestion = suggestOwner({ project: data.project, people: Array.from(people.values()), events: data.events, query: question, now })[0];
      const named = personIds.map((id) => people.get(id)).find((person) => person && data.project.team.some((member) => member.personId === person.id));
      owner = named ? { person: named, reason: `You asked about ${named.name}` } : suggestion ? { person: suggestion.person, reason: suggestion.reason } : undefined;
    }

    const offered: string[] = [];
    if (route.action === "create_tickets") offered.push("review ticket drafts made from this message");
    if (route.action === "generate_report") offered.push("generate the report");
    if (route.action === "escalate" && owner) offered.push(`send this question to ${owner.person.name}`);

    const draft = await runTextAgent(
      ctx,
      composer,
      { question, directorName: args.actor.name, today: now.toISOString().slice(0, 10), intent: route.intent, findings, evidenceBlock: bag.render("evidence"), evidence: bag.list(), history, offered },
      { stream: true },
    );
    const answer = stripInvalidRefs(draft, bag).trim();

    const mechanical = checkGrounding(answer, bag);
    const review = await runAgent(ctx, verifier, { answer, evidenceBlock: bag.render("evidence"), uncited: mechanical.unsupported });
    const unsupported = Array.from(new Set([...mechanical.unsupported, ...review.unsupported.map((s) => truncate(s, 160))])).slice(0, 8);
    const grounding: GroundingResult = {
      ...mechanical,
      unsupported,
      verdict: mechanical.verdict === "grounded" && review.verdict !== "supported" ? "partially_grounded" : mechanical.verdict,
    };

    const actions = await codeStep(ctx, "propose-actions", "Decide which actions to offer", route.action, () => proposeActions(route, question, targets, grounding, owner), (list) => (list.length ? list.map((a) => a.label).join("; ") : "none"));

    const run = await finishRun(ctx, answer, { grounding });
    return { answer, citations: bag.citations(mechanical.citedRefs), actions, grounding, run, projectIds: targets.map((p) => p.id), intent: route.intent };
  } catch (error) {
    await failRun(ctx, error);
    throw error;
  }
}
