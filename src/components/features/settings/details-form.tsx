"use client";

import { useState } from "react";
import { updateProjectDetailsAction } from "@/app/actions";
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { isoDate } from "@/lib/format";
import type { MessageChannel, Project } from "@/lib/types";
import { useAction } from "./use-action";

export interface DetailsValues {
  name: string;
  client: string;
  description: string;
  status: Project["status"];
  startDate: string;
  targetDate: string;
  notifyChannel: MessageChannel;
}

export function DetailsForm({ projectId, initial }: { projectId: string; initial: DetailsValues }) {
  const { run, pending } = useAction();
  const [values, setValues] = useState<DetailsValues>({ ...initial, startDate: isoDate(initial.startDate), targetDate: isoDate(initial.targetDate) });
  const set = <K extends keyof DetailsValues>(key: K, value: DetailsValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    await run(() => updateProjectDetailsAction(projectId, values), { success: "Project details saved" });
  }

  return (
    <Card as="section" aria-labelledby="details-heading">
      <CardHeader title={<span id="details-heading">Project details</span>} description="The basics shown in the project header and on reports." />
      <CardBody>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Project name" required>
              <Input value={values.name} onChange={(event) => set("name", event.target.value)} maxLength={80} required />
            </Field>
            <Field label="Client" required>
              <Input value={values.client} onChange={(event) => set("client", event.target.value)} maxLength={80} required />
            </Field>
          </div>
          <Field label="Description" hint="One or two sentences on what the project delivers. The assistant uses it as context.">
            <Textarea rows={3} value={values.description} onChange={(event) => set("description", event.target.value)} maxLength={600} />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Status" hint="Paused and completed projects stay visible but are flagged.">
              <Select value={values.status} onChange={(event) => set("status", event.target.value as Project["status"])}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </Select>
            </Field>
            <Field label="Start date" required>
              <Input type="date" value={values.startDate} onChange={(event) => set("startDate", event.target.value)} required />
            </Field>
            <Field label="Target date" required hint="Pace and health are measured against this date.">
              <Input type="date" value={values.targetDate} onChange={(event) => set("targetDate", event.target.value)} required />
            </Field>
          </div>
          <Field label="Where questions to the team are sent" hint="When you ask a team member something, it is delivered here. The in-app inbox always keeps a copy.">
            <Select value={values.notifyChannel} onChange={(event) => set("notifyChannel", event.target.value as MessageChannel)} className="md:max-w-xs">
              <option value="in_app">In-app inbox only</option>
              <option value="teams">Microsoft Teams</option>
              <option value="email">Email</option>
              <option value="slack">Slack</option>
            </Select>
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={pending}>
              Save details
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
