import type { z } from "zod";
import { pickProvider, LlmError, type Effort, type ToolSpec } from "@/lib/llm";
import { UNTRUSTED_NOTICE } from "@/lib/security/redact";
import { getStore } from "@/lib/store";
import type { Actor, AgentRun, GroundingResult, Lesson, Project, RunStep, RunTrigger, Tier, Usage } from "@/lib/types";
import { newId, nowIso, truncate } from "@/lib/util";

/**
 * The agent runtime.
 *
 * An agent is a small, single-purpose unit: a system prompt, an input-to-prompt
 * function, an output schema, and a deterministic fallback. Workflows (see
 * src/lib/workflows) compose agents in code. Every step is recorded in an
 * AgentRun trace so a director can see exactly which agent did what, on which
 * model, and whether it ran live or on the fallback path.
 */

export type RunEvent =
  | { type: "run_started"; run: AgentRun }
  | { type: "step_started"; step: RunStep }
  | { type: "step_finished"; step: RunStep }
  | { type: "delta"; text: string }
  | { type: "run_finished"; run: AgentRun };

export interface RunContext {
  run: AgentRun;
  actor: Actor;
  project?: Project;
  /** Active lessons (global and for this project) injected into agent prompts. */
  lessons: Lesson[];
  emit(event: RunEvent): void;
}

interface AgentMeta {
  /** Stable machine name, e.g. "fix-reviewer". */
  name: string;
  /** Human title shown in traces. */
  title: string;
  /** One line on what this agent is responsible for. */
  description: string;
  tier: Tier;
  /** Bump when the prompt changes so traces can be compared across versions. */
  version: string;
  system: string;
  effort?: Effort;
  maxTokens?: number;
  /** True when the prompt may contain source code; drives privacy routing. */
  handlesCode?: boolean;
}

export interface AgentDef<I, O> extends AgentMeta {
  schema: z.ZodType<O>;
  prompt(input: I): string;
  /** Deterministic implementation used when no model is available or the call fails. */
  fallback(input: I): O | Promise<O>;
}

export interface TextAgentDef<I> extends AgentMeta {
  prompt(input: I): string;
  fallback(input: I): string | Promise<string>;
}

export interface ToolAgentDef<I> extends TextAgentDef<I> {
  tools(input: I): ToolSpec[];
  maxIterations?: number;
}

/** Every defined agent, for the "Agents" catalogue in the UI and the docs. */
export const AGENT_CATALOG = new Map<string, { name: string; title: string; description: string; tier: Tier; version: string; kind: "structured" | "text" | "tool" }>();

function register(meta: AgentMeta, kind: "structured" | "text" | "tool") {
  AGENT_CATALOG.set(meta.name, { name: meta.name, title: meta.title, description: meta.description, tier: meta.tier, version: meta.version, kind });
}

export function defineAgent<I, O>(def: AgentDef<I, O>): AgentDef<I, O> {
  register(def, "structured");
  return def;
}

export function defineTextAgent<I>(def: TextAgentDef<I>): TextAgentDef<I> {
  register(def, "text");
  return def;
}

export function defineToolAgent<I>(def: ToolAgentDef<I>): ToolAgentDef<I> {
  register(def, "tool");
  return def;
}

// --- runs ----------------------------------------------------------------------

const ZERO: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

async function saveRun(run: AgentRun): Promise<void> {
  try {
    const store = await getStore();
    await store.put("runs", run);
  } catch {
    // Tracing must never fail the work it describes.
  }
}

export async function loadLessons(projectId?: string): Promise<Lesson[]> {
  const store = await getStore();
  const lessons = await store.list("lessons");
  return lessons.filter((lesson) => lesson.status === "active" && (lesson.scope === "global" || lesson.scope === projectId));
}

export interface StartRunArgs {
  workflow: string;
  title: string;
  actor: Actor;
  project?: Project;
  trigger: RunTrigger;
  input: string;
  onEvent?: (event: RunEvent) => void;
}

export async function startRun(args: StartRunArgs): Promise<RunContext> {
  const run: AgentRun = {
    id: newId("run"),
    workflow: args.workflow,
    title: args.title,
    projectId: args.project?.id,
    userId: args.actor.id,
    trigger: args.trigger,
    status: "running",
    inputPreview: truncate(args.input, 400),
    steps: [],
    usage: { ...ZERO },
    startedAt: nowIso(),
  };
  const ctx: RunContext = {
    run,
    actor: args.actor,
    project: args.project,
    lessons: await loadLessons(args.project?.id),
    emit: (event) => {
      try {
        args.onEvent?.(event);
      } catch {
        /* a broken listener must not break the run */
      }
    },
  };
  await saveRun(run);
  ctx.emit({ type: "run_started", run });
  return ctx;
}

