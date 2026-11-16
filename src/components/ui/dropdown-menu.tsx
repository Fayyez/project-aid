"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

export interface DropdownMenuProps {
  /** Accessible name of the trigger button. */
  label: string;
  /** Trigger content (text, avatar, icon). */
  trigger: ReactNode;
  /** Show a chevron next to the trigger content. */
  chevron?: boolean;
  align?: "start" | "end";
  /** DropdownMenuItem / DropdownMenuLabel / DropdownMenuSeparator children (or any node, e.g. a sign-out form). */
  children: ReactNode;
  triggerClassName?: string;
  menuClassName?: string;
}

/**
 * Simple menu. The panel stays mounted (hidden) while closed so forms inside keep working.
 * `<DropdownMenu label="Actions" trigger="Actions" chevron><DropdownMenuItem href="/x">Open</DropdownMenuItem></DropdownMenu>`
 */
export function DropdownMenu({ label, trigger, chevron, align = "end", children, triggerClassName, menuClassName }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, [open]);

  function items() {
    return Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const list = items();
      const idx = list.indexOf(document.activeElement as HTMLElement);
      const next = e.key === "ArrowDown" ? (idx + 1) % list.length : (idx - 1 + list.length) % list.length;
      list[next]?.focus();
    }
    if (e.key === "Tab") setOpen(false);
  }

  return (
    <div ref={root} className="relative inline-block" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn("inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-fg transition-colors hover:bg-surface-2", triggerClassName)}
      >
        {trigger}
        {chevron ? <ChevronDown size={14} className="text-muted" aria-hidden /> : null}
      </button>
      <div
        ref={panel}
        id={id}
        role="menu"
        aria-label={label}
        hidden={!open}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[role="menuitem"]')) setOpen(false);
        }}
        className={cn(
          "absolute z-50 mt-1.5 min-w-52 rounded-lg border border-line bg-surface p-1 shadow-pop",
          align === "end" ? "right-0" : "left-0",
          menuClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

const itemClass =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-fg transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:text-muted";

export interface DropdownMenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "role"> {
  /** Renders a next/link instead of a button. */
  href?: string;
  icon?: ReactNode;
  danger?: boolean;
  /** Called when the item is chosen (client components only). */
  onSelect?: () => void;
}

export function DropdownMenuItem({ href, icon, danger, onSelect, className, children, onClick, type = "button", ...rest }: DropdownMenuItemProps) {
  const cls = cn(itemClass, danger && "text-danger [&>svg]:text-danger", className);
  if (href) {
    return (
      <Link href={href} role="menuitem" className={cls}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button
      type={type}
      role="menuitem"
      className={cls}
      onClick={(e) => {
        onClick?.(e);
        onSelect?.();
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function DropdownMenuLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-2.5 py-1.5 text-xs text-muted", className)}>{children}</div>;
}

export function DropdownMenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-line" />;
}
