"use client";

import { CircleAlert, Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, Callout, Checkbox, Dialog, Field, Input, Select, Textarea, toast } from "@/components/ui";
import { createTicketsAction, draftTicketsAction } from "@/app/actions";
import type { Priority, TicketType } from "@/lib/types";
import type { TicketDraft } from "@/lib/workflows/tickets";
import type { TicketDraftDialogProps } from "./contracts";

export interface TicketDraftDialogWithTeamProps extends TicketDraftDialogProps {
  /** Team members the director can assign drafts to. */
  team?: { id: string; name: string }[];
}

interface EditableDraft {
  key: number;
  include: boolean;
  title: string;
  description: string;
  criteria: string;
  type: TicketType;
  priority: Priority;
  assigneeId: string;
  assigneeReason?: string;
  duplicateOfKey?: string;
  rationale: string;
  labels: string[];
  estimate?: number;
}

const TYPES: { value: TicketType; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature" },
  { value: "task", label: "Task" },
  { value: "chore", label: "Chore" },
  { value: "question", label: "Question" },
];
const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "P0", label: "P0 - Drop everything" },
  { value: "P1", label: "P1 - High" },
  { value: "P2", label: "P2 - Normal" },
  { value: "P3", label: "P3 - Low" },
];

function toEditable(draft: TicketDraft, index: number): EditableDraft {
  return {
    key: index,
    include: !draft.duplicateOfKey,
    title: draft.title,
    description: draft.description,
    criteria: draft.acceptanceCriteria.join("\n"),
    type: draft.type,
    priority: draft.priority,
    assigneeId: draft.suggestedAssigneeId ?? "",
    assigneeReason: draft.assigneeReason,
    duplicateOfKey: draft.duplicateOfKey,
    rationale: draft.rationale,
    labels: draft.labels,
    estimate: draft.estimate,
  };
}

function toDraft(d: EditableDraft): TicketDraft {
  return {
    title: d.title.trim(),
    description: d.description.trim(),
    acceptanceCriteria: d.criteria.split("\n").map((line) => line.trim()).filter(Boolean),
    type: d.type,
    priority: d.priority,
    labels: d.labels,
    suggestedAssigneeId: d.assigneeId || undefined,
    assigneeReason: d.assigneeReason,
    duplicateOfKey: d.duplicateOfKey,
    rationale: d.rationale,
    estimate: d.estimate,
  };
}

/** Turns a pasted message into ticket drafts the director can edit, then creates the ones they keep. */
export function TicketDraftDialog(props: TicketDraftDialogWithTeamProps) {
  // Every time the dialog is opened it starts a fresh session: no stale text or drafts.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) setSession((n) => n + 1);
  }
  return <DraftSession key={session} {...props} />;
}

