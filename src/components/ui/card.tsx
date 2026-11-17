import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Render as a different element, e.g. "section" or "article". */
  as?: "div" | "section" | "article";
}

/** Surface container: rounded-lg, hairline border, subtle shadow. Compose with CardHeader + CardBody. */
export function Card({ as: Tag = "div", className, ...rest }: CardProps) {
  return <Tag className={cn("rounded-lg border border-line bg-surface shadow-card", className)} {...rest} />;
}

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned slot for buttons, tabs or a badge. */
  actions?: ReactNode;
  /** Heading level used for the title. Defaults to h2. */
  as?: "h2" | "h3" | "h4";
}

export function CardHeader({ title, description, actions, as: Heading = "h2", className, ...rest }: CardHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3", className)} {...rest}>
      <div className="min-w-0">
        <Heading className="text-sm font-semibold text-fg">{title}</Heading>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...rest} />;
}
