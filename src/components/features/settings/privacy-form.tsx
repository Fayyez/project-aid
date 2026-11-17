"use client";

import { useState } from "react";
import { setPrivacyAction } from "@/app/actions";
import { Button, Callout, Card, CardBody, CardHeader, Switch } from "@/components/ui";
import type { PrivacySettings } from "@/lib/types";
import { useAction } from "./use-action";

const MODES: { value: PrivacySettings["codeSummaryMode"]; label: string; description: string }[] = [
  { value: "cloud", label: "Cloud model", description: "A cloud model reads each code change (after secrets are redacted) and writes a plain-language summary. Best summaries." },
  { value: "local", label: "Local model only", description: "Only a model running on your own infrastructure reads code. If none is set up, summaries fall back to commit messages and file names." },
  { value: "metadata-only", label: "Metadata only", description: "No model ever reads code. Summaries come from commit messages and file names, so they are less detailed." },
];

export function PrivacyForm({ projectId, initial }: { projectId: string; initial: PrivacySettings }) {
  const { run, pending } = useAction();
  const [values, setValues] = useState<PrivacySettings>(initial);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  async function save() {
    await run(() => setPrivacyAction(projectId, values), { success: "Privacy settings saved" });
  }

  return (
    <Card as="section" aria-labelledby="privacy-heading">
      <CardHeader title={<span id="privacy-heading">Privacy and code</span>} description="Control what the assistant is allowed to read and what is kept." />
      <CardBody className="space-y-6">
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium">How code changes are summarised</legend>
          <div className="grid grid-cols-1 gap-2">
            {MODES.map((mode) => {
              const selected = values.codeSummaryMode === mode.value;
              return (
                <label key={mode.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${selected ? "border-accent-line bg-accent-soft" : "border-line hover:border-line-strong"}`}>
                  <input type="radio" name="codeSummaryMode" value={mode.value} checked={selected} onChange={() => setValues((current) => ({ ...current, codeSummaryMode: mode.value }))} className="mt-1 size-4 accent-accent" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{mode.label}</span>
                    <span className="block text-[13px] text-muted">{mode.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="space-y-4">
          <Switch
            label="Keep raw diffs"
            description="When on, the full code changes are stored next to their summaries. When off (recommended), only the summaries are kept and the code is discarded after summarising."
            checked={values.storeRawCode}
            onChange={(event) => setValues((current) => ({ ...current, storeRawCode: event.target.checked }))}
          />
          <Switch
            label="Redact secrets before any model sees content"
            description="When on (recommended), keys, tokens and passwords are removed from commits, messages and documents before a model reads them. When off, content is sent as it is."
            checked={values.redactSecrets}
            onChange={(event) => setValues((current) => ({ ...current, redactSecrets: event.target.checked }))}
          />
        </div>
        {!values.redactSecrets ? (
          <Callout tone="warning" title="Secrets will not be redacted">
            Anything pasted into a commit or message, including credentials, may be sent to the model provider. Leave this on unless you have a reason.
          </Callout>
        ) : null}
        <div className="flex justify-end">
          <Button variant="primary" loading={pending} disabled={!dirty} onClick={save}>
            Save privacy settings
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
