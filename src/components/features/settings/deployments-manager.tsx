"use client";

import { Pencil, Plus, Rocket, Trash2 } from "lucide-react";
import { useState } from "react";
import { removeDeployTargetAction, upsertDeployTargetAction } from "@/app/actions";
import { Badge, Button, Callout, Card, CardBody, CardHeader, Dialog, EmptyState, Field, Input, Select, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { useAction } from "./use-action";

export interface DeployTargetItem {
  id: string;
  environment: string;
  provider: string;
  config: Record<string, string>;
  secretEnv?: string;
}

interface ProviderInfo {
  label: string;
  description: string;
  fields: { key: string; label: string; required: boolean; placeholder?: string }[];
  defaultEnv?: string;
}

const PROVIDERS: Record<string, ProviderInfo> = {
  vercel: {
    label: "Vercel",
    description: "Reads deployments of a Vercel project. Set the token variable on the host.",
    fields: [
      { key: "projectId", label: "Vercel project id", required: true, placeholder: "prj_..." },
      { key: "teamId", label: "Team id", required: false, placeholder: "team_..." },
    ],
    defaultEnv: "VERCEL_TOKEN",
  },
  github: {
    label: "GitHub deployments",
    description: "Reads GitHub deployment statuses for a repository environment.",
    fields: [
      { key: "owner", label: "Owner or organisation", required: true, placeholder: "acme" },
      { key: "repo", label: "Repository", required: true, placeholder: "web-app" },
      { key: "environment", label: "GitHub environment name", required: false, placeholder: "production" },
    ],
    defaultEnv: "GITHUB_TOKEN",
  },
  healthcheck: {
    label: "Health check URL",
    description: "Calls a public URL on every check and reports whether it responds.",
    fields: [{ key: "url", label: "Health check URL (https)", required: true, placeholder: "https://app.example.com/health" }],
  },
  azure: { label: "Azure", description: "Azure monitoring is not available yet: this target is recorded but not checked. Use a health check or GitHub for now.", fields: [] },
  simulated: { label: "Simulated", description: "Generates demo deployments so the project is explorable.", fields: [] },
};

interface Draft {
  id?: string;
  environment: string;
  provider: string;
  config: Record<string, string>;
  secretEnv: string;
}

export function DeploymentsManager({ projectId, targets }: { projectId: string; targets: DeployTargetItem[] }) {
  const { run, pending } = useAction();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<DeployTargetItem | null>(null);
  const info = draft ? PROVIDERS[draft.provider] : undefined;
  const missing = draft && info ? !draft.environment.trim() || info.fields.some((field) => field.required && !(draft.config[field.key] ?? "").trim()) : true;

  async function save() {
    if (!draft) return;
    const result = await run(() => upsertDeployTargetAction(projectId, { id: draft.id, environment: draft.environment, provider: draft.provider, config: draft.config, secretEnv: draft.secretEnv.trim() || undefined }), { success: draft.id ? "Target updated" : "Target added" });
    if (result.ok) setDraft(null);
  }
  async function remove() {
    if (!removing) return;
    const result = await run(() => removeDeployTargetAction(projectId, removing.id), { success: "Target removed" });
    if (result.ok) setRemoving(null);
  }
  const summary = (target: DeployTargetItem) =>
    Object.entries(target.config)
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ") || "No extra settings";

  return (
    <Card as="section" aria-labelledby="deploy-heading">
      <CardHeader
        title={<span id="deploy-heading">Deployments</span>}
        description="The environments to watch. A failed deployment can open an incident."
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setDraft({ environment: "", provider: "vercel", config: {}, secretEnv: "" })}>
            Add target
          </Button>
        }
      />
      <CardBody className="space-y-4">
        <Callout tone="info" title="Credentials never go in this app">
          Provider tokens are read from environment variables on the host. Enter only the variable name, and set its value in your hosting settings.
        </Callout>
        {targets.length === 0 ? (
          <EmptyState icon={<Rocket size={20} />} title="No deployment targets" description="Add an environment such as production so deployment status shows on the project." />
        ) : (
          <Table>
            <THead>
              <Tr hover={false}>
                <Th>Environment</Th>
                <Th>Provider</Th>
                <Th>Settings</Th>
                <Th>Credential variable</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {targets.map((target) => (
                <Tr key={target.id}>
                  <Td className="font-medium">{target.environment}</Td>
                  <Td>
                    <Badge tone="neutral">{PROVIDERS[target.provider]?.label ?? target.provider}</Badge>
                  </Td>
                  <Td className="max-w-xs break-words" muted>
                    {summary(target)}
                  </Td>
                  <Td mono>{target.secretEnv ?? PROVIDERS[target.provider]?.defaultEnv ?? "None needed"}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" icon={<Pencil size={13} />} aria-label={`Edit ${target.environment}`} onClick={() => setDraft({ id: target.id, environment: target.environment, provider: target.provider, config: { ...target.config }, secretEnv: target.secretEnv ?? "" })}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} aria-label={`Remove ${target.environment}`} onClick={() => setRemoving(target)}>
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
        title={draft?.id ? "Edit deployment target" : "Add a deployment target"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" loading={pending} disabled={missing} onClick={save}>
              {draft?.id ? "Save target" : "Add target"}
            </Button>
          </>
        }
      >
        {draft && info ? (
          <div className="space-y-4">
            <Field label="Environment" required hint="For example production or staging.">
              <Input value={draft.environment} onChange={(event) => setDraft({ ...draft, environment: event.target.value })} maxLength={40} />
            </Field>
            <Field label="Provider" hint={info.description}>
              <Select value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value, config: {}, secretEnv: "" })}>
                {Object.entries(PROVIDERS).map(([value, provider]) => (
                  <option key={value} value={value}>
                    {provider.label}
                  </option>
                ))}
              </Select>
            </Field>
            {info.fields.map((field) => (
              <Field key={field.key} label={field.label} required={field.required}>
                <Input value={draft.config[field.key] ?? ""} placeholder={field.placeholder} onChange={(event) => setDraft({ ...draft, config: { ...draft.config, [field.key]: event.target.value } })} />
              </Field>
            ))}
            {info.defaultEnv ? (
              <Field label="Credential environment variable" hint={`The variable's name, not the secret. Leave empty to use ${info.defaultEnv}.`}>
                <Input className="font-mono" value={draft.secretEnv} placeholder={info.defaultEnv} onChange={(event) => setDraft({ ...draft, secretEnv: event.target.value.toUpperCase() })} spellCheck={false} />
              </Field>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        size="sm"
        title="Remove this target?"
        description={removing ? `The ${removing.environment} environment will no longer be monitored. Past deployments are kept.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" loading={pending} onClick={remove}>
              Remove target
            </Button>
          </>
        }
      />
    </Card>
  );
}
