import { ticketDeduper } from "@/lib/agents/defs/ticket-deduper";
import { ticketExtractor } from "@/lib/agents/defs/ticket-extractor";
import { codeStep, runAgent, withRun, type RunEvent } from "@/lib/agents/runtime";
import { assertProjectAccess, assertWrite } from "@/lib/auth/access";
import { config } from "@/lib/config";
import { createGithubIssue } from "@/lib/connectors";
import { loadPeople, searchTickets } from "@/lib/knowledge/evidence";
import { audit } from "@/lib/security/audit";
import { looksLikeInjection, redactSecrets } from "@/lib/security/redact";
import { getStore } from "@/lib/store";
import type { Actor, AgentRun, Person, Priority, Project, ProjectEvent, RunTrigger, Ticket, TicketType } from "@/lib/types";
import { newId, nowIso, truncate, uniq } from "@/lib/util";
import { suggestOwner } from "./escalate";

export interface TicketDraft {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  type: TicketType;
  priority: Priority;
  labels: string[];
  suggestedAssigneeId?: string;
  assigneeReason?: string;
  duplicateOfKey?: string;
  rationale: string;
  estimate?: number;
}

const MAX_MESSAGE_CHARS = 8000;
const MAX_DRAFTS = 12;
const CLOSED: Ticket["status"][] = ["done", "cancelled"];

function teamPeople(project: Project, people: Map<string, Person>): Person[] {
  return project.team.map((member) => people.get(member.personId)).filter((person): person is Person => Boolean(person));
}

/** Resolves a name suggested by a model against the team. Anything that does not match is ignored. */
function resolveName(team: Person[], name: string | null | undefined): Person | undefined {
  const wanted = name?.toLowerCase().trim();
  if (!wanted) return undefined;
  const exact = team.filter((person) => person.name.toLowerCase() === wanted);
  if (exact.length === 1) return exact[0];
  const partial = team.filter((person) => {
    const full = person.name.toLowerCase();
    return full.split(/\s+/).includes(wanted) || (wanted.length > 3 && full.includes(wanted));
  });
  return partial.length === 1 ? partial[0] : undefined;
}

export async function draftTicketsFromMessage(args: { project: Project; actor: Actor; text: string; trigger: RunTrigger; onEvent?: (e: RunEvent) => void }): Promise<{ drafts: TicketDraft[]; questions: string[]; run: AgentRun }> {
  const { project, actor } = args;
  if (!project.features.ticketing) throw new Error("Message to ticket is disabled for this project.");
  assertProjectAccess(actor, project);
  if (!args.text.trim()) throw new Error("The message is empty.");

  const { result, run } = await withRun(
    { workflow: "tickets-draft", title: `Draft tickets for ${project.name}`, actor, project, trigger: args.trigger, input: args.text, onEvent: args.onEvent },
    async (ctx) => {
      const prepared = await codeStep(
        ctx,
        "prepare",
        "Redact the message and load open tickets and team",
        `${args.text.length} characters`,
        async () => {
          const redacted = redactSecrets(args.text);
          const text = redacted.text.slice(0, MAX_MESSAGE_CHARS);
          if (looksLikeInjection(text)) await audit(actor, "security.possible_injection", { projectId: project.id, detail: `Instruction-like text in a message shared for ticketing: "${truncate(text, 80)}"` });
          const store = await getStore();
          const people = await loadPeople();
          const open = (await store.list("tickets")).filter((ticket) => ticket.projectId === project.id && !CLOSED.includes(ticket.status));
          const events = (await store.list("events")).filter((event) => event.projectId === project.id);
          return { text, open, events, team: teamPeople(project, people), people: Array.from(people.values()), redactions: Object.values(redacted.findings).reduce((a, b) => a + b, 0) };
        },
        (p) => `${p.text.length} chars, ${p.open.length} open tickets, ${p.team.length} team members, ${p.redactions} redaction(s)`,
      );

      const extraction = await runAgent(ctx, ticketExtractor, {
        projectName: project.name,
        knownAreas: uniq(project.team.flatMap((member) => member.areas)),
        teamNames: prepared.team.map((person) => person.name),
        text: prepared.text,
        senderName: actor.name,
      });

      const drafts: (TicketDraft & { _suggestedName: string | null })[] = extraction.tickets
        .filter((ticket) => ticket.title.trim())
        .slice(0, MAX_DRAFTS)
        .map((ticket) => ({
          title: truncate(redactSecrets(ticket.title).text, 80),
          description: redactSecrets(ticket.description).text.trim(),
          acceptanceCriteria: ticket.acceptanceCriteria.map((c) => truncate(redactSecrets(c).text, 240)).filter(Boolean).slice(0, 8),
          type: ticket.type,
          priority: ticket.priority,
          labels: uniq(ticket.labels.map((label) => label.toLowerCase().trim()).filter(Boolean)).slice(0, 5),
          rationale: truncate(redactSecrets(ticket.rationale).text, 300),
          _suggestedName: ticket.suggestedAssigneeName,
        }));
      const questions = extraction.questionsForSender.map((q) => truncate(redactSecrets(q).text, 300)).filter(Boolean).slice(0, 6);

      // Duplicate check: candidates are chosen in code; the agent can only pick among them.
      const withCandidates = drafts.map((draft, index) => ({ index, title: draft.title, description: draft.description, candidates: searchTickets(prepared.open, `${draft.title} ${draft.description}`, 4).map((t) => ({ key: t.key, title: t.title, description: truncate(t.description, 300), status: t.status })) })).filter((item) => item.candidates.length > 0);
      if (withCandidates.length) {
        const verdict = await runAgent(ctx, ticketDeduper, { items: withCandidates });
        for (const result of verdict.results) {
          const draft = drafts[result.index];
          const item = withCandidates.find((candidate) => candidate.index === result.index);
          if (!draft || !item || !result.duplicateOfKey) continue;
          const match = item.candidates.find((candidate) => candidate.key.toLowerCase() === result.duplicateOfKey?.toLowerCase());
          if (!match) continue;
          draft.duplicateOfKey = match.key;
          draft.rationale = truncate(`${draft.rationale} Possible duplicate of ${match.key}: ${redactSecrets(result.reason).text}`, 400);
        }
      }

      const finished = await codeStep(
        ctx,
        "assign",
        "Suggest an assignee for each draft",
        `${drafts.length} drafts`,
        () =>
          drafts.map((draft): TicketDraft => {
            const { _suggestedName, ...rest } = draft;
            const named = resolveName(prepared.team, _suggestedName);
            if (named) return { ...rest, suggestedAssigneeId: named.id, assigneeReason: "Named in the message as the right person" };
            const [best] = suggestOwner({ project, people: prepared.people, events: prepared.events, query: `${draft.title} ${draft.description} ${draft.labels.join(" ")}` });
            return best ? { ...rest, suggestedAssigneeId: best.person.id, assigneeReason: best.reason } : rest;
          }),
        (list) => list.map((d) => `${d.title} -> ${d.suggestedAssigneeId ?? "nobody"}`).join("; "),
      );
      return { drafts: finished, questions };
    },
    (r) => `${r.drafts.length} draft(s), ${r.drafts.filter((d) => d.duplicateOfKey).length} possible duplicate(s), ${r.questions.length} question(s)`,
  );
  return { drafts: result.drafts, questions: result.questions, run };
}

