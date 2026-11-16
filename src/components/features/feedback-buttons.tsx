"use client";

import { Check, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { feedbackAction } from "@/app/actions";
import { Button, Textarea, cn, toast } from "@/components/ui";
import type { FeedbackButtonsProps } from "./contracts";

/** Thumbs up / down. A thumbs down asks "What was wrong?" before it is sent. */
export function FeedbackButtons({ target, projectId, runId, initial, size = "sm" }: FeedbackButtonsProps) {
  const [rating, setRating] = useState<"up" | "down" | undefined>(initial);
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [thanks, setThanks] = useState(false);

  async function submit(next: "up" | "down", text?: string) {
    setPending(true);
    const result = await feedbackAction({ target, rating: next, comment: text?.trim() || undefined, projectId, runId });
    setPending(false);
    if (!result.ok) {
      toast({ tone: "danger", title: result.error });
      return;
    }
    setRating(next);
    setAsking(false);
    setThanks(true);
  }

  const dim = size === "sm" ? "size-7" : "size-9";
  const icon = size === "sm" ? 14 : 16;
  const base = cn("inline-flex items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50", dim);

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1" role="group" aria-label="Rate this answer">
        <button
          type="button"
          className={cn(base, rating === "up" && "bg-success-soft text-success hover:bg-success-soft hover:text-success")}
          aria-label="Helpful"
          aria-pressed={rating === "up"}
          disabled={pending}
          onClick={() => void submit("up")}
        >
          <ThumbsUp size={icon} />
        </button>
        <button
          type="button"
          className={cn(base, rating === "down" && "bg-danger-soft text-danger hover:bg-danger-soft hover:text-danger")}
          aria-label="Not helpful"
          aria-pressed={rating === "down"}
          aria-expanded={asking}
          disabled={pending}
          onClick={() => setAsking((v) => !v)}
        >
          <ThumbsDown size={icon} />
        </button>
        <span role="status" aria-live="polite" className="ml-1 inline-flex items-center gap-1 text-xs text-muted">
          {thanks ? (
            <>
              <Check size={12} aria-hidden /> Thanks for the feedback
            </>
          ) : null}
        </span>
      </div>
      {asking ? (
        <form
          className="mt-2 w-full max-w-sm space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit("down", comment);
          }}
        >
          <label className="block text-xs font-medium text-muted" htmlFor={`fb-${target.id}`}>
            What was wrong?
          </label>
          <Textarea id={`fb-${target.id}`} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Missing facts, wrong project, unclear..." className="text-[13px]" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" loading={pending}>
              Send feedback
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
