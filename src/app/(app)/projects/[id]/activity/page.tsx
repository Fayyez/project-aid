import { notFound } from "next/navigation";
import { Activity, ExternalLink, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, CardBody, EmptyState, Input, LinkButton, RelativeTime, Select, Tooltip } from "@/components/ui";
import { ChangeTypeBadge, EVENT_KIND_META, EventKindIcon, SOURCE_META, SourceIcon } from "@/components/domain";
import { AskAuthorButton } from "@/components/features/project/ask-author-button";
import { EventToTicketsButton } from "@/components/features/project/event-to-tickets-button";
import { UploadDocument } from "@/components/features/project/upload-document";
import { AccessError } from "@/lib/auth/access";
import { requireActor } from "@/lib/auth/current";
import { listActivity } from "@/lib/services/queries";
import type { EventKind, ProjectEvent } from "@/lib/types";

const DAYS = [7, 14, 30, 90];
const IMPORTANCE = [
  { value: "", label: "Any importance" },
  { value: "3", label: "Normal and up" },
  { value: "4", label: "High and up" },
  { value: "5", label: "Critical only" },
];

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function summarisedBy(e: ProjectEvent): string {
  const s = e.summarizedBy;
  if (s.mode === "llm") return `Summarised by an AI model (${s.model})`;
  if (s.mode === "heuristic") return "Summarised with simple rules, no AI model";
  return "Shown as received, not summarised";
}

