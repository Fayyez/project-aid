"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { escalateAction, suggestOwnersAction } from "@/app/actions";
import { CircleCheck } from "lucide-react";
import { Button, Dialog, Field, LinkButton, Spinner, Textarea, cn, toast } from "@/components/ui";
import type { EscalateDialogProps } from "./contracts";

interface Owner {
  personId: string;
  name: string;
  reason: string;
}

/** Ask a team member a question. Suggests who to ask based on recent work. */
export function EscalateDialog({ projectId, open, onClose, defaultQuestion, onSent }: EscalateDialogProps) {
  const [question, setQuestion] = useState(defaultQuestion ?? "");
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [sentId, setSentId] = useState<string | undefined>();
  const touched = useRef(false);
  const seq = useRef(0);

  // Re-seed the question each time the dialog opens.
  useEffect(() => {
    if (open) {
      setQuestion(defaultQuestion ?? "");
      setChosen(undefined);
      setError(undefined);
      setSentId(undefined);
      touched.current = false;
    }
  }, [open, defaultQuestion]);

  // Debounced owner suggestions.
  useEffect(() => {
    if (!open) return;
    const text = question.trim();
    if (text.length < 8) {
      setOwners([]);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      const result = await suggestOwnersAction(projectId, text);
      if (mine !== seq.current) return;
      setLoading(false);
      if (result.ok) {
        setOwners(result.data);
        if (!touched.current) setChosen(result.data[0]?.personId);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [open, question, projectId]);

  async function send() {
    setSending(true);
    setError(undefined);
    const result = await escalateAction(projectId, { question: question.trim(), assigneeId: chosen });
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      toast({ tone: "danger", title: result.error });
      return;
    }
    toast({ tone: "success", title: "Question sent", description: "You will see the answer in your inbox." });
    setSentId(result.data.threadId);
    onSent?.(result.data.threadId);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Ask the team"
      description="We send this question to the best person and notify you when they answer."
      footer={
        sentId ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <LinkButton href={`/inbox/${sentId}`} variant="primary">
              Open conversation
            </LinkButton>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={sending} disabled={question.trim().length < 3} onClick={() => void send()}>
              Send question
            </Button>
          </>
        )
      }
    >
      {sentId ? (
        <div role="status" className="flex items-start gap-3 text-sm">
          <CircleCheck size={18} aria-hidden className="mt-0.5 shrink-0 text-success" />
          <p>
            Question sent. The answer will appear in your <Link href={`/inbox/${sentId}`} className="text-accent underline-offset-2 hover:underline">inbox</Link>.
          </p>
        </div>
      ) : (
      <div className="space-y-4">
        <Field label="Your question" required error={error}>
          <Textarea rows={4} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Will the 3-D Secure work make the release?" />
        </Field>
        <fieldset className="min-w-0">
          <legend className="mb-1.5 flex items-center gap-2 text-sm font-medium text-fg">
            Who should answer?
            {loading ? <Spinner size={12} label="Finding the right person" /> : null}
          </legend>
          {owners.length === 0 ? (
            <p className="text-[13px] text-muted">{question.trim().length < 8 ? "Write your question to see who is best placed to answer." : loading ? "Looking for the best person..." : "No specific owner found. We will pick the project lead."}</p>
          ) : (
            <ul className="space-y-2">
              {owners.map((o) => {
                const id = `owner-${o.personId}`;
                const selected = chosen === o.personId;
                return (
                  <li key={o.personId}>
                    <label htmlFor={id} className={cn("flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors", selected ? "border-accent-line bg-accent-soft" : "border-line hover:border-line-strong")}>
                      <input
                        id={id}
                        type="radio"
                        name="owner"
                        className="mt-1 accent-accent"
                        checked={selected}
                        onChange={() => {
                          touched.current = true;
                          setChosen(o.personId);
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">{o.name}</span>
                        <span className="block text-[13px] text-muted">{o.reason}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      </div>
      )}
    </Dialog>
  );
}
