"use client";

import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { submitPublicReplyAction } from "@/app/actions";
import { Button, Field, Textarea } from "@/components/ui";

export function ReplyForm({ threadId, token }: { threadId: string; token: string }) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-lg border border-success-line bg-success-soft p-4">
        <CircleCheck size={20} aria-hidden className="mt-0.5 shrink-0 text-success" />
        <div>
          <p className="font-semibold">Thank you, your answer was sent.</p>
          <p className="mt-0.5 text-[13px] text-muted">The project director has been notified. You can close this page.</p>
        </div>
      </div>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSending(true);
        setError(undefined);
        const result = await submitPublicReplyAction(threadId, token, body.trim());
        setSending(false);
        if (!result.ok) setError(result.error);
        else setSent(true);
      }}
    >
      <Field label="Your answer" required error={error} hint="A few sentences are plenty.">
        <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your answer here..." />
      </Field>
      <Button type="submit" variant="primary" loading={sending} disabled={!body.trim()}>
        Send answer
      </Button>
    </form>
  );
}