export async function finishRun(ctx: RunContext, output: string, extra: { grounding?: GroundingResult } = {}): Promise<AgentRun> {
  ctx.run.status = "succeeded";
  ctx.run.outputPreview = truncate(output, 600);
  ctx.run.finishedAt = nowIso();
  if (extra.grounding) ctx.run.grounding = extra.grounding;
  await saveRun(ctx.run);
  ctx.emit({ type: "run_finished", run: ctx.run });
  return ctx.run;
}

export async function failRun(ctx: RunContext, error: unknown): Promise<AgentRun> {
  ctx.run.status = "failed";
  ctx.run.error = truncate(error instanceof Error ? error.message : String(error), 400);
  ctx.run.finishedAt = nowIso();
  await saveRun(ctx.run);
  ctx.emit({ type: "run_finished", run: ctx.run });
  return ctx.run;
}

/** Runs `fn` inside a traced run and closes the trace whatever happens. */
export async function withRun<T>(args: StartRunArgs, fn: (ctx: RunContext) => Promise<T>, summarize: (result: T) => string = () => "done"): Promise<{ result: T; run: AgentRun }> {
  const ctx = await startRun(args);
  try {
    const result = await fn(ctx);
    if (ctx.run.status === "running") await finishRun(ctx, summarize(result));
    return { result, run: ctx.run };
  } catch (error) {
    await failRun(ctx, error);
    throw error;
  }
}

// --- steps ---------------------------------------------------------------------

function beginStep(ctx: RunContext, partial: Pick<RunStep, "agent" | "title" | "tier" | "provider" | "model" | "mode" | "inputPreview"> & { group?: string; promptVersion?: string }): RunStep {
  const step: RunStep = { id: newId("stp"), status: "running", startedAt: nowIso(), ...partial };
  ctx.run.steps.push(step);
  ctx.emit({ type: "step_started", step });
  return step;
}

async function endStep(ctx: RunContext, step: RunStep, patch: Partial<RunStep>): Promise<void> {
  Object.assign(step, patch);
  step.finishedAt = nowIso();
  step.durationMs = new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime();
  if (step.status === "running") step.status = "succeeded";
  if (step.usage) {
    ctx.run.usage.inputTokens += step.usage.inputTokens;
    ctx.run.usage.outputTokens += step.usage.outputTokens;
    ctx.run.usage.costUsd = Math.round((ctx.run.usage.costUsd + step.usage.costUsd) * 1e6) / 1e6;
  }
  ctx.emit({ type: "step_finished", step });
  await saveRun(ctx.run);
}

function systemPrompt(ctx: RunContext, meta: AgentMeta): string {
  const lessons = ctx.lessons.filter((lesson) => lesson.agent === "all" || lesson.agent === meta.name);
  const learned = lessons.length
    ? `\n\nGuidance learned from director feedback (follow it unless it conflicts with the rules above):\n${lessons.map((lesson) => `- ${lesson.text}`).join("\n")}`
    : "";
  return `${meta.system}\n\n${UNTRUSTED_NOTICE}${learned}`;
}

function describeFailure(error: unknown): string {
  if (error instanceof LlmError) return `${error.kind}: ${error.message}`;
  return error instanceof Error ? error.message : "unknown error";
}

function preview(value: unknown): string {
  if (typeof value === "string") return truncate(value, 500);
  try {
    return truncate(JSON.stringify(value), 500);
  } catch {
    return "[unserialisable]";
  }
}

export interface StepOptions {
  /** Steps sharing a group are shown as having run in parallel. */
  group?: string;
  /** Overrides the step title, e.g. to name the item being processed. */
  title?: string;
}

/** Runs a structured-output agent: live when a model is available, otherwise on its fallback. */
export async function runAgent<I, O>(ctx: RunContext, def: AgentDef<I, O>, input: I, options: StepOptions = {}): Promise<O> {
  const provider = pickProvider(def.tier, { handlesCode: def.handlesCode, privacy: ctx.project?.privacy });
  const prompt = def.prompt(input);
  const step = beginStep(ctx, {
    agent: def.name,
    title: options.title ?? def.title,
    tier: def.tier,
    provider: provider?.name ?? "heuristic",
    model: provider?.model(def.tier) ?? "rules",
    mode: provider ? "llm" : "heuristic",
    inputPreview: truncate(prompt, 500),
    group: options.group,
    promptVersion: def.version,
  });
  if (provider) {
    try {
      const result = await provider.json({ tier: def.tier, system: systemPrompt(ctx, def), prompt, schema: def.schema, effort: def.effort, maxTokens: def.maxTokens });
      await endStep(ctx, step, { outputPreview: preview(result.data), usage: result.usage, model: result.model });
      return result.data;
    } catch (error) {
      // Degrade instead of failing the workflow; the trace records why.
      step.error = `Model call failed (${describeFailure(error)}); used the deterministic fallback.`;
      step.mode = "heuristic";
    }
  }
  try {
    const output = await def.fallback(input);
    await endStep(ctx, step, { outputPreview: preview(output) });
    return output;
  } catch (error) {
    await endStep(ctx, step, { status: "failed", error: describeFailure(error) });
    throw error;
  }
}