function EventItem({ event, projectId, ticketing, team }: { event: ProjectEvent; projectId: string; ticketing: boolean; team: { id: string; name: string }[] }) {
  const redacted = event.tags.includes("secrets-redacted");
  const injection = event.tags.includes("possible-injection");
  const tags = event.tags.filter((t) => t !== "secrets-redacted" && t !== "possible-injection");
  return (
    <li className="min-w-0 px-4 py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex shrink-0 flex-col items-center gap-1.5">
          <EventKindIcon kind={event.kind} size={16} />
          <SourceIcon source={event.source} size={13} className="text-subtle" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {event.url ? (
              <a href={event.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 text-[13px] font-semibold hover:underline">
                <span className="min-w-0">{event.title}</span>
                <ExternalLink size={12} aria-hidden className="shrink-0 text-subtle" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <h3 className="min-w-0 text-[13px] font-semibold">{event.title}</h3>
            )}
            {event.changeType ? <ChangeTypeBadge type={event.changeType} /> : null}
            {event.clarity === "unclear" ? (
              <Tooltip content="This change is significant but the system could not explain it. A question may have been sent to the author.">
                <Badge tone="warning" icon={<ShieldAlert size={12} aria-hidden />} tabIndex={0}>
                  Unclear
                </Badge>
              </Tooltip>
            ) : null}
            {redacted ? (
              <Badge tone="info" icon={<ShieldCheck size={12} aria-hidden />}>
                Secrets removed
              </Badge>
            ) : null}
            {injection ? (
              <Badge tone="danger" icon={<ShieldAlert size={12} aria-hidden />}>
                Possible injected instructions
              </Badge>
            ) : null}
          </div>
          {event.summary ? <p className="text-[13px] text-muted">{event.summary}</p> : null}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="font-medium text-fg">{event.actorName ?? "Unknown author"}</span>
            <span aria-hidden>·</span>
            <RelativeTime iso={event.occurredAt} />
            <span aria-hidden>·</span>
            <span>
              {EVENT_KIND_META[event.kind].label} from {SOURCE_META[event.source].label}
            </span>
            <span aria-hidden>·</span>
            <span title="1 is noise, 5 is critical or client visible">Importance {event.importance}/5</span>
            <Tooltip content={summarisedBy(event)}>
              <span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-2">
                {event.summarizedBy.mode === "llm" ? "AI summary" : event.summarizedBy.mode === "heuristic" ? "Rule-based summary" : "Original text"}
              </span>
            </Tooltip>
          </p>
          {event.areas.length + tags.length + event.refs.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {event.areas.map((a) => (
                <Badge key={`a-${a}`} tone="accent">
                  {a}
                </Badge>
              ))}
              {tags.map((t) => (
                <Badge key={`t-${t}`} tone="neutral">
                  {t}
                </Badge>
              ))}
              {event.refs.map((r) => (
                <span key={`r-${r}`} className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                  {r}
                </span>
              ))}
            </div>
          ) : null}
          {event.actorId || (ticketing && event.kind === "message") ? (
            <div className="-ml-2 flex flex-wrap items-center gap-1">
              {event.actorId ? <AskAuthorButton projectId={projectId} eventTitle={event.title} authorName={event.actorName ?? "the author"} /> : null}
              {ticketing && event.kind === "message" ? <EventToTicketsButton projectId={projectId} text={event.details ?? event.summary} team={team} /> : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default async function ActivityPage({ params, searchParams }: PageProps<"/projects/[id]/activity">) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requireActor();
  const q = first(sp.q).trim();
  const kind = first(sp.kind);
  const person = first(sp.person);
  const importance = first(sp.importance);
  const daysRaw = Number(first(sp.days));
  const days = DAYS.includes(daysRaw) ? daysRaw : 30;
  const validKind = kind in EVENT_KIND_META ? (kind as EventKind) : "";

  let data;
  try {
    data = await listActivity(actor, id, { q: q || undefined, kind: validKind || undefined, personId: person || undefined, days, minImportance: Number(importance) || undefined, limit: 100 });
  } catch (error) {
    if (error instanceof AccessError) notFound();
    throw error;
  }
  const { project, events, total, team } = data;
  const filtered = Boolean(q || validKind || person || importance || days !== 30);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-muted">Everything that changed on this project, from every connected source, with the person behind each change.</p>
        <UploadDocument projectId={id} />
      </div>

      <Card>
        <CardBody>
          <form method="get" role="search" aria-label="Filter activity" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="sm:col-span-2">
              <label htmlFor="f-q" className="mb-1 block text-xs font-medium text-muted">
                Search
              </label>
              <Input id="f-q" name="q" defaultValue={q} placeholder="Words in a title or summary" />
            </div>
            <div>
              <label htmlFor="f-kind" className="mb-1 block text-xs font-medium text-muted">
                Type
              </label>
              <Select id="f-kind" name="kind" defaultValue={validKind}>
                <option value="">All types</option>
                {Object.entries(EVENT_KIND_META).map(([k, m]) => (
                  <option key={k} value={k}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="f-person" className="mb-1 block text-xs font-medium text-muted">
                Person
              </label>
              <Select id="f-person" name="person" defaultValue={person}>
                <option value="">Everyone</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="f-days" className="mb-1 block text-xs font-medium text-muted">
                Period
              </label>
              <Select id="f-days" name="days" defaultValue={String(days)}>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    Last {d} days
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="f-imp" className="mb-1 block text-xs font-medium text-muted">
                Importance
              </label>
              <Select id="f-imp" name="importance" defaultValue={importance}>
                {IMPORTANCE.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-6">
              <Button type="submit" variant="primary" icon={<Search size={14} aria-hidden />}>
                Apply filters
              </Button>
              {filtered ? (
                <LinkButton href={`/projects/${id}/activity`} variant="ghost">
                  Clear filters
                </LinkButton>
              ) : null}
              <span className="ml-auto text-xs text-muted" role="status">
                {total === events.length ? `${total} change${total === 1 ? "" : "s"}` : `Showing ${events.length} of ${total} changes`}
              </span>
            </div>
          </form>
        </CardBody>
      </Card>

      {events.length === 0 ? (
        <EmptyState
          icon={<Activity size={20} />}
          title={filtered ? "No changes match these filters" : "No activity yet"}
          description={filtered ? "Try a longer period or clear the filters." : "Sync the project, upload a document or run a demo scenario from the overview to see changes here."}
          action={
            filtered ? (
              <LinkButton href={`/projects/${id}/activity`} variant="secondary" size="sm">
                Clear filters
              </LinkButton>
            ) : undefined
          }
        />
      ) : (
        <Card as="section" aria-label="Activity feed">
          <ul className="divide-y divide-line">
            {events.map((event) => (
              <EventItem key={event.id} event={event} projectId={id} ticketing={project.features.ticketing} team={team.map((m) => ({ id: m.id, name: m.name }))} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
