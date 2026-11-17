import {
  Ban, CircleAlert, CircleCheck, CircleDashed, CircleHelp, CircleX, Cog, Code, Eye, Flag, Loader, OctagonAlert, ShieldAlert, ShieldCheck, ShieldQuestion,
  Sparkles, TrendingDown, TrendingUp, TriangleAlert, Undo2, Zap, Gauge, UserCheck, Hourglass, Wrench, GitPullRequest,
} from "lucide-react";
import type {
  ChangeType, DeploymentStatus, GroundingResult, Health, IncidentStatus, PaceStatus, Priority, RunStep, Severity, Tier, TicketStatus,
} from "@/lib/types";
import { Badge, cn, type Tone } from "../ui";

type Common = { className?: string };

// ----- Health -------------------------------------------------------------

const healthMap: Record<Health, { tone: Tone; label: string; icon: typeof CircleCheck }> = {
  green: { tone: "success", label: "Healthy", icon: CircleCheck },
  amber: { tone: "warning", label: "At risk", icon: TriangleAlert },
  red: { tone: "danger", label: "Critical", icon: OctagonAlert },
};

export function HealthBadge({ health, className }: { health: Health } & Common) {
  const m = healthMap[health];
  const Icon = m.icon;
  return (
    <Badge tone={m.tone} icon={<Icon aria-hidden />} className={className}>
      {m.label}
    </Badge>
  );
}

const dotColor: Record<Health, string> = { green: "bg-success", amber: "bg-warning", red: "bg-danger" };

/** Compact dot with a screen-reader label. Use next to a project name. */
export function HealthDot({ health, className }: { health: Health } & Common) {
  return (
    <span role="img" aria-label={healthMap[health].label} title={healthMap[health].label} className={cn("inline-block size-2.5 shrink-0 rounded-full ring-2 ring-surface", dotColor[health], className)} />
  );
}

// ----- Pace ---------------------------------------------------------------

const paceMap: Record<PaceStatus, { tone: Tone; label: string; icon: typeof CircleCheck }> = {
  ahead: { tone: "success", label: "Ahead", icon: TrendingUp },
  on_track: { tone: "success", label: "On track", icon: CircleCheck },
  at_risk: { tone: "warning", label: "At risk", icon: TriangleAlert },
  behind: { tone: "danger", label: "Behind", icon: TrendingDown },
  unknown: { tone: "neutral", label: "Unknown", icon: CircleHelp },
};

export function PaceBadge({ status, className }: { status: PaceStatus } & Common) {
  const m = paceMap[status];
  const Icon = m.icon;
  return (
    <Badge tone={m.tone} icon={<Icon aria-hidden />} className={className}>
      {m.label}
    </Badge>
  );
}

// ----- Deployments --------------------------------------------------------

const deployMap: Record<DeploymentStatus | "unknown", { tone: Tone; label: string; icon: typeof CircleCheck; spin?: boolean }> = {
  success: { tone: "success", label: "Succeeded", icon: CircleCheck },
  failed: { tone: "danger", label: "Failed", icon: CircleX },
  in_progress: { tone: "info", label: "In progress", icon: Loader, spin: true },
  degraded: { tone: "warning", label: "Degraded", icon: TriangleAlert },
  rolled_back: { tone: "warning", label: "Rolled back", icon: Undo2 },
  unknown: { tone: "neutral", label: "Unknown", icon: CircleHelp },
};

export function DeployBadge({ status, className }: { status: DeploymentStatus | "unknown" } & Common) {
  const m = deployMap[status];
  const Icon = m.icon;
  return (
    <Badge tone={m.tone} icon={<Icon aria-hidden className={m.spin ? "animate-spin" : undefined} />} className={className}>
      {m.label}
    </Badge>
  );
}

// ----- Tickets ------------------------------------------------------------

const ticketMap: Record<TicketStatus, { tone: Tone; label: string; icon: typeof CircleCheck }> = {
  draft: { tone: "neutral", label: "Draft", icon: CircleDashed },
  todo: { tone: "neutral", label: "To do", icon: CircleDashed },
  in_progress: { tone: "info", label: "In progress", icon: Loader },
  in_review: { tone: "accent", label: "In review", icon: Eye },
  blocked: { tone: "danger", label: "Blocked", icon: Ban },
  done: { tone: "success", label: "Done", icon: CircleCheck },
  cancelled: { tone: "neutral", label: "Cancelled", icon: CircleX },
};

export function TicketStatusBadge({ status, className }: { status: TicketStatus } & Common) {
  const m = ticketMap[status];
  const Icon = m.icon;
  return (
    <Badge tone={m.tone} icon={<Icon aria-hidden />} className={className}>
      {m.label}
    </Badge>
  );
}

const priorityMap: Record<Priority, { tone: Tone; hint: string }> = {
  P0: { tone: "danger", hint: "Critical" },
  P1: { tone: "warning", hint: "High" },
  P2: { tone: "info", hint: "Medium" },
  P3: { tone: "neutral", hint: "Low" },
};

export function PriorityBadge({ priority, className }: { priority: Priority } & Common) {
  const m = priorityMap[priority];
  return (
    <Badge tone={m.tone} icon={<Flag aria-hidden />} title={`${priority} · ${m.hint}`} className={cn("font-mono", className)}>
      {priority}
    </Badge>
  );
}

// ----- Incidents ----------------------------------------------------------

