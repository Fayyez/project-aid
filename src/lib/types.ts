/**
 * Domain model for Project Aid.
 *
 * This file is the shared contract between connectors, agents, workflows,
 * services, the MCP server and the UI. Everything is plain JSON so that any
 * document store can persist it.
 */

// ---------------------------------------------------------------------------
// People, projects, configuration
// ---------------------------------------------------------------------------

export type Role = "admin" | "pd" | "member";

export interface Person {
  id: string;
  name: string;
  email: string;
  title?: string;
  role: Role;
  /** scrypt hash. Present only for people who can sign in to the portal. */
  passwordHash?: string;
  /** Identities on external systems, used to attribute activity to a person. */
  handles: {
    github?: string;
    azureDevOps?: string;
    jira?: string;
    teams?: string;
    slack?: string;
  };
  createdAt: string;
}

export interface TeamAssignment {
  personId: string;
  /** Role on this project, e.g. "Tech Lead", "Backend", "QA". */
  projectRole: string;
  /** Code or product areas this person owns, used to route questions. */
  areas: string[];
  allocationPct?: number;
}

export type SourceKind =
  | "github"
  | "azure-devops"
  | "jira"
  | "teams"
  | "outlook"
  | "slack"
  | "document"
  | "deploy"
  | "manual"
  | "simulated"
  | "system";

export interface SourceConfig {
  id: string;
  kind: SourceKind;
  name: string;
  enabled: boolean;
  /**
   * Non-secret settings. Examples:
   *  github:        { owner, repo, branch? }
   *  azure-devops:  { organization, project, repository? }
   *  jira:          { baseUrl, projectKey, email }
   *  teams:         { teamId, channelId }
   */
  config: Record<string, string>;
  /**
   * Name of the environment variable that holds the credential for this
   * source. Secrets are never stored in the database.
   */
  secretEnv?: string;
  lastSyncAt?: string;
  lastSyncStatus?: "ok" | "error" | "stubbed" | "never";
  lastSyncDetail?: string;
  /** Opaque incremental cursor (ISO timestamp or provider token). */
  cursor?: string;
}

/** Every platform feature can be switched on or off per project. */
export interface FeatureFlags {
  chat: boolean;
  dailySync: boolean;
  releaseNotes: boolean;
  reports: boolean;
  ticketing: boolean;
  deployMonitoring: boolean;
  incidentTriage: boolean;
  autoFixProposals: boolean;
  clarifyingQuestions: boolean;
  escalations: boolean;
  contributionInsights: boolean;
}

export const FEATURE_LABELS: Record<keyof FeatureFlags, { label: string; description: string }> = {
  chat: { label: "Project chat", description: "Ask the assistant questions about this project." },
  dailySync: { label: "Daily sync", description: "Generate a daily summary of what changed." },
  releaseNotes: { label: "Release note cards", description: "Turn merged work into short release note cards." },
  reports: { label: "Reports", description: "Progress, incident and release reports from templates." },
  ticketing: { label: "Message to ticket", description: "Convert shared messages into tickets." },
  deployMonitoring: { label: "Deployment monitoring", description: "Track deployment status for every environment." },
  incidentTriage: { label: "Incident triage", description: "Triage failed deployments automatically." },
  autoFixProposals: { label: "Fix proposals", description: "Propose and internally review a fix for incidents." },
  clarifyingQuestions: { label: "Clarifying questions", description: "Ask the author when a major change is unclear." },
  escalations: { label: "Escalations", description: "Route questions to the right team member." },
  contributionInsights: { label: "Contribution insights", description: "Per-person activity and contribution summaries." },
};

export interface PrivacySettings {
  /**
   * How code changes are summarised:
   *  cloud          - the cheap cloud model reads the (redacted) diff
   *  local          - only a local model reads the diff; if none is configured, falls back to metadata-only
   *  metadata-only  - no model ever reads code; summaries come from commit messages and file names
   */
  codeSummaryMode: "cloud" | "local" | "metadata-only";
  /** Keep raw diffs after summarising. Off by default: only summaries are stored. */
  storeRawCode: boolean;
  /** Strip credentials and keys from content before any model sees it. */
  redactSecrets: boolean;
}

export interface Milestone {
  id: string;
  name: string;
  description?: string;
  dueDate: string;
  status: "planned" | "in_progress" | "done" | "at_risk";
}