/** Runs a free-text agent, optionally streaming its output to the run listener. */
export async function runTextAgent<I>(ctx: RunContext, def: TextAgentDef<I>, input: I, options: StepOptions & { stream?: boolean } = {}): Promise<string> {
  const provider = pickProvider(def.tier, { handlesCode: def.handlesCode, privacy: ctx.project?.privacy });
  const prompt = def.prompt(input);
  const step = beginStep(ctx, {
    agent: def.name,
    title: options.title ?? def.title,
    tier: def.tier,
    provider: provider?.name ?? "heuristic",
    model: provider?.model(def.tier) ?? "rules",
    mode: provider ? "llm" : "heuristic",
    inputPreview: truncate(prompt, 500),
    group: options.group,
    promptVersion: def.version,
  });
  let streamed = "";
  if (provider) {
    try {
      const result = await provider.text({
        tier: def.tier,
        system: systemPrompt(ctx, def),
        prompt,
        effort: def.effort,
        maxTokens: def.maxTokens,
        onDelta: options.stream
          ? (text) => {
              streamed += text;
              ctx.emit({ type: "delta", text });
            }
          : undefined,
      });
      await endStep(ctx, step, { outputPreview: preview(result.text), usage: result.usage, model: result.model });
      return result.text;
    } catch (error) {
      step.error = `Model call failed (${describeFailure(error)}); used the deterministic fallback.`;
      step.mode = "heuristic";
    }
  }
  try {
    const output = await def.fallback(input);
    if (options.stream) {
      // If a partial live answer was already shown, separate it from the fallback text.
      ctx.emit({ type: "delta", text: streamed ? `\n\n---\n\n${output}` : output });
    }
    await endStep(ctx, step, { outputPreview: preview(output) });
    return output;
  } catch (error) {
    await endStep(ctx, step, { status: "failed", error: describeFailure(error) });
    throw error;
  }
}

/** Runs an investigating agent that may call read-only tools in a loop. */
export async function runToolAgent<I>(ctx: RunContext, def: ToolAgentDef<I>, input: I, options: StepOptions = {}): Promise<string> {
  const provider = pickProvider(def.tier, { handlesCode: def.handlesCode, privacy: ctx.project?.privacy });
  const prompt = def.prompt(input);
  const canLoop = Boolean(provider?.toolLoop);
  const step = beginStep(ctx, {
    agent: def.name,
    title: options.title ?? def.title,
    tier: def.tier,
    provider: canLoop ? provider!.name : "heuristic",
    model: canLoop ? provider!.model(def.tier) : "rules",
    mode: canLoop ? "llm" : "heuristic",
    inputPreview: truncate(prompt, 500),
    group: options.group,
    promptVersion: def.version,
  });
  step.toolCalls = [];
  if (provider?.toolLoop) {
    try {
      const result = await provider.toolLoop({
        tier: def.tier,
        system: systemPrompt(ctx, def),
        prompt,
        effort: def.effort,
        maxTokens: def.maxTokens,
        tools: def.tools(input),
        maxIterations: def.maxIterations,
        onToolCall: (call) => step.toolCalls?.push({ name: call.name, inputPreview: preview(call.input), ok: call.ok }),
      });
      await endStep(ctx, step, { outputPreview: preview(result.text), usage: result.usage, model: result.model });
      return result.text;
    } catch (error) {
      step.error = `Model call failed (${describeFailure(error)}); used the deterministic fallback.`;
      step.mode = "heuristic";
    }
  }
  try {
    const output = await def.fallback(input);
    await endStep(ctx, step, { outputPreview: preview(output) });
    return output;
  } catch (error) {
    await endStep(ctx, step, { status: "failed", error: describeFailure(error) });
    throw error;
  }
}

/** Records a plain orchestration step (retrieval, policy check, persistence) in the trace. */
export async function codeStep<T>(ctx: RunContext, name: string, title: string, inputPreview: string, fn: () => Promise<T> | T, describe: (result: T) => string = preview, options: StepOptions = {}): Promise<T> {
  const step = beginStep(ctx, { agent: name, title, tier: "code", provider: "code", model: "-", mode: "code", inputPreview: truncate(inputPreview, 500), group: options.group });
  try {
    const result = await fn();
    await endStep(ctx, step, { outputPreview: truncate(describe(result), 500) });
    return result;
  } catch (error) {
    await endStep(ctx, step, { status: "failed", error: describeFailure(error) });
    throw error;
  }
}
