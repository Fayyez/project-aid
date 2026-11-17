"use client";

import { Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { reflectAction } from "@/app/actions";
import { useAction } from "@/components/features/settings/use-action";
import { Badge, Button, Callout, Card, CardBody, CardHeader, EmptyState, RelativeTime } from "@/components/ui";

export interface FeedbackItem {
  id: string;
  rating: "up" | "down";
  comment?: string;
  about: string;
  href?: string;
  runId?: string;
  projectName?: string;
  userName?: string;
  processed: boolean;
  createdAt: string;
}

export function FeedbackPanel({ items, pending: pendingCount }: { items: FeedbackItem[]; pending: number }) {
  const { run, pending } = useAction();
  const [result, setResult] = useState<{ lessons: number; processed: number } | null>(null);

  async function reflect() {
    const outcome = await run(() => reflectAction(), {});
    if (outcome.ok) setResult(outcome.data);
  }

  return (
    <Card as="section" aria-labelledby="feedback-heading">
      <CardHeader
        title={<span id="feedback-heading">Feedback</span>}
        description="Thumbs up and down from directors. Criticism is turned into proposed lessons you can approve."
        actions={
          <Button variant="primary" size="sm" icon={<Sparkles size={14} />} loading={pending} disabled={pendingCount === 0} onClick={reflect}>
            Learn from feedback ({pendingCount} pending)
          </Button>
        }
      />
      <CardBody className="space-y-4">
        {pending ? (
          <Callout tone="info" title="Reading the feedback">
            This can take up to a minute while the assistant looks for patterns.
          </Callout>
        ) : null}
        {result ? (
          <Callout tone={result.lessons > 0 ? "success" : "info"} title={`${result.lessons} ${result.lessons === 1 ? "lesson" : "lessons"} proposed`}>
            {result.processed} feedback {result.processed === 1 ? "item was" : "items were"} reviewed.{" "}
            {result.lessons > 0 ? "Approve the proposals under Lessons for them to take effect." : "Nothing needed a new lesson."}
          </Callout>
        ) : null}
        {items.length === 0 ? (
          <EmptyState icon={<ThumbsUp size={20} />} title="No feedback yet" description="Use the thumbs on answers and reports. Comments on thumbs-down ratings are the most useful." />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-3 py-2.5">
                <span className={item.rating === "up" ? "mt-0.5 text-success" : "mt-0.5 text-danger"}>
                  {item.rating === "up" ? <ThumbsUp size={16} aria-label="Thumbs up" /> : <ThumbsDown size={16} aria-label="Thumbs down" />}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  {item.comment ? <p className="break-words text-sm">{item.comment}</p> : <p className="text-[13px] text-muted">No comment</p>}
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                    <span>About: {item.href ? <Link href={item.href} className="text-accent hover:underline">{item.about}</Link> : item.about}</span>
                    {item.projectName ? <span>· {item.projectName}</span> : null}
                    {item.userName ? <span>· {item.userName}</span> : null}
                    <span>
                      · <RelativeTime iso={item.createdAt} />
                    </span>
                    {item.runId ? (
                      <Link href={`/runs/${item.runId}`} className="text-accent hover:underline">
                        · View run
                      </Link>
                    ) : null}
                  </p>
                </div>
                <Badge tone={item.processed ? "success" : "warning"} dot>
                  {item.processed ? "Processed" : "Pending"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
