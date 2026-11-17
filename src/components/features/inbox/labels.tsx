import { Check, CircleAlert, CircleHelp, Megaphone } from "lucide-react";
import { Badge, Tooltip } from "@/components/ui";
import type { DeliveryRecord, MessageChannel, Thread, ThreadMessage } from "@/lib/types";

export const CHANNEL_LABEL: Record<MessageChannel, string> = { in_app: "In the portal", teams: "Teams", email: "Email", slack: "Slack" };

export const KIND_LABEL: Record<Thread["kind"], string> = {
  escalation: "Your question",
  clarification: "Question from Project Aid",
  incident: "Incident",
};

export type InboxBucket = "needs_reply" | "waiting" | "answered" | "closed";

export const BUCKET_LABEL: Record<InboxBucket, string> = {
  needs_reply: "Needs your reply",
  waiting: "Waiting for the team",
  answered: "Answered",
  closed: "Closed",
};

/** A reply the director has not read yet counts as "needs your reply". */
export function bucketOf(thread: Pick<Thread, "status" | "unreadForWatchers">): InboxBucket {
  if (thread.status === "closed") return "closed";
  if (thread.status === "open") return "waiting";
  return thread.unreadForWatchers ? "needs_reply" : "answered";
}

export function isSystemAuthor(authorId: string): boolean {
  return authorId.startsWith("agent:") || authorId === "system";
}

export function authorLabel(message: Pick<ThreadMessage, "authorId" | "authorName">): string {
  return isSystemAuthor(message.authorId) ? "Project Aid" : message.authorName;
}

export function KindBadge({ kind }: { kind: Thread["kind"] }) {
  if (kind === "incident") return <Badge tone="danger" icon={<CircleAlert />}>{KIND_LABEL.incident}</Badge>;
  if (kind === "clarification") return <Badge tone="accent" icon={<CircleHelp />}>{KIND_LABEL.clarification}</Badge>;
  return <Badge tone="info" icon={<Megaphone />}>{KIND_LABEL.escalation}</Badge>;
}

export function BucketBadge({ bucket }: { bucket: InboxBucket }) {
  const tone = bucket === "needs_reply" ? "warning" : bucket === "waiting" ? "info" : bucket === "answered" ? "success" : "neutral";
  return (
    <Badge tone={tone} icon={bucket === "answered" || bucket === "needs_reply" ? <Check /> : undefined} dot={bucket === "waiting"}>
      {BUCKET_LABEL[bucket]}
    </Badge>
  );
}

/** "Teams: stubbed", with the delivery detail as a tooltip. */
export function DeliveryPill({ record }: { record: DeliveryRecord }) {
  const tone = record.status === "sent" ? "success" : record.status === "failed" ? "danger" : "neutral";
  const label = record.status === "stubbed" ? "stubbed" : record.status;
  const pill = (
    <Badge tone={tone} tabIndex={record.detail ? 0 : undefined}>
      {CHANNEL_LABEL[record.channel]}: {label}
    </Badge>
  );
  return record.detail ? <Tooltip content={record.detail}>{pill}</Tooltip> : pill;
}
