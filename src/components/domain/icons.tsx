import {
  Cloud, Cpu, FileText, FlaskConical, GitCommitHorizontal, GitPullRequest, Eye, CircleDot, ListChecks, MessageSquare, Rocket, Siren, StickyNote,
  CircleHelp, Ticket, Tag, Video, Hand, Mail, MessagesSquare, Hash, GitBranch, SquareKanban, type LucideIcon,
} from "lucide-react";
import type { EventKind, SourceKind } from "@/lib/types";
import { cn } from "../ui";

export const SOURCE_META: Record<SourceKind, { label: string; icon: LucideIcon }> = {
  github: { label: "GitHub", icon: GitBranch },
  "azure-devops": { label: "Azure DevOps", icon: Cloud },
  jira: { label: "Jira", icon: SquareKanban },
  teams: { label: "Teams", icon: MessagesSquare },
  outlook: { label: "Outlook", icon: Mail },
  slack: { label: "Slack", icon: Hash },
  document: { label: "Document", icon: FileText },
  deploy: { label: "Deploy", icon: Rocket },
  manual: { label: "Manual", icon: Hand },
  simulated: { label: "Simulated", icon: FlaskConical },
  system: { label: "System", icon: Cpu },
};

export const EVENT_KIND_META: Record<EventKind, { label: string; icon: LucideIcon }> = {
  commit: { label: "Commit", icon: GitCommitHorizontal },
  pull_request: { label: "Pull request", icon: GitPullRequest },
  review: { label: "Review", icon: Eye },
  issue: { label: "Issue", icon: CircleDot },
  work_item: { label: "Work item", icon: ListChecks },
  message: { label: "Message", icon: MessageSquare },
  document: { label: "Document", icon: FileText },
  deployment: { label: "Deployment", icon: Rocket },
  incident: { label: "Incident", icon: Siren },
  note: { label: "Note", icon: StickyNote },
  clarification: { label: "Clarification", icon: CircleHelp },
  ticket: { label: "Ticket", icon: Ticket },
  release: { label: "Release", icon: Tag },
  meeting: { label: "Meeting", icon: Video },
};

export interface IconProps {
  size?: number;
  className?: string;
}

/** Icon for the system a record came from. Has an accessible name. */
export function SourceIcon({ source, size = 16, className }: { source: SourceKind } & IconProps) {
  const m = SOURCE_META[source];
  const Icon = m.icon;
  return <Icon size={size} role="img" aria-label={m.label} className={cn("shrink-0 text-muted", className)} />;
}

/** Icon for an activity event kind. Has an accessible name. */
export function EventKindIcon({ kind, size = 16, className }: { kind: EventKind } & IconProps) {
  const m = EVENT_KIND_META[kind];
  const Icon = m.icon;
  return <Icon size={size} role="img" aria-label={m.label} className={cn("shrink-0 text-muted", className)} />;
}
