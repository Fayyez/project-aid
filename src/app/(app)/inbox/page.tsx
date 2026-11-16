import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, Users } from "lucide-react";
import { BUCKET_LABEL, BucketBadge, DeliveryPill, KindBadge, authorLabel, bucketOf, type InboxBucket } from "@/components/features/inbox/labels";
import { Badge, Card, EmptyState, PageHeader, RelativeTime, Tabs, cn } from "@/components/ui";
import { requireActor } from "@/lib/auth/current";
import { truncate } from "@/lib/format";
import { listThreads, type ThreadView } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Inbox" };

const ORDER: InboxBucket[] = ["needs_reply", "waiting", "answered", "closed"];
const EMPTY_COPY: Record<InboxBucket, string> = {
  needs_reply: "No answers are waiting for you.",
  waiting: "Nothing is waiting on the team.",
  answered: "No answered conversations yet.",
  closed: "No closed conversations.",
};

function ThreadRow({ thread, actorId }: { thread: ThreadView; actorId: string }) {
  const last = thread.messages[thread.messages.length - 1];
  const bucket = bucketOf(thread);
  const askedBy = thread.createdById.startsWith("agent:") ? "Project Aid" : thread.createdById === actorId ? "You" : "A colleague";
  return (
    <li>
      <Link href={`/inbox/${thread.id}`} className="block px-4 py-3 transition-colors hover:bg-surface-2/70 focus-visible:bg-surface-2/70">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-1.5 flex size-2 shrink-0" aria-hidden={!thread.unreadForWatchers}>
            {thread.unreadForWatchers ? (
              <>
                <span className="size-2 rounded-full bg-accent" />
                <span className="sr-only">Unread</span>
              </>
            ) : null}
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <KindBadge kind={thread.kind} />
              <BucketBadge bucket={bucket} />
              <span className="text-xs text-muted">{thread.projectName}</span>
              <span className="ml-auto text-xs text-muted">
                <RelativeTime iso={thread.updatedAt} />
              </span>
            </div>
            <h3 className={cn("break-words text-sm", thread.unreadForWatchers ? "font-semibold" : "font-medium")}>{thread.subject}</h3>
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
              <Users size={12} aria-hidden className="shrink-0" />
              <span className="truncate">
                {askedBy} asked {thread.assigneeName}
              </span>
            </p>
            {last ? (
              <p className="line-clamp-2 break-words text-[13px] text-muted">
                <span className="font-medium text-fg">{authorLabel(last)}:</span> {truncate(last.body, 220)}
              </p>
            ) : null}
            {thread.delivery.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {thread.delivery.map((d, i) => (
                  <DeliveryPill key={`${d.channel}-${i}`} record={d} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const actor = await requireActor();
  const sp = await searchParams;
  const raw = typeof sp.status === "string" ? sp.status : "all";
  const filter: InboxBucket | "all" = (ORDER as string[]).includes(raw) ? (raw as InboxBucket) : "all";
  const threads = await listThreads(actor);
  const groups = new Map<InboxBucket, ThreadView[]>(ORDER.map((b) => [b, []]));
  for (const t of threads) groups.get(bucketOf(t))?.push(t);
  const shown = filter === "all" ? ORDER : [filter];

  return (
    <>
      <PageHeader title="Inbox" description="Questions you sent to the team, questions Project Aid needs answered, and incident conversations." />
      <div className="space-y-5">
        <Tabs
          param="status"
          defaultValue="all"
          label="Filter conversations"
          items={[
            { label: "All", value: "all", count: threads.length },
            ...ORDER.map((b) => ({ label: BUCKET_LABEL[b], value: b, count: groups.get(b)?.length ?? 0 })),
          ]}
        />
        {threads.length === 0 ? (
          <EmptyState icon={<Inbox size={20} />} title="Your inbox is empty" description="When you ask the team a question, or Project Aid needs a clarification, the conversation appears here." />
        ) : filter !== "all" && (groups.get(filter)?.length ?? 0) === 0 ? (
          <EmptyState icon={<Inbox size={20} />} title={EMPTY_COPY[filter]} description="Switch to another tab to see the rest of your conversations." />
        ) : (
          shown.map((bucket) => {
            const list = groups.get(bucket) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={bucket} aria-labelledby={`h-${bucket}`}>
                {filter === "all" ? (
                  <h2 id={`h-${bucket}`} className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    {BUCKET_LABEL[bucket]} <Badge tone="neutral">{list.length}</Badge>
                  </h2>
                ) : (
                  <h2 id={`h-${bucket}`} className="sr-only">
                    {BUCKET_LABEL[bucket]}
                  </h2>
                )}
                <Card>
                  <ul className="divide-y divide-line">
                    {list.map((t) => (
                      <ThreadRow key={t.id} thread={t} actorId={actor.id} />
                    ))}
                  </ul>
                </Card>
              </section>
            );
          })
        )}
      </div>
    </>
  );
}
