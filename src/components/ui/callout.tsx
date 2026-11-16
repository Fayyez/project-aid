import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export type CalloutTone = "info" | "success" | "warning" | "danger";

const styles: Record<CalloutTone, { box: string; icon: typeof Info }> = {
  info: { box: "border-info-line bg-info-soft [&>svg]:text-info", icon: Info },
  success: { box: "border-success-line bg-success-soft [&>svg]:text-success", icon: CircleCheck },
  warning: { box: "border-warning-line bg-warning-soft [&>svg]:text-warning", icon: TriangleAlert },
  danger: { box: "border-danger-line bg-danger-soft [&>svg]:text-danger", icon: CircleAlert },
};

export interface CalloutProps {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Optional trailing action (button/link). */
  action?: ReactNode;
  className?: string;
}

/** Inline notice: `<Callout tone="warning" title="Deploy degraded">Staging is slower than usual.</Callout>` */
export function Callout({ tone = "info", title, children, action, className }: CalloutProps) {
  const { box, icon: Icon } = styles[tone];
  return (
    <div role={tone === "danger" || tone === "warning" ? "alert" : "note"} className={cn("flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[13px]", box, className)}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-fg">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "text-fg/85")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
