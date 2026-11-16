import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Siren } from "lucide-react";
import { BucketBadge, CHANNEL_LABEL, DeliveryPill, KindBadge, authorLabel, bucketOf, isSystemAuthor } from "@/components/features/inbox/labels";
import { MarkRead, ReplyBox } from "@/components/features/inbox/thread-actions";
import { Avatar, Card, CardBody, CardHeader, LinkButton, PageHeader, RelativeTime, cn } from "@/components/ui";
import { SourceIcon } from "@/components/domain";
import { AccessError } from "@/lib/auth/access";
import { requireActor } from "@/lib/auth/current";
import { getThread } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Conversation" };

const VIA: Record<string, string> = { portal: "from the portal", reply_link: "through the reply link", agent: "automatic", in_app: "in the portal", teams: "from Teams", email: "by email", slack: "from Slack" };

export default async function ThreadPage({ params }: PageProps<"/inbox/[threadId]">) {
  const actor = await requireActor();
  const { threadId } = await params;
  let data: Awaited<ReturnType<typeof getThread>>;
  try {
    data = await getThread(actor, threadId);
  } catch (error) {
    if (error instanceof AccessError) notFound();
    throw error;
  }
  const { thread, project, relatedEvents, assignee } = data;
  const bucket = bucketOf(thread);
  return (
    <>
      <MarkRead threadId={thread.id} unread={thread.unreadForWatchers} />
      <PageHeader
        title={thread.subject}
        breadcrumbs={[{ label: "Inbox", href: "/inbox" }, { label: project.name }]}
        meta={
          <>
            <KindBadge kind={thread.kind} />
            <BucketBadge bucket={bucket} />
          </>
        }
        actions={
          thread.relatedIncidentId ? (
            <LinkButton href={`/projects/${project.id}/incidents/${thread.relatedIncidentId}`} variant="secondary" size="sm" icon={<Siren size={14} />}>
              Open incident
            </LinkButton>
          ) : null
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <ol className="space-y-4" aria-label="Messages">
            {thread.messages.map((m) => {
              const system = isSystemAuthor(m.authorId);
              const mine = m.authorId === actor.id;
              return (
                <li key={m.id} className={cn("flex gap-3", mine && "flex-row-reverse")}>
                  {system ? (
                    <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
                      PA
                    </span>
                  ) : (
                    <Avatar name={m.authorName} size="sm" />
                  )}
                  <div className={cn("min-w-0 max-w-[88%] rounded-2xl border px-4 py-3", mine ? "rounded-tr-sm border-accent-line bg-accent-soft/50" : "rounded-tl-sm border-line bg-surface shadow-card")}>
                    <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                      <span className="text-[13px] font-semibold text-fg">{mine ? "You" : authorLabel(m)}</span>
                      <RelativeTime iso={m.at} />
                      <span>{VIA[m.via] ?? m.via}</span>
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          {thread.status === "open" ? (
            <p role="status" className="rounded-md border border-info-line bg-info-soft px-3 py-2 text-[13px] text-info">
              Waiting for {thread.assigneeName} to answer. You will see the reply here.
            </p>
          ) : null}
          <Card>
            <CardHeader title="Your reply" as="h2" />
            <CardBody>
              <ReplyBox threadId={thread.id} closed={thread.status === "closed"} assigneeName={thread.assigneeName} />
            </CardBody>
          </Card>
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Conversation details">
          <Card>
            <CardHeader title="Who" as="h2" />
            <CardBody className="space-y-2 text-[13px]">
              <p>
                <span className="text-muted">Asked: </span>
                <span className="font-medium">{assignee?.name ?? thread.assigneeName}</span>
                {assignee?.title ? <span className="text-muted">, {assignee.title}</span> : null}
              </p>
              <p>
                <span className="text-muted">Project: </span>
                <Link href={`/projects/${project.id}`} className="font-medium text-accent hover:underline">
                  {project.name}
                </Link>
              </p>
              <p className="text-muted">
                Started <RelativeTime iso={thread.createdAt} />
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Related changes" as="h2" description="Work this question is about." />
            <CardBody>
              {relatedEvents.length === 0 ? (
                <p className="text-[13px] text-muted">No related changes were linked.</p>
              ) : (
                <ul className="space-y-2.5">
                  {relatedEvents.map((e) => (
                    <li key={e.id} className="min-w-0 text-[13px]">
                      <Link href={`/projects/${project.id}/activity?q=${encodeURIComponent(e.title)}`} className="group flex min-w-0 items-start gap-2 hover:text-accent">
                        <SourceIcon source={e.source} size={14} />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words font-medium group-hover:underline">{e.title}</span>
                          <span className="block text-xs text-muted">
                            {e.actorName ? `${e.actorName}, ` : ""}
                            <RelativeTime iso={e.occurredAt} />
                          </span>
                        </span>
                        <ArrowUpRight size={13} aria-hidden className="mt-0.5 shrink-0 text-subtle" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Delivery" as="h2" description="How the question reached the team." />
            <CardBody>
              {thread.delivery.length === 0 ? (
                <p className="text-[13px] text-muted">No delivery attempts were recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {thread.delivery.map((d, i) => (
                    <li key={`${d.channel}-${i}`} className="text-[13px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <DeliveryPill record={d} />
                        <span className="text-xs text-muted">
                          <RelativeTime iso={d.at} />
                        </span>
                      </div>
                      {d.detail ? (
                        <p className="mt-1 break-words text-xs text-muted">
                          {CHANNEL_LABEL[d.channel]}: {d.detail}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
