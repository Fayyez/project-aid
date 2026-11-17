import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export interface Breadcrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  /** Right-aligned buttons. */
  actions?: ReactNode;
  /** Slot under the title for badges / meta (health, dates, owners). */
  meta?: ReactNode;
  className?: string;
}

/** Page title block (the only h1 on a page). */
export function PageHeader({ title, description, breadcrumbs, actions, meta, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-5", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
            {breadcrumbs.map((b, i) => (
              <li key={b.label + i} className="inline-flex items-center gap-1">
                {i > 0 ? <ChevronRight size={12} aria-hidden className="text-subtle" /> : null}
                {b.href ? (
                  <Link href={b.href} className="hover:text-fg hover:underline">
                    {b.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-fg">
                    {b.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-[22px]">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-[13px] text-muted">{description}</p> : null}
          {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