export interface DeployTarget {
  id: string;
  /** e.g. "production", "staging" */
  environment: string;
  provider: "vercel" | "github" | "healthcheck" | "azure" | "simulated";
  /** vercel: { projectId, teamId? }  github: { owner, repo, environment? }  healthcheck: { url } */
  config: Record<string, string>;
  secretEnv?: string;
}

export type ReportKind = "progress" | "incident" | "release_notes";

export interface Project {
  id: string;
  /** Short code used in ticket keys, e.g. "ATLAS". */
  key: string;
  name: string;
  client: string;
  description: string;
  status: "active" | "paused" | "completed";
  /** Project directors (and admins) who may see this project. */
  pdIds: string[];
  team: TeamAssignment[];
  sources: SourceConfig[];
  deployTargets: DeployTarget[];
  features: FeatureFlags;
  privacy: PrivacySettings;
  milestones: Milestone[];
  startDate: string;
  targetDate: string;
  /** Per-project overrides of the report templates (markdown). */
  templates: Partial<Record<ReportKind, string>>;
  /** Escalation channel preference for this project. */
  notifyChannel: MessageChannel;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Activity: the unified, grounded record of everything that happened
// ---------------------------------------------------------------------------

export type EventKind =
  | "commit"
  | "pull_request"
  | "review"
  | "issue"
  | "work_item"
  | "message"
  | "document"
  | "deployment"
  | "incident"
  | "note"
  | "clarification"
  | "ticket"
  | "release"
  | "meeting";

export type ChangeType =
  | "feature"
  | "fix"
  | "refactor"
  | "chore"
  | "docs"
  | "test"
  | "infra"
  | "security"
  | "other";

export interface ProjectEvent {
  id: string;
  projectId: string;
  sourceId?: string;
  source: SourceKind;
  kind: EventKind;
  /** Stable id on the external system, used for de-duplication. */
  externalId?: string;
  url?: string;
  title: string;
  /** One to three sentence summary, safe to show to a project director. */
  summary: string;
  /** Optional longer breakdown. Never contains raw code unless privacy.storeRawCode is on. */
  details?: string;
  actorId?: string;
  actorName?: string;
  occurredAt: string;
  ingestedAt: string;
  repo?: string;
  branch?: string;
  stats?: { additions?: number; deletions?: number; filesChanged?: number };
  areas: string[];
  tags: string[];
  /** 1 = noise, 3 = normal, 5 = critical / client visible. */
  importance: 1 | 2 | 3 | 4 | 5;
  changeType?: ChangeType;
  /** "unclear" marks a significant change the system could not explain. */
  clarity: "clear" | "unclear";
  userFacing: boolean;
  /** Ticket keys or external references mentioned by this event. */
  refs: string[];
  summarizedBy: { provider: string; model: string; mode: "llm" | "heuristic" | "none" };
}

export type TicketStatus = "draft" | "todo" | "in_progress" | "in_review" | "blocked" | "done" | "cancelled";
export type TicketType = "bug" | "feature" | "task" | "question" | "chore";
export type Priority = "P0" | "P1" | "P2" | "P3";

export interface Ticket {
  id: string;
  projectId: string;
  key: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  type: TicketType;
  priority: Priority;
  status: TicketStatus;
  assigneeId?: string;
  reporterId?: string;
  labels: string[];
  milestoneId?: string;
  /** Story points or ideal days. */
  estimate?: number;
  origin: {
    kind: "manual" | "message" | "incident" | "import" | "clarification";
    /** The original message text the ticket was derived from. */
    text?: string;
    ref?: string;
  };
  external?: { system: "github" | "jira" | "azure-devops"; id: string; url?: string };
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export type DeploymentStatus = "success" | "failed" | "in_progress" | "degraded" | "rolled_back";

export interface Deployment {
  id: string;
  projectId: string;
  environment: string;
  provider: string;
  status: DeploymentStatus;
  version?: string;
  commitSha?: string;
  ref?: string;
  url?: string;
  externalId?: string;
  startedAt: string;
  finishedAt?: string;
  triggeredById?: string;
  /** Short, redacted excerpt of the build or runtime log. */
  logExcerpt?: string;
}

// ---------------------------------------------------------------------------
// Grounding
// ---------------------------------------------------------------------------

export type CitationType =
  | "event"
  | "ticket"
  | "deployment"
  | "incident"
  | "note"
  | "report"
  | "metric"
  | "thread"
  | "digest";

/** A pointer to a stored record that supports a statement. */
export interface Citation {
  /** Short label used inline in text, e.g. "E3". */
  ref: string;
  type: CitationType;
  id: string;
  title: string;
  projectId?: string;
  url?: string;
  occurredAt?: string;
}

/** One retrievable piece of evidence handed to an agent. */
export interface Evidence extends Citation {
  /** The text the agent may rely on. Already redacted and summarised. */
  text: string;
  actorName?: string;
}

export interface GroundingResult {
  /** Share of sentences with at least one valid citation (0..1). */
  score: number;
  citedRefs: string[];
  /** Citations that do not point at any supplied evidence. */
  invalidRefs: string[];
  /** Statements the verifier could not support. */
  unsupported: string[];
  verdict: "grounded" | "partially_grounded" | "ungrounded" | "no_evidence";
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

export type Severity = "SEV1" | "SEV2" | "SEV3" | "SEV4";

export interface IncidentTriage {
  summary: string;
  suspectedCause: string;
  /** 0..1 */
  confidence: number;
  suspectEventIds: string[];
  suspectOwnerId?: string;
  impact: string;
  nextSteps: string[];
  evidence: Citation[];
}

export interface FixProposal {
  kind: "patch" | "revert" | "config" | "runbook";
  summary: string;
  steps: string[];
  /** Unified diff when the agent can express the change as code. */
  patch?: string;
  targetRepo?: string;
  risk: "low" | "medium" | "high";
  rollbackPlan: string;
  testPlan: string[];
  revision: number;
  /** Nothing is ever applied without a human approving it. */
  status: "proposed" | "approved" | "rejected" | "applied";
  prUrl?: string;
  decidedById?: string;
  decidedAt?: string;
}

export interface FixReview {
  round: number;
  reviewer: string;
  verdict: "approve" | "revise" | "reject";
  concerns: string[];
  checks: { name: string; passed: boolean; detail: string }[];
}

export type IncidentStatus =
  | "detected"
  | "triaging"
  | "fix_proposed"
  | "awaiting_approval"
  | "escalated"
  | "mitigated"
  | "resolved";

export interface Incident {
  id: string;
  projectId: string;
  key: string;
  title: string;
  status: IncidentStatus;
  severity: Severity;
  detectedAt: string;
  resolvedAt?: string;
  trigger: { kind: "deployment" | "healthcheck" | "manual" | "alert"; deploymentId?: string; detail: string };
  triage?: IncidentTriage;
  fix?: FixProposal;
  reviews: FixReview[];
  escalation?: { personId: string; reason: string; threadId?: string; at: string };
  reportId?: string;
  timeline: { at: string; actor: string; text: string }[];
  runId?: string;
}

// ---------------------------------------------------------------------------
// Conversations with the team (escalations and clarifying questions)
// ---------------------------------------------------------------------------

export type MessageChannel = "in_app" | "teams" | "email" | "slack";

export interface ThreadMessage {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  at: string;
  via: MessageChannel | "portal" | "reply_link" | "agent";
}

export interface DeliveryRecord {
  channel: MessageChannel;
  status: "sent" | "stubbed" | "failed";
  detail?: string;
  at: string;
}

export interface Thread {
  id: string;
  projectId: string;
  kind: "escalation" | "clarification" | "incident";
  subject: string;
  status: "open" | "answered" | "closed";
  /** Person id, or "agent:<name>" when the system opened the thread. */
  createdById: string;
  /** The team member being asked. */
  assigneeId: string;
  /** PD who should see the answer. */
  watcherIds: string[];
  relatedEventIds: string[];
  relatedIncidentId?: string;
  /** The PD question that led to this thread, if any. */
  originQuestion?: string;
  /** Hash of the single-use style token behind the public reply link. */
  replyTokenHash: string;
  delivery: DeliveryRecord[];
  messages: ThreadMessage[];
  /** Whether the PD has seen the latest reply. */
  unreadForWatchers: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// PD workspace: notes, digests, reports, chat
// ---------------------------------------------------------------------------

export interface Note {
  id: string;
  projectId: string;
  authorId: string;
  title?: string;
  body: string;
  pinned: boolean;
  /** When true the assistant may use this note as evidence for its owner. */
  shareWithAssistant: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseCard {
  id: string;
  title: string;
  summary: string;
  changeType: ChangeType;
  audience: "client" | "internal";
  eventIds: string[];
  contributorIds: string[];
}

export interface DailyDigest {
  id: string;
  projectId: string;
  /** YYYY-MM-DD */
  date: string;
  headline: string;
  summary: string;
  highlights: string[];
  risks: string[];
  nextUp: string[];
  cards: ReleaseCard[];
  stats: { events: number; commits: number; ticketsClosed: number; ticketsOpened: number; deployments: number; contributors: number };
  citations: Citation[];
  createdAt: string;
  runId?: string;
}

export interface Report {
  id: string;
  projectId: string;
  kind: ReportKind;
  title: string;
  periodStart: string;
  periodEnd: string;
  markdown: string;
  citations: Citation[];
  grounding?: GroundingResult;
  createdById: string;
  createdAt: string;
  runId?: string;
  relatedIncidentId?: string;
}

export type ActionKind = "create_tickets" | "escalate" | "generate_report" | "save_note" | "open_incident";

/** Something the assistant suggests. It only happens when the PD confirms it. */
export interface ProposedAction {
  id: string;
  kind: ActionKind;
  label: string;
  description?: string;
  projectId: string;
  payload: Record<string, unknown>;
  status: "proposed" | "done" | "dismissed";
  resultRef?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
  citations?: Citation[];
  actions?: ProposedAction[];
  grounding?: GroundingResult;
  runId?: string;
  feedback?: "up" | "down";
}

export interface Conversation {
  id: string;
  userId: string;
  /** Undefined for portfolio-wide conversations. */
  projectId?: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Project health snapshot (precomputed for the dashboard)
// ---------------------------------------------------------------------------

export type Health = "green" | "amber" | "red";
export type PaceStatus = "ahead" | "on_track" | "at_risk" | "behind" | "unknown";

export interface PaceMetrics {
  status: PaceStatus;
  /** 0..100, share of scoped tickets done. */
  progressPct: number;
  /** 0..100, share of the schedule elapsed. */
  timeElapsedPct: number;
  /** Tickets closed per week, most recent last. */
  weeklyThroughput: number[];
  /** Average closed per week over the last four weeks. */
  velocity: number;
  /** Change of velocity vs the previous four weeks, in percent. */
  velocityTrendPct: number;
  openTickets: number;
  doneTickets: number;
  blockedTickets: number;
  projectedCompletion?: string;
  /** Positive = projected to finish late, in days. */
  slipDays: number;
  explanation: string;
}

export interface ContributionStats {
  personId: string;
  name: string;
  projectRole: string;
  commits: number;
  pullRequests: number;
  reviews: number;
  ticketsClosed: number;
  ticketsInProgress: number;
  linesChanged: number;
  /** Median hours to answer an escalation or clarification, when known. */
  medianResponseHours?: number;
  lastActiveAt?: string;
  /** Distinct active days in the window. */
  activeDays: number;
  areas: string[];
  /** Daily event counts, oldest first. */
  activity: number[];
  highlights: string[];
}

export interface ProjectSnapshot {
  /** Same as projectId: one snapshot per project. */
  id: string;
  projectId: string;
  health: Health;
  healthReasons: string[];
  headline: string;
  keyUpdates: { text: string; citation?: Citation }[];
  topTodos: { ticketId: string; key: string; title: string; priority: Priority; status: TicketStatus; assigneeName?: string; reason: string }[];
  pace: PaceMetrics;
  deploy: { environment: string; status: DeploymentStatus | "unknown"; version?: string; at?: string; deploymentId?: string }[];
  openIncidents: number;
  openQuestions: number;
  eventsLast24h: number;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Orchestration traces, learning loop, security
// ---------------------------------------------------------------------------

export type Tier = "smart" | "cheap";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** Estimated cost in USD. Zero for local and heuristic steps. */
  costUsd: number;
}

export interface RunStep {
  id: string;
  /** Agent name, e.g. "router" or "fix-reviewer". */
  agent: string;
  title: string;
  tier: Tier | "code";
  provider: string;
  model: string;
  /** llm = model call, heuristic = deterministic fallback, code = plain orchestration step. */
  mode: "llm" | "heuristic" | "code";
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  inputPreview: string;
  outputPreview?: string;
  toolCalls?: { name: string; inputPreview: string; ok: boolean }[];
  usage?: Usage;
  error?: string;
  promptVersion?: string;
  /** Steps sharing a group ran in parallel. */
  group?: string;
}

export type RunTrigger = "chat" | "cron" | "webhook" | "manual" | "mcp" | "simulator" | "system";

export interface AgentRun {
  id: string;
  workflow: string;
  title: string;
  projectId?: string;
  userId?: string;
  trigger: RunTrigger;
  status: "running" | "succeeded" | "failed";
  inputPreview: string;
  outputPreview?: string;
  steps: RunStep[];
  usage: Usage;
  grounding?: GroundingResult;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface Feedback {
  id: string;
  userId: string;
  projectId?: string;
  target: { type: "chat_message" | "report" | "digest" | "ticket" | "incident" | "event"; id: string; conversationId?: string };
  rating: "up" | "down";
  comment?: string;
  runId?: string;
  /** Set once the reflector has turned this into a lesson (or decided not to). */
  processed: boolean;
  createdAt: string;
}

/** A piece of guidance the platform learned and now injects into agent prompts. */
export interface Lesson {
  id: string;
  /** "global" or a project id. */
  scope: string;
  /** Agent name this applies to, or "all". */
  agent: string;
  text: string;
  rationale: string;
  source: "feedback" | "clarification" | "manual" | "reflection";
  /** Lessons proposed by the system only take effect once a PD approves them. */
  status: "proposed" | "active" | "retired";
  evidenceFeedbackIds: string[];
  createdAt: string;
  decidedById?: string;
}

export interface EvalCase {
  id: string;
  projectId?: string;
  question: string;
  /** Facts the answer is expected to contain. */
  mustMention: string[];
  createdById: string;
  createdAt: string;
  lastResult?: { at: string; passed: boolean; groundingScore: number; missing: string[]; runId?: string };
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  action: string;
  projectId?: string;
  target?: string;
  detail?: string;
}

export interface ApiToken {
  id: string;
  userId: string;
  name: string;
  /** SHA-256 of the token. The token itself is shown once and never stored. */
  tokenHash: string;
  /** First characters, for display. */
  prefix: string;
  scopes: ("read" | "write")[];
  createdAt: string;
  lastUsedAt?: string;
}

/** The authenticated caller of any service function. */
export interface Actor {
  id: string;
  name: string;
  role: Role;
  /** How the caller authenticated. */
  via: "session" | "token" | "system";
  scopes: ("read" | "write")[];
}

// ---------------------------------------------------------------------------
// Store collections
// ---------------------------------------------------------------------------

export interface Collections {
  people: Person;
  projects: Project;
  events: ProjectEvent;
  tickets: Ticket;
  deployments: Deployment;
  incidents: Incident;
  threads: Thread;
  notes: Note;
  digests: DailyDigest;
  reports: Report;
  conversations: Conversation;
  snapshots: ProjectSnapshot;
  runs: AgentRun;
  feedback: Feedback;
  lessons: Lesson;
  evals: EvalCase;
  audit: AuditEntry;
  tokens: ApiToken;
}

export type CollectionName = keyof Collections;

export const COLLECTION_NAMES: CollectionName[] = [
  "people",
  "projects",
  "events",
  "tickets",
  "deployments",
  "incidents",
  "threads",
  "notes",
  "digests",
  "reports",
  "conversations",
  "snapshots",
  "runs",
  "feedback",
  "lessons",
  "evals",
  "audit",
  "tokens",
];

export const DEFAULT_FEATURES: FeatureFlags = {
  chat: true,
  dailySync: true,
  releaseNotes: true,
  reports: true,
  ticketing: true,
  deployMonitoring: true,
  incidentTriage: true,
  autoFixProposals: true,
  clarifyingQuestions: true,
  escalations: true,
  contributionInsights: true,
};

export const DEFAULT_PRIVACY: PrivacySettings = {
  codeSummaryMode: "cloud",
  storeRawCode: false,
  redactSecrets: true,
};
