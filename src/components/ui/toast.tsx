"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "./cn";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. 0 keeps it until dismissed. Default 4500. */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const EMPTY: ToastItem[] = [];

function emit() {
  listeners.forEach((l) => l());
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/** Show a toast from anywhere on the client (event handlers, effects). Returns its id. */
export function toast(input: ToastInput | string): number {
  const t: ToastItem = { id: nextId++, ...(typeof input === "string" ? { title: input } : input) };
  items = [...items, t].slice(-4);
  emit();
  const duration = t.duration ?? 4500;
  if (duration > 0) setTimeout(() => dismissToast(t.id), duration);
  return t.id;
}

/** `const { toast } = useToast(); toast({ title: "Saved", tone: "success" })` */
export function useToast() {
  return { toast, dismiss: dismissToast };
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const icons = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };
const toneIcon = { info: "text-info", success: "text-success", warning: "text-warning", danger: "text-danger" };

/** Mount once (the root layout already does). */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  return (
    <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end">
      {list.map((t) => {
        const tone = t.tone ?? "info";
        const Icon = icons[tone];
        return (
          <div
            key={t.id}
            role={tone === "danger" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-line bg-surface p-3 shadow-pop [animation:aid-toast-in_180ms_ease-out]"
          >
            <Icon size={16} className={cn("mt-0.5 shrink-0", toneIcon[tone])} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-fg">{t.title}</p>
              {t.description ? <p className="mt-0.5 text-xs text-muted">{t.description}</p> : null}
            </div>
            <button type="button" aria-label="Dismiss notification" onClick={() => dismissToast(t.id)} className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-fg">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
