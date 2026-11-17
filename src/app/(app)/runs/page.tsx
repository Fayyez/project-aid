import type { Metadata } from "next";
import Link from "next/link";
import { Route } from "lucide-react";
import { GroundingBadge } from "@/components/domain";
import { AgentCatalog } from "@/components/features/runs/agent-catalog";
import { RUN_STATUS_TONE, workflowLabel } from "@/components/features/runs/labels";
import { formatCost, formatDuration, runDurationMs } from "@/components/features/run-trace";
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader, RelativeTime, Select, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { requireActor } from "@/lib/auth/current";
import { listRuns } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Agent runs" };

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export default async function RunsPage({ searchParams }: PageProps<"/runs">) {
  const actor = await requireActor();
  const sp = await searchParams;
  const workflow = one(sp.workflow);
  const projectId = one(sp.projectId);
  const [all, runs] = await Promise.all([listRuns(actor, { limit: 200 }), listRuns(actor, { workflow, projectId, limit: 100 })]);
  const workflows = Array.from(new Set(all.map((r) => r.workflow))).sort();
  const projects = Array.from(new Map(all.filter((r) => r.projectId).map((r) => [r.projectId as string, r.projectName ?? r.projectId])).entries());
  const filtered = Boolean(workflow || projectId);

  return (
    <>
      <PageHeader title="Agent runs" description="Every time the agents answered a question, wrote a summary or triaged an incident, the run is recorded here." />
      <div className="space-y-6">
        <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filter runs">
          <div className="min-w-44">
            <label htmlFor="f-workflow" className="mb-1 block text-xs font-medium text-muted">
              Workflow
            </label>
            <Select id="f-workflow" name="workflow" defaultValue={workflow ?? ""}>
              <option value="">All workflows</option>
              {workflows.map((w) => (
                <option key={w} value={w}>
                  {workflowLabel(w)}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-44">
            <label htmlFor="f-project" className="mb-1 block text-xs font-medium text-muted">
              Project
            </label>
            <Select id="f-project" name="projectId" defaultValue={projectId ?? ""}>
              <option value="">All projects</option>
              {projects.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
          {filtered ? (
            <LinkButton href="/runs" variant="ghost">
              Clear
            </LinkButton>
          ) : null}
        </form>

        {runs.length === 0 ? (
          <EmptyState
            icon={<Route size={20} />}
            title={filtered ? "No runs match these filters" : "No agent runs yet"}
            description={filtered ? "Try a different workflow or project." : "Ask a question in the chat and the run will show up here."}
            action={filtered ? undefined : <LinkButton href="/chat" variant="primary">Ask a question</LinkButton>}
          />
        ) : (
          <Card>
            <Table>
              <THead>
                <Tr hover={false}>
                  <Th>Run</Th>
                  <Th>Project</Th>
                  <Th>Status</Th>
                  <Th numeric>Steps</Th>
                  <Th>Live model</Th>
                  <Th numeric>Duration</Th>
                  <Th numeric>Tokens</Th>
                  <Th numeric>Cost</Th>
                  <Th>Answer check</Th>
                  <Th>Started</Th>
                </Tr>
              </THead>
              <TBody>
                {runs.map((r) => {
                  const live = r.steps.filter((s) => s.mode === "llm").length;
                  const modelSteps = r.steps.filter((s) => s.mode !== "code").length;
                  const tokens = r.usage.inputTokens + r.usage.outputTokens;
                  return (
                    <Tr key={r.id}>
                      <Td className="min-w-56 max-w-sm">
                        <Link href={`/runs/${r.id}`} className="group block min-w-0">
                          <span className="block text-xs text-muted">
                            {workflowLabel(r.workflow)} <span aria-hidden>/</span> {r.trigger}
                          </span>
                          <span className="block break-words font-medium group-hover:text-accent group-hover:underline">{r.title}</span>
                        </Link>
                      </Td>
                      <Td>{r.projectName ?? <span className="text-muted">Portfolio</span>}</Td>
                      <Td>
                        <Badge tone={RUN_STATUS_TONE[r.status]} dot>
                          {r.status === "succeeded" ? "Succeeded" : r.status === "failed" ? "Failed" : "Running"}
                        </Badge>
                      </Td>
                      <Td numeric>{r.steps.length}</Td>
                      <Td className="whitespace-nowrap">
                        {modelSteps === 0 ? (
                          <span className="text-muted">No model steps</span>
                        ) : (
                          <span title={`${live} of ${modelSteps} model steps ran live, the rest used the deterministic fallback`}>
                            {live} live, {modelSteps - live} fallback
                          </span>
                        )}
                      </Td>
                      <Td numeric>{formatDuration(runDurationMs(r))}</Td>
                      <Td numeric>{tokens > 0 ? tokens.toLocaleString("en-GB") : "-"}</Td>
                      <Td numeric>{formatCost(r.usage.costUsd)}</Td>
                      <Td>{r.grounding ? <GroundingBadge grounding={r.grounding} /> : <span className="text-muted">-</span>}</Td>
                      <Td muted className="whitespace-nowrap">
                        <RelativeTime iso={r.startedAt} />
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        )}

        <AgentCatalog />
      </div>
    </>
  );
}
