import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { Avatar, Callout, Card, CardBody, EmptyState, RelativeTime, Tabs } from "@/components/ui";
import { ActivityHeat } from "@/components/charts";
import { AccessError } from "@/lib/auth/access";
import { requireActor } from "@/lib/auth/current";
import { getTeamInsights } from "@/lib/services/queries";
import type { ContributionStats } from "@/lib/types";

const WINDOWS = [7, 14, 30];

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-semibold leading-tight tabular-nums">{value}</dd>
      {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

function PersonCard({ c, windowDays }: { c: ContributionStats; windowDays: number }) {
  return (
    <Card as="article" className="min-w-0" aria-labelledby={`p-${c.personId}`}>
      <CardBody className="space-y-4">
        <div className="flex items-start gap-3">
          <Avatar name={c.name} size="lg" />
          <div className="min-w-0">
            <h3 id={`p-${c.personId}`} className="truncate text-sm font-semibold">
              {c.name}
            </h3>
            <p className="truncate text-[13px] text-muted">{c.projectRole}</p>
            {c.areas.length > 0 ? <p className="mt-0.5 truncate text-xs text-muted">Areas: {c.areas.join(", ")}</p> : null}
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-x-3 gap-y-3">
          <Metric label="Commits" value={c.commits} />
          <Metric label="Pull requests" value={c.pullRequests} />
          <Metric label="Reviews" value={c.reviews} />
          <Metric label="Tickets closed" value={c.ticketsClosed} />
          <Metric label="In progress" value={c.ticketsInProgress} />
          <Metric label="Active days" value={`${c.activeDays}/${windowDays}`} />
        </dl>

        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3">
          <div className="min-w-0">
            <p className="mb-1 text-xs text-muted">Daily activity, oldest to newest</p>
            <ActivityHeat data={c.activity} title={`${c.name}: daily activity over ${windowDays} days`} />
          </div>
          <div className="text-right text-xs text-muted">
            <p>
              Answers questions in{" "}
              <span className="font-medium text-fg">{c.medianResponseHours != null ? `${c.medianResponseHours < 1 ? "under 1" : Math.round(c.medianResponseHours)}h` : "no data yet"}</span>
            </p>
            <p>
              Last active <RelativeTime iso={c.lastActiveAt} empty="not in this period" />
            </p>
          </div>
        </div>

        {c.highlights.length > 0 ? (
          <div>
            <h4 className="mb-1 text-xs font-semibold text-muted">Highlights</h4>
            <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
              {c.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

export default async function TeamPage({ params, searchParams }: PageProps<"/projects/[id]/team">) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requireActor();
  const raw = Number(Array.isArray(sp.days) ? sp.days[0] : sp.days);
  const days = WINDOWS.includes(raw) ? raw : 14;

  let data;
  try {
    data = await getTeamInsights(actor, id, days);
  } catch (error) {
    if (error instanceof AccessError) notFound();
    throw error;
  }
  const { contributions, enabled, windowDays } = data;
  const sorted = [...contributions].sort((a, b) => b.activeDays - a.activeDays || b.commits + b.pullRequests + b.reviews - (a.commits + a.pullRequests + a.reviews));

  return (
    <div className="space-y-5">
      <Callout tone="info" title="Activity signals, not a performance rating">
        <span>
          These numbers show what each person has been visibly working on, so you know who to talk to. They miss design, pairing, support and unblocking others, so use them to start a conversation, never to rank people.
        </span>
      </Callout>

      {!enabled ? (
        <EmptyState
          icon={<Users size={20} />}
          title="Contribution insights are switched off for this project"
          description="Turn them on in the project settings to see per-person activity."
          action={
            <Link href={`/projects/${id}/settings`} className="text-[13px] font-medium text-accent hover:underline">
              Open project settings
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted">Last {windowDays} days</p>
            <Tabs param="days" label="Time window" defaultValue="14" className="max-w-full" items={WINDOWS.map((d) => ({ label: `${d} days`, value: String(d) }))} />
          </div>
          {sorted.length === 0 ? (
            <EmptyState icon={<Users size={20} />} title="No one on the team yet" description="Add team members in the project settings to see their activity here." />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sorted.map((c) => (
                <PersonCard key={c.personId} c={c} windowDays={windowDays} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
