import type { Tone } from "../ui/tones";

export type ChartTone = Tone;

/** Tailwind text-colour classes: SVG shapes use `currentColor`, so the tone drives stroke and fill. */
export const chartText: Record<ChartTone, string> = {
  neutral: "text-subtle",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
};
