"use client";

import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { removeTeamMemberAction, setDirectorsAction, upsertPersonAction, upsertTeamMemberAction } from "@/app/actions";
import { Avatar, Badge, Button, Card, CardBody, CardHeader, Checkbox, Dialog, EmptyState, Field, Input, SegmentedControl, Select, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { useAction } from "./use-action";

export interface PersonItem {
  id: string;
  name: string;
  email: string;
  title?: string;
  role: "admin" | "pd" | "member";
}

export interface MemberItem extends PersonItem {
  projectRole: string;
  areas: string[];
  allocationPct?: number;
}

interface MemberDraft {
  personId: string;
  mode: "existing" | "new";
  projectRole: string;
  areas: string;
  allocation: string;
  isEdit: boolean;
  name: string;
  email: string;
  title: string;
  github: string;
  azureDevOps: string;
  teams: string;
}

const BLANK: MemberDraft = { personId: "", mode: "existing", projectRole: "", areas: "", allocation: "", isEdit: false, name: "", email: "", title: "", github: "", azureDevOps: "", teams: "" };

export function TeamManager({ projectId, members, people, pdIds }: { projectId: string; members: MemberItem[]; people: PersonItem[]; pdIds: string[] }) {
  const { run, pending } = useAction();
  const [draft, setDraft] = useState<MemberDraft | null>(null);
  const [removing, setRemoving] = useState<MemberItem | null>(null);
  const [directors, setDirectors] = useState<string[]>(pdIds);

  const memberIds = new Set(members.map((member) => member.id));
  const available = people.filter((person) => !memberIds.has(person.id));
  const eligible = people.filter((person) => person.role === "pd" || person.role === "admin");
  const directorsDirty = directors.length !== pdIds.length || directors.some((id) => !pdIds.includes(id));

  function startAdd() {
    setDraft({ ...BLANK, mode: available.length > 0 ? "existing" : "new", personId: available[0]?.id ?? "" });
  }
  function startEdit(member: MemberItem) {
    setDraft({ ...BLANK, isEdit: true, personId: member.id, projectRole: member.projectRole, areas: member.areas.join(", "), allocation: member.allocationPct ? String(member.allocationPct) : "" });
  }
  async function save() {
    if (!draft) return;
    let personId = draft.personId;
    if (draft.mode === "new" && !draft.isEdit) {
      const created = await run(() => upsertPersonAction({ name: draft.name, email: draft.email, title: draft.title || undefined, handles: { github: draft.github || undefined, azureDevOps: draft.azureDevOps || undefined, teams: draft.teams || undefined } }), { refresh: false });
      if (!created.ok) return;
      personId = created.data.id;
    }
    const allocation = Number(draft.allocation);
    const result = await run(
      () => upsertTeamMemberAction(projectId, { personId, projectRole: draft.projectRole, areas: draft.areas.split(",").map((area) => area.trim()).filter(Boolean), allocationPct: allocation > 0 ? allocation : undefined }),
      { success: draft.isEdit ? "Team member updated" : "Team member added" },
    );
    if (result.ok) setDraft(null);
  }
  async function remove() {
    if (!removing) return;
    const result = await run(() => removeTeamMemberAction(projectId, removing.id), { success: `${removing.name} removed from the project` });
    if (result.ok) setRemoving(null);
  }
  async function saveDirectors() {
    await run(() => setDirectorsAction(projectId, directors), { success: "Directors updated" });
  }

  const canSave = draft ? (draft.mode === "existing" || draft.isEdit ? Boolean(draft.personId) : Boolean(draft.name.trim() && draft.email.trim())) : false;

  return (
    <div className="space-y-6">
      <Card as="section" aria-labelledby="team-heading">
        <CardHeader
          title={<span id="team-heading">Team members</span>}
          description="Who works on this project. Areas help route questions to the right person."
          actions={
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={startAdd}>
              Add member
            </Button>
          }
        />
        <CardBody>
          {members.length === 0 ? (
            <EmptyState icon={<Users size={20} />} title="No team members yet" description="Add the people working on this project so activity is attributed and questions can be routed." action={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={startAdd}>Add member</Button>} />
          ) : (
            <Table>
              <THead>
                <Tr hover={false}>
                  <Th>Person</Th>
                  <Th>Project role</Th>
                  <Th>Areas</Th>
                  <Th numeric>Allocation</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </Tr>
              </THead>
              <TBody>
                {members.map((member) => (
                  <Tr key={member.id}>
                    <Td className="min-w-48">
                      <div className="flex items-center gap-2">
                        <Avatar name={member.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{member.name}</p>
                          <p className="truncate text-xs text-muted">{member.title ?? member.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>{member.projectRole}</Td>
                    <Td className="min-w-40">
                      {member.areas.length === 0 ? (
                        <span className="text-muted">None</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {member.areas.map((area) => (
                            <Badge key={area}>{area}</Badge>
                          ))}
                        </div>
                      )}
                    </Td>
                    <Td numeric>{member.allocationPct ? `${member.allocationPct}%` : "-"}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" icon={<Pencil size={13} />} aria-label={`Edit ${member.name}`} onClick={() => startEdit(member)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} aria-label={`Remove ${member.name}`} onClick={() => setRemoving(member)}>
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
      </Card>

      <Card as="section" aria-labelledby="directors-heading">
        <CardHeader title={<span id="directors-heading">Project directors</span>} description="Directors (and administrators) can see and change this project. At least one is required." />
        <CardBody className="space-y-4">
          <fieldset>
            <legend className="sr-only">Project directors</legend>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {eligible.map((person) => (
                <Checkbox
                  key={person.id}
                  label={person.name}
                  description={`${person.role === "admin" ? "Administrator" : "Project director"} · ${person.email}`}
                  checked={directors.includes(person.id)}
                  onChange={(event) => setDirectors((current) => (event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id)))}
                />
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end">
            <Button variant="primary" loading={pending} disabled={!directorsDirty || directors.length === 0} onClick={saveDirectors}>
              Save directors
            </Button>
          </div>
        </CardBody>
      </Card>

      <Dialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.isEdit ? "Edit team member" : "Add a team member"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" loading={pending} disabled={!canSave} onClick={save}>
              {draft?.isEdit ? "Save member" : "Add to project"}
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            {!draft.isEdit ? (
              <SegmentedControl
                label="Who to add"
                value={draft.mode}
                onChange={(value) => setDraft({ ...draft, mode: value as MemberDraft["mode"] })}
                options={[
                  { value: "existing", label: "Existing person" },
                  { value: "new", label: "New person" },
                ]}
              />
            ) : null}
            {draft.mode === "existing" || draft.isEdit ? (
              <Field label="Person" required>
                {draft.isEdit ? (
                  <Input value={people.find((person) => person.id === draft.personId)?.name ?? ""} readOnly />
                ) : (
                  <Select value={draft.personId} onChange={(event) => setDraft({ ...draft, personId: event.target.value })}>
                    {available.length === 0 ? <option value="">Everyone is already on this project</option> : null}
                    {available.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                        {person.title ? `, ${person.title}` : ""}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Full name" required>
                    <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={80} />
                  </Field>
                  <Field label="Email" required>
                    <Input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
                  </Field>
                </div>
                <Field label="Job title">
                  <Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={80} placeholder="Senior engineer" />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="GitHub handle" hint="Links commits to them.">
                    <Input value={draft.github} onChange={(event) => setDraft({ ...draft, github: event.target.value })} placeholder="octocat" />
                  </Field>
                  <Field label="Azure DevOps">
                    <Input value={draft.azureDevOps} onChange={(event) => setDraft({ ...draft, azureDevOps: event.target.value })} />
                  </Field>
                  <Field label="Teams handle">
                    <Input value={draft.teams} onChange={(event) => setDraft({ ...draft, teams: event.target.value })} />
                  </Field>
                </div>
              </>
            )}
            <Field label="Project role" hint="For example Tech Lead, Backend or QA.">
              <Input value={draft.projectRole} onChange={(event) => setDraft({ ...draft, projectRole: event.target.value })} maxLength={40} placeholder="Engineer" />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Field label="Areas" hint="Comma separated, for example api, billing, mobile.">
                <Input value={draft.areas} onChange={(event) => setDraft({ ...draft, areas: event.target.value })} />
              </Field>
              <Field label="Allocation (%)">
                <Input type="number" min={0} max={100} value={draft.allocation} onChange={(event) => setDraft({ ...draft, allocation: event.target.value })} />
              </Field>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        size="sm"
        title="Remove from this project?"
        description={removing ? `${removing.name} stays in the people directory but will no longer be part of this team.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" loading={pending} onClick={remove}>
              Remove
            </Button>
          </>
        }
      />
    </div>
  );
}
