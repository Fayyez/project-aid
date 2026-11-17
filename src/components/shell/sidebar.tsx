"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../ui";
import { HealthDot } from "../domain";
import { PRIMARY_NAV } from "./nav";

export interface ShellProject {
  id: string;
  name: string;
  key: string;
  health: "green" | "amber" | "red";
}

export interface SidebarProps {
  projects: ShellProject[];
  counts: { inbox: number; incidents: number };
  /** Called after a link is chosen (closes the mobile drawer). */
  onNavigate?: () => void;
}

const linkBase = "group flex items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors";

export function Sidebar({ projects, counts, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Link href="/" onClick={onNavigate} className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <span aria-hidden className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-fg">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h4l3-8 4 16 3-8h4" />
          </svg>
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Project Aid</span>
      </Link>

      <nav aria-label="Primary" className="shrink-0 space-y-0.5 px-2.5 py-3">
        {PRIMARY_NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
          const n = item.count ? counts[item.count] : 0;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(linkBase, "h-8", active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg")}
            >
              <Icon size={16} aria-hidden className="shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {n > 0 ? (
                <span
                  aria-label={`${n} ${item.label.toLowerCase()}`}
                  className={cn(
                    "min-w-5 rounded-full px-1.5 py-px text-center text-[11px] font-semibold tabular-nums",
                    item.count === "incidents" ? "bg-danger text-danger-fg" : "bg-accent text-accent-fg",
                  )}
                >
                  {n > 99 ? "99+" : n}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mx-4 h-px shrink-0 bg-line" />

      <nav aria-label="Projects" className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
        <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">Projects</p>
        {projects.length === 0 ? <p className="px-2.5 text-[13px] text-muted">No projects yet.</p> : null}
        <ul className="space-y-0.5">
          {projects.map((p) => {
            const base = `/projects/${p.id}`;
            const active = pathname === base || pathname.startsWith(base + "/");
            return (
              <li key={p.id}>
                <Link
                  href={base}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  title={`${p.name} (${p.key})`}
                  className={cn(linkBase, "h-8", active ? "bg-accent-soft text-accent" : "text-fg/90 hover:bg-surface-2")}
                >
                  <HealthDot health={p.health} className="ring-0" />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="font-mono text-[10.5px] text-subtle">{p.key}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
