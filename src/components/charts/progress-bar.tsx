import { cn } from "../ui/cn";
import { toneDot, type Tone } from "../ui/tones";

export interface ProgressBarProps {
  /** 0-100. */
  value: number;
  /** Second marker, e.g. share of the schedule elapsed (0-100). */
  marker?: number;
  markerLabel?: string;
  /**
   * Fill colour. "auto" (needs `marker`) goes green when progress keeps up with time,
   * amber when slightly behind, red when well behind.
   */
  tone?: Tone | "auto";
  label?: string;
  /** Show the percentage next to the bar. */
  showValue?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/** `<ProgressBar value={62} marker={48} markerLabel="Time elapsed" tone="auto" label="Scope done" showValue />` */
export function ProgressBar({ value, marker, markerLabel = "Time elapsed", tone = "accent", label = "Progress", showValue, size = "md", className }: ProgressBarProps) {
  const v = Math.min(100, Math.max(0, value));
  const m = marker == null ? undefined : Math.min(100, Math.max(0, marker));
  const resolved: Tone = tone === "auto" ? (m == null ? "accent" : v >= m - 3 ? "success" : v >= m - 15 ? "warning" : "danger") : tone;
  const h = size === "sm" ? "h-1.5" : "h-2.5";
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v)}
        aria-valuetext={m == null ? `${Math.round(v)}%` : `${Math.round(v)}% done, ${Math.round(m)}% ${markerLabel.toLowerCase()}`}
        className={cn("relative flex-1 rounded-full bg-surface-3", h)}
      >
        <div className={cn("h-full rounded-full transition-[width]", toneDot[resolved])} style={{ width: `${v}%` }} />
        {m != null ? (
          <div title={`${markerLabel}: ${Math.round(m)}%`} className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded bg-fg" style={{ left: `${m}%` }} />
        ) : null}
      </div>
      {showValue ? <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-muted">{Math.round(v)}%</span> : null}
    </div>
  );
}
