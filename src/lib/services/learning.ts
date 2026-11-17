import { AGENT_CATALOG } from "@/lib/agents/runtime";
import { AccessError, assertWrite, visibleProjects } from "@/lib/auth/access";
import { audit } from "@/lib/security/audit";
import { getStore } from "@/lib/store";
import type { Actor, AgentRun, EvalCase, Feedback, Lesson } from "@/lib/types";
import { byNewest, newId, nowIso, truncate } from "@/lib/util";

/**
 * The learning loop: directors rate outputs, the reflector turns criticism into
 * proposed lessons, a director approves them, and approved lessons are injected
 * into agent prompts. Pinned questions act as a regression suite.
 */

export async function submitFeedback(actor: Actor, input: { target: Feedback["target"]; rating: "up" | "down"; comment?: string; projectId?: string; runId?: string }): Promise<Feedback> {
  assertWrite(actor);
  const store = await getStore();
  let projectId = input.projectId;
  let runId = input.runId;
  if (input.target.type === "chat_message" && input.target.conversationId) {
    const conversation = await store.get("conversations", input.target.conversationId);
    if (!conversation || conversation.userId !== actor.id) throw new AccessError("Conversation not found", 404);
    const message = conversation.messages.find((candidate) => candidate.id === input.target.id);
    if (!message) throw new AccessError("Message not found", 404);
    message.feedback = input.rating;
    projectId ??= conversation.projectId;
    runId ??= message.runId;
    await store.put("conversations", conversation);
  }
  const existing = (await store.list("feedback")).find((entry) => entry.userId === actor.id && entry.target.type === input.target.type && entry.target.id === input.target.id);
  const feedback: Feedback = {
    id: existing?.id ?? newId("fb"),
    userId: actor.id,
    projectId,
    target: input.target,
    rating: input.rating,
    comment: input.comment ? truncate(input.comment, 600) : existing?.comment,
    runId,
    processed: false,
    createdAt: existing?.createdAt ?? nowIso(),
  };
  await store.put("feedback", feedback);
  return feedback;
}

export interface AgentQuality {
  agent: string;
  title: string;
  tier: string;
  steps: number;
  live: number;
  fallbacks: number;
  failures: number;
  avgMs: number;
  costUsd: number;
}

export interface LearningView {
  lessons: Lesson[];
  feedback: (Feedback & { userName?: string; projectName?: string })[];
  evals: EvalCase[];
  quality: {
    runs: number;
    answers: number;
    avgGrounding: number | null;
    groundedShare: number | null;
    liveShare: number | null;
    modelFailures: number;
    costUsd: number;
    thumbsUp: number;
    thumbsDown: number;
    byAgent: AgentQuality[];
  };
  agents: { name: string; title: string; description: string; tier: string; version: string; kind: string }[];
  pendingFeedback: number;
}

function qualityOf(runs: AgentRun[], feedback: Feedback[]): LearningView["quality"] {
  const answers = runs.filter((run) => run.workflow === "ask" && run.grounding);
  const steps = runs.flatMap((run) => run.steps).filter((step) => step.mode !== "code");
  const byAgent = new Map<string, AgentQuality>();
  for (const step of steps) {
    const meta = AGENT_CATALOG.get(step.agent);
    const row = byAgent.get(step.agent) ?? { agent: step.agent, title: meta?.title ?? step.agent, tier: String(step.tier), steps: 0, live: 0, fallbacks: 0, failures: 0, avgMs: 0, costUsd: 0 };
    row.steps += 1;
    if (step.mode === "llm") row.live += 1;
    if (step.error && step.status !== "failed") row.fallbacks += 1;
    if (step.status === "failed") row.failures += 1;
    row.avgMs += step.durationMs ?? 0;
    row.costUsd += step.usage?.costUsd ?? 0;
    byAgent.set(step.agent, row);
  }
  const rows = Array.from(byAgent.values()).map((row) => ({ ...row, avgMs: row.steps ? Math.round(row.avgMs / row.steps) : 0, costUsd: Math.round(row.costUsd * 1e4) / 1e4 }));
  return {
    runs: runs.length,
    answers: answers.length,
    avgGrounding: answers.length ? Math.round((answers.reduce((sum, run) => sum + (run.grounding?.score ?? 0), 0) / answers.length) * 100) / 100 : null,
    groundedShare: answers.length ? Math.round((answers.filter((run) => run.grounding?.verdict === "grounded").length / answers.length) * 100) / 100 : null,
    liveShare: steps.length ? Math.round((steps.filter((step) => step.mode === "llm").length / steps.length) * 100) / 100 : null,
    modelFailures: steps.filter((step) => step.error).length,
    costUsd: Math.round(runs.reduce((sum, run) => sum + run.usage.costUsd, 0) * 1e4) / 1e4,
    thumbsUp: feedback.filter((entry) => entry.rating === "up").length,
    thumbsDown: feedback.filter((entry) => entry.rating === "down").length,
    byAgent: rows.sort((a, b) => b.steps - a.steps),
  };
}

