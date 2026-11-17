"use client";

import { Check, Pencil, Plus, Users } from "lucide-react";
import { useState } from "react";
import { upsertPersonAction } from "@/app/actions";
import { Avatar, Badge, Button, Card, CardBody, CardHeader, Dialog, EmptyState, Field, Input, Select, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import type { Person } from "@/lib/types";
import { useAction } from "./use-action";

export interface PersonRow {
  id: string;
  name: string;
  email: string;
  title?: string;
  role: Person["role"];
  handles: Person["handles"];
  canSignIn: boolean;
}

interface Draft {
  id?: string;
  name: string;
  email: string;
  title: string;
  role: Person["role"];
  github: string;
  azureDevOps: string;
  jira: string;
  teams: string;
  slack: string;
  password: string;
}

const ROLE_LABEL: Record<Person["role"], string> = { admin: "Administrator", pd: "Project director", member: "Team member" };

export function PeopleManager({ people, isAdmin }: { people: PersonRow[]; isAdmin: boolean }) {
  const { run, pending } = useAction();
  const [draft, setDraft] = useState<Draft | null>(null);

  function blank(): Draft {
    return { name: "", email: "", title: "", role: "member", github: "", azureDevOps: "", jira: "", teams: "", slack: "", password: "" };
  }
  function from(person: PersonRow): Draft {
    return { id: person.id, name: person.name, email: person.email, title: person.title ?? "", role: person.role, github: person.handles.github ?? "", azureDevOps: person.handles.azureDevOps ?? "", jira: person.handles.jira ?? "", teams: person.handles.teams ?? "", slack: person.handles.slack ?? "", password: "" };
  }
  async function save() {
    if (!draft) return;
    const original = people.find((person) => person.id === draft.id);
    const result = await run(
      () =>
        upsertPersonAction({
          id: draft.id,
          name: draft.name,
          email: draft.email,
          title: draft.title || undefined,
          role: isAdmin && draft.role !== (original?.role ?? "member") ? draft.role : undefined,
          handles: { github: draft.github, azureDevOps: draft.azureDevOps, jira: draft.jira, teams: draft.teams, slack: draft.slack },
          password: isAdmin && draft.password ? draft.password : undefined,
        }),
      { success: draft.id ? "Person updated" : "Person added" },
    );
    if (result.ok) setDraft(null);
  }

  const handleList = (person: PersonRow) => Object.entries(person.handles).filter(([, value]) => value);

  return (
    <Card as="section" aria-labelledby="people-heading">
      <CardHeader
        title={<span id="people-heading">People</span>}
        description="Everyone who can be added to a project. Handles link commits and messages to the right person."
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setDraft(blank())}>
            Add person
          </Button>
        }
      />
      <CardBody>
        {people.length === 0 ? (
          <EmptyState icon={<Users size={20} />} title="No people yet" description="Add the people who work on your projects." />
        ) : (
          <Table>
            <THead>
              <Tr hover={false}>
                <Th>Name</Th>
                <Th>Title</Th>
                <Th>Role</Th>
                <Th>Handles</Th>
                <Th>Can sign in</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {people.map((person) => (
                <Tr key={person.id}>
                  <Td className="min-w-52">
                    <div className="flex items-center gap-2">
                      <Avatar name={person.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{person.name}</p>
                        <p className="truncate text-xs text-muted">{person.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td muted>{person.title ?? "-"}</Td>
                  <Td>
                    <Badge tone={person.role === "admin" ? "accent" : person.role === "pd" ? "info" : "neutral"}>{ROLE_LABEL[person.role]}</Badge>
                  </Td>
                  <Td className="min-w-44">
                    {handleList(person).length === 0 ? (
                      <span className="text-muted">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {handleList(person).map(([key, value]) => (
                          <span key={key} className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-xs">
                            <span className="text-muted">{key}:</span> {value}
                          </span>
                        ))}
                      </div>
                    )}
                  </Td>
                  <Td>{person.canSignIn ? <span className="inline-flex items-center gap-1 text-success"><Check size={14} aria-hidden /> Yes</span> : <span className="text-muted">No</span>}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" icon={<Pencil size={13} />} aria-label={`Edit ${person.name}`} onClick={() => setDraft(from(person))}>
                        Edit
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
        title={draft?.id ? "Edit person" : "Add a person"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" loading={pending} disabled={!draft?.name.trim() || !draft.email.trim()} onClick={save}>
              {draft?.id ? "Save person" : "Add person"}
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full name" required>
                <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={80} />
              </Field>
              <Field label="Email" required>
                <Input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
              </Field>
            </div>
            <Field label="Job title">
              <Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={80} />
            </Field>
            <fieldset className="space-y-3">
              <legend className="text-[13px] font-medium">Handles on other systems</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="GitHub">
                  <Input value={draft.github} onChange={(event) => setDraft({ ...draft, github: event.target.value })} />
                </Field>
                <Field label="Azure DevOps">
                  <Input value={draft.azureDevOps} onChange={(event) => setDraft({ ...draft, azureDevOps: event.target.value })} />
                </Field>
                <Field label="Jira">
                  <Input value={draft.jira} onChange={(event) => setDraft({ ...draft, jira: event.target.value })} />
                </Field>
                <Field label="Teams">
                  <Input value={draft.teams} onChange={(event) => setDraft({ ...draft, teams: event.target.value })} />
                </Field>
                <Field label="Slack">
                  <Input value={draft.slack} onChange={(event) => setDraft({ ...draft, slack: event.target.value })} />
                </Field>
              </div>
            </fieldset>
            {isAdmin ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Role" hint="Directors and administrators can sign in. Team members cannot.">
                  <Select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as Person["role"] })}>
                    <option value="member">Team member</option>
                    <option value="pd">Project director</option>
                    <option value="admin">Administrator</option>
                  </Select>
                </Field>
                <Field label={draft.id ? "New password" : "Password"} hint="At least 10 characters. Leave empty to keep the current one.">
                  <Input type="password" autoComplete="new-password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} />
                </Field>
              </div>
            ) : (
              <p className="text-[13px] text-muted">Only administrators can change roles or set passwords.</p>
            )}
          </div>
        ) : null}
      </Dialog>
    </Card>
  );
}
