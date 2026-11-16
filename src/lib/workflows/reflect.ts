import { reflector, type FeedbackCase } from "@/lib/agents/defs/reflector";
import { codeStep, runAgent, withRun } from "@/lib/agents/runtime";
import { audit } from "@/lib/security/audit";
import { redactSecrets } from "@/lib/security/redact";
import { getStore } from "@/lib/store";
import type { Actor, AgentRun, Conversation, Feedback, Lesson, RunTrigger } from "@/lib/types";
import { newId, nowIso, tokenize, truncate } from "@/lib/util";

/** Lessons that would loosen safety rules are never stored, whatever the model proposed. */
const WEAKENS_RULES = /\b(ignore|skip|omit|bypass|disable|turn off|stop)\s+(the\s+)?(citations?|citing|grounding|evidence|redact\w*|privacy|approvals?|confirmations?|reviews?)\b|\b(don'?t|do not|never|no need to)\s+(cite|redact|ask for (an )?approval|require (an )?approval|check (the )?evidence)\b|\bwithout (asking|waiting for) (for )?(approval|confirmation)\b|\b(make up|invent|guess)\b.*\b(when|if)\b.*\b(unsure|unknown|missing)\b/i;

function similar(a: string, b: string): boolean {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / (ta.size + tb.size - shared) >= 0.6;
}

async function describeTarget(feedback: Feedback, conversations: Conversation[]): Promise<string> {
  const store = await getStore();
  const { target } = feedback;
  if (target.type === "chat_message") {
    const convo = (target.conversationId ? conversations.find((c) => c.id === target.conversationId) : undefined) ?? conversations.find((c) => c.messages.some((m) => m.id === target.id));
    const index = convo?.messages.findIndex((m) => m.id === target.id) ?? -1;
    if (convo && index >= 0) {
      const answer = convo.messages[index];
      const question = [...convo.messages.slice(0, index)].reverse().find((m) => m.role === "user");
      return `${question ? `Question: ${truncate(question.content, 300)}\n` : ""}Answer: ${truncate(answer.content, 600)}${answer.grounding ? `\nGrounding: ${answer.grounding.verdict}` : ""}`;
    }
    return "(message no longer available)";
  }
  if (target.type === "report") return (await store.get("reports", target.id))?.title ?? "(report no longer available)";
  if (target.type === "digest") return (await store.get("digests", target.id))?.headline ?? "(digest no longer available)";
  if (target.type === "ticket") return (await store.get("tickets", target.id))?.title ?? "(ticket no longer available)";
  if (target.type === "incident") return (await store.get("incidents", target.id))?.title ?? "(incident no longer available)";
  return (await store.get("events", target.id))?.title ?? "(event no longer available)";
}

function traceNotes(run: AgentRun | null): { agents: string[]; notes: string[] } {
  if (!run) return { agents: [], notes: [] };
  const agentSteps = run.steps.filter((s) => s.mode !== "code");
  const notes: string[] = [`workflow ${run.workflow}`];
  const fallbacks = agentSteps.filter((s) => s.mode === "heuristic").map((s) => s.agent);
  if (fallbacks.length) notes.push(`ran on the deterministic fallback: ${Array.from(new Set(fallbacks)).join(", ")}`);
  const errors = agentSteps.filter((s) => s.error).length;
  if (errors) notes.push(`${errors} step(s) reported model errors`);
  if (run.grounding) notes.push(`grounding ${run.grounding.verdict} (score ${run.grounding.score}${run.grounding.invalidRefs.length ? `, ${run.grounding.invalidRefs.length} invalid refs` : ""})`);
  return { agents: Array.from(new Set(agentSteps.map((s) => s.agent))), notes };
}

/**
 * The self-improvement loop: turns unprocessed feedback into proposed lessons. Lessons only
 * take effect once a director approves them with `decideLesson`.
 */
export async function reflectOnFeedback(args: { actor: Actor; projectId?: string; trigger: RunTrigger }): Promise<{ lessons: Lesson[]; processed: number; run: AgentRun }> {
  const store = await getStore();
  const project = args.projectId ? ((await store.get("projects", args.projectId)) ?? undefined) : undefined;
  const { result, run } = await withRun(
    { workflow: "reflect", title: project ? `Reflect on feedback for ${project.name}` : "Reflect on feedback", actor: args.actor, project, trigger: args.trigger, input: args.projectId ? `feedback for ${args.projectId}` : "all unprocessed feedback" },
    async (ctx) => {
      const { pending, cases } = await codeStep(
        ctx,
        "load-feedback",
        "Load feedback and what it was about",
        args.projectId ?? "all projects",
        async () => {
          const pending = (await store.list("feedback")).filter((f) => !f.processed && (!args.projectId || f.projectId === args.projectId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          const conversations = pending.some((f) => f.target.type === "chat_message") ? await store.list("conversations") : [];
          const cases: FeedbackCase[] = [];
          for (const f of pending) {
            const runRecord = f.runId ? await store.get("runs", f.runId) : null;
            const trace = traceNotes(runRecord);
            cases.push({
              id: f.id,
              rating: f.rating,
              comment: f.comment ? redactSecrets(f.comment).text : undefined,
              targetType: f.target.type,
              about: redactSecrets(await describeTarget(f, conversations)).text,
              agents: trace.agents,
              traceNotes: trace.notes,
            });
          }
          return { pending, cases };
        },
        (r) => `${r.pending.length} unprocessed feedback item(s)`,
      );

      const proposed: Lesson[] = [];
      if (cases.length) {
        const existing = (await store.list("lessons")).filter((l) => l.status !== "retired");
        const reflection = await runAgent(ctx, reflector, { cases, existing: existing.map((l) => ({ agent: l.agent, text: l.text })) });
        await codeStep(
          ctx,
          "store-lessons",
          "De-duplicate and store proposed lessons",
          `${reflection.lessons.length} candidate lesson(s)`,
          async () => {
            const byId = new Map(pending.map((f) => [f.id, f]));
            const caseById = new Map(cases.map((c) => [c.id, c]));
            const known = existing.map((l) => l.text);
            for (const candidate of reflection.lessons) {
              const text = truncate(candidate.text, 400);
              if (!text || WEAKENS_RULES.test(text)) continue;
              const ids = candidate.feedbackIds.filter((id) => byId.has(id));
              if (ids.length === 0) continue;
              if (known.some((k) => similar(k, text))) continue;
              const involved = new Set(ids.flatMap((id) => caseById.get(id)?.agents ?? []));
              const agent = candidate.agent === "all" || involved.has(candidate.agent) ? candidate.agent : "all";
              const projects = new Set(ids.map((id) => byId.get(id)?.projectId));
              const projectId = projects.size === 1 ? Array.from(projects)[0] : undefined;
              const lesson: Lesson = {
                id: newId("les"),
                scope: candidate.scope === "project" && projectId ? projectId : "global",
                agent,
                text,
                rationale: truncate(candidate.rationale, 300),
                source: "reflection",
                status: "proposed",
                evidenceFeedbackIds: ids,
                createdAt: nowIso(),
              };
              await store.put("lessons", lesson);
              known.push(text);
              proposed.push(lesson);
            }
          },
          () => `${proposed.length} lesson(s) proposed`,
        );
      }
      for (const f of pending) await store.put("feedback", { ...f, processed: true });
      await audit(args.actor, "lessons.reflect", { projectId: args.projectId, detail: `${pending.length} feedback item(s) processed, ${proposed.length} lesson(s) proposed` });
      return { lessons: proposed, processed: pending.length };
    },
    (r) => `${r.processed} feedback processed, ${r.lessons.length} lessons proposed`,
  );
  return { ...result, run };
}

/** A director approves ("active") or rejects ("retired") a lesson. */
export async function decideLesson(args: { actor: Actor; lessonId: string; decision: "active" | "retired" }): Promise<Lesson> {
  const store = await getStore();
  const lesson = await store.get("lessons", args.lessonId);
  if (!lesson) throw new Error(`Lesson ${args.lessonId} was not found.`);
  const updated: Lesson = { ...lesson, status: args.decision, decidedById: args.actor.id };
  await store.put("lessons", updated);
  await audit(args.actor, args.decision === "active" ? "lesson.approve" : "lesson.retire", { projectId: lesson.scope === "global" ? undefined : lesson.scope, target: lesson.id });
  return updated;
}

/** A director writes a lesson directly; it takes effect immediately. */
export async function addManualLesson(args: { actor: Actor; scope: string; agent: string; text: string }): Promise<Lesson> {
  const text = truncate(args.text, 500);
  if (!text) throw new Error("A lesson needs some text.");
  const store = await getStore();
  const lesson: Lesson = {
    id: newId("les"),
    scope: args.scope || "global",
    agent: args.agent || "all",
    text,
    rationale: "Added manually by a director.",
    source: "manual",
    status: "active",
    evidenceFeedbackIds: [],
    createdAt: nowIso(),
    decidedById: args.actor.id,
  };
  await store.put("lessons", lesson);
  await audit(args.actor, "lesson.add", { projectId: lesson.scope === "global" ? undefined : lesson.scope, target: lesson.id });
  return lesson;
}
