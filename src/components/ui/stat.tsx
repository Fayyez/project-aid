import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { toneText, type Tone } from "./tones";

export interface StatDelta {
  /** Display text, e.g. "+12%" or "-2 tickets". */
  value: string;
  direction: "up" | "down" | "flat";
  /** Colour of the delta. Defaults: up = success, down = danger, flat = neutral. Override when "down" is good. */
  tone?: Tone;
  /** Trailing context, e.g. "vs last 4 weeks". */
  label?: string;
}

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  delta?: StatDelta;
  hint?: ReactNode;
  /** Slot for a Sparkline or other tiny chart, shown at the right. */
  spark?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/** KPI block: `<Stat label="Velocity" value="8.5" delta={{ value: "+12%", direction: "up" }} spark={<Sparkline data={[...]} />} />` */
export function Stat({ label, value, delta, hint, spark, icon, className }: StatProps) {
  const dTone: Tone = delta ? (delta.tone ?? (delta.direction === "up" ? "success" : delta.direction === "down" ? "danger" : "neutral")) : "neutral";
  const DIcon = delta?.direction === "up" ? ArrowUpRight : delta?.direction === "down" ? ArrowDownRight : Minus;
  return (
    <div className={cn("flex min-w-0 items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted [&>svg]:size-3.5">
          {icon}
          <span className="truncate">{label}</span>
        </div>
        <div className="mt-1 text-2xl font-semibold leading-none tracking-tight tabular-nums">{value}</div>
        {delta || hint ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs">
            {delta ? (
              <span className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", toneText[dTone])}>
                <DIcon size={13} aria-hidden />
                <span className="sr-only">{delta.direction === "up" ? "Up " : delta.direction === "down" ? "Down " : "Unchanged "}</span>
                {delta.value}
              </span>
            ) : null}
            {delta?.label ? <span className="text-muted">{delta.label}</span> : null}
            {hint ? <span className="text-muted">{hint}</span> : null}
          </div>
        ) : null}
      </div>
      {spark ? <div className="shrink-0">{spark}</div> : null}
    </div>
  );
}
