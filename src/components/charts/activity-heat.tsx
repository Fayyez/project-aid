import { cn } from "../ui/cn";
import { chartText, type ChartTone } from "./tones";

export interface ActivityHeatProps {
  /** One value per day, oldest first. */
  data: number[];
  /** Optional label per cell (e.g. ISO dates) used in tooltips. */
  labels?: string[];
  tone?: ChartTone;
  /** Cell size in px. */
  cell?: number;
  gap?: number;
  title?: string;
  className?: string;
}

const LEVELS = [0.22, 0.45, 0.7, 1];

/** One row of day cells with 4 intensity levels: `<ActivityHeat data={person.activity} title="Daily activity" />` */
export function ActivityHeat({ data, labels, tone = "accent", cell = 12, gap = 3, title = "Daily activity", className }: ActivityHeatProps) {
  const max = Math.max(...data, 0);
  const width = data.length * (cell + gap) - gap;
  return (
    <svg width={width} height={cell} viewBox={`0 0 ${Math.max(width, 1)} ${cell}`} role="img" aria-label={`${title}: ${data.join(", ")}`} className={cn("max-w-full", chartText[tone], className)}>
      <title>{title}</title>
      {data.map((v, i) => {
        const level = v <= 0 || max === 0 ? -1 : Math.min(3, Math.ceil((v / max) * 4) - 1);
        return (
          <rect key={i} x={i * (cell + gap)} y={0} width={cell} height={cell} rx={3} fill={level < 0 ? "var(--surface-3)" : "currentColor"} opacity={level < 0 ? 1 : LEVELS[level]}>
            <title>{`${labels?.[i] ?? `Day ${i + 1}`}: ${v}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
