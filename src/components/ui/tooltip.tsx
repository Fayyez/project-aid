import type { ReactNode } from "react";
import { cn } from "./cn";

export interface TooltipProps {
  content: ReactNode;
  side?: "top" | "bottom";
  children: ReactNode;
  className?: string;
}

/** CSS-only tooltip shown on hover and keyboard focus of the wrapped element. */
export function Tooltip({ content, side = "top", children, className }: TooltipProps) {
  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2 rounded-md bg-fg px-2 py-1 text-xs font-normal leading-snug text-bg opacity-0 shadow-pop transition-opacity delay-100 group-focus-within/tt:opacity-100 group-hover/tt:opacity-100",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        )}
      >
        {content}
      </span>
    </span>
  );
}
