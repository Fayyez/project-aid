import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, FileText } from "lucide-react";
import { Badge, Callout, Card, CardBody, CardHeader, EmptyState, RelativeTime } from "@/components/ui";
import { ChangeTypeBadge, CitationList, Markdown } from "@/components/domain";
import { FeedbackButtons } from "@/components/features/feedback-buttons";
import { DailySyncButton } from "@/components/features/project/daily-sync-button";
import { AccessError } from "@/lib/auth/access";
import { requireActor } from "@/lib/auth/current";
import { formatDate } from "@/lib/format";
import { listDigests } from "@/lib/services/queries";
import type { Citation, DailyDigest } from "@/lib/types";

function MarkdownList({ title, items, citations, empty }: { title: string; items: string[]; citations: Citation[]; empty: string }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-[13px] text-muted">{empty}</p>
      ) : (
        <ul className="list-disc space-y-1.5 pl-5 text-[13px] marker:text-subtle">
          {items.map((item, i) => (
            <li key={i}>
              <Markdown content={item} citations={citations} className="text-[13px] [&>p]:m-0" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function hrefFor(projectId: string) {
  return (c: Citation) => (c.type === "incident" ? `/projects/${projectId}/incidents/${c.id}` : c.type === "thread" ? `/inbox/${c.id}` : undefined);
}

export default async function DailyPage({ params, searchParams }: PageProps<"/projects/[id]/daily">) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requireActor();
  let data;
  try {
    data = await listDigests(actor, id);
  } catch (error) {
    if (error instanceof AccessError) notFound();
    throw error;
  }
  const { project, digests, team } = data;
  const wanted = typeof sp.date === "string" ? sp.date : undefined;
  const digest: DailyDigest | undefined = (wanted ? digests.find((d) => d.date === wanted) : undefined) ?? digests[0];
  const earlier = digests.filter((d) => d.id !== digest?.id);
  const nameOf = new Map(team.map((m) => [m.id, m.name]));
  const isLatest = digest && digest.id === digests[0]?.id;

  return (
    <div className="space-y-6">
      <Card as="section">
        <CardBody className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <h2 className="text-sm font-semibold">Daily sync</h2>
            <p className="mt-1 text-[13px] text-muted">A short, sourced summary of what changed, what is risky and what comes next. Every statement links to the activity behind it.</p>
          </div>
          {project.features.dailySync ? (
            <DailySyncButton projectId={id} hasDigest={digests.length > 0} />
          ) : (
            <Callout tone="info" title="Daily sync is switched off for this project" className="max-w-md">
              Turn it on in <Link className="font-medium underline" href={`/projects/${id}/settings`}>project settings</Link> to generate summaries.
            </Callout>
          )}
        </CardBody>
      </Card>

      {!digest ? (
        <EmptyState icon={<FileText size={20} />} title="No daily sync yet" description={project.features.dailySync ? "Generate today's sync to see a summary of recent activity, risks and what is next." : "Daily sync is switched off, so no summaries have been written."} />
      ) : (
        <Card as="article" aria-labelledby="digest-title">
          <CardHeader
            title={<span id="digest-title">{digest.headline}</span>}
            description={
              <span className="inline-flex flex-wrap items-center gap-x-2">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays size={13} aria-hidden /> {formatDate(digest.date)}
                </span>
                <span>·</span>
                <span>
                  Written <RelativeTime iso={digest.createdAt} />
                </span>
                {!isLatest ? <Badge tone="neutral">Earlier sync</Badge> : null}
              </span>
            }
            actions={
              <>
                {digest.runId ? (
                  <Link href={`/runs/${digest.runId}`} className="text-xs text-muted hover:text-fg hover:underline">
                    How it was written
                  </Link>
                ) : null}
                <FeedbackButtons target={{ type: "digest", id: digest.id }} projectId={id} runId={digest.runId} size="sm" />
              </>
            }
          />
          <CardBody className="space-y-6">
            <Markdown content={digest.summary} citations={digest.citations} />

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Changes", digest.stats.events],
                ["Commits", digest.stats.commits],
                ["Tickets closed", digest.stats.ticketsClosed],
                ["Tickets opened", digest.stats.ticketsOpened],
                ["Deployments", digest.stats.deployments],
                ["Contributors", digest.stats.contributors],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md bg-surface-2 px-3 py-2">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <MarkdownList title="Highlights" items={digest.highlights} citations={digest.citations} empty="No highlights for this day." />
              <MarkdownList title="Risks" items={digest.risks} citations={digest.citations} empty="No new risks spotted." />
              <MarkdownList title="Next up" items={digest.nextUp} citations={digest.citations} empty="Nothing queued." />
            </div>

            {digest.cards.length > 0 ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Release notes</h3>
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {digest.cards.map((card) => {
                    const names = card.contributorIds.map((cid) => nameOf.get(cid)).filter((n): n is string => Boolean(n));
                    return (
                      <li key={card.id} className="min-w-0 rounded-lg border border-line bg-surface-2/50 p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <ChangeTypeBadge type={card.changeType} />
                          <Badge tone={card.audience === "client" ? "accent" : "neutral"}>{card.audience === "client" ? "For the client" : "Internal"}</Badge>
                        </div>
                        <p className="mt-2 text-[13px] font-semibold">{card.title}</p>
                        <p className="mt-1 text-[13px] text-muted">{card.summary}</p>
                        {names.length > 0 ? <p className="mt-2 text-xs text-muted">By {names.join(", ")}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {digest.citations.length > 0 ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Sources</h3>
                <CitationList citations={digest.citations} hrefFor={hrefFor(id)} />
              </section>
            ) : null}
          </CardBody>
        </Card>
      )}

      <details className="group rounded-lg border border-line bg-surface shadow-card" open={Boolean(wanted && earlier.length > 0 && !isLatest)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <span>Earlier syncs ({earlier.length})</span>
          <span aria-hidden className="text-xs font-normal text-muted group-open:hidden">Show</span>
          <span aria-hidden className="hidden text-xs font-normal text-muted group-open:inline">Hide</span>
        </summary>
        {earlier.length === 0 ? (
          <p className="border-t border-line px-4 py-3 text-[13px] text-muted">There are no earlier syncs.</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {earlier.map((d) => (
              <li key={d.id}>
                <Link href={`/projects/${id}/daily?date=${d.date}`} className="flex min-w-0 flex-wrap items-baseline gap-x-3 px-4 py-2.5 hover:bg-surface-2/70">
                  <span className="w-24 shrink-0 text-xs font-medium tabular-nums text-muted">{formatDate(d.date)}</span>
                  <span className="min-w-0 flex-1 text-[13px]">{d.headline}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
