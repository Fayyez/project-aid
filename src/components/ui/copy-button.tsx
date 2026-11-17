"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

export interface CopyButtonProps {
  value: string;
  /** Accessible label. Defaults to "Copy". */
  label?: string;
  /** Optional visible text next to the icon. */
  children?: ReactNode;
  className?: string;
}

/** Copies `value` to the clipboard and flashes a check: `<CopyButton value={sha} label="Copy commit sha" />` */
export function CopyButton({ value, label = "Copy", children, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      ta.remove();
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className={cn("inline-flex h-6 items-center gap-1 rounded px-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg", copied && "text-success hover:text-success", className)}
    >
      {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      {children}
    </button>
  );
}
