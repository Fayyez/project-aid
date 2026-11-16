/** Semantic tones shared by Badge, Callout, Stat, charts. Colour is reserved for status. */
export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

/** Soft filled chip: background, text and hairline border. */
export const toneSoft: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-line",
  accent: "bg-accent-soft text-accent border-accent-line",
  success: "bg-success-soft text-success border-success-line",
  warning: "bg-warning-soft text-warning border-warning-line",
  danger: "bg-danger-soft text-danger border-danger-line",
  info: "bg-info-soft text-info border-info-line",
};

/** Text colour only. */
export const toneText: Record<Tone, string> = {
  neutral: "text-muted",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
};

/** Solid dot / fill colour. */
export const toneDot: Record<Tone, string> = {
  neutral: "bg-subtle",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};
