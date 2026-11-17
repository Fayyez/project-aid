import type { DeployTarget, Deployment, MessageChannel, Person, Project, SourceConfig, SourceKind, EventKind } from "@/lib/types";

/**
 * A raw item pulled from an external system, before any model has seen it.
 * `body` and `diff` are untrusted third-party content: they are redacted and
 * wrapped before being shown to a model, and never interpreted as instructions.
 */
export interface RawItem {
  source: SourceKind;
  kind: EventKind;
  /** Stable id on the external system (commit sha, PR number, message id). */
  externalId: string;
  url?: string;
  title: string;
  /** Free text: commit message, PR description, chat message, document text. */
  body?: string;
  /** Unified diff for code changes. Dropped after summarising unless storeRawCode is on. */
  diff?: string;
  /** Paths touched by a code change. */
  files?: string[];
  stats?: { additions?: number; deletions?: number; filesChanged?: number };
  /** Author identity as the external system knows it. */
  actor?: { name?: string; email?: string; handle?: string };
  occurredAt: string;
  repo?: string;
  branch?: string;
  /** For kind "deployment": the normalised deployment this item describes. */
  deployment?: Omit<Deployment, "id" | "projectId">;
  /** Provider-specific extras that are safe to keep (labels, state, etc.). */
  meta?: Record<string, string>;
}

export interface FetchResult {
  items: RawItem[];
  /** New cursor to store on the source, if the provider supports incremental sync. */
  cursor?: string;
  status: "ok" | "error" | "stubbed";
  detail?: string;
}

export interface ConnectorContext {
  project: Project;
  /** Resolves the credential named by source.secretEnv, or the connector's default env var. */
  secret(envName?: string): string | undefined;
  /** ISO timestamp: only fetch items newer than this. */
  since: string;
  now: Date;
}

/** Pulls activity from one kind of source. */
export interface SourceConnector {
  kind: SourceKind;
  label: string;
  /** Human readable description of the config keys this connector expects. */
  configHelp: { key: string; label: string; required: boolean; placeholder?: string }[];
  /** Environment variable used when the source does not name one. */
  defaultSecretEnv?: string;
  /** True when the connector can run with the given source config and environment. */
  isConfigured(source: SourceConfig, ctx: ConnectorContext): boolean;
  fetch(source: SourceConfig, ctx: ConnectorContext): Promise<FetchResult>;
}

/** Reads the current deployment state of one environment. */
export interface DeployMonitor {
  provider: DeployTarget["provider"];
  label: string;
  isConfigured(target: DeployTarget, ctx: ConnectorContext): boolean;
  /** Returns the most recent deployments (newest first), at most `limit`. */
  check(target: DeployTarget, ctx: ConnectorContext, limit: number): Promise<{ deployments: Omit<Deployment, "id" | "projectId">[]; status: "ok" | "error" | "stubbed"; detail?: string }>;
}

export interface OutboundMessage {
  to: Person;
  subject: string;
  /** Plain text / light markdown body. */
  body: string;
  /** Link the recipient can use to answer without signing in. */
  replyUrl?: string;
  project: Project;
}

export interface SendResult {
  channel: MessageChannel;
  status: "sent" | "stubbed" | "failed";
  detail?: string;
}

/** Delivers a message to a team member over one channel. */
export interface Messenger {
  channel: MessageChannel;
  label: string;
  isConfigured(): boolean;
  send(message: OutboundMessage): Promise<SendResult>;
}

/** Text extracted from an uploaded project artifact. */
export interface ParsedDocument {
  title: string;
  text: string;
  /** e.g. "docx", "xlsx", "md", "txt", "csv" */
  format: string;
  /** Sheet names, page counts and similar. */
  meta: Record<string, string>;
}
