import { Bot } from "lucide-react";
import { Card, CardBody, CardHeader, Badge } from "@/components/ui";
import { TierBadge } from "@/components/domain";
import { AGENT_CATALOG } from "@/lib/agents/runtime";
import "@/lib/agents/defs/activity-analyst";
import "@/lib/agents/defs/assistant";
import "@/lib/agents/defs/clarifier";
import "@/lib/agents/defs/digest-editor";
import "@/lib/agents/defs/escalation-drafter";
import "@/lib/agents/defs/incident";
import "@/lib/agents/defs/knowledge-distiller";
import "@/lib/agents/defs/reflector";
import "@/lib/agents/defs/release-notes-writer";
import "@/lib/agents/defs/report-reviewer";
import "@/lib/agents/defs/report-writer";
import "@/lib/agents/defs/risk-scout";
import "@/lib/agents/defs/summarizer";
import "@/lib/agents/defs/ticket-deduper";
import "@/lib/agents/defs/ticket-extractor";

const KIND = { structured: "Structured output", text: "Writes text", tool: "Uses tools" } as const;

/** The multi-agent roster. Importing the definitions registers them in AGENT_CATALOG. */
export function AgentCatalog() {
  const agents = Array.from(AGENT_CATALOG.values()).sort((a, b) => a.title.localeCompare(b.title));
  return (
    <Card as="section">
      <CardHeader title="The agents" as="h2" description={`${agents.length} specialists share the work. Each one has a single job and a model tier.`} />
      <CardBody>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => (
            <li key={a.name} className="min-w-0 rounded-lg border border-line p-3">
              <div className="flex items-start gap-2">
                <Bot size={15} aria-hidden className="mt-0.5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[13px] font-semibold">{a.title}</p>
                  <p className="font-mono text-[11px] text-muted">{a.name}</p>
                </div>
              </div>
              <p className="mt-1.5 break-words text-[13px] text-muted">{a.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <TierBadge tier={a.tier} />
                <Badge tone="neutral">{KIND[a.kind]}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
