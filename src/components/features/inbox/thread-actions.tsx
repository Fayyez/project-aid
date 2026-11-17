"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { closeThreadAction, markThreadReadAction, replyThreadAction } from "@/app/actions";
import { Button, Field, Textarea, toast } from "@/components/ui";

/** Marks the thread as read once it has been viewed. Renders nothing. */
export function MarkRead({ threadId, unread }: { threadId: string; unread: boolean }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (!unread || done.current) return;
    done.current = true;
    void markThreadReadAction(threadId).then((r) => {
      if (r.ok) router.refresh();
    });
  }, [threadId, unread, router]);
  return null;
}

export function ReplyBox({ threadId, closed, assigneeName }: { threadId: string; closed: boolean; assigneeName: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);

  async function send() {
    setSending(true);
    const result = await replyThreadAction(threadId, body.trim());
    setSending(false);
    if (!result.ok) {
      toast({ tone: "danger", title: result.error });
      return;
    }
    setBody("");
    toast({ tone: "success", title: "Reply sent" });
    router.refresh();
  }

  async function close() {
    setClosing(true);
    const result = await closeThreadAction(threadId);
    setClosing(false);
    if (!result.ok) {
      toast({ tone: "danger", title: result.error });
      return;
    }
    toast({ tone: "success", title: "Conversation closed" });
    router.refresh();
  }

  if (closed) return <p className="text-[13px] text-muted">This conversation is closed.</p>;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) void send();
      }}
    >
      <Field label="Reply" hint={`${assigneeName} gets your reply through the same channels as the original question.`}>
        <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply..." />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={sending} disabled={!body.trim()}>
          Send reply
        </Button>
        <Button variant="secondary" loading={closing} onClick={() => void close()}>
          Close conversation
        </Button>
      </div>
    </form>
  );
}