function DraftSession({ projectId, open, onClose, initialText, autoDraft, onCreated, team = [] }: TicketDraftDialogWithTeamProps) {
  const auto = Boolean(autoDraft && initialText?.trim());
  const [text, setText] = useState(initialText ?? "");
  const [drafts, setDrafts] = useState<EditableDraft[] | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [drafting, setDrafting] = useState(auto);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((result: Awaited<ReturnType<typeof draftTicketsAction>> | null) => {
    if (!result) setError("The drafts could not be prepared. Please try again.");
    else if (!result.ok) setError(result.error);
    else {
      setDrafts(result.data.drafts.map(toEditable));
      setQuestions(result.data.questions);
    }
    setDrafting(false);
  }, []);

  useEffect(() => {
    if (!auto || !initialText) return;
    draftTicketsAction(projectId, initialText).then(apply, () => apply(null));
    // Runs once per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startDrafting() {
    if (!text.trim()) {
      setError("Paste the message you want to turn into tickets.");
      return;
    }
    setError(null);
    setDrafting(true);
    draftTicketsAction(projectId, text).then(apply, () => apply(null));
  }

  const selected = drafts?.filter((d) => d.include) ?? [];
  const invalid = selected.some((d) => !d.title.trim());

  function patch(key: number, change: Partial<EditableDraft>) {
    setDrafts((current) => current?.map((d) => (d.key === key ? { ...d, ...change } : d)) ?? null);
  }

  async function create() {
    if (selected.length === 0 || invalid) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createTicketsAction(projectId, selected.map(toDraft), text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const keys = result.data.keys;
      toast({ tone: "success", title: `${keys.length} ticket${keys.length === 1 ? "" : "s"} created`, description: keys.join(", ") });
      onCreated?.(keys);
      onClose();
    } catch {
      setError("The tickets could not be created. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  const footer = drafts ? (
    <>
      <Button variant="ghost" onClick={() => setDrafts(null)} disabled={creating}>
        Back to the message
      </Button>
      <Button variant="primary" loading={creating} disabled={selected.length === 0 || invalid} onClick={create}>
        {selected.length === 0 ? "Select a ticket to create" : `Create ${selected.length} ticket${selected.length === 1 ? "" : "s"}`}
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button variant="primary" loading={drafting} disabled={!text.trim()} onClick={startDrafting}>
        {drafting ? "Drafting…" : "Draft tickets"}
      </Button>
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Turn a message into tickets"
      description={drafts ? "Review the drafts, edit anything, and untick the ones you do not want." : "Paste an email, chat message or meeting note. Secrets are removed before anything is analysed."}
      footer={footer}
    >
      {drafts === null ? (
        <div className="space-y-3">
          <Field label="Message" hint="Up to about 8,000 characters. Nothing is created until you confirm the drafts.">
            <Textarea rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the client message here" disabled={drafting} />
          </Field>
          {drafting ? (
            <p role="status" className="text-[13px] text-muted">
              Reading the message, splitting it into separate asks and checking them against your open tickets. This can take up to a minute.
            </p>
          ) : null}
          {error ? <Callout tone="danger">{error}</Callout> : null}
        </div>
      ) : (
        <div className="space-y-4">
          {questions.length > 0 ? (
            <Callout tone="info" title="Worth asking the sender before you start">
              <ul className="list-disc space-y-0.5 pl-4">
                {questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </Callout>
          ) : null}
          {drafts.length === 0 ? (
            <Callout tone="warning" title="No tickets found in this message">
              Try pasting more of the conversation, or go back and edit the text.
            </Callout>
          ) : null}
          <ol className="space-y-4">
            {drafts.map((d, i) => (
              <li key={d.key} className={`rounded-lg border p-4 ${d.include ? "border-line-strong bg-surface" : "border-line bg-surface-2/60"}`}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <Checkbox checked={d.include} onChange={(e) => patch(d.key, { include: e.target.checked })} label={<span className="font-medium">Ticket {i + 1}: create this one</span>} />
                </div>
                {d.duplicateOfKey ? (
                  <Callout tone="warning" className="mb-3" title={`Looks like a duplicate of ${d.duplicateOfKey}`}>
                    <span className="inline-flex items-center gap-1">
                      <Copy size={12} aria-hidden /> It is unticked so you do not create it twice. Tick it if it is a different request.
                    </span>
                  </Callout>
                ) : null}
                <div className="space-y-3">
                  <Field label="Title" required error={d.include && !d.title.trim() ? "Add a title" : undefined}>
                    <Input value={d.title} onChange={(e) => patch(d.key, { title: e.target.value })} maxLength={200} />
                  </Field>
                  <Field label="Description">
                    <Textarea rows={3} value={d.description} onChange={(e) => patch(d.key, { description: e.target.value })} />
                  </Field>
                  <Field label="Acceptance criteria" hint="One per line.">
                    <Textarea rows={3} value={d.criteria} onChange={(e) => patch(d.key, { criteria: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field label="Type">
                      <Select value={d.type} onChange={(e) => patch(d.key, { type: e.target.value as TicketType })}>
                        {TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Priority">
                      <Select value={d.priority} onChange={(e) => patch(d.key, { priority: e.target.value as Priority })}>
                        {PRIORITIES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Assignee">
                      <Select value={d.assigneeId} onChange={(e) => patch(d.key, { assigneeId: e.target.value })}>
                        <option value="">Unassigned</option>
                        {team.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                        {d.assigneeId && !team.some((m) => m.id === d.assigneeId) ? <option value={d.assigneeId}>Suggested person</option> : null}
                      </Select>
                    </Field>
                  </div>
                  {d.assigneeReason ? <p className="text-xs text-muted">Why this person: {d.assigneeReason}</p> : null}
                  {d.rationale ? (
                    <p className="flex items-start gap-1.5 text-xs text-muted">
                      <CircleAlert size={12} aria-hidden className="mt-0.5 shrink-0" />
                      <span>From the message: {d.rationale}</span>
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {error ? <Callout tone="danger">{error}</Callout> : null}
        </div>
      )}
    </Dialog>
  );
}
