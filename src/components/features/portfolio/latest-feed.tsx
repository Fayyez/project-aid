import Link from "next/link";
import { Activity } from "lucide-react";
import { Card, CardHeader, EmptyState, RelativeTime } from "@/components/ui";
import { EventKindIcon } from "@/components/domain";
import type { ProjectEvent } from "@/lib/types";

export function LatestFeed({ events }: { events: (ProjectEvent & { projectName: string })[] }) {
  return (
    <Card as="section" aria-labelledby="latest-title">
      <CardHeader title={<span id="latest-title">Latest across your projects</span>} description="Notable changes only; open a project for the full feed." />
      {events.length === 0 ? (
        <EmptyState icon={<Activity size={20} />} title="No activity yet" description="Sync a project or run a demo scenario to see changes here." />
      ) : (
        <ul className="divide-y divide-line">
          {events.map((event) => (
            <li key={event.id} className="flex min-w-0 items-start gap-3 px-4 py-2.5">
              <EventKindIcon kind={event.kind} size={16} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-snug">{event.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                  <Link href={`/projects/${event.projectId}/activity`} className="font-medium text-accent hover:underline">
                    {event.projectName}
                  </Link>
                  {event.actorName ? <span>· {event.actorName}</span> : null}
                  <span>·</span>
                  <RelativeTime iso={event.occurredAt} />
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
