import { clarifier, type ClarifierOutput } from "@/lib/agents/defs/clarifier";
import { codeStep, runAgent, withRun } from "@/lib/agents/runtime";
import { loadPeople } from "@/lib/knowledge/evidence";
import { audit } from "@/lib/security/audit";
import { redactSecrets } from "@/lib/security/redact";
import { getStore } from "@/lib/store";
import type { Actor, Person, Project, ProjectEvent, RunTrigger, Thread } from "@/lib/types";
import { DAY, nowIso, truncate } from "@/lib/util";
import { openThread } from "./escalate";

export const CLARIFIER_ID = "agent:clarifier";
const MAX_OPEN_PER_AUTHOR = 2;
const MAX_PER_PROJECT_PER_DAY = 3;

type Policy = { ok: true; author: Person } | { ok: false; reason: string };

/** Code-side policy. It runs before any model is called and decides whether asking is allowed at all. */
async function checkPolicy(project: Project, event: ProjectEvent, now: Date): Promise<Policy> {
  if (!project.features.clarifyingQuestions) return { ok: false, reason: "Clarifying questions are disabled for this project." };
  if (event.projectId !== project.id) return { ok: false, reason: "The event belongs to another project." };
  if (!event.actorId || !project.team.some((member) => member.personId === event.actorId)) return { ok: false, reason: "The author is not on the project team." };
  if (event.clarity !== "unclear" || event.importance < 4) return { ok: false, reason: "The change is clear or not significant enough." };
  const people = await loadPeople();
  const author = people.get(event.actorId);
  if (!author) return { ok: false, reason: "The author is unknown." };

  const store = await getStore();
  const threads = (await store.list("threads")).filter((thread) => thread.projectId === project.id);
  if (threads.some((thread) => thread.relatedEventIds.includes(event.id))) return { ok: false, reason: "A thread already references this change." };
  const clarifications = threads.filter((thread) => thread.kind === "clarification");
  const open = clarifications.filter((thread) => thread.assigneeId === author.id && thread.status === "open");
  if (open.length >= MAX_OPEN_PER_AUTHOR) return { ok: false, reason: `${author.name} already has ${open.length} open clarification questions.` };
  const recent = clarifications.filter((thread) => new Date(thread.createdAt).getTime() >= now.getTime() - DAY);
  if (recent.length >= MAX_PER_PROJECT_PER_DAY) return { ok: false, reason: "The daily limit of clarification questions for this project is reached." };
  return { ok: true, author };
}

function composeBody(project: Project, author: Person, event: ProjectEvent, questions: string[]): string {
  const first = author.name.split(/\s+/)[0] || author.name;
  const day = event.occurredAt.slice(0, 10);
  return [
    `Hi ${first},`,
    "",
    `I'm Project Aid, the assistant for the ${project.name} directors. I noticed "${truncate(event.title, 100)}" (${day}) and its description does not say what it is for, so I would like to make sure the directors hear it from you.`,
    "",
    ...questions.map((question, index) => `${index + 1}. ${question}`),
    "",
    "A few words are plenty. You can answer with the link below, no sign-in needed. Thank you!",
  ].join("\n");
}

/**
 * Asks the author of an unclear, significant change what it was for, but only
 * when the policy allows it. Returns null when nothing was asked.
 */
export async function askClarification(args: { project: Project; event: ProjectEvent; actor: Actor; trigger: RunTrigger }): Promise<Thread | null> {
  const { project, event, actor } = args;
  const policy = await checkPolicy(project, event, new Date());
  if (!policy.ok) return null;
  const author = policy.author;

  const { result } = await withRun(
    { workflow: "clarify", title: `Clarify: ${truncate(event.title, 70)}`, actor, project, trigger: args.trigger, input: `${author.name}: ${event.title}`, onEvent: undefined },
    async (ctx) => {
      await codeStep(ctx, "policy", "Check the clarification policy", `${event.id} by ${author.name}`, () => "allowed", (r) => r);
      const decision: ClarifierOutput = await runAgent(ctx, clarifier, {
        projectName: project.name,
        authorName: author.name,
        event: {
          title: event.title,
          summary: event.summary,
          kind: event.kind,
          areas: event.areas,
          filesChanged: event.stats?.filesChanged,
          linesChanged: (event.stats?.additions ?? 0) + (event.stats?.deletions ?? 0) || undefined,
          occurredAt: event.occurredAt,
        },
      });
      const questions = decision.questions.map((question) => truncate(redactSecrets(question).text, 300)).filter(Boolean).slice(0, 2);
      if (!decision.shouldAsk || questions.length === 0) {
        await audit(actor, "clarification.skipped", { projectId: project.id, target: event.id, detail: truncate(decision.reason, 200) });
        return null;
      }
      return codeStep(
        ctx,
        "deliver",
        "Create the thread and deliver it",
        `${author.name} via ${project.notifyChannel}`,
        async () => {
          const thread = await openThread({
            project,
            actor,
            kind: "clarification",
            subject: `Quick question about: ${truncate(event.title, 80)}`,
            body: composeBody(project, author, event, questions),
            assignee: author,
            createdById: CLARIFIER_ID,
            authorName: "Project Aid",
            via: "agent",
            watcherIds: project.pdIds,
            relatedEventIds: [event.id],
            originQuestion: questions.join(" "),
          });
          await audit(actor, "clarification.created", { projectId: project.id, target: thread.id, detail: `Asked ${author.name} about "${truncate(event.title, 80)}" at ${nowIso()}` });
          const { refreshSnapshot } = await import("@/lib/services/snapshot");
          await refreshSnapshot(project);
          return thread;
        },
        (thread) => `Thread ${thread.id}`,
      );
    },
    (thread) => (thread ? `Asked about ${event.id}` : "No question needed"),
  );
  return result;
}