const severityMap: Record<Severity, { tone: Tone; hint: string }> = {
  SEV1: { tone: "danger", hint: "Critical outage" },
  SEV2: { tone: "warning", hint: "Major degradation" },
  SEV3: { tone: "info", hint: "Minor impact" },
  SEV4: { tone: "neutral", hint: "Low impact" },
};

export function SeverityBadge({ severity, className }: { severity: Severity } & Common) {
  const m = severityMap[severity];
  return (
    <Badge tone={m.tone} icon={<ShieldAlert aria-hidden />} title={`${severity} · ${m.hint}`} className={cn("font-mono", className)}>
      {severity}
    </Badge>
  );
}

const incidentMap: Record<IncidentStatus, { tone: Tone; label: string; icon: typeof CircleCheck }> = {
  detected: { tone: "danger", label: "Detected", icon: CircleAlert },
  triaging: { tone: "warning", label: "Triaging", icon: Hourglass },
  fix_proposed: { tone: "info", label: "Fix proposed", icon: Wrench },
  awaiting_approval: { tone: "accent", label: "Awaiting approval", icon: UserCheck },
  escalated: { tone: "danger", label: "Escalated", icon: Zap },
  mitigated: { tone: "info", label: "Mitigated", icon: ShieldCheck },
  resolved: { tone: "success", label: "Resolved", icon: CircleCheck },
};

export function IncidentStatusBadge({ status, className }: { status: IncidentStatus } & Common) {
  const m = incidentMap[status];
  const Icon = m.icon;
  return (
    <Badge tone={m.tone} icon={<Icon aria-hidden />} className={className}>
      {m.label}
    </Badge>
  );
}

// ----- Activity -----------------------------------------------------------

const changeMap: Record<ChangeType, { tone: Tone; label: string }> = {
  feature: { tone: "accent", label: "Feature" },
  fix: { tone: "warning", label: "Fix" },
  refactor: { tone: "neutral", label: "Refactor" },
  chore: { tone: "neutral", label: "Chore" },
  docs: { tone: "neutral", label: "Docs" },
  test: { tone: "neutral", label: "Test" },
  infra: { tone: "info", label: "Infra" },
  security: { tone: "danger", label: "Security" },
  other: { tone: "neutral", label: "Other" },
};

export function ChangeTypeBadge({ type, className }: { type: ChangeType } & Common) {
  const m = changeMap[type];
  return (
    <Badge tone={m.tone} className={className}>
      {m.label}
    </Badge>
  );
}

// ----- Agents -------------------------------------------------------------

const modeMap: Record<RunStep["mode"], { tone: Tone; label: string; icon: typeof Sparkles; hint: string }> = {
  llm: { tone: "accent", label: "LLM", icon: Sparkles, hint: "Model call" },
  heuristic: { tone: "warning", label: "Heuristic", icon: Cog, hint: "Deterministic fallback, no model used" },
  code: { tone: "neutral", label: "Code", icon: Code, hint: "Plain orchestration step" },
};

export function FeatureModeBadge({ mode, className }: { mode: RunStep["mode"] } & Common) {
  const m = modeMap[mode];
  const Icon = m.icon;
  return (
    <Badge tone={m.tone} icon={<Icon aria-hidden />} title={m.hint} className={className}>
      {m.label}
    </Badge>
  );
}

const tierMap: Record<Tier | "code", { tone: Tone; label: string; icon: typeof Sparkles }> = {
  smart: { tone: "accent", label: "Smart", icon: Gauge },
  cheap: { tone: "info", label: "Cheap", icon: Zap },
  code: { tone: "neutral", label: "Code", icon: GitPullRequest },
};

export function TierBadge({ tier, className }: { tier: Tier | "code" } & Common) {
  const m = tierMap[tier];
  const Icon = m.icon;
  return (
    <Badge tone={m.tone} icon={<Icon aria-hidden />} className={className}>
      {m.label}
    </Badge>
  );
}

const groundingMap: Record<GroundingResult["verdict"], { tone: Tone; label: string; icon: typeof ShieldCheck }> = {
  grounded: { tone: "success", label: "Grounded", icon: ShieldCheck },
  partially_grounded: { tone: "warning", label: "Partly grounded", icon: ShieldAlert },
  ungrounded: { tone: "danger", label: "Ungrounded", icon: ShieldAlert },
  no_evidence: { tone: "neutral", label: "No evidence", icon: ShieldQuestion },
};

/** Verdict plus score from a GroundingResult; the title lists invalid and unsupported items. */
export function GroundingBadge({ grounding, className }: { grounding: GroundingResult } & Common) {
  const m = groundingMap[grounding.verdict];
  const Icon = m.icon;
  const pct = Math.round(grounding.score * 100);
  const details = [
    `${grounding.citedRefs.length} cited source${grounding.citedRefs.length === 1 ? "" : "s"}`,
    grounding.invalidRefs.length ? `${grounding.invalidRefs.length} invalid ref${grounding.invalidRefs.length === 1 ? "" : "s"}` : null,
    grounding.unsupported.length ? `${grounding.unsupported.length} unsupported statement${grounding.unsupported.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return (
    <Badge tone={m.tone} icon={<Icon aria-hidden />} title={`${m.label} (${pct}%): ${details.join(", ")}`} className={className}>
      {m.label}
      {grounding.verdict !== "no_evidence" ? <span className="tabular-nums opacity-80">{pct}%</span> : null}
    </Badge>
  );
}
