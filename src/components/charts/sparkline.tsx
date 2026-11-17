import { cn } from "../ui/cn";
import { chartText, type ChartTone } from "./tones";

export interface SparklineProps {
  data: number[];
  /** "line" (default, with soft area) or "bars". */
  kind?: "line" | "bars";
  tone?: ChartTone;
  width?: number;
  height?: number;
  /** Accessible description. */
  title?: string;
  className?: string;
}

/** Tiny trend graphic: `<Sparkline data={[3, 5, 4, 8]} tone="success" title="Weekly throughput" />` */
export function Sparkline({ data, kind = "line", tone = "accent", width = 96, height = 28, title = "Trend", className }: SparklineProps) {
  const pad = 2;
  const n = data.length;
  const max = Math.max(...data, 1);
  const min = kind === "bars" ? 0 : Math.min(...data, 0);
  const span = max - min || 1;
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const label = `${title}: ${data.join(", ")}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className={cn("overflow-visible", chartText[tone], className)}>
      <title>{label}</title>
      {n === 0 ? null : kind === "bars" ? (
        data.map((v, i) => {
          const gap = 2;
          const bw = Math.max(2, (width - gap * (n - 1)) / n);
          const top = y(v);
          return <rect key={i} x={i * (bw + gap)} y={top} width={bw} height={Math.max(1.5, height - pad - top)} rx={1.5} fill="currentColor" opacity={i === n - 1 ? 1 : 0.55} />;
        })
      ) : (
        (() => {
          const step = n > 1 ? (width - pad * 2) / (n - 1) : 0;
          const pts = data.map((v, i) => [pad + i * step, y(v)] as const);
          const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
          const last = pts[pts.length - 1];
          return (
            <>
              {n > 1 ? <path d={`${d} L${last[0]} ${height - pad} L${pts[0][0]} ${height - pad} Z`} fill="currentColor" opacity={0.12} /> : null}
              <path d={d} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={last[0]} cy={last[1]} r={2.2} fill="currentColor" />
            </>
          );
        })()
      )}
    </svg>
  );
}