export async function getLearning(actor: Actor): Promise<LearningView> {
  const store = await getStore();
  const projects = await visibleProjects(actor);
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const inScope = (projectId?: string) => !projectId || projectNames.has(projectId);
  const [lessons, feedback, evals, runs, people] = await Promise.all([store.list("lessons"), store.list("feedback"), store.list("evals"), store.list("runs"), store.list("people")]);
  const names = new Map(people.map((person) => [person.id, person.name]));
  const visibleRuns = runs.filter((run) => (run.projectId ? projectNames.has(run.projectId) : run.userId === actor.id || actor.role === "admin"));
  const visibleFeedback = feedback.filter((entry) => inScope(entry.projectId) && (actor.role === "admin" || entry.userId === actor.id || Boolean(entry.projectId)));
  return {
    lessons: lessons.filter((lesson) => lesson.scope === "global" || projectNames.has(lesson.scope)).sort(byNewest((lesson) => lesson.createdAt)),
    feedback: visibleFeedback.sort(byNewest((entry) => entry.createdAt)).slice(0, 50).map((entry) => ({ ...entry, userName: names.get(entry.userId), projectName: entry.projectId ? projectNames.get(entry.projectId) : undefined })),
    evals: evals.filter((evalCase) => inScope(evalCase.projectId)).sort(byNewest((evalCase) => evalCase.createdAt)),
    quality: qualityOf(visibleRuns, visibleFeedback),
    agents: Array.from(AGENT_CATALOG.values()),
    pendingFeedback: visibleFeedback.filter((entry) => !entry.processed).length,
  };
}

export async function reflect(actor: Actor, projectId?: string) {
  assertWrite(actor);
  const { reflectOnFeedback } = await import("@/lib/workflows/reflect");
  return reflectOnFeedback({ actor, projectId, trigger: "manual" });
}

async function assertLessonScope(actor: Actor, scope: string): Promise<void> {
  if (scope === "global") {
    if (actor.role === "member") throw new AccessError("Not allowed");
    return;
  }
  const projects = await visibleProjects(actor);
  if (!projects.some((project) => project.id === scope)) throw new AccessError("Project not found", 404);
}

export async function decideLesson(actor: Actor, lessonId: string, decision: "active" | "retired"): Promise<Lesson> {
  assertWrite(actor);
  const store = await getStore();
  const lesson = await store.get("lessons", lessonId);
  if (!lesson) throw new AccessError("Lesson not found", 404);
  await assertLessonScope(actor, lesson.scope);
  const workflow = await import("@/lib/workflows/reflect");
  return workflow.decideLesson({ actor, lessonId, decision });
}

export async function addLesson(actor: Actor, input: { scope: string; agent: string; text: string }): Promise<Lesson> {
  assertWrite(actor);
  await assertLessonScope(actor, input.scope);
  const text = input.text.trim();
  if (text.length < 10) throw new Error("Write the guidance as a full sentence.");
  const agent = input.agent === "all" || AGENT_CATALOG.has(input.agent) ? input.agent : "all";
  const workflow = await import("@/lib/workflows/reflect");
  return workflow.addManualLesson({ actor, scope: input.scope, agent, text: truncate(text, 400) });
}

export async function addEvalCase(actor: Actor, input: { question: string; mustMention: string[]; projectId?: string }): Promise<EvalCase> {
  assertWrite(actor);
  if (input.projectId) await assertLessonScope(actor, input.projectId);
  const question = input.question.trim();
  if (question.length < 8) throw new Error("Write the question out in full.");
  const store = await getStore();
  const evalCase: EvalCase = {
    id: newId("eval"),
    projectId: input.projectId,
    question: truncate(question, 400),
    mustMention: input.mustMention.map((term) => term.trim()).filter(Boolean).slice(0, 8),
    createdById: actor.id,
    createdAt: nowIso(),
  };
  await store.put("evals", evalCase);
  return evalCase;
}

export async function removeEvalCase(actor: Actor, evalId: string): Promise<void> {
  assertWrite(actor);
  const store = await getStore();
  const evalCase = await store.get("evals", evalId);
  if (!evalCase) return;
  if (evalCase.createdById !== actor.id && actor.role !== "admin") throw new AccessError("Not allowed");
  await store.remove("evals", evalId);
}

/**
 * Replays every pinned question through the assistant and checks that the
 * answer is grounded and still mentions the expected facts. Run it after
 * changing prompts, models or lessons to catch regressions.
 */
export async function runEvals(actor: Actor): Promise<{ total: number; passed: number; results: EvalCase[] }> {
  assertWrite(actor);
  const store = await getStore();
  const projects = await visibleProjects(actor);
  const visible = new Set(projects.map((project) => project.id));
  const cases = (await store.list("evals")).filter((evalCase) => !evalCase.projectId || visible.has(evalCase.projectId)).slice(0, 12);
  const { askAssistant } = await import("@/lib/workflows/ask");
  const results: EvalCase[] = [];
  for (const evalCase of cases) {
    try {
      const result = await askAssistant({ actor, question: evalCase.question, projectId: evalCase.projectId, trigger: "system" });
      const answer = result.answer.toLowerCase();
      const missing = evalCase.mustMention.filter((term) => !answer.includes(term.toLowerCase()));
      evalCase.lastResult = { at: nowIso(), passed: missing.length === 0 && result.grounding.verdict !== "ungrounded" && result.grounding.invalidRefs.length === 0, groundingScore: result.grounding.score, missing, runId: result.run.id };
    } catch (error) {
      evalCase.lastResult = { at: nowIso(), passed: false, groundingScore: 0, missing: [error instanceof Error ? truncate(error.message, 120) : "error"] };
    }
    await store.put("evals", evalCase);
    results.push(evalCase);
  }
  await audit(actor, "learning.evals_run", { detail: `${results.filter((r) => r.lastResult?.passed).length}/${results.length} passed` });
  return { total: results.length, passed: results.filter((r) => r.lastResult?.passed).length, results };
}
