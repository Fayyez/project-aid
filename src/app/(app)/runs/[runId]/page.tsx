import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RunTrace, formatDuration, runDurationMs } from "@/components/features/run-trace";
import { Badge, Callout, Card, CardBody, CardHeader, PageHeader, RelativeTime } from "@/components/ui";
import { AccessError } from "@/lib/auth/access";
import { requireActor } from "@/lib/auth/current";
import { getRun } from "@/lib/services/queries";
import { RUN_STATUS_TONE, workflowLabel } from "@/components/features/runs/labels";

export const metadata: Metadata = { title: "Agent run" };

export default async function RunPage({ params }: PageProps<"/runs/[runId]">) {
  const actor = await requireActor();
  const { runId } = await params;
  let run: Awaited<ReturnType<typeof getRun>>;
  try {
    run = await getRun(actor, runId);
  } catch (error) {
    if (error instanceof AccessError) notFound();
    throw error;
  }
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Agent runs", href: "/runs" }, { label: workflowLabel(run.workflow) }]}
        title={run.title}
        description={
          <>
            {workflowLabel(run.workflow)}
            {run.projectName ? (
              <>
                {" "}
                on{" "}
                <Link href={`/projects/${run.projectId}`} className="text-accent hover:underline">
                  {run.projectName}
                </Link>
              </>
            ) : null}
            , started <RelativeTime iso={run.startedAt} />, took {formatDuration(runDurationMs(run))}.
          </>
        }
        meta={
          <>
            <Badge tone={RUN_STATUS_TONE[run.status]} dot>
              {run.status === "succeeded" ? "Succeeded" : run.status === "failed" ? "Failed" : "Running"}
            </Badge>
            <Badge tone="neutral">Trigger: {run.trigger}</Badge>
          </>
        }
      />
      <div className="space-y-6">
        <Callout tone="info" title="How to read this page">
          This is the full record of how an answer or document was produced: which agents ran, on which model, what they received and what they returned. Steps with a dashed outline ran side by side.
        </Callout>
        <Card as="section">
          <CardHeader title="Steps" as="h2" />
          <CardBody>
            <RunTrace run={run} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
