"use client";

import { Pencil, Plus, Trash2, Plug } from "lucide-react";
import { useState } from "react";
import { removeSourceAction, upsertSourceAction } from "@/app/actions";
import { SourceIcon, SOURCE_META } from "@/components/domain";
import { Badge, Button, Callout, Card, CardBody, CardHeader, Dialog, EmptyState, Field, Input, RelativeTime, Select, Switch, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import type { SourceKind } from "@/lib/types";
import { useAction } from "./use-action";

export interface ConnectorInfo {
  kind: string;
  label: string;
  configHelp: { key: string; label: string; required: boolean; placeholder?: string }[];
  defaultSecretEnv?: string;
}

export interface SourceItem {
  id: string;
  kind: string;
  name: string;
  enabled: boolean;
  config: Record<string, string>;
  secretEnv?: string;
  lastSyncAt?: string;
  lastSyncStatus?: "ok" | "error" | "stubbed" | "never";
  lastSyncDetail?: string;
}

const HOW_TO: Record<string, string> = {
  github: "Create a fine-grained personal access token with read access to the repository (contents, pull requests, issues and deployments).",
  "azure-devops": "Create a personal access token with Code (read) and Work Items (read) scopes. For on-prem servers, also fill in the base URL.",
  jira: "Create an API token for the account email above, from the Atlassian account security page.",
  teams: "Provide a Microsoft Graph access token that can read the team's channel messages.",
  outlook: "Provide a Microsoft Graph access token that can read the mailbox.",
  slack: "Create a Slack bot token with channel history read access and invite the bot to the channel.",
  simulated: "No credentials needed. Generates realistic demo activity so the project is explorable.",
};

const STATUS_TONE = { ok: "success", error: "danger", stubbed: "warning", never: "neutral" } as const;
const STATUS_LABEL = { ok: "Synced", error: "Error", stubbed: "Not connected", never: "Never synced" } as const;

interface Draft {
  id?: string;
  kind: string;
  name: string;
  enabled: boolean;
  config: Record<string, string>;
  secretEnv: string;
}

export function SourcesManager({ projectId, sources, connectors }: { projectId: string; sources: SourceItem[]; connectors: ConnectorInfo[] }) {
  const { run, pending } = useAction();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<SourceItem | null>(null);

  const kinds: ConnectorInfo[] = connectors.some((connector) => connector.kind === "simulated") ? connectors : [...connectors, { kind: "simulated", label: "Simulated activity (demo)", configHelp: [] }];
  const connector = draft ? kinds.find((candidate) => candidate.kind === draft.kind) : undefined;
  const kindLabel = (kind: string) => kinds.find((candidate) => candidate.kind === kind)?.label ?? kind;
  const envName = draft ? draft.secretEnv || connector?.defaultSecretEnv : undefined;

  function startAdd() {
    const first = kinds.find((candidate) => candidate.kind !== "simulated") ?? kinds[0];
    setDraft({ kind: first.kind, name: "", enabled: true, config: {}, secretEnv: "" });
  }
  function startEdit(source: SourceItem) {
    setDraft({ id: source.id, kind: source.kind, name: source.name, enabled: source.enabled, config: { ...source.config }, secretEnv: source.secretEnv ?? "" });
  }
  async function save() {
    if (!draft) return;
    const result = await run(() => upsertSourceAction(projectId, { id: draft.id, kind: draft.kind, name: draft.name || kindLabel(draft.kind), enabled: draft.enabled, config: draft.config, secretEnv: draft.secretEnv.trim() || undefined }), { success: draft.id ? "Source updated" : "Source added" });
    if (result.ok) setDraft(null);
  }
  async function toggle(source: SourceItem, enabled: boolean) {
    await run(() => upsertSourceAction(projectId, { id: source.id, kind: source.kind, name: source.name, enabled, config: source.config, secretEnv: source.secretEnv }), { success: enabled ? "Source enabled" : "Source paused" });
  }
  async function remove() {
    if (!removing) return;
    const result = await run(() => removeSourceAction(projectId, removing.id), { success: "Source removed" });
    if (result.ok) setRemoving(null);
  }

  const missingRequired = draft && connector ? connector.configHelp.some((field) => field.required && !(draft.config[field.key] ?? "").trim()) : false;

  return (
    <Card as="section" aria-labelledby="sources-heading">
      <CardHeader
        title={<span id="sources-heading">Sources</span>}
        description="Where project activity comes from. Each source is synced on a schedule and on demand."
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={startAdd}>
            Add source
          </Button>
        }
      />
      <CardBody className="space-y-4">
        <Callout tone="info" title="Credentials never go in this app">
          Each source names an <em>environment variable</em> that holds its credential, for example <code className="font-mono text-xs">GITHUB_TOKEN</code>. Set the variable on the host (in Vercel: Project Settings, Environment Variables, then redeploy). Only the name is stored here.
        </Callout>
        {sources.length === 0 ? (
          <EmptyState icon={<Plug size={20} />} title="No sources connected" description="Add a source such as GitHub or Jira so the assistant has activity to work with." action={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={startAdd}>Add source</Button>} />
        ) : (
          <Table>
            <THead>
              <Tr hover={false}>
                <Th>Source</Th>
                <Th>Enabled</Th>
                <Th>Last sync</Th>
                <Th>Credential variable</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {sources.map((source) => {
                const status = source.lastSyncStatus ?? "never";
                const defaultEnv = connectors.find((candidate) => candidate.kind === source.kind)?.defaultSecretEnv;
                return (
                  <Tr key={source.id}>
                    <Td className="min-w-48">
                      <div className="flex items-center gap-2">
                        <SourceIcon source={source.kind as SourceKind} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{source.name}</p>
                          <p className="truncate text-xs text-muted">{SOURCE_META[source.kind as SourceKind]?.label ?? kindLabel(source.kind)}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Switch aria-label={`${source.name} enabled`} checked={source.enabled} disabled={pending} onChange={(event) => toggle(source, event.target.checked)} />
                    </Td>
                    <Td className="min-w-44">
                      <Badge tone={STATUS_TONE[status]} dot>
                        {STATUS_LABEL[status]}
                      </Badge>
                      <div className="mt-0.5 text-xs text-muted">
                        {source.lastSyncAt ? <RelativeTime iso={source.lastSyncAt} /> : null}
                        {source.lastSyncDetail ? <span className="block max-w-xs break-words">{source.lastSyncDetail}</span> : null}
                      </div>
                    </Td>
                    <Td mono>{source.secretEnv ?? (defaultEnv ? `${defaultEnv} (default)` : "None needed")}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" icon={<Pencil size={13} />} onClick={() => startEdit(source)} aria-label={`Edit ${source.name}`}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => setRemoving(source)} aria-label={`Remove ${source.name}`}>
                          Remove
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </CardBody>

      <Dialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit source" : "Add a source"}
        description="Settings here are not secret. The credential is read from an environment variable on the host."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" loading={pending} disabled={missingRequired} onClick={save}>
              {draft?.id ? "Save source" : "Add source"}
            </Button>
          </>
        }
      >
        {draft && connector ? (
          <div className="space-y-4">
            <Field label="Kind of source">
              <Select value={draft.kind} disabled={Boolean(draft.id)} onChange={(event) => setDraft({ ...draft, kind: event.target.value, config: {}, secretEnv: "" })}>
                {kinds.map((candidate) => (
                  <option key={candidate.kind} value={candidate.kind}>
                    {candidate.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Display name" hint="Shown in the source list. Defaults to the kind of source.">
              <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={connector.label} maxLength={80} />
            </Field>
            {connector.configHelp.map((field) => (
              <Field key={field.key} label={field.label} required={field.required}>
                <Input value={draft.config[field.key] ?? ""} placeholder={field.placeholder} onChange={(event) => setDraft({ ...draft, config: { ...draft.config, [field.key]: event.target.value } })} />
              </Field>
            ))}
            {draft.kind !== "simulated" ? (
              <Field label="Credential environment variable" hint={`Enter the variable's name, not the secret. Leave empty to use ${connector.defaultSecretEnv ?? "the default"}.`}>
                <Input className="font-mono" value={draft.secretEnv} placeholder={connector.defaultSecretEnv ?? "MY_SERVICE_TOKEN"} onChange={(event) => setDraft({ ...draft, secretEnv: event.target.value.toUpperCase() })} autoCapitalize="characters" spellCheck={false} />
              </Field>
            ) : null}
            <Switch label="Enabled" description="When off, this source is skipped during syncs but kept in the list." checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
            <div className="rounded-lg border border-line bg-surface-2 p-3 text-[13px]">
              <p className="font-medium">How to connect</p>
              <p className="mt-1 text-muted">{HOW_TO[draft.kind] ?? "Provide the settings above."}</p>
              {envName ? (
                <p className="mt-1 text-muted">
                  Then set <code className="font-mono text-xs text-fg">{envName}</code> on the host (for example Vercel, Project Settings, Environment Variables) and redeploy.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        size="sm"
        title="Remove this source?"
        description={removing ? `${removing.name} will stop syncing. Activity already collected is kept.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" loading={pending} onClick={remove}>
              Remove source
            </Button>
          </>
        }
      />
    </Card>
  );
}
