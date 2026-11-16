import { randomBytes } from "node:crypto";
import { knowledgeDistiller } from "@/lib/agents/defs/knowledge-distiller";
import { codeStep, runAgent, withRun } from "@/lib/agents/runtime";
import { AccessError, assertProjectAccess, assertWrite, canAccessProject } from "@/lib/auth/access";
import { loadPeople } from "@/lib/knowledge/evidence";
import { audit } from "@/lib/security/audit";
import { looksLikeInjection, redactSecrets } from "@/lib/security/redact";
import { getStore } from "@/lib/store";
import type { Actor, Person, Project, ProjectEvent, Thread, ThreadMessage } from "@/lib/types";
import { newId, nowIso, sha256, truncate, uniq } from "@/lib/util";
import { buildReplyUrl, deliverToPerson, verifyReplyToken } from "./escalate";

const MAX_REPLY_CHARS = 4000;

async function loadThread(threadId: string): Promise<{ thread: Thread; project: Project }> {
  const store = await getStore();
  const thread = await store.get("threads", threadId);
  const project = thread ? await store.get("projects", thread.projectId) : null;
  if (!thread || !project) throw new Error("Conversation not found");
  return { thread, project };
}

async function refresh(project: Project): Promise<void> {
  const { refreshSnapshot } = await import("@/lib/services/snapshot");
  await refreshSnapshot(project);
}

/**
 * Adds a reply to a thread. A reply from the assignee marks it answered and is
 * distilled into a project event; a reply from a director goes back to the assignee.
 * Callers are responsible for authenticating `author`: the public reply page does so
 * with the reply token, the portal with the session (pass `actor`).
 */
export async function postThreadReply(args: { threadId: string; body: string; via: ThreadMessage["via"]; author: { id: string; name: string }; actor?: Actor }): Promise<Thread> {
  const body = redactSecrets(args.body.trim().slice(0, MAX_REPLY_CHARS)).text.trim();
  if (!body) throw new Error("A reply cannot be empty.");
  const { thread, project } = await loadThread(args.threadId);
  if (thread.status === "closed") throw new Error("This conversation is closed.");
  const store = await getStore();
  const people = await loadPeople();
  const assignee = people.get(thread.assigneeId);
  if (!assignee) throw new Error("The person asked is no longer available.");
  const fromAssignee = args.author.id === thread.assigneeId;

  if (!fromAssignee) {
    const actor = args.actor;
    if (!actor || (actor.id !== args.author.id && actor.via !== "system")) throw new AccessError("Not allowed to reply to this conversation");
    if (!canAccessProject(actor, project)) throw new AccessError("Project not found", 404);
    assertWrite(actor);
  }
  const authorName = fromAssignee ? assignee.name : (people.get(args.author.id)?.name ?? args.author.name);
  const message: ThreadMessage = { id: newId("msg"), authorId: args.author.id, authorName, body, at: nowIso(), via: args.via };
  const runActor: Actor = args.actor ?? { id: args.author.id, name: authorName, role: "member", via: "token", scopes: ["read", "write"] };
  if (looksLikeInjection(body)) await audit(runActor, "security.possible_injection", { projectId: project.id, target: thread.id, detail: "Instruction-like text in a thread reply" });

  if (!fromAssignee) {
    // Director follow-up: reopen and deliver to the assignee. The link is rotated because only hashes are stored.
    const token = randomBytes(24).toString("base64url");
    const subject = `Re: ${thread.subject}`;
    const delivery = await deliverToPerson(project, { to: assignee, subject, body, replyUrl: buildReplyUrl(thread.id, token) });
    const updated: Thread = { ...thread, status: "open", messages: [...thread.messages, message], delivery: [...thread.delivery, ...delivery], replyTokenHash: sha256(token), unreadForWatchers: false, updatedAt: message.at };
    await store.put("threads", updated);
    await audit(runActor, "thread.followup", { projectId: project.id, target: thread.id, detail: `Follow-up to ${assignee.name}` });
    await refresh(project);
    return updated;
  }

  const { result: updated } = await withRun(
    { workflow: "thread-reply", title: `Answer from ${assignee.name}`, actor: runActor, project, trigger: "manual", input: truncate(body, 300) },
    async (ctx) => {
      const events = (await store.list("events")).filter((event) => event.projectId === project.id);
      const related = thread.relatedEventIds.map((id) => events.find((event) => event.id === id)).filter((event): event is ProjectEvent => Boolean(event));
      const question = thread.originQuestion ?? thread.messages[0]?.body ?? thread.subject;
      const distilled = await runAgent(ctx, knowledgeDistiller, { projectName: project.name, assigneeName: assignee.name, question: truncate(question, 1500), answer: body, relatedTitles: related.map((event) => event.title) });
      const step = ctx.run.steps[ctx.run.steps.length - 1];
      const summary = truncate(redactSecrets(distilled.summary).text, 600) || truncate(body, 300);
      const title = truncate(redactSecrets(distilled.title).text, 120) || truncate(thread.subject, 120);

      const next: Thread = { ...thread, status: "answered", messages: [...thread.messages, message], unreadForWatchers: true, updatedAt: message.at };
      await codeStep(
        ctx,
        "persist",
        "Store the answer as project knowledge",
        thread.id,
        async () => {
          const assignment = project.team.find((member) => member.personId === assignee.id);
          const event: ProjectEvent = {
            id: newId("evt"),
            projectId: project.id,
            source: "system",
            kind: "clarification",
            externalId: `thread:${thread.id}:${message.id}`,
            title,
            summary,
            actorId: assignee.id,
            actorName: assignee.name,
            occurredAt: message.at,
            ingestedAt: nowIso(),
            areas: uniq([...related.flatMap((event) => event.areas), ...(assignment?.areas ?? [])].map((area) => area.toLowerCase())).slice(0, 4),
            tags: uniq(["clarification", thread.kind, ...(distilled.resolvesQuestion ? [] : ["partial-answer"]), ...distilled.tags.map((tag) => tag.toLowerCase().trim()).filter(Boolean)]).slice(0, 7),
            importance: 3,
            changeType: "other",
            clarity: "clear",
            userFacing: false,
            refs: uniq(related.flatMap((event) => event.refs)).slice(0, 8),
            summarizedBy: { provider: step?.provider ?? "heuristic", model: step?.model ?? "rules", mode: step?.mode === "llm" ? "llm" : "heuristic" },
          };
          await store.put("events", event);
          if (thread.kind === "clarification" && distilled.resolvesQuestion) {
            for (const original of related.filter((candidate) => candidate.clarity === "unclear")) {
              await store.put("events", { ...original, clarity: "clear", summary: truncate(`${original.summary} Author's explanation: ${summary}`, 1200) });
            }
          }
          await store.put("threads", next);
          return event;
        },
        (event) => `Event ${event.id}`,
      );
      await audit(runActor, "thread.answered", { projectId: project.id, target: thread.id, detail: `${assignee.name} answered via ${args.via}` });
      await refresh(project);
      return next;
    },
    (t) => `Thread ${t.id} answered`,
  );
  return updated;
}

