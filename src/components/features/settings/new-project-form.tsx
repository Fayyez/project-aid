"use client";

import { useState } from "react";
import { createProjectAction } from "@/app/actions";
import { Button, Card, CardBody, Checkbox, Field, Input, Textarea } from "@/components/ui";
import { isoDate } from "@/lib/format";
import { useAction } from "./use-action";

function suggestKey(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 6);
  return words.map((word) => word[0]).join("").slice(0, 6).padEnd(2, words[0].slice(1, 2));
}

export function NewProjectForm() {
  const { run, pending, router } = useAction();
  const today = new Date();
  const target = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(isoDate(today));
  const [targetDate, setTargetDate] = useState(isoDate(target));
  const [demo, setDemo] = useState(true);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = await run(() => createProjectAction({ name, key, client, description, startDate, targetDate, withDemoSource: demo }), { success: "Project created", refresh: true });
    if (result.ok) router.push(`/projects/${result.data.id}/settings?tab=sources&new=1`);
  }

  return (
    <form onSubmit={submit}>
      <Card>
        <CardBody className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Field label="Project name" required>
              <Input
                value={name}
                maxLength={80}
                required
                autoFocus
                placeholder="Atlas customer portal"
                onChange={(event) => {
                  setName(event.target.value);
                  if (!keyTouched) setKey(suggestKey(event.target.value));
                }}
              />
            </Field>
            <Field label="Project key" required hint="Used in ticket keys, like ATLAS-12. Two to ten letters or digits.">
              <Input
                className="font-mono uppercase"
                value={key}
                maxLength={10}
                required
                onChange={(event) => {
                  setKeyTouched(true);
                  setKey(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                }}
              />
            </Field>
          </div>
          <Field label="Client" hint="Who the project is for. Leave empty for an internal project.">
            <Input value={client} maxLength={80} onChange={(event) => setClient(event.target.value)} placeholder="Acme Corp" />
          </Field>
          <Field label="Description" hint="One or two sentences on what you are building. The assistant uses it as context.">
            <Textarea rows={3} value={description} maxLength={600} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Start date" required>
              <Input type="date" value={startDate} required onChange={(event) => setStartDate(event.target.value)} />
            </Field>
            <Field label="Target date" required hint="Pace and health are measured against this date.">
              <Input type="date" value={targetDate} required onChange={(event) => setTargetDate(event.target.value)} />
            </Field>
          </div>
          <Checkbox label="Start with simulated activity so the project is explorable immediately" description="Adds a demo source and a demo deployment target. You can remove them once real sources are connected." checked={demo} onChange={(event) => setDemo(event.target.checked)} />
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => router.push("/")} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={pending} disabled={!name.trim() || key.length < 2}>
              Create project
            </Button>
          </div>
        </CardBody>
      </Card>
    </form>
  );
}
