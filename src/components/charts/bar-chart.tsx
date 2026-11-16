import { cn } from "../ui/cn";
import { chartText, type ChartTone } from "./tones";

export interface BarDatum {
  label: string;
  value: number;
  /** Overrides the chart tone for this bar. */
  tone?: ChartTone;
}

export interface BarChartProps {
  data: BarDatum[];
  tone?: ChartTone;
  height?: number;
  /** Width of each bar slot in px. */
  slot?: number;
  /** Emphasise the last bar and fade the rest (good for "this week"). */
  highlightLast?: boolean;
  /** Format value labels. */
  format?: (value: number) => string;
  title?: string;
  className?: string;
}

/** Labelled vertical bars: `<BarChart title="Tickets closed per week" data={[{ label: "W1", value: 6 }, ...]} />` */
export function BarChart({ data, tone = "accent", height = 150, slot = 44, highlightLast = true, format = String, title = "Bar chart", className }: BarChartProps) {
  const n = data.length;
  const width = Math.max(n, 1) * slot;
  const top = 18;
  const bottom = 20;
  const plot = height - top - bottom;
  const max = Math.max(...data.map((d) => d.value), 1);
  const bw = Math.min(26, slot - 14);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${format(d.value)}`).join(", ")}`} className={cn("max-w-full", className)}>
      <title>{title}</title>
      <line x1={0} x2={width} y1={top + plot} y2={top + plot} stroke="var(--line-strong)" strokeWidth={1} />
      <line x1={0} x2={width} y1={top} y2={top} stroke="var(--line)" strokeWidth={1} strokeDasharray="3 4" />
      {data.map((d, i) => {
        const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * plot);
        const x = i * slot + (slot - bw) / 2;
        const isLast = i === n - 1;
        return (
          <g key={d.label + i} className={chartText[d.tone ?? tone]}>
            <title>{`${d.label}: ${format(d.value)}`}</title>
            <rect x={x} y={top + plot - h} width={bw} height={h} rx={3} fill="currentColor" opacity={highlightLast && !isLast ? 0.5 : 1} />
            <text x={i * slot + slot / 2} y={top + plot - h - 5} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--fg)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {format(d.value)}
            </text>
            <text x={i * slot + slot / 2} y={height - 5} textAnchor="middle" fontSize={10.5} fill="var(--muted)">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
