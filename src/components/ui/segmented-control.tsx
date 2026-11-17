"use client";

import { useState, type ReactNode } from "react";
import { cn } from "./cn";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentedOption<T>[];
  /** Controlled value. */
  value?: T;
  /** Uncontrolled initial value. */
  defaultValue?: T;
  onChange?: (value: T) => void;
  size?: "sm" | "md";
  /** Required accessible name. */
  label: string;
  className?: string;
}

/** Client-side segmented switch: `<SegmentedControl label="Range" options={[...]} defaultValue="7d" onChange={...} />` */
export function SegmentedControl<T extends string = string>({ options, value, defaultValue, onChange, size = "md", label, className }: SegmentedControlProps<T>) {
  const [internal, setInternal] = useState<T | undefined>(defaultValue ?? options[0]?.value);
  const current = value ?? internal;

  function select(v: T) {
    if (value === undefined) setInternal(v);
    onChange?.(v);
  }

  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const idx = options.findIndex((o) => o.value === current);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % options.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + options.length) % options.length;
    if (next >= 0) {
      e.preventDefault();
      select(options[next].value);
      const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>("button");
      buttons[next]?.focus();
    }
  }

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKey} className={cn("inline-flex rounded-md border border-line bg-surface-2 p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === current;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => select(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded font-medium transition-colors",
              size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-3 text-[13px]",
              active ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
