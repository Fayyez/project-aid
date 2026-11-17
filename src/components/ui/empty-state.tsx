import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  /** A lucide icon element, e.g. `<Inbox size={20} />`. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Usually a Button or LinkButton. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-10 text-center", className)}>
      {icon ? <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-2 text-muted">{icon}</div> : null}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
