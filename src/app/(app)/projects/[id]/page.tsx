import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, CheckCircle2, Circle, CircleDot, MessageCircleQuestion, TriangleAlert } from "lucide-react";
import { AvatarStack, Badge, Card, CardBody, CardHeader, EmptyState, LinkButton, RelativeTime, toneDot, toneText, type Tone } from "@/components/ui";
import { BarChart, ProgressBar } from "@/components/charts";
import { DeployBadge, IncidentStatusBadge, PaceBadge, PriorityBadge, SeverityBadge, TicketStatusBadge } from "@/components/domain";
import { DemoControls } from "@/components/features/demo-controls";
import { AccessError } from "@/lib/auth/access";
import { requireActor } from "@/lib/auth/current";
import { formatDate, shortDate } from "@/lib/format";
import { getProjectOverview } from "@/lib/services/queries";
import { SCENARIOS } from "@/lib/services/commands";
import type { Milestone } from "@/lib/types";

const milestoneMeta: Record<Milestone["status"], { label: string; tone: Tone; icon: typeof Circle }> = {
  done: { label: "Done", tone: "success", icon: CheckCircle2 },
  in_progress: { label: "In progress", tone: "info", icon: CircleDot },
  at_risk: { label: "At risk", tone: "warning", icon: TriangleAlert },
  planned: { label: "Planned", tone: "neutral", icon: Circle },
};

const healthTone = { green: "success", amber: "warning", red: "danger" } as const;

