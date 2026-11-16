"use client";

import { Lock, Pencil, Pin, PinOff, Sparkles, StickyNote, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteNoteAction, saveNoteAction } from "@/app/actions";
import { useAction } from "@/components/features/settings/use-action";
import { Badge, Button, Callout, Card, CardBody, CardHeader, Dialog, EmptyState, Field, Input, RelativeTime, Switch, Textarea } from "@/components/ui";

export interface NoteItem {
  id: string;
  title?: string;
  body: string;
  pinned: boolean;
  shareWithAssistant: boolean;
  updatedAt: string;
}

interface Draft {
  title: string;
  body: string;
  pinned: boolean;
  share: boolean;
}

const EMPTY: Draft = { title: "", body: "", pinned: false, share: true };

function NoteForm({ draft, onChange, idPrefix, disabled }: { draft: Draft; onChange: (draft: Draft) => void; idPrefix: string; disabled: boolean }) {
  return (
    <div className="space-y-3">
      <Field label="Title (optional)">
        <Input id={`${idPrefix}-title`} value={draft.title} maxLength={120} disabled={disabled} onChange={(event) => onChange({ ...draft, title: event.target.value })} placeholder="For example: Client call, 12 May" />
      </Field>
      <Field label="Note" required>
        <Textarea id={`${idPrefix}-body`} rows={5} value={draft.body} maxLength={8000} disabled={disabled} onChange={(event) => onChange({ ...draft, body: event.target.value })} placeholder="What do you want to remember about this project?" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Switch label="Pin" description="Pinned notes stay at the top of the list." checked={draft.pinned} disabled={disabled} onChange={(event) => onChange({ ...draft, pinned: event.target.checked })} />
        <Switch
          label="Let the assistant use this note"
          description="Shared notes are used only when you ask the assistant a question. No one else sees them. Turn off to keep the note to yourself."
          checked={draft.share}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, share: event.target.checked })}
        />
      </div>
    </div>
  );
}

function NoteCard({ projectId, note }: { projectId: string; note: NoteItem }) {
  const { run, pending } = useAction();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState<Draft>({ title: note.title ?? "", body: note.body, pinned: note.pinned, share: note.shareWithAssistant });

  async function save() {
    const result = await run(() => saveNoteAction(projectId, { id: note.id, title: draft.title, body: draft.body, pinned: draft.pinned, shareWithAssistant: draft.share }), { success: "Note saved" });
    if (result.ok) setEditing(false);
  }
  async function togglePin() {
    await run(() => saveNoteAction(projectId, { id: note.id, title: note.title, body: note.body, pinned: !note.pinned, shareWithAssistant: note.shareWithAssistant }), { success: note.pinned ? "Note unpinned" : "Note pinned" });
  }
  async function remove() {
    const result = await run(() => deleteNoteAction(projectId, note.id), { success: "Note deleted" });
    if (result.ok) setConfirming(false);
  }

  return (
    <Card as="article">
      <CardBody className="space-y-3">
        {editing ? (
          <>
            <NoteForm draft={draft} onChange={setDraft} idPrefix={`edit-${note.id}`} disabled={pending} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" loading={pending} disabled={!draft.body.trim()} onClick={save}>
                Save changes
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words text-sm font-semibold">{note.title || "Untitled note"}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {note.pinned ? (
                    <Badge tone="accent" icon={<Pin size={11} />}>
                      Pinned
                    </Badge>
                  ) : null}
                  {note.shareWithAssistant ? (
                    <Badge tone="info" icon={<Sparkles size={11} />}>
                      Assistant can use
                    </Badge>
                  ) : (
                    <Badge tone="neutral" icon={<Lock size={11} />}>
                      Only you
                    </Badge>
                  )}
                  <span>
                    Updated <RelativeTime iso={note.updatedAt} />
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" icon={note.pinned ? <PinOff size={14} /> : <Pin size={14} />} onClick={togglePin} disabled={pending} aria-label={note.pinned ? `Unpin ${note.title || "note"}` : `Pin ${note.title || "note"}`}>
                  {note.pinned ? "Unpin" : "Pin"}
                </Button>
                <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => setEditing(true)} aria-label={`Edit ${note.title || "note"}`}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => setConfirming(true)} aria-label={`Delete ${note.title || "note"}`}>
                  Delete
                </Button>
              </div>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm text-fg/90">{note.body}</p>
          </>
        )}
      </CardBody>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this note?"
        description="This cannot be undone. The assistant will no longer be able to use it."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              Keep note
            </Button>
            <Button variant="danger" loading={pending} onClick={remove}>
              Delete note
            </Button>
          </>
        }
      />
    </Card>
  );
}

export function NotesManager({ projectId, notes }: { projectId: string; notes: NoteItem[] }) {
  const { run, pending } = useAction();
  const [draft, setDraft] = useState<Draft>(EMPTY);

  async function add() {
    const result = await run(() => saveNoteAction(projectId, { title: draft.title, body: draft.body, pinned: draft.pinned, shareWithAssistant: draft.share }), { success: "Note added" });
    if (result.ok) setDraft(EMPTY);
  }

  return (
    <div className="space-y-6">
      <Callout tone="info" title="Your notes are private">
        <span className="flex items-start gap-1.5">
          <Lock size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>Only you can see the notes you write, not other directors or administrators. They are never part of reports or shared with the team.</span>
        </span>
      </Callout>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card as="section" aria-labelledby="composer-heading" className="self-start">
          <CardHeader title={<span id="composer-heading">New note</span>} />
          <CardBody className="space-y-4">
            <NoteForm draft={draft} onChange={setDraft} idPrefix="new-note" disabled={pending} />
            <Button variant="primary" loading={pending} disabled={!draft.body.trim()} onClick={add}>
              Add note
            </Button>
          </CardBody>
        </Card>

        <section aria-labelledby="notes-heading" className="min-w-0 space-y-3">
          <h2 id="notes-heading" className="text-sm font-semibold">
            Your notes <span className="font-normal text-muted">({notes.length})</span>
          </h2>
          {notes.length === 0 ? (
            <EmptyState icon={<StickyNote size={20} />} title="No notes yet" description="Jot down client context, decisions and things to follow up. Pinned notes stay on top." />
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <NoteCard key={note.id} projectId={projectId} note={note} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
