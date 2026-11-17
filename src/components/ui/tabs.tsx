"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { cn } from "./cn";

export interface TabItem {
  label: ReactNode;
  /** Path mode: the link target. Param mode: ignored (built from `value`). */
  href?: string;
  /** Param mode: the value stored in the search param. */
  value?: string;
  /** Path mode: only active on an exact pathname match (use for "Overview" tabs). */
  exact?: boolean;
  icon?: ReactNode;
  /** Small count shown after the label. */
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  /**
   * When set, tabs are driven by this search param (`?range=7d`) instead of the pathname.
   * Other search params are preserved.
   */
  param?: string;
  /** Param mode: the value considered active when the param is absent. Defaults to the first item. */
  defaultValue?: string;
  /** Accessible name of the tab list. */
  label?: string;
  className?: string;
}

const listClass = "relative flex min-w-0 gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function TabLink({ active, href, item }: { active: boolean; href: string; item: TabItem }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors",
        active ? "border-accent text-fg" : "border-transparent text-muted hover:border-line-strong hover:text-fg",
      )}
    >
      {item.icon}
      {item.label}
      {item.count != null ? (
        <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted")}>{item.count}</span>
      ) : null}
    </Link>
  );
}

function PathTabs({ items, label, className }: TabsProps) {
  const pathname = usePathname();
  return (
    <nav aria-label={label ?? "Sections"} className={cn(listClass, className)}>
      {items.map((item, i) => {
        const href = item.href ?? "#";
        const active = item.exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
        return <TabLink key={href + i} item={item} href={href} active={active} />;
      })}
    </nav>
  );
}

function ParamTabsInner({ items, param = "tab", defaultValue, label, className }: TabsProps) {
  const pathname = usePathname();
  const search = useSearchParams();
  const current = search.get(param) ?? defaultValue ?? items[0]?.value;
  return (
    <nav aria-label={label ?? "Sections"} className={cn(listClass, className)}>
      {items.map((item, i) => {
        const next = new URLSearchParams(search.toString());
        if (item.value) next.set(param, item.value);
        const href = `${pathname}?${next.toString()}`;
        return <TabLink key={(item.value ?? "") + i} item={item} href={href} active={item.value === current} />;
      })}
    </nav>
  );
}

/**
 * Link-based tabs. Safe to render from server components.
 * Path mode: `<Tabs items={[{ label: "Overview", href: "/projects/a", exact: true }, ...]} />`
 * Param mode: `<Tabs param="range" items={[{ label: "7d", value: "7d" }, { label: "30d", value: "30d" }]} />`
 */
export function Tabs(props: TabsProps) {
  if (props.param) {
    return (
      <Suspense fallback={<div className={cn(listClass, "h-10", props.className)} />}>
        <ParamTabsInner {...props} />
      </Suspense>
    );
  }
  return <PathTabs {...props} />;
}
