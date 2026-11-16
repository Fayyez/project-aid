import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { toneDot, toneSoft, type Tone } from "./tones";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** Small status dot before the label. */
  dot?: boolean;
  /** Leading icon (lucide, size 12). Pair colour with an icon or label: colour is never the only signal. */
  icon?: ReactNode;
}

/** `<Badge tone="success" dot>Healthy</Badge>` */
export function Badge({ tone = "neutral", dot, icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-medium leading-none [&>svg]:size-3 [&>svg]:shrink-0",
        toneSoft[tone],
        className,
      )}
      {...rest}
    >
      {dot ? <span aria-hidden className={cn("size-1.5 rounded-full", toneDot[tone])} /> : null}
      {icon}
      {children}
    </span>
  );
}
