"use client";

import { Flag, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { removeMilestoneAction, upsertMilestoneAction } from "@/app/actions";
import { Badge, Button, Card, CardBody, CardHeader, Dialog, EmptyState, Field, Input, Select, Table, TBody, Td, Th, THead, Tr, type Tone } from "@/components/ui";
import { formatDate, isoDate } from "@/lib/format";
import type { Milestone } from "@/lib/types";
import { useAction } from "./use-action";

const STATUS: Record<Milestone["status"], { label: string; tone: Tone }> = {
  planned: { label: "Planned", tone: "neutral" },
  in_progress: { label: "In progress", tone: "info" },
  at_risk: { label: "At risk", tone: "warning" },
  done: { label: "Done", tone: "success" },
};

interface Draft {
  id?: string;
  name: string;
  description: string;
  dueDate: string;
  status: Milestone["status"];
}

export function MilestonesManager({ projectId, milestones }: { projectId: string; milestones: Milestone[] }) {
  const { run, pending } = useAction();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<Milestone | null>(null);

  async function save() {
    if (!draft) return;
    const result = await run(() => upsertMilestoneAction(projectId, { id: draft.id, name: draft.name, description: draft.description || undefined, dueDate: draft.dueDate, status: draft.status }), { success: draft.id ? "Milestone updated" : "Milestone added" });
    if (result.ok) setDraft(null);
  }
  async function remove() {
    if (!removing) return;
    const result = await run(() => removeMilestoneAction(projectId, removing.id), { success: "Milestone removed" });
    if (result.ok) setRemoving(null);
  }

  return (
    <Card as="section" aria-labelledby="milestones-heading">
      <CardHeader
        title={<span id="milestones-heading">Milestones</span>}
        description="Key dates for the client. They appear in progress reports."
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setDraft({ name: "", description: "", dueDate: "", status: "planned" })}>
            Add milestone
          </Button>
        }
      />
      <CardBody>
        {milestones.length === 0 ? (
          <EmptyState icon={<Flag size={20} />} title="No milestones yet" description="Add the dates you have promised the client, such as a beta or launch." />
        ) : (
          <Table>
            <THead>
              <Tr hover={false}>
                <Th>Milestone</Th>
                <Th>Due</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {milestones.map((milestone) => (
                <Tr key={milestone.id}>
                  <Td className="min-w-48">
                    <p className="font-medium">{milestone.name}</p>
                    {milestone.description ? <p className="max-w-md text-xs text-muted">{milestone.description}</p> : null}
                  </Td>
                  <Td className="whitespace-nowrap">{formatDate(milestone.dueDate)}</Td>
                  <Td>
                    <Badge tone={STATUS[milestone.status].tone} dot>
                      {STATUS[milestone.status].label}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" icon={<Pencil size={13} />} aria-label={`Edit ${milestone.name}`} onClick={() => setDraft({ id: milestone.id, name: milestone.name, description: milestone.description ?? "", dueDate: isoDate(milestone.dueDate), status: milestone.status })}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} aria-label={`Remove ${milestone.name}`} onClick={() => setRemoving(milestone)}>
                        Remove
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>

      <Dialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit milestone" : "Add a milestone"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" loading={pending} disabled={!draft?.name.trim() || !draft.dueDate} onClick={save}>
              {draft?.id ? "Save milestone" : "Add milestone"}
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <Field label="Name" required>
              <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={80} placeholder="Public beta" />
            </Field>
            <Field label="Description">
              <Input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={300} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Due date" required>
                <Input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} />
              </Field>
              <Field label="Status">
                <Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Milestone["status"] })}>
                  {Object.entries(STATUS).map(([value, item]) => (
                    <option key={value} value={value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        size="sm"
        title="Remove this milestone?"
        description={removing ? `"${removing.name}" will be deleted.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" loading={pending} onClick={remove}>
              Remove milestone
            </Button>
          </>
        }
      />
    </Card>
  );
}
