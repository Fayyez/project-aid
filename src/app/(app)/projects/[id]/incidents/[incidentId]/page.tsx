import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, FileText, GitCommitHorizontal, MessageSquare, X } from "lucide-react";
import { CitationList, DeployBadge, IncidentStatusBadge, Markdown, PersonChip, SeverityBadge } from "@/components/domain";
import { ProgressBar } from "@/components/charts";
import { FixDecision, ResolveForm } from "@/components/features/incidents/incident-actions";
import { RunTrace } from "@/components/features/run-trace";
import { Badge, Card, CardBody, CardHeader, PageHeader, RelativeTime, cn } from "@/components/ui";
import { AccessError } from "@/lib/auth/access";
import { requireActor } from "@/lib/auth/current";
import { formatDateTime } from "@/lib/format";
import { getIncident } from "@/lib/services/queries";
import type { Citation, FixReview } from "@/lib/types";

export const metadata: Metadata = { title: "Incident" };

const FIX_KIND = { patch: "Code patch", revert: "Revert a change", config: "Configuration change", runbook: "Manual runbook" } as const;
const FIX_STATUS = { proposed: "Awaiting your decision", approved: "Approved", rejected: "Rejected", applied: "Applied" } as const;
const FIX_TONE = { proposed: "accent", approved: "success", rejected: "danger", applied: "success" } as const;
const RISK_TONE = { low: "success", medium: "warning", high: "danger" } as const;
const VERDICT = { approve: "Approved", revise: "Needs changes", reject: "Rejected" } as const;
const VERDICT_TONE = { approve: "success", revise: "warning", reject: "danger" } as const;

function citationHref(c: Citation, projectId: string): string | undefined {
  const pid = c.projectId ?? projectId;
  if (c.type === "event") return `/projects/${pid}/activity?q=${encodeURIComponent(c.title)}`;
  if (c.type === "incident") return `/projects/${pid}/incidents/${c.id}`;
  if (c.type === "report") return `/projects/${pid}/reports/${c.id}`;
  if (c.type === "thread") return `/inbox/${c.id}`;
  return undefined;
}