async function loadForActor(actor: Actor, threadId: string): Promise<{ thread: Thread; project: Project }> {
  const { thread, project } = await loadThread(threadId).catch(() => {
    throw new AccessError("Conversation not found", 404);
  });
  assertProjectAccess(actor, project);
  return { thread, project };
}

export async function markThreadRead(args: { actor: Actor; threadId: string }): Promise<Thread> {
  const { thread, project } = await loadForActor(args.actor, args.threadId);
  if (!thread.unreadForWatchers) return thread;
  const updated: Thread = { ...thread, unreadForWatchers: false };
  await (await getStore()).put("threads", updated);
  await refresh(project);
  return updated;
}

export async function closeThread(args: { actor: Actor; threadId: string }): Promise<Thread> {
  const { thread, project } = await loadForActor(args.actor, args.threadId);
  assertWrite(args.actor);
  const updated: Thread = { ...thread, status: "closed", unreadForWatchers: false, updatedAt: nowIso() };
  await (await getStore()).put("threads", updated);
  await audit(args.actor, "thread.closed", { projectId: project.id, target: thread.id });
  await refresh(project);
  return updated;
}

/** Backs the public reply page: reveals nothing unless the token verifies and the thread is still open. */
export async function getThreadForReply(threadId: string, token: string | undefined): Promise<{ thread: Thread; project: Project; assignee: Person } | null> {
  const store = await getStore();
  const thread = await store.get("threads", threadId);
  if (!thread || !verifyReplyToken(thread, token) || thread.status === "closed") return null;
  const [project, assignee] = await Promise.all([store.get("projects", thread.projectId), store.get("people", thread.assigneeId)]);
  if (!project || !assignee) return null;
  return { thread, project, assignee };
}
