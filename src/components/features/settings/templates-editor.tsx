"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { setTemplateAction } from "@/app/actions";
import { Badge, Button, Callout, Card, CardBody, CardHeader, SegmentedControl, Textarea } from "@/components/ui";
import type { ReportKind } from "@/lib/types";
import { useAction } from "./use-action";

export interface TemplateInfo {
  kind: ReportKind;
  label: string;
  description: string;
  defaultText: string;
  override?: string;
  placeholders: string[];
}

function KindEditor({ projectId, info }: { projectId: string; info: TemplateInfo }) {
  const { run, pending } = useAction();
  const [text, setText] = useState(info.override ?? info.defaultText);
  const [saved, setSaved] = useState(info.override);
  const customised = saved !== undefined;
  const dirty = text !== (saved ?? info.defaultText);

  async function save() {
    const result = await run(() => setTemplateAction(projectId, info.kind, text), { success: "Template saved for this project" });
    if (result.ok) setSaved(text);
  }
  async function reset() {
    const result = await run(() => setTemplateAction(projectId, info.kind, null), { success: "Template reset to the default" });
    if (result.ok) {
      setSaved(undefined);
      setText(info.defaultText);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] text-muted">{info.description}</p>
        <Badge tone={customised ? "accent" : "neutral"}>{customised ? "Customised for this project" : "Using the default"}</Badge>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`template-${info.kind}`} className="block text-[13px] font-medium">
          Template (markdown)
        </label>
        <Textarea id={`template-${info.kind}`} rows={18} value={text} onChange={(event) => setText(event.target.value)} className="font-mono text-[13px]" spellCheck={false} />
      </div>
      <div>
        <p className="text-[13px] font-medium">Available placeholders</p>
        <p className="text-xs text-muted">Write them as {"{{name}}"}. They are replaced when the report is generated; unknown names are left as written.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {info.placeholders.map((name) => (
            <code key={name} className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{`{{${name}}}`}</code>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" icon={<RotateCcw size={14} />} disabled={pending || (!customised && !dirty)} onClick={customised ? reset : () => setText(info.defaultText)}>
          Reset to default
        </Button>
        <Button variant="primary" loading={pending} disabled={!dirty || !text.trim()} onClick={save}>
          Save for this project
        </Button>
      </div>
    </div>
  );
}

export function TemplatesEditor({ projectId, templates }: { projectId: string; templates: TemplateInfo[] }) {
  const [kind, setKind] = useState<ReportKind>(templates[0].kind);
  const info = templates.find((template) => template.kind === kind) ?? templates[0];
  return (
    <Card as="section" aria-labelledby="templates-heading">
      <CardHeader title={<span id="templates-heading">Report templates</span>} description="The structure the assistant follows when it writes a report. Change the headings and sections to match what your client expects." />
      <CardBody className="space-y-4">
        <SegmentedControl label="Report kind" value={kind} onChange={(value) => setKind(value as ReportKind)} options={templates.map((template) => ({ value: template.kind, label: template.label }))} />
        <Callout tone="info">Only this project is affected. Reset to default removes your changes and goes back to the shared template.</Callout>
        <KindEditor key={info.kind} projectId={projectId} info={info} />
      </CardBody>
    </Card>
  );
}
