import { randomBytes, timingSafeEqual } from "node:crypto";
import { escalationDrafter, limitWords, templateEscalation } from "@/lib/agents/defs/escalation-drafter";
import { codeStep, runAgent, withRun, type RunEvent } from "@/lib/agents/runtime";
import { assertProjectAccess, assertWrite } from "@/lib/auth/access";
import { config } from "@/lib/config";
import { getMessenger } from "@/lib/connectors";
import { loadPeople, searchEvents } from "@/lib/knowledge/evidence";
import { audit } from "@/lib/security/audit";
import { looksLikeInjection, redactSecrets } from "@/lib/security/redact";
import { getStore } from "@/lib/store";
import type { Actor, DeliveryRecord, Person, Project, ProjectEvent, RunTrigger, Thread } from "@/lib/types";
import { DAY, newId, nowIso, sha256, tokenize, truncate } from "@/lib/util";

// --- who should be asked -------------------------------------------------------

export interface OwnerSuggestion {
  person: Person;
  score: number;
  reason: string;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function termMatchesArea(term: string, areaTokens: string[]): boolean {
  return areaTokens.some((token) => token === term || (term.length >= 4 && token.length >= 4 && (token.startsWith(term) || term.startsWith(token))));
}

/**
 * Deterministic ranking of a project's team for a question: declared areas that
 * match the query, authorship of recent related events, and recent activity.
 * Names of team members that appear in the query are ignored on purpose, so a
 * message cannot steer the result by naming someone.
 */
export function suggestOwner(args: { project: Project; people: Person[]; events: ProjectEvent[]; query: string; now?: Date }): OwnerSuggestion[] {
  const now = args.now ?? new Date();
  const byId = new Map(args.people.map((person) => [person.id, person]));
  const members = args.project.team.map((assignment) => ({ assignment, person: byId.get(assignment.personId) })).filter((entry): entry is { assignment: (typeof args.project.team)[number]; person: Person } => Boolean(entry.person));
  if (members.length === 0) return [];

  const nameTokens = new Set(members.flatMap((member) => tokenize(member.person.name)));
  const terms = tokenize(args.query).filter((term) => !nameTokens.has(term));
  const related = terms.length ? searchEvents(args.events, { query: terms.join(" "), limit: 40, now }) : [];
  const weekAgo = now.getTime() - 7 * DAY;

  const ranked = members.map(({ assignment, person }): OwnerSuggestion => {
    const matchedAreas = assignment.areas.filter((area) => {
      const tokens = tokenize(area);
      return tokens.length > 0 && terms.some((term) => termMatchesArea(term, tokens));
    });
    const authored = related.filter((event) => event.actorId === person.id);
    const thisWeek = authored.filter((event) => new Date(event.occurredAt).getTime() >= weekAgo).length;
    const roleMatch = terms.some((term) => tokenize(assignment.projectRole).includes(term));
    const lastActive = args.events.filter((event) => event.actorId === person.id).reduce((max, event) => Math.max(max, new Date(event.occurredAt).getTime()), 0);
    const activeDaysAgo = lastActive ? Math.max(0, (now.getTime() - lastActive) / DAY) : Infinity;
    const recency = Number.isFinite(activeDaysAgo) ? Math.max(0, 1 - activeDaysAgo / 14) : 0;

    const score = Math.min(matchedAreas.length, 2) * 5 + Math.min(authored.length, 5) * 1.5 + Math.min(thisWeek, 5) * 0.5 + (roleMatch ? 1 : 0) + recency;

    const parts: string[] = [];
    if (matchedAreas.length) parts.push(`Owns ${matchedAreas.slice(0, 2).join(" and ")}`);
    if (authored.length) parts.push(thisWeek > 0 ? `authored ${plural(thisWeek, "related change")} this week` : `authored ${plural(authored.length, "related change")} recently`);
    if (roleMatch && parts.length === 0) parts.push(`Works as ${assignment.projectRole}`);
    if (parts.length === 0) parts.push(recency > 0 ? `Active on the project in the last ${Math.max(1, Math.ceil(activeDaysAgo))} day${Math.ceil(activeDaysAgo) <= 1 ? "" : "s"}; no clear owner of this topic` : "On the project team; no clear owner of this topic");
    const reason = parts.join("; ").replace(/^./, (c) => c.toUpperCase());
    return { person, score: Math.round(score * 100) / 100, reason };
  });

  return ranked.sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name)).slice(0, 3);
}

