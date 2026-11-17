import { beforeEach, describe, expect, it } from "vitest";
import { addManualLesson, decideLesson, reflectOnFeedback } from "@/lib/workflows/reflect";
import { loadLessons } from "@/lib/agents/runtime";
import { getStore, useFreshMemoryStore } from "@/lib/store";
import type { Actor, AgentRun, Conversation, Feedback, Report } from "@/lib/types";

const actor: Actor = { id: "u_pd", name: "Dana Director", role: "pd", via: "system", scopes: ["read", "write"] };
const at = new Date().toISOString();

function feedback(id: string, patch: Partial<Feedback> = {}): Feedback {
  return { id, userId: actor.id, projectId: "prj_atlas", target: { type: "chat_message", id: "m2", conversationId: "c1" }, rating: "down", comment: "The answer was too long and buried the key point", processed: false, createdAt: at, ...patch };
}

async function seed() {
  const store = await getStore();
  const convo: Conversation = {
    id: "c1", userId: actor.id, projectId: "prj_atlas", title: "t", createdAt: at, updatedAt: at,
    messages: [{ id: "m1", role: "user", content: "How is checkout going?", at }, { id: "m2", role: "assistant", content: "A very long answer about checkout [E1].", at, runId: "run_x" }],
  };
  await store.put("conversations", convo);
  const report: Report = { id: "rep1", projectId: "prj_atlas", kind: "progress", title: "Atlas - Progress report", periodStart: at, periodEnd: at, markdown: "", citations: [], createdById: actor.id, createdAt: at };
  await store.put("reports", report);
  const run: AgentRun = {
    id: "run_x", workflow: "chat", title: "chat", trigger: "chat", status: "succeeded", inputPreview: "", usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, startedAt: at,
    steps: [{ id: "s1", agent: "chat-answerer", title: "Answer", tier: "smart", provider: "heuristic", model: "rules", mode: "heuristic", status: "succeeded", startedAt: at, inputPreview: "" }],
    grounding: { score: 0.5, citedRefs: [], invalidRefs: [], unsupported: [], verdict: "partially_grounded" },
  };
  await store.put("runs", run);
  await store.put("feedback", feedback("f1", { runId: "run_x" }));
  await store.put("feedback", feedback("f2", { target: { type: "report", id: "rep1" }, comment: "Use plainer language for the client" }));
  await store.put("feedback", feedback("f3", { rating: "up", comment: "Great" }));
  await store.put("feedback", feedback("f4", { projectId: "prj_other", comment: "Other project problem with dates" }));
}

describe("reflectOnFeedback", () => {
  beforeEach(() => {
    useFreshMemoryStore();
  });

  it("proposes lessons for negative feedback with comments and marks feedback processed", async () => {
    await seed();
    const { lessons, processed, run } = await reflectOnFeedback({ actor, projectId: "prj_atlas", trigger: "manual" });
    expect(processed).toBe(3);
    expect(lessons).toHaveLength(2);
    expect(lessons.every((l) => l.status === "proposed" && l.source === "reflection")).toBe(true);
    expect(lessons.find((l) => l.evidenceFeedbackIds.includes("f1"))?.agent).toBe("chat-answerer");
    expect(run.status).toBe("succeeded");
    expect(run.steps.find((s) => s.agent === "reflector")?.mode).toBe("heuristic");
    const store = await getStore();
    const feedbackNow = await store.list("feedback");
    expect(feedbackNow.filter((f) => f.processed).map((f) => f.id).sort()).toEqual(["f1", "f2", "f3"]);
    expect(feedbackNow.find((f) => f.id === "f4")?.processed).toBe(false);
    expect(await store.list("lessons")).toHaveLength(2);
    // Proposed lessons do not reach agent prompts until approved.
    expect(await loadLessons("prj_atlas")).toHaveLength(0);
  });

  it("does not duplicate lessons and does nothing when there is no feedback", async () => {
    await seed();
    await reflectOnFeedback({ actor, trigger: "manual" });
    const store = await getStore();
    await store.put("feedback", feedback("f9", { target: { type: "report", id: "rep1" }, comment: "Use plainer language for the client" }));
    const again = await reflectOnFeedback({ actor, trigger: "manual" });
    expect(again.processed).toBe(1);
    expect(again.lessons).toHaveLength(0);
    const empty = await reflectOnFeedback({ actor, trigger: "manual" });
    expect(empty.processed).toBe(0);
    expect(empty.run.steps.some((s) => s.agent === "reflector")).toBe(false);
  });

  it("lets a director approve, retire and add lessons", async () => {
    await seed();
    const { lessons } = await reflectOnFeedback({ actor, projectId: "prj_atlas", trigger: "manual" });
    const approved = await decideLesson({ actor, lessonId: lessons[0].id, decision: "active" });
    expect(approved.status).toBe("active");
    expect(approved.decidedById).toBe(actor.id);
    expect(await loadLessons("prj_atlas")).toHaveLength(1);
    const retired = await decideLesson({ actor, lessonId: lessons[0].id, decision: "retired" });
    expect(retired.status).toBe("retired");
    await expect(decideLesson({ actor, lessonId: "nope", decision: "active" })).rejects.toThrow(/not found/i);
    const manual = await addManualLesson({ actor, scope: "global", agent: "all", text: "Always state dates in UTC." });
    expect(manual).toMatchObject({ status: "active", source: "manual" });
    expect(await loadLessons()).toHaveLength(1);
  });
});
