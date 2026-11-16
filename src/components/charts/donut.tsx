import { cn } from "../ui/cn";
import { toneDot } from "../ui/tones";
import { chartText, type ChartTone } from "./tones";

export interface DonutSegment {
  label: string;
  value: number;
  tone: ChartTone;
}

export interface DonutProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  /** Big text in the centre (defaults to the total). */
  centerValue?: string | number;
  centerLabel?: string;
  legend?: boolean;
  title?: string;
  className?: string;
}

/** `<Donut title="Tickets by status" segments={[{ label: "Done", value: 24, tone: "success" }, ...]} centerLabel="tickets" />` */
export function Donut({ segments, size = 120, thickness = 14, centerValue, centerLabel, legend = true, title = "Distribution", className }: DonutProps) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 1.5 : 0;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-3", className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${title}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`} className="shrink-0">
        <title>{title}</title>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        {total > 0
          ? segments.map((s) => {
              if (s.value <= 0) return null;
              const len = (s.value / total) * c;
              const el = (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={thickness}
                  strokeDasharray={`${Math.max(len - gap, 0.5)} ${c - Math.max(len - gap, 0.5)}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  className={chartText[s.tone]}
                >
                  <title>{`${s.label}: ${s.value}`}</title>
                </circle>
              );
              offset += len;
              return el;
            })
          : null}
        <text x="50%" y={centerLabel ? "47%" : "50%"} textAnchor="middle" dominantBaseline="central" fontSize={size / 5} fontWeight={600} fill="var(--fg)" style={{ fontVariantNumeric: "tabular-nums" }}>
          {centerValue ?? total}
        </text>
        {centerLabel ? (
          <text x="50%" y="64%" textAnchor="middle" dominantBaseline="central" fontSize={Math.max(9, size / 11)} fill="var(--muted)">
            {centerLabel}
          </text>
        ) : null}
      </svg>
      {legend ? (
        <ul className="min-w-0 space-y-1 text-[13px]">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span aria-hidden className={cn("size-2.5 shrink-0 rounded-sm", toneDot[s.tone])} />
              <span className="text-muted">{s.label}</span>
              <span className="ml-auto pl-3 font-medium tabular-nums">{s.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
