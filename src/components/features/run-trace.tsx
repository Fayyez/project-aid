import { Check, CircleAlert, Layers, TriangleAlert, Wrench, X } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Spinner, cn } from "@/components/ui";
import { FeatureModeBadge, GroundingBadge, TierBadge } from "@/components/domain";
import type { AgentRun, RunStep } from "@/lib/types";
import type { RunTraceProps } from "./contracts";

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return "-";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

export function formatCost(usd: number): string {
  if (usd === 0) return "$0";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

export function runDurationMs(run: AgentRun): number | undefined {
  if (!run.finishedAt) return undefined;
  return new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
}

/** Consecutive steps that share a group form one parallel block. */
function toBlocks(steps: RunStep[]): RunStep[][] {
  const blocks: RunStep[][] = [];
  for (const step of steps) {
    const last = blocks[blocks.length - 1];
    if (step.group && last && last[0].group === step.group) last.push(step);
    else blocks.push([step]);
  }
  return blocks;
}

function StatusMark({ step }: { step: RunStep }) {
  if (step.status === "running") return <Spinner size={14} label="Running" className="text-info" />;
  if (step.status === "failed") return <X size={14} aria-label="Failed" className="text-danger" />;
  if (step.error) return <TriangleAlert size={14} aria-label="Fell back after a model error" className="text-warning" />;
  return <Check size={14} aria-label="Succeeded" className="text-success" />;
}

function Preview({ label, text }: { label: string; text: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface-2 p-2.5 font-mono text-xs leading-relaxed text-fg">{text}</pre>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate font-mono text-fg" title={typeof children === "string" ? children : undefined}>
        {children}
      </dd>
    </div>
  );
}

function StepCard({ step, compact }: { step: RunStep; compact?: boolean }) {
  const failed = step.status === "failed";
  const warned = !failed && Boolean(step.error);
  const usage = step.usage;
  return (
    <details open={!compact && (failed || warned)} className={cn("min-w-0 rounded-lg border bg-surface shadow-card", failed ? "border-danger-line" : warned ? "border-warning-line" : "border-line")}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg p-3 hover:bg-surface-2/60 [&::-webkit-details-marker]:hidden">
        <StatusMark step={step} />
        <span className="min-w-0 flex-1 basis-48">
          <span className="block truncate text-[13px] font-medium">{step.title}</span>
          <span className="block truncate font-mono text-[11px] text-muted">{step.agent}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <TierBadge tier={step.tier} />
          <FeatureModeBadge mode={step.mode} />
          <span className="text-xs tabular-nums text-muted">{formatDuration(step.durationMs)}</span>
        </span>
      </summary>
      <div className="space-y-3 border-t border-line p-3">
        {step.error ? (
          <div role={failed ? "alert" : "note"} className={cn("flex items-start gap-2 rounded-md border p-2.5 text-[13px]", failed ? "border-danger-line bg-danger-soft text-danger" : "border-warning-line bg-warning-soft text-warning")}>
            {failed ? <CircleAlert size={14} aria-hidden className="mt-0.5 shrink-0" /> : <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0" />}
            <p className="min-w-0 break-words">
              {failed ? "This step failed: " : "The model call failed and a fallback was used: "}
              {step.error}
            </p>
          </div>
        ) : null}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
          <Meta label="Provider">{step.provider}</Meta>
          <Meta label="Model">{step.model}</Meta>
          <Meta label="Tokens">{usage ? `${usage.inputTokens.toLocaleString("en-GB")} in / ${usage.outputTokens.toLocaleString("en-GB")} out` : "-"}</Meta>
          <Meta label="Cost">{usage ? formatCost(usage.costUsd) : "-"}</Meta>
          {step.promptVersion ? <Meta label="Prompt version">{step.promptVersion}</Meta> : null}
        </dl>
        {step.toolCalls && step.toolCalls.length > 0 ? (
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Tool calls</p>
            <ul className="space-y-1">
              {step.toolCalls.map((t, i) => (
                <li key={`${t.name}-${i}`} className="flex min-w-0 items-center gap-2 text-xs">
                  <Wrench size={12} aria-hidden className="shrink-0 text-muted" />
                  <span className="shrink-0 font-mono">{t.name}</span>
                  <Badge tone={t.ok ? "success" : "danger"} icon={t.ok ? <Check size={11} /> : <X size={11} />}>
                    {t.ok ? "ok" : "failed"}
                  </Badge>
                  <span className="min-w-0 truncate font-mono text-muted" title={t.inputPreview}>
                    {t.inputPreview}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Preview label="Input" text={step.inputPreview || "(empty)"} />
          {step.outputPreview ? <Preview label="Output" text={step.outputPreview} /> : null}
        </div>
      </div>
    </details>
  );
}

function Summary({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

/** Step-by-step view of one agent run. Server-renderable. */
export function RunTrace({ run, compact }: RunTraceProps) {
  const live = run.steps.filter((s) => s.mode === "llm").length;
  const fallbacks = run.steps.filter((s) => s.mode === "heuristic").length;
  const blocks = toBlocks(run.steps);
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface p-3 sm:grid-cols-3 lg:grid-cols-6">
        <Summary label="Steps">{run.steps.length}</Summary>
        <Summary label="Ran on a live model">
          {live} of {run.steps.length}
        </Summary>
        <Summary label="Deterministic fallback">{fallbacks}</Summary>
        <Summary label="Duration">{formatDuration(runDurationMs(run))}</Summary>
        <Summary label="Cost">{formatCost(run.usage.costUsd)}</Summary>
        <Summary label="Answer check">{run.grounding ? <GroundingBadge grounding={run.grounding} /> : <span className="font-normal text-muted">Not applicable</span>}</Summary>
      </dl>
      {run.error ? (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-danger-line bg-danger-soft p-3 text-[13px] text-danger">
          <CircleAlert size={14} aria-hidden className="mt-0.5 shrink-0" />
          <p className="min-w-0 break-words">The run failed: {run.error}</p>
        </div>
      ) : null}
      {blocks.length === 0 ? <p className="text-[13px] text-muted">No steps were recorded for this run.</p> : null}
      <ol className="space-y-3">
        {blocks.map((block, i) => (
          <li key={block.map((s) => s.id).join("-")} className="relative pl-8">
            {i < blocks.length - 1 ? <span aria-hidden className="absolute left-[10px] top-6 -bottom-3 w-px bg-line" /> : null}
            <span aria-hidden className="absolute left-0 top-3 flex size-5 items-center justify-center rounded-full border border-line-strong bg-surface text-[10px] font-semibold tabular-nums text-muted">
              {i + 1}
            </span>
            {block.length > 1 ? (
              <div className="rounded-lg border border-dashed border-line-strong p-2">
                <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-muted">
                  <Layers size={13} aria-hidden /> {block.length} steps ran in parallel
                </p>
                <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                  {block.map((s) => (
                    <StepCard key={s.id} step={s} compact={compact} />
                  ))}
                </div>
              </div>
            ) : (
              <StepCard step={block[0]} compact={compact} />
            )}
          </li>
        ))}
      </ol>
      {run.inputPreview || run.outputPreview ? (
        <details className="rounded-lg border border-line bg-surface">
          <summary className="cursor-pointer p-3 text-[13px] font-medium">Run input and output</summary>
          <div className="grid grid-cols-1 gap-3 border-t border-line p-3 lg:grid-cols-2">
            <Preview label="Input" text={run.inputPreview || "(empty)"} />
            {run.outputPreview ? <Preview label="Output" text={run.outputPreview} /> : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
