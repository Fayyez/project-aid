import { CircleAlert, CircleCheck, CircleDashed } from "lucide-react";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import type { SetupStatus } from "@/lib/services/admin";

const GROUPS: { level: "required" | "recommended" | "optional"; title: string; description: string }[] = [
  { level: "required", title: "Required", description: "The platform is not safe or usable without these." },
  { level: "recommended", title: "Recommended", description: "Works without them, but with reduced quality or durability." },
  { level: "optional", title: "Optional", description: "Turn on extra integrations when you need them." },
];

export function SetupStatusPanel({ status }: { status: SetupStatus }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardBody className="space-y-1.5">
            <p className="text-xs font-medium text-muted">AI mode</p>
            <Badge tone={status.llm.mode === "live" ? "success" : "warning"} dot>
              {status.llm.mode === "live" ? "Live models" : "Heuristic mode"}
            </Badge>
            <p className="text-[13px] text-muted">{status.llm.detail}</p>
            {status.llm.mode === "live" ? (
              <dl className="text-xs text-muted">
                <div className="flex gap-1">
                  <dt>Reasoning:</dt>
                  <dd className="font-mono text-fg">{status.llm.smartModel ?? "-"}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>Summaries:</dt>
                  <dd className="font-mono text-fg">{status.llm.cheapModel ?? "-"}</dd>
                </div>
                {status.llm.localModel ? (
                  <div className="flex gap-1">
                    <dt>Local:</dt>
                    <dd className="font-mono text-fg">{status.llm.localModel}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-1.5">
            <p className="text-xs font-medium text-muted">Storage</p>
            <Badge tone={status.store === "redis" ? "success" : "warning"} dot>
              {status.store === "redis" ? "Redis (durable)" : "In memory"}
            </Badge>
            <p className="text-[13px] text-muted">{status.store === "redis" ? "Data survives restarts." : "Data is lost when the server restarts."}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-1.5">
            <p className="text-xs font-medium text-muted">Public address</p>
            <p className="break-all font-mono text-[13px]">{status.baseUrl}</p>
            <p className="text-[13px] text-muted">Used in reply links and the MCP endpoint.</p>
          </CardBody>
        </Card>
      </div>

      {GROUPS.map((group) => {
        const checks = status.checks.filter((check) => check.level === group.level);
        if (checks.length === 0) return null;
        return (
          <Card as="section" key={group.level} aria-labelledby={`group-${group.level}`}>
            <CardHeader title={<span id={`group-${group.level}`}>{group.title}</span>} description={group.description} />
            <ul className="divide-y divide-line">
              {checks.map((check) => (
                <li key={check.id} className="flex items-start gap-3 px-4 py-3">
                  {check.ok ? (
                    <CircleCheck size={18} className="mt-0.5 shrink-0 text-success" aria-label="Set up" />
                  ) : check.level === "optional" ? (
                    <CircleDashed size={18} className="mt-0.5 shrink-0 text-muted" aria-label="Not set up" />
                  ) : (
                    <CircleAlert size={18} className={`mt-0.5 shrink-0 ${check.level === "required" ? "text-danger" : "text-warning"}`} aria-label="Needs attention" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-medium">{check.label}</p>
                      {check.env ? <code className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{check.env}</code> : null}
                    </div>
                    <p className="text-[13px] text-muted">{check.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card as="section" aria-labelledby="connectors-heading">
          <CardHeader title={<span id="connectors-heading">Source connectors</span>} description="Whether a default credential is present on the host. Sources can also name their own variable." />
          <ul className="divide-y divide-line">
            {status.connectors.map((connector) => (
              <li key={connector.kind} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm">{connector.label}</p>
                  {connector.defaultSecretEnv ? <p className="truncate font-mono text-xs text-muted">{connector.defaultSecretEnv}</p> : null}
                </div>
                {connector.defaultSecretEnv ? (
                  <Badge tone={connector.hasDefaultSecret ? "success" : "neutral"} icon={connector.hasDefaultSecret ? <CircleCheck /> : <CircleDashed />}>
                    {connector.hasDefaultSecret ? "Credential present" : "No default credential"}
                  </Badge>
                ) : (
                  <Badge tone="neutral">No credential needed</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card as="section" aria-labelledby="messengers-heading">
          <CardHeader title={<span id="messengers-heading">Messengers</span>} description="Where questions to the team can be delivered." />
          <ul className="divide-y divide-line">
            {status.messengers.map((messenger) => (
              <li key={messenger.channel} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <p className="truncate text-sm">{messenger.label}</p>
                <Badge tone={messenger.configured ? "success" : "neutral"} icon={messenger.configured ? <CircleCheck /> : <CircleDashed />}>
                  {messenger.configured ? "Configured" : "Not configured"}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