export default async function ProjectOverviewPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const actor = await requireActor();
  let o;
  try {
    o = await getProjectOverview(actor, id);
  } catch (error) {
    if (error instanceof AccessError) notFound();
    throw error;
  }
  const { project, snapshot, team, latestDigest, openIncidents, openThreads } = o;
  const { pace } = snapshot;
  const milestones = [...project.milestones].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const weeks = pace.weeklyThroughput.map((value, i) => ({ label: i === pace.weeklyThroughput.length - 1 ? "This week" : `${pace.weeklyThroughput.length - 1 - i}w ago`, value }));
  const slip = Math.round(pace.slipDays);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card as="section" className="min-w-0 lg:col-span-2" aria-labelledby="health-title">
          <CardHeader title={<span id="health-title">Where this project stands</span>} />
          <CardBody className="space-y-4">
            <p className="text-sm leading-relaxed">{snapshot.headline}</p>
            {snapshot.healthReasons.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Why it is rated this way</p>
                <ul className="space-y-1.5">
                  {snapshot.healthReasons.map((r) => (
                    <li key={r} className="flex items-start gap-2 text-[13px]">
                      <span aria-hidden className={`mt-1.5 size-1.5 shrink-0 rounded-full ${toneDot[healthTone[snapshot.health]]}`} />
                      <span className="min-w-0">{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[13px] text-muted">No concerns were found.</p>
            )}
            <p className="text-xs text-muted">
              Updated <RelativeTime iso={snapshot.updatedAt} />
            </p>
          </CardBody>
        </Card>

        <Card as="section" className="min-w-0" aria-labelledby="deploy-title">
          <CardHeader title={<span id="deploy-title">Deployments</span>} />
          {snapshot.deploy.length === 0 ? (
            <CardBody>
              <p className="text-[13px] text-muted">No environments are tracked. Add a deployment target in settings.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {snapshot.deploy.map((d) => (
                <li key={d.environment} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium capitalize">{d.environment}</p>
                    <p className="text-xs text-muted">
                      {d.version ? <span className="font-mono">{d.version}</span> : "No version"}
                      {d.at ? (
                        <>
                          {" · "}
                          <RelativeTime iso={d.at} />
                        </>
                      ) : null}
                    </p>
                  </div>
                  <DeployBadge status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card as="section" className="min-w-0 lg:col-span-2" aria-labelledby="pace-title">
          <CardHeader title={<span id="pace-title">Progress and pace</span>} actions={<PaceBadge status={pace.status} />} />
          <CardBody className="space-y-5">
            <div>
              <ProgressBar value={pace.progressPct} marker={pace.timeElapsedPct} tone="auto" label="Scope done" showValue />
              <p className="mt-1.5 text-xs text-muted">
                {Math.round(pace.progressPct)}% of scope done. The marker shows {Math.round(pace.timeElapsedPct)}% of the schedule used.
              </p>
            </div>
            <p className="text-[13px] leading-relaxed">{pace.explanation}</p>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">Target date</dt>
                <dd className="text-[13px] font-medium">{formatDate(project.targetDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Projected finish</dt>
                <dd className="text-[13px] font-medium">{pace.projectedCompletion ? formatDate(pace.projectedCompletion) : "Not enough data"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Schedule</dt>
                <dd className={`text-[13px] font-medium ${slip > 0 ? toneText.danger : slip < 0 ? toneText.success : ""}`}>{slip > 0 ? `${slip} day${slip === 1 ? "" : "s"} late` : slip < 0 ? `${-slip} day${slip === -1 ? "" : "s"} early` : "On the date"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Tickets</dt>
                <dd className="text-[13px] font-medium tabular-nums">
                  {pace.doneTickets} done · {pace.openTickets} open
                  {pace.blockedTickets > 0 ? ` · ${pace.blockedTickets} blocked` : ""}
                </dd>
              </div>
            </dl>
            <div>
              <p className="mb-1 text-xs font-medium text-muted">
                Tickets closed per week (average {pace.velocity.toFixed(1)}, {pace.velocityTrendPct > 0 ? "+" : ""}
                {Math.round(pace.velocityTrendPct)}% vs the four weeks before)
              </p>
              {weeks.length > 0 ? <BarChart data={weeks} title="Tickets closed per week" highlightLast height={140} /> : <p className="text-[13px] text-muted">No throughput data yet.</p>}
            </div>
          </CardBody>
        </Card>

        <Card as="section" className="min-w-0" aria-labelledby="ms-title">
          <CardHeader title={<span id="ms-title">Milestones</span>} />
          {milestones.length === 0 ? (
            <CardBody>
              <p className="text-[13px] text-muted">No milestones yet. Add them in project settings.</p>
            </CardBody>
          ) : (
            <ol className="space-y-0 px-4 py-3">
              {milestones.map((m, i) => {
                const meta = milestoneMeta[m.status];
                const Icon = meta.icon;
                return (
                  <li key={m.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < milestones.length - 1 ? <span aria-hidden className="absolute left-[7px] top-5 h-[calc(100%-12px)] w-px bg-line" /> : null}
                    <Icon size={16} aria-hidden className={`relative z-10 mt-0.5 shrink-0 bg-surface ${toneText[meta.tone]}`} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">{m.name}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span className={toneText[meta.tone]}>{meta.label}</span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock size={12} aria-hidden /> {shortDate(m.dueDate)}
                        </span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card as="section" className="min-w-0" aria-labelledby="updates-title">
          <CardHeader title={<span id="updates-title">Latest key updates</span>} />
          {snapshot.keyUpdates.length === 0 ? (
            <CardBody>
              <p className="text-[13px] text-muted">Nothing notable has happened recently.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {snapshot.keyUpdates.map((u, i) => (
                <li key={i} className="px-4 py-2.5 text-[13px]">
                  {u.text}
                  {u.citation ? (
                    <span className="ml-1.5 text-xs text-muted">
                      {u.citation.url ? (
                        <a href={u.citation.url} target="_blank" rel="noreferrer" className="hover:underline">
                          source
                        </a>
                      ) : (
                        <Link href={`/projects/${id}/activity`} className="hover:underline">
                          source
                        </Link>
                      )}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card as="section" className="min-w-0" aria-labelledby="todos-title">
          <CardHeader title={<span id="todos-title">Most important next</span>} actions={<LinkButton href={`/projects/${id}/tickets`} variant="ghost" size="sm">All tickets</LinkButton>} />
          {snapshot.topTodos.length === 0 ? (
            <CardBody>
              <p className="text-[13px] text-muted">No open tickets need a push right now.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {snapshot.topTodos.map((t) => (
                <li key={t.ticketId} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-xs text-muted">{t.key}</span>
                    <PriorityBadge priority={t.priority} />
                    <TicketStatusBadge status={t.status} />
                  </div>
                  <p className="mt-1 text-[13px] font-medium">{t.title}</p>
                  <p className="text-xs text-muted">
                    {t.assigneeName ? `${t.assigneeName}. ` : "Unassigned. "}
                    {t.reason}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card as="section" className="min-w-0" aria-labelledby="inc-title">
          <CardHeader title={<span id="inc-title">Open incidents</span>} />
          {openIncidents.length === 0 ? (
            <CardBody>
              <p className="text-[13px] text-muted">No open incidents.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {openIncidents.map((i) => (
                <li key={i.id}>
                  <Link href={`/projects/${id}/incidents/${i.id}`} className="block px-4 py-3 hover:bg-surface-2/70">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted">{i.key}</span>
                      <SeverityBadge severity={i.severity} />
                      <IncidentStatusBadge status={i.status} />
                    </div>
                    <p className="mt-1 text-[13px] font-medium">{i.title}</p>
                    <p className="text-xs text-muted">
                      Detected <RelativeTime iso={i.detectedAt} />
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card as="section" className="min-w-0" aria-labelledby="q-title">
          <CardHeader title={<span id="q-title">Open team questions</span>} />
          {openThreads.length === 0 ? (
            <CardBody>
              <p className="text-[13px] text-muted">No questions are waiting on the team.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {openThreads.map((t) => (
                <li key={t.id}>
                  <Link href={`/inbox/${t.id}`} className="flex items-start gap-2.5 px-4 py-3 hover:bg-surface-2/70">
                    <MessageCircleQuestion size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">{t.subject}</span>
                      <span className="text-xs text-muted">
                        {t.status === "answered" ? "Answered" : "Waiting for an answer"} · <RelativeTime iso={t.updatedAt} />
                      </span>
                    </span>
                    {t.unreadForWatchers ? <Badge tone="accent">New answer</Badge> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card as="section" className="min-w-0" aria-labelledby="daily-title">
          <CardHeader title={<span id="daily-title">Latest daily sync</span>} actions={<LinkButton href={`/projects/${id}/daily`} variant="ghost" size="sm">Open daily sync</LinkButton>} />
          <CardBody>
            {latestDigest ? (
              <div className="space-y-1">
                <p className="text-xs text-muted">{formatDate(latestDigest.date)}</p>
                <p className="text-sm font-medium leading-snug">{latestDigest.headline}</p>
              </div>
            ) : (
              <EmptyState title="No daily sync yet" description="Generate one to get a short summary of what changed." action={<LinkButton href={`/projects/${id}/daily`} variant="secondary" size="sm">Go to daily sync</LinkButton>} />
            )}
          </CardBody>
        </Card>

        <Card as="section" className="min-w-0" aria-labelledby="team-title">
          <CardHeader title={<span id="team-title">Team</span>} actions={<LinkButton href={`/projects/${id}/team`} variant="ghost" size="sm">Contributions</LinkButton>} />
          <CardBody>
            {team.length === 0 ? (
              <p className="text-[13px] text-muted">No one is assigned yet.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <AvatarStack people={team} max={8} />
                <p className="min-w-0 text-[13px] text-muted">{team.map((m) => m.name).join(", ")}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <DemoControls projectId={id} scenarios={SCENARIOS.map(({ id: sid, label, description }) => ({ id: sid, label, description }))} />
    </div>
  );
}
