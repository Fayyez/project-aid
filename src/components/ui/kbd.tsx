import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface-2 px-1 font-mono text-[11px] font-medium text-muted shadow-[0_1px_0_var(--line-strong)]", className)}
      {...rest}
    />
  );
}
