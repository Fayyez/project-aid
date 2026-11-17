"use client";

import { SendHorizontal } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button, Kbd } from "@/components/ui";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  projectScoped: boolean;
}

export function Composer({ value, onChange, onSubmit, disabled, projectScoped }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  return (
    <form
      className="border-t border-line bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && value.trim()) onSubmit();
      }}
    >
      <div className="flex items-end gap-2">
        <label htmlFor="chat-input" className="sr-only">
          Ask Project Aid
        </label>
        <textarea
          id="chat-input"
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!disabled && value.trim()) onSubmit();
            }
          }}
          placeholder={projectScoped ? "Ask about this project..." : "Ask about any of your projects..."}
          className="max-h-[200px] min-h-10 w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2 text-sm leading-relaxed placeholder:text-subtle hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60"
        />
        <Button type="submit" variant="primary" disabled={disabled || !value.trim()} icon={<SendHorizontal size={15} />} className="h-10">
          <span className="hidden sm:inline">Send</span>
          <span className="sr-only sm:hidden">Send</span>
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        <Kbd>Enter</Kbd> to send, <Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> for a new line. Tip: paste a client message and ask to &ldquo;turn this into tickets&rdquo;.
      </p>
    </form>
  );
}