function Review({ review }: { review: FixReview }) {
  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-[13px] font-semibold">Review round {review.round}</h4>
        <span className="text-xs text-muted">by {review.reviewer}</span>
        <Badge tone={VERDICT_TONE[review.verdict]} icon={review.verdict === "approve" ? <Check /> : <X />}>
          {VERDICT[review.verdict]}
        </Badge>
      </div>
      {review.concerns.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px]">
          {review.concerns.map((c, i) => (
            <li key={i} className="break-words">
              {c}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-muted">No concerns raised.</p>
      )}
      {review.checks.length > 0 ? (
        <ul className="mt-2 space-y-1.5" aria-label="Checks">
          {review.checks.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px]">
              {c.passed ? <Check size={14} aria-label="Passed" className="mt-0.5 shrink-0 text-success" /> : <X size={14} aria-label="Failed" className="mt-0.5 shrink-0 text-danger" />}
              <span className="min-w-0">
                <span className="font-medium">{c.name}</span>
                <span className="text-muted"> - {c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default async function IncidentPage({ params }: PageProps<"/projects/[id]/incidents/[incidentId]">) {
  const actor = await requireActor();
  const { id, incidentId } = await params;
  let detail: Awaited<ReturnType<typeof getIncident>>;
  try {
    detail = await getIncident(actor, incidentId);
  } catch (error) {
    if (error instanceof AccessError) notFound();
    throw error;
  }
  const { incident, project, deployment, suspectEvents, owner, thread, report, run } = detail;
  if (project.id !== id) notFound();
  const { triage, fix } = incident;
  const resolved = incident.status === "resolved";

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        breadcrumbs={[{ label: "Incidents", href: `/projects/${project.id}/incidents` }, { label: incident.key }]}
        title={
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-base text-muted">{incident.key}</span>
            <span className="min-w-0 break-words">{incident.title}</span>
          </span>
        }
        meta={
          <>
            <SeverityBadge severity={incident.severity} />
            <IncidentStatusBadge status={incident.status} />
            <span className="text-xs text-muted">
              Detected <RelativeTime iso={incident.detectedAt} />
              {incident.resolvedAt ? (
                <>
                  , resolved <RelativeTime iso={incident.resolvedAt} />
                </>
              ) : null}
            </span>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Card as="section">
            <CardHeader title="What happened" as="h2" />
            <CardBody className="space-y-3 text-sm">
              <p className="break-words">{incident.trigger.detail}</p>
              {deployment ? (
                <div className="space-y-2 rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-medium capitalize">{deployment.environment} deployment</span>
                    <DeployBadge status={deployment.status} />
                    {deployment.version ? <span className="font-mono text-xs text-muted">{deployment.version}</span> : null}
                    {deployment.commitSha ? <span className="font-mono text-xs text-muted">{deployment.commitSha.slice(0, 7)}</span> : null}
                    <span className="text-xs text-muted">
                      <RelativeTime iso={deployment.startedAt} />
                    </span>
                  </div>
                  {deployment.logExcerpt ? (
                    <pre tabIndex={0} aria-label="Deployment log excerpt" className="max-h-64 overflow-auto whitespace-pre rounded-md border border-line bg-surface-2 p-3 font-mono text-xs leading-relaxed">
                      {deployment.logExcerpt}
                    </pre>
                  ) : (
                    <p className="text-[13px] text-muted">No log excerpt was kept for this deployment.</p>
                  )}
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card as="section">
            <CardHeader title="Assessment" as="h2" />
            <CardBody className="space-y-5">
              {!triage ? (
                <p className="text-[13px] text-muted">{incident.status === "detected" || incident.status === "triaging" ? "The agents are still working on a first assessment. Refresh this page in a moment." : "No assessment was written for this incident."}</p>
              ) : (
                <>
                  <div className="space-y-3">
                    <Markdown content={triage.summary} citations={triage.evidence} />
                    <div>
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Suspected cause</h3>
                      <Markdown content={triage.suspectedCause} citations={triage.evidence} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="max-w-xs">
                      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">How sure are we</h3>
                      <ProgressBar value={Math.round(triage.confidence * 100)} tone={triage.confidence >= 0.7 ? "success" : triage.confidence >= 0.4 ? "warning" : "danger"} label="Confidence in the suspected cause" showValue />
                      <p className="mt-1 text-xs text-muted">{triage.confidence >= 0.7 ? "High confidence" : triage.confidence >= 0.4 ? "Medium confidence, worth confirming with the owner" : "Low confidence, treat as a lead only"}</p>
                    </div>
                    <div>
                      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Impact</h3>
                      <p className="break-words text-sm">{triage.impact}</p>
                    </div>
                  </div>
                  {triage.nextSteps.length > 0 ? (
                    <div>
                      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Next steps</h3>
                      <ol className="list-decimal space-y-1 pl-5 text-sm">
                        {triage.nextSteps.map((s, i) => (
                          <li key={i} className="break-words">
                            {s}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                  {suspectEvents.length > 0 ? (
                    <div>
                      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Suspect changes</h3>
                      <ul className="space-y-2">
                        {suspectEvents.map((e) => (
                          <li key={e.id} className="flex min-w-0 items-start gap-2 text-[13px]">
                            <GitCommitHorizontal size={15} aria-hidden className="mt-0.5 shrink-0 text-muted" />
                            <span className="min-w-0">
                              <Link href={`/projects/${project.id}/activity?q=${encodeURIComponent(e.title)}`} className="break-words font-medium hover:text-accent hover:underline">
                                {e.title}
                              </Link>
                              <span className="block text-xs text-muted">
                                {e.actorName ?? "Unknown author"}, <RelativeTime iso={e.occurredAt} />
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {triage.evidence.length > 0 ? (
                    <div>
                      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Evidence</h3>
                      <CitationList citations={triage.evidence} hrefFor={(c) => citationHref(c, project.id)} />
                    </div>
                  ) : null}
                </>
              )}
            </CardBody>
          </Card>

          <Card as="section">
            <CardHeader title="Proposed fix" as="h2" actions={fix ? <Badge tone={FIX_TONE[fix.status]}>{FIX_STATUS[fix.status]}</Badge> : undefined} />
            <CardBody className="space-y-5">
              {!fix ? (
                <p className="text-[13px] text-muted">No fix has been proposed yet.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{FIX_KIND[fix.kind]}</Badge>
                    <Badge tone={RISK_TONE[fix.risk]}>Risk: {fix.risk}</Badge>
                    <span className="text-xs text-muted">Revision {fix.revision}</span>
                    {fix.decidedAt ? (
                      <span className="text-xs text-muted">
                        Decided <RelativeTime iso={fix.decidedAt} />
                      </span>
                    ) : null}
                  </div>
                  <p className="break-words text-sm">{fix.summary}</p>
                  {fix.steps.length > 0 ? (
                    <div>
                      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Steps</h3>
                      <ol className="list-decimal space-y-1 pl-5 text-sm">
                        {fix.steps.map((s, i) => (
                          <li key={i} className="break-words">
                            {s}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                  {fix.patch ? (
                    <div>
                      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Patch{fix.targetRepo ? ` for ${fix.targetRepo}` : ""}</h3>
                      <pre tabIndex={0} aria-label="Proposed patch" className="max-h-80 overflow-auto rounded-md border border-line bg-surface-2 p-3 font-mono text-xs leading-relaxed">
                        {fix.patch}
                      </pre>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Rollback plan</h3>
                      <p className="break-words text-sm">{fix.rollbackPlan}</p>
                    </div>
                    <div>
                      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Test plan</h3>
                      <ul className="list-disc space-y-1 pl-5 text-sm">
                        {fix.testPlan.map((t, i) => (
                          <li key={i} className="break-words">
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {fix.prUrl ? (
                    <p className="text-[13px]">
                      <a href={fix.prUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                        Open the pull request
                      </a>
                    </p>
                  ) : null}
                  {incident.reviews.length > 0 ? (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">Internal review before it reached you</h3>
                      <ol className="space-y-2">
                        {[...incident.reviews]
                          .sort((a, b) => a.round - b.round)
                          .map((r) => (
                            <Review key={r.round} review={r} />
                          ))}
                      </ol>
                    </div>
                  ) : null}
                  {fix.status === "proposed" ? <FixDecision incidentId={incident.id} /> : null}
                </>
              )}
            </CardBody>
          </Card>

          {!resolved ? (
            <Card as="section">
              <CardHeader title="Close this incident" as="h2" />
              <CardBody>
                <ResolveForm incidentId={incident.id} />
              </CardBody>
            </Card>
          ) : null}

          {run ? (
            <Card as="section">
              <CardHeader title="How the agents handled this" as="h2" description="Every step the agents took, in order." />
              <CardBody>
                <RunTrace run={run} compact />
              </CardBody>
            </Card>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Incident context">
          <Card as="section">
            <CardHeader title="People" as="h2" />
            <CardBody className="space-y-3 text-[13px]">
              {incident.escalation ? (
                <>
                  <p className="text-muted">Escalated to</p>
                  {owner ? <PersonChip name={owner.name} subtitle={owner.title} /> : null}
                  <p className="break-words">{incident.escalation.reason}</p>
                  {thread ? (
                    <Link href={`/inbox/${thread.id}`} className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline">
                      <MessageSquare size={14} aria-hidden /> Open the conversation
                    </Link>
                  ) : null}
                </>
              ) : owner ? (
                <>
                  <p className="text-muted">Most likely owner</p>
                  <PersonChip name={owner.name} subtitle={owner.title} />
                </>
              ) : (
                <p className="text-muted">Nobody has been asked yet.</p>
              )}
            </CardBody>
          </Card>

          {report ? (
            <Card as="section">
              <CardHeader title="Incident report" as="h2" />
              <CardBody>
                <Link href={`/projects/${project.id}/reports/${report.id}`} className="flex min-w-0 items-start gap-2 text-[13px] font-medium text-accent hover:underline">
                  <FileText size={15} aria-hidden className="mt-0.5 shrink-0" />
                  <span className="min-w-0 break-words">{report.title}</span>
                </Link>
              </CardBody>
            </Card>
          ) : null}

          <Card as="section">
            <CardHeader title="Timeline" as="h2" />
            <CardBody>
              {incident.timeline.length === 0 ? (
                <p className="text-[13px] text-muted">Nothing has been recorded yet.</p>
              ) : (
                <ol className="relative space-y-4 border-l border-line pl-4">
                  {incident.timeline.map((t, i) => (
                    <li key={i} className="relative text-[13px]">
                      <span aria-hidden className={cn("absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-surface", i === incident.timeline.length - 1 ? "bg-accent" : "bg-line-strong")} />
                      <p className="break-words">{t.text}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {t.actor} - <time dateTime={t.at}>{formatDateTime(t.at)}</time>
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>

    </div>
  );
}