// --- reply links ---------------------------------------------------------------

/** Constant-time check of a reply token against the hash stored on the thread. Also accepts seeded demo tokens. */
export function verifyReplyToken(thread: Thread, token: string | undefined): boolean {
  if (!token || typeof token !== "string" || token.length > 512) return false;
  const expected = Buffer.from(thread.replyTokenHash ?? "", "utf8");
  const actual = Buffer.from(sha256(token), "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export interface OpenThreadArgs {
  project: Project;
  actor: Actor | { id: string };
  kind: Thread["kind"];
  subject: string;
  body: string;
  assignee: Person;
  createdById: string;
  authorName: string;
  via: "portal" | "agent";
  watcherIds: string[];
  relatedEventIds: string[];
  relatedIncidentId?: string;
  originQuestion?: string;
}

export function buildReplyUrl(threadId: string, token: string): string {
  return `${config.baseUrl}/reply/${threadId}?t=${token}`;
}

/** Sends one message through the project's channel and always records an in-app delivery. */
export async function deliverToPerson(project: Project, message: { to: Person; subject: string; body: string; replyUrl: string }): Promise<DeliveryRecord[]> {
  const records: DeliveryRecord[] = [];
  const channel = project.notifyChannel;
  try {
    const result = await getMessenger(channel).send({ ...message, project });
    records.push({ channel: result.channel, status: result.status, detail: result.detail ? truncate(result.detail, 200) : undefined, at: nowIso() });
  } catch (error) {
    records.push({ channel, status: "failed", detail: truncate(error instanceof Error ? error.message : "delivery failed", 200), at: nowIso() });
  }
  if (!records.some((record) => record.channel === "in_app")) records.push({ channel: "in_app", status: "sent", at: nowIso() });
  return records;
}

/**
 * Shared by escalations and clarifications: creates the thread with its first
 * message, a fresh reply token (only its hash is stored), delivers it, stores it.
 */
export async function openThread(args: OpenThreadArgs): Promise<Thread> {
  const store = await getStore();
  const now = nowIso();
  const id = newId("thr");
  const token = randomBytes(24).toString("base64url");
  const replyUrl = buildReplyUrl(id, token);
  const delivery = await deliverToPerson(args.project, { to: args.assignee, subject: args.subject, body: args.body, replyUrl });
  const thread: Thread = {
    id,
    projectId: args.project.id,
    kind: args.kind,
    subject: truncate(args.subject, 140),
    status: "open",
    createdById: args.createdById,
    assigneeId: args.assignee.id,
    watcherIds: args.watcherIds,
    relatedEventIds: args.relatedEventIds,
    relatedIncidentId: args.relatedIncidentId,
    originQuestion: args.originQuestion,
    replyTokenHash: sha256(token),
    delivery,
    messages: [{ id: newId("msg"), authorId: args.createdById, authorName: args.authorName, body: args.body, at: now, via: args.via }],
    unreadForWatchers: false,
    createdAt: now,
    updatedAt: now,
  };
  await store.put("threads", thread);
  return thread;
}

// --- escalation ----------------------------------------------------------------

export interface EscalateArgs {
  project: Project;
  actor: Actor;
  question: string;
  assigneeId?: string;
  context?: string;
  relatedEventIds?: string[];
  relatedIncidentId?: string;
  kind?: "escalation" | "incident";
  trigger: RunTrigger;
  onEvent?: (e: RunEvent) => void;
}

/** Asks the right team member a question on behalf of a director. Nothing is sent without this explicit call. */
export async function escalateQuestion(args: EscalateArgs): Promise<Thread> {
  const { project, actor } = args;
  const kind = args.kind ?? "escalation";
  if (kind !== "incident" && !project.features.escalations) throw new Error("Escalations are disabled for this project.");
  assertProjectAccess(actor, project);
  assertWrite(actor);

  const question = truncate(redactSecrets(args.question).text, 2000);
  if (!question) throw new Error("A question is required.");
  const context = args.context ? truncate(redactSecrets(args.context).text, 1500) : undefined;
  if (looksLikeInjection(`${question}\n${context ?? ""}`)) {
    await audit(actor, "security.possible_injection", { projectId: project.id, detail: `Instruction-like text in an escalation question "${truncate(question, 80)}"` });
  }

  const { result } = await withRun(
    { workflow: "escalate", title: `Escalate: ${truncate(question, 70)}`, actor, project, trigger: args.trigger, input: question, onEvent: args.onEvent },
    async (ctx) => {
      const route = await codeStep(
        ctx,
        "route",
        "Choose who to ask",
        truncate(question, 200),
        async () => {
          const store = await getStore();
          const people = Array.from((await loadPeople()).values());
          const team = project.team.map((member) => people.find((person) => person.id === member.personId)).filter((person): person is Person => Boolean(person));
          if (team.length === 0) throw new Error("This project has no team members to ask. Add people to the project team first.");
          const events = (await store.list("events")).filter((event) => event.projectId === project.id);
          const suggestions = suggestOwner({ project, people, events, query: `${question} ${context ?? ""}` });
          const chosen = args.assigneeId ? team.find((person) => person.id === args.assigneeId) : undefined;
          const assignee = chosen ?? suggestions[0]?.person ?? team[0];
          const reason = chosen ? "Chosen by the director" : (suggestions.find((entry) => entry.person.id === assignee.id)?.reason ?? "Team member on this project");
          const wanted = args.relatedEventIds?.length ? args.relatedEventIds : searchEvents(events, { query: question, limit: 3, minImportance: 2, now: new Date() }).map((event) => event.id);
          const related = wanted.map((id) => events.find((event) => event.id === id)).filter((event): event is ProjectEvent => Boolean(event)).slice(0, 5);
          return { assignee, reason, related };
        },
        (r) => `${r.assignee.name}: ${r.reason}; ${r.related.length} related change(s)`,
      );

      const draft = await runAgent(ctx, escalationDrafter, {
        projectName: project.name,
        directorName: actor.name,
        assigneeName: route.assignee.name,
        question,
        context,
        related: route.related.map((event) => ({ title: event.title, summary: event.summary })),
      });
      const fallback = templateEscalation({ projectName: project.name, directorName: actor.name, assigneeName: route.assignee.name, question, context, related: route.related.map((event) => ({ title: event.title, summary: event.summary })) });
      const body = limitWords(redactSecrets(draft.body).text) || fallback.body;
      const subject = truncate(redactSecrets(draft.subject).text, 120) || fallback.subject;

      return codeStep(
        ctx,
        "deliver",
        "Create the thread and deliver it",
        `${route.assignee.name} via ${project.notifyChannel}`,
        async () => {
          const thread = await openThread({
            project,
            actor,
            kind,
            subject,
            body,
            assignee: route.assignee,
            createdById: actor.id,
            authorName: actor.name,
            via: "portal",
            watcherIds: [actor.id],
            relatedEventIds: route.related.map((event) => event.id),
            relatedIncidentId: args.relatedIncidentId,
            originQuestion: question,
          });
          await audit(actor, kind === "incident" ? "incident.escalated" : "escalation.created", { projectId: project.id, target: thread.id, detail: `Asked ${route.assignee.name} (${thread.delivery.map((d) => `${d.channel}:${d.status}`).join(", ")})` });
          const { refreshSnapshot } = await import("@/lib/services/snapshot");
          await refreshSnapshot(project);
          return thread;
        },
        (thread) => `Thread ${thread.id}, ${thread.delivery.map((d) => `${d.channel}:${d.status}`).join(", ")}`,
      );
    },
    (thread) => `Asked ${thread.assigneeId}: ${thread.subject}`,
  );
  return result;
}