const PRIORITY_IMPORTANCE: Record<Priority, ProjectEvent["importance"]> = { P0: 5, P1: 4, P2: 3, P3: 2 };

function nextTicketNumber(project: Project, tickets: Ticket[]): number {
  const pattern = new RegExp(`^${project.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  return tickets.reduce((max, ticket) => {
    const match = pattern.exec(ticket.key);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

async function mirrorToGithub(project: Project, actor: Actor, ticket: Ticket): Promise<Ticket["external"] | undefined> {
  const source = project.sources.find((s) => s.kind === "github" && s.enabled && s.config.createIssues === "true");
  if (!source) return undefined;
  const token = config.secret(source.secretEnv ?? "GITHUB_TOKEN");
  const { owner, repo } = source.config;
  if (!token || !owner || !repo) return undefined;
  try {
    const body = [ticket.description, ticket.acceptanceCriteria.length ? `\n**Acceptance criteria**\n${ticket.acceptanceCriteria.map((c) => `- [ ] ${c}`).join("\n")}` : "", `\n_Created from Project Aid as ${ticket.key}._`].join("\n");
    const issue = await createGithubIssue({ owner, repo, title: `[${ticket.key}] ${ticket.title}`, body, labels: ticket.labels.slice(0, 5), token });
    return { system: "github", id: issue.id, url: issue.url || undefined };
  } catch (error) {
    await audit(actor, "ticket.github_issue_failed", { projectId: project.id, target: ticket.key, detail: error instanceof Error ? error.message : "GitHub issue creation failed" });
    return undefined;
  }
}

/** Stores confirmed drafts as tickets. Drafts still marked as duplicates are skipped. */
export async function createTickets(args: { project: Project; actor: Actor; drafts: TicketDraft[]; originText?: string; originKind?: Ticket["origin"]["kind"]; originRef?: string }): Promise<Ticket[]> {
  const { project, actor } = args;
  assertProjectAccess(actor, project);
  assertWrite(actor);
  const store = await getStore();
  const wanted = args.drafts.filter((draft) => !draft.duplicateOfKey && draft.title.trim());
  if (wanted.length === 0) return [];

  const existing = (await store.list("tickets")).filter((ticket) => ticket.projectId === project.id);
  let counter = nextTicketNumber(project, existing);
  const originText = args.originText ? truncate(redactSecrets(args.originText).text, 4000) : undefined;
  const onTeam = new Set(project.team.map((member) => member.personId));
  const now = nowIso();
  const created: Ticket[] = [];

  for (const draft of wanted) {
    counter += 1;
    const ticket: Ticket = {
      id: newId("tkt"),
      projectId: project.id,
      key: `${project.key}-${counter}`,
      title: truncate(draft.title, 120),
      description: draft.description.trim(),
      acceptanceCriteria: draft.acceptanceCriteria.filter((c) => c.trim()),
      type: draft.type,
      priority: draft.priority,
      status: "todo",
      assigneeId: draft.suggestedAssigneeId && onTeam.has(draft.suggestedAssigneeId) ? draft.suggestedAssigneeId : undefined,
      reporterId: actor.via === "system" ? undefined : actor.id,
      labels: draft.labels,
      estimate: draft.estimate,
      origin: { kind: args.originKind ?? "message", text: originText, ref: args.originRef },
      createdAt: now,
      updatedAt: now,
    };
    const external = await mirrorToGithub(project, actor, ticket);
    if (external) ticket.external = external;
    created.push(ticket);
  }

  await store.putMany("tickets", created);
  const events: ProjectEvent[] = created.map((ticket) => ({
    id: newId("evt"),
    projectId: project.id,
    source: "manual",
    kind: "ticket",
    externalId: `ticket:${ticket.id}`,
    url: ticket.external?.url,
    title: `${ticket.key}: ${ticket.title}`,
    summary: truncate(`${actor.name} created ${ticket.type} ${ticket.key} (${ticket.priority}): ${ticket.description || ticket.title}`, 400),
    actorId: actor.via === "system" ? undefined : actor.id,
    actorName: actor.name,
    occurredAt: now,
    ingestedAt: now,
    areas: ticket.labels.slice(0, 4),
    tags: uniq(["ticket", ticket.type, ticket.priority.toLowerCase()]),
    importance: PRIORITY_IMPORTANCE[ticket.priority],
    changeType: ticket.type === "bug" ? "fix" : ticket.type === "feature" ? "feature" : "other",
    clarity: "clear",
    userFacing: false,
    refs: [ticket.key],
    summarizedBy: { provider: "none", model: "-", mode: "none" },
  }));
  await store.putMany("events", events);
  await audit(actor, "tickets.created", { projectId: project.id, target: created.map((t) => t.key).join(","), detail: `${created.length} ticket(s) created${args.originKind ? ` from ${args.originKind}` : ""}` });
  const { refreshSnapshot } = await import("@/lib/services/snapshot");
  await refreshSnapshot(project);
  return created;
}

const STATUSES: Ticket["status"][] = ["draft", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"];
const PRIORITIES: Priority[] = ["P0", "P1", "P2", "P3"];

/** Applies a patch to a ticket. Only defined fields change; an empty-string assigneeId unassigns. */
export async function updateTicket(args: { project: Project; actor: Actor; ticketId: string; patch: Partial<Pick<Ticket, "status" | "priority" | "assigneeId" | "title" | "description" | "dueDate" | "milestoneId" | "labels">> }): Promise<Ticket> {
  const { project, actor, patch } = args;
  assertProjectAccess(actor, project);
  assertWrite(actor);
  const store = await getStore();
  const ticket = await store.get("tickets", args.ticketId);
  if (!ticket || ticket.projectId !== project.id) throw new Error("Ticket not found");

  const next: Ticket = { ...ticket };
  if (patch.status !== undefined) {
    if (!STATUSES.includes(patch.status)) throw new Error(`Unknown status "${patch.status}"`);
    next.status = patch.status;
  }
  if (patch.priority !== undefined) {
    if (!PRIORITIES.includes(patch.priority)) throw new Error(`Unknown priority "${patch.priority}"`);
    next.priority = patch.priority;
  }
  if (patch.assigneeId !== undefined) {
    if (patch.assigneeId === "") next.assigneeId = undefined;
    else if (!project.team.some((member) => member.personId === patch.assigneeId)) throw new Error("The assignee is not on this project's team.");
    else next.assigneeId = patch.assigneeId;
  }
  if (patch.title !== undefined) {
    const title = truncate(patch.title, 120);
    if (!title) throw new Error("A ticket needs a title.");
    next.title = title;
  }
  if (patch.description !== undefined) next.description = patch.description.trim();
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate || undefined;
  if (patch.milestoneId !== undefined) {
    if (patch.milestoneId && !project.milestones.some((m) => m.id === patch.milestoneId)) throw new Error("Unknown milestone.");
    next.milestoneId = patch.milestoneId || undefined;
  }
  if (patch.labels !== undefined) next.labels = uniq(patch.labels.map((label) => label.trim().toLowerCase()).filter(Boolean)).slice(0, 8);

  const now = nowIso();
  if (next.status === "done" && ticket.status !== "done") next.closedAt = now;
  else if (next.status !== "done" && ticket.status === "done") next.closedAt = undefined;
  next.updatedAt = now;

  await store.put("tickets", next);
  const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter((key) => patch[key] !== undefined);
  await audit(actor, "ticket.updated", { projectId: project.id, target: ticket.key, detail: `Changed ${changed.join(", ") || "nothing"}${patch.status ? ` (status ${ticket.status} -> ${next.status})` : ""}` });
  const { refreshSnapshot } = await import("@/lib/services/snapshot");
  await refreshSnapshot(project);
  return next;
}
