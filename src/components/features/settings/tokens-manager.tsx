"use client";

import { KeyRound, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { createTokenAction, revokeTokenAction } from "@/app/actions";
import { Badge, Button, Callout, Card, CardBody, CardHeader, CopyButton, Dialog, EmptyState, Field, Input, RelativeTime, Select, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { useAction } from "./use-action";

export interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  scopes: ("read" | "write")[];
  createdAt: string;
  lastUsedAt?: string;
}

export interface ToolRow {
  name: string;
  title: string;
  description: string;
  mutating: boolean;
}

function Snippet({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium">{label}</p>
        <CopyButton value={value} label={`Copy ${label}`}>
          Copy
        </CopyButton>
      </div>
      <pre className="max-w-full overflow-x-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-xs leading-relaxed">{value}</pre>
    </div>
  );
}

export function TokensManager({ tokens, baseUrl, tools }: { tokens: TokenRow[]; baseUrl: string; tools: ToolRow[] }) {
  const { run, pending } = useAction();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [fresh, setFresh] = useState<{ token: string; name: string } | null>(null);
  const [revoking, setRevoking] = useState<TokenRow | null>(null);

  const endpoint = `${baseUrl.replace(/\/$/, "")}/api/mcp`;
  const tokenText = fresh?.token ?? "<token>";
  const cli = `claude mcp add --transport http project-aid ${endpoint} --header "Authorization: Bearer ${tokenText}"`;
  const json = JSON.stringify({ mcpServers: { "project-aid": { type: "http", url: endpoint, headers: { Authorization: `Bearer ${tokenText}` } } } }, null, 2);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const result = await run(() => createTokenAction(name, scope), { success: "Token created" });
    if (result.ok) {
      setFresh({ token: result.data.token, name });
      setName("");
    }
  }
  async function revoke() {
    if (!revoking) return;
    const result = await run(() => revokeTokenAction(revoking.id), { success: "Token revoked" });
    if (result.ok) setRevoking(null);
  }

  return (
    <div className="space-y-6">
      <Card as="section" aria-labelledby="tokens-heading">
        <CardHeader title={<span id="tokens-heading">Personal access tokens</span>} description="Let an AI client or script act as you. A token has the same project access as your account." />
        <CardBody className="space-y-5">
          {fresh ? (
            <Callout tone="warning" title={`Copy your new token for "${fresh.name}" now`}>
              <p>This is the only time it is shown. Store it somewhere safe; if you lose it, revoke it and create another.</p>
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                <code className="min-w-0 max-w-full break-all rounded border border-warning-line bg-surface px-2 py-1 font-mono text-xs">{fresh.token}</code>
                <span className="inline-flex h-7 items-center rounded-md border border-line-strong bg-surface">
                  <CopyButton value={fresh.token} label="Copy token" className="h-7 text-[13px] text-fg">
                    Copy token
                  </CopyButton>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setFresh(null)}>
                  I have saved it
                </Button>
              </div>
            </Callout>
          ) : null}

          <form onSubmit={create} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_auto]">
            <Field label="Token name" hint="Where you will use it, for example Claude Code on my laptop.">
              <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required />
            </Field>
            <Field label="Access" hint={scope === "read" ? "Can read projects, activity and reports." : "Can also create tickets, notes and reports."}>
              <Select value={scope} onChange={(event) => setScope(event.target.value as "read" | "write")}>
                <option value="read">Read-only</option>
                <option value="write">Read and write</option>
              </Select>
            </Field>
            <Button type="submit" variant="primary" icon={<Plus size={14} />} loading={pending} disabled={!name.trim()} className="md:mb-[22px]">
              Create token
            </Button>
          </form>

          {tokens.length === 0 ? (
            <EmptyState icon={<KeyRound size={20} />} title="No tokens yet" description="Create one to connect Claude Code or another MCP client." />
          ) : (
            <Table>
              <THead>
                <Tr hover={false}>
                  <Th>Name</Th>
                  <Th>Token</Th>
                  <Th>Access</Th>
                  <Th>Created</Th>
                  <Th>Last used</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </Tr>
              </THead>
              <TBody>
                {tokens.map((token) => (
                  <Tr key={token.id}>
                    <Td className="font-medium">{token.name}</Td>
                    <Td mono>{token.prefix}...</Td>
                    <Td>
                      <Badge tone={token.scopes.includes("write") ? "warning" : "neutral"}>{token.scopes.includes("write") ? "Read and write" : "Read-only"}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap" muted>
                      <RelativeTime iso={token.createdAt} />
                    </Td>
                    <Td className="whitespace-nowrap" muted>
                      <RelativeTime iso={token.lastUsedAt} empty="Never" />
                    </Td>
                    <Td>
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} aria-label={`Revoke ${token.name}`} onClick={() => setRevoking(token)}>
                          Revoke
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

      <Card as="section" aria-labelledby="mcp-heading">
        <CardHeader title={<span id="mcp-heading">Connect an AI client</span>} description="Project Aid speaks MCP, so tools like Claude Code can query your projects directly." />
        <CardBody className="space-y-5">
          <dl className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-muted">Endpoint</dt>
              <dd className="flex min-w-0 items-center gap-1">
                <code className="min-w-0 break-all font-mono text-xs">{endpoint}</code>
                <CopyButton value={endpoint} label="Copy endpoint" />
              </dd>
            </div>
            <div>
              <dt className="text-muted">Transport and sign-in</dt>
              <dd>Streamable HTTP, header <code className="font-mono text-xs">Authorization: Bearer &lt;token&gt;</code></dd>
            </div>
          </dl>
          {!fresh ? <p className="text-xs text-muted">Replace <code className="font-mono">&lt;token&gt;</code> with a token you created above. Snippets fill it in right after you create one.</p> : null}
          <Snippet label="Claude Code CLI" value={cli} />
          <Snippet label="Generic JSON config" value={json} />
        </CardBody>
      </Card>

      <Card as="section" aria-labelledby="tools-heading">
        <CardHeader title={<span id="tools-heading">Available tools</span>} description={`${tools.length} tools. Tools that change data need a read and write token.`} />
        {tools.length === 0 ? (
          <CardBody>
            <p className="text-[13px] text-muted">No tools are registered.</p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {tools.map((tool) => (
              <li key={tool.name} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[13px] font-medium">{tool.name}</p>
                  <p className="text-[13px] text-muted">{tool.description}</p>
                </div>
                <Badge tone={tool.mutating ? "warning" : "neutral"} icon={tool.mutating ? <TriangleAlert /> : undefined}>
                  {tool.mutating ? "Changes data" : "Read-only"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        size="sm"
        title="Revoke this token?"
        description={revoking ? `Anything using "${revoking.name}" will stop working immediately.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevoking(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" loading={pending} onClick={revoke}>
              Revoke token
            </Button>
          </>
        }
      />
    </div>
  );
}
