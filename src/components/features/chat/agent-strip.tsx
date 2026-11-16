"use client";

import { Check, Layers, X } from "lucide-react";
import { Spinner, cn } from "@/components/ui";
import type { RunStep } from "@/lib/types";

function Mark({ status }: { status: RunStep["status"] }) {
  if (status === "running") return <Spinner size={12} label="" className="text-info" />;
  if (status === "failed") return <X size={12} aria-hidden className="text-danger" />;
  return <Check size={12} aria-hidden className="text-success" />;
}

function statusWord(status: RunStep["status"]) {
  return status === "running" ? "working" : status === "failed" ? "failed" : "done";
}

type Block = { kind: "single"; step: RunStep } | { kind: "group"; group: string; steps: RunStep[] };

function toBlocks(steps: RunStep[]): Block[] {
  const blocks: Block[] = [];
  for (const step of steps) {
    const last = blocks[blocks.length - 1];
    if (step.group && last?.kind === "group" && last.group === step.group) last.steps.push(step);
    else if (step.group) blocks.push({ kind: "group", group: step.group, steps: [step] });
    else blocks.push({ kind: "single", step });
  }
  return blocks;
}

/** Live "agents at work" strip built from the step events of one answer. */
export function AgentStrip({ steps }: { steps: RunStep[] }) {
  const blocks = toBlocks(steps);
  return (
    <div className="rounded-lg border border-line bg-surface-2/60 p-3" aria-label="Agents at work">
      <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted">
        <Spinner size={12} label="" />
        Agents at work
      </p>
      {blocks.length === 0 ? <p className="text-[13px] text-muted">Starting up...</p> : null}
      <ol className="flex flex-wrap items-center gap-2" aria-live="polite">
        {blocks.map((b) => {
          if (b.kind === "single") {
            return (
              <li key={b.step.id} className={cn("inline-flex items-center gap-1.5 rounded-full border bg-surface px-2.5 py-1 text-xs", b.step.status === "failed" ? "border-danger-line" : "border-line")}>
                <Mark status={b.step.status} />
                <span>{b.step.title}</span>
                <span className="sr-only">{statusWord(b.step.status)}</span>
              </li>
            );
          }
          const running = b.steps.some((s) => s.status === "running");
          const finished = b.steps.filter((s) => s.status !== "running").length;
          return (
            <li key={b.group + b.steps[0].id} className="rounded-lg border border-dashed border-line-strong bg-surface p-1.5">
              <p className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted">
                <Layers size={11} aria-hidden />
                {b.steps.length} project specialists, side by side
                <span className="tabular-nums">
                  ({finished}/{b.steps.length}
                  <span className="sr-only"> finished</span>)
                </span>
                {running ? null : <span className="sr-only">all done</span>}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {b.steps.map((s) => (
                  <li key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-xs">
                    <Mark status={s.status} />
                    <span>{s.title}</span>
                    <span className="sr-only">{statusWord(s.status)}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
