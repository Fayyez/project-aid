import type { ChangeType, DeploymentStatus, EventKind, Priority, TicketStatus, TicketType } from "@/lib/types";
import type { When } from "../helpers";

/** A ticket written by hand. Most fields have sensible defaults. */
export interface TicketSpec {
  /** Ticket number, the key is `<PROJECT>-<n>`. */
  n: number;
  t: string;
  /** Why it matters, written for a project director. Reused in event summaries. */
  why: string;
  /** Area (see the project team areas). */
  a: string;
  /** Person key of the assignee. */
  who: string;
  ty?: TicketType;
  p?: Priority;
  /** Defaults to "done" in `done` lists, required for `open` lists. */
  s?: TicketStatus;
  est?: number;
  /** Milestone index within the project. */
  ms?: number;
  ac?: string[];
  /** Ticket was created from this message. */
  msg?: { text: string; by: string; ref: string };
  /** Pin the close time (only for done tickets). */
  pin?: When;
  ct?: ChangeType;
  imp?: 1 | 2 | 3 | 4 | 5;
  ui?: boolean;
  /** Person key of the reviewer. */
  rev?: string;
  /** For blocked tickets: what it is waiting for. */
  note?: string;
  /** Created this many days ago (open tickets). */
  c?: number;
  /** Extra areas touched. */
  areas?: string[];
  labels?: string[];
}

/** A hand-written event that is not derived from a ticket. */
export interface EventSpec {
  key: string;
  w: When;
  kind: EventKind;
  title: string;
  summary: string;
  details?: string;
  /** Person key of the actor. */
  who?: string;
  /** Actor name when the actor is not on the team (e.g. a client contact). */
  actor?: string;
  areas: string[];
  tags?: string[];
  imp: 1 | 2 | 3 | 4 | 5;
  ct?: ChangeType;
  unclear?: boolean;
  ui?: boolean;
  refs?: string[];
  repo?: string;
  stats?: { additions?: number; deletions?: number; filesChanged?: number };
  branch?: string;
}

export interface DeploySpec {
  /** 1-based sequence, id is `dep_<slug>_<nn>`. */
  n: number;
  env: "production" | "staging";
  status: DeploymentStatus;
  version: string;
  w: When;
  /** Minutes the deployment ran. */
  mins: number;
  who: string;
  /** Event key whose commit sha this deployment ships. */
  shaOf?: string;
  note: string;
  log?: string;
  imp?: 1 | 2 | 3 | 4 | 5;
  /** Skip the activity event for this deployment (keeps the feed short). */
  noEvent?: boolean;
}

export interface HistNoun {
  a: string;
  noun: string;
}

export interface StorySpec {
  projectId: string;
  /** Used in ids: `evt_<slug>_001`. */
  slug: string;
  /** Ticket key prefix, e.g. ATLAS. */
  key: string;
  sourceId: string;
  /** Default repo and per-area overrides. */
  repo: string;
  repoByArea?: Record<string, string>;
  /** Person key of the tech lead (default reviewer). */
  lead: string;
  /** Person keys on the team. */
  team: string[];
  /** Area -> person keys who usually work on it. */
  owners: Record<string, string[]>;
  /** Project start, in days before the seed time. */
  startDaysAgo: number;
  milestoneIds: string[];
  /** Tickets closed in each week bucket, b0 = last 7 days ... b7. */
  buckets: number[];
  /** First number for generated older tickets. */
  histBase: number;
  histNouns: HistNoun[];
  /** Milestone index for older tickets, by bucket. */
  histMs: number[];
  done: TicketSpec[];
  open: TicketSpec[];
  events: EventSpec[];
  deployments: DeploySpec[];
  /** Probability that a merged ticket also has a review event. */
  reviewProb: number;
  /** Probability of a second commit on a ticket. */
  secondCommitProb: number;
  /** First pull request number. */
  prBase: number;
}
