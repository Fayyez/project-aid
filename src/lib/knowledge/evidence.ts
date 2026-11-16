import { wrapUntrusted } from "@/lib/security/redact";
import { getStore } from "@/lib/store";
import type {
  Actor,
  Citation,
  CitationType,
  DailyDigest,
  Deployment,
  Evidence,
  GroundingResult,
  Incident,
  Note,
  Person,
  Project,
  ProjectEvent,
  Report,
  Thread,
  Ticket,
} from "@/lib/types";
import { DAY, byNewest, isoDate, tokenize, truncate } from "@/lib/util";

/**
 * Grounding layer.
 *
 * Agents never answer from memory. A workflow first collects records into an
 * EvidenceBag, which gives each one a short reference (E1, T2, D1...). Agents
 * are told to cite those references, and `checkGrounding` verifies afterwards
 * that every reference exists and that statements are actually cited.
 */

export interface ProjectData {
  project: Project;
  events: ProjectEvent[];
  tickets: Ticket[];
  deployments: Deployment[];
  incidents: Incident[];
  threads: Thread[];
  notes: Note[];
  digests: DailyDigest[];
  reports: Report[];
}

/** Loads everything known about one project. Notes are limited to the caller's own shared notes. */
export async function loadProjectData(project: Project, actor?: Actor): Promise<ProjectData> {
  const store = await getStore();
  const [events, tickets, deployments, incidents, threads, notes, digests, reports] = await Promise.all([
    store.list("events"),
    store.list("tickets"),
    store.list("deployments"),
    store.list("incidents"),
    store.list("threads"),
    store.list("notes"),
    store.list("digests"),
    store.list("reports"),
  ]);
  const mine = <T extends { projectId: string }>(items: T[]) => items.filter((item) => item.projectId === project.id);
  return {
    project,
    events: mine(events).sort(byNewest((e) => e.occurredAt)),
    tickets: mine(tickets).sort(byNewest((t) => t.updatedAt)),
    deployments: mine(deployments).sort(byNewest((d) => d.startedAt)),
    incidents: mine(incidents).sort(byNewest((i) => i.detectedAt)),
    threads: mine(threads).sort(byNewest((t) => t.updatedAt)),
    notes: mine(notes).filter((note) => actor && note.authorId === actor.id && note.shareWithAssistant),
    digests: mine(digests).sort(byNewest((d) => d.date)),
    reports: mine(reports).sort(byNewest((r) => r.createdAt)),
  };
}

export async function loadPeople(): Promise<Map<string, Person>> {
  const store = await getStore();
  return new Map((await store.list("people")).map((person) => [person.id, person]));
}

const PREFIX: Record<CitationType, string> = {
  event: "E",
  ticket: "T",
  deployment: "D",
  incident: "I",
  note: "N",
  thread: "Q",
  metric: "M",
  digest: "G",
  report: "R",
};

export class EvidenceBag {
  private readonly items: Evidence[] = [];
  private readonly byKey = new Map<string, Evidence>();
  private readonly counters: Partial<Record<CitationType, number>> = {};

  constructor(private readonly people: Map<string, Person> = new Map()) {}

  get size(): number {
    return this.items.length;
  }

  private add(type: CitationType, record: Omit<Evidence, "ref" | "type">): Evidence {
    const key = `${type}:${record.id}`;
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const index = (this.counters[type] = (this.counters[type] ?? 0) + 1);
    const evidence: Evidence = { ref: `${PREFIX[type]}${index}`, type, ...record };
    this.items.push(evidence);
    this.byKey.set(key, evidence);
    return evidence;
  }

  private name(personId?: string, fallback?: string): string | undefined {
    return (personId && this.people.get(personId)?.name) || fallback;
  }

  addEvent(event: ProjectEvent): Evidence {
    const extras = [
      event.changeType ? `type ${event.changeType}` : "",
      event.areas.length ? `areas ${event.areas.join(", ")}` : "",
      event.refs.length ? `refs ${event.refs.join(", ")}` : "",
      event.clarity === "unclear" ? "intent unclear" : "",
    ].filter(Boolean);
    return this.add("event", {
      id: event.id,
      title: event.title,
      projectId: event.projectId,
      url: event.url,
      occurredAt: event.occurredAt,
      actorName: this.name(event.actorId, event.actorName),
      text: `${event.kind.replace("_", " ")}: ${event.title}. ${event.summary}${extras.length ? ` (${extras.join("; ")})` : ""}`,
    });
  }

  addTicket(ticket: Ticket): Evidence {
    const assignee = this.name(ticket.assigneeId);
    return this.add("ticket", {
      id: ticket.id,
      title: `${ticket.key} ${ticket.title}`,
      projectId: ticket.projectId,
      url: ticket.external?.url,
      occurredAt: ticket.updatedAt,
      actorName: assignee,
      text: `Ticket ${ticket.key} (${ticket.type}, ${ticket.priority}, status ${ticket.status}${assignee ? `, assigned to ${assignee}` : ", unassigned"}${ticket.dueDate ? `, due ${isoDate(ticket.dueDate)}` : ""}): ${ticket.title}. ${truncate(ticket.description, 240)}`,
    });
  }

  addDeployment(deployment: Deployment): Evidence {
    return this.add("deployment", {
      id: deployment.id,
      title: `${deployment.environment} deployment ${deployment.version ?? deployment.commitSha?.slice(0, 7) ?? ""} ${deployment.status}`.replace(/\s+/g, " "),
      projectId: deployment.projectId,
      url: deployment.url,
      occurredAt: deployment.finishedAt ?? deployment.startedAt,
      actorName: this.name(deployment.triggeredById),
      text: `Deployment to ${deployment.environment}${deployment.version ? ` of ${deployment.version}` : ""}: ${deployment.status}.${deployment.logExcerpt ? ` Log: ${truncate(deployment.logExcerpt, 400)}` : ""}`,
    });
  }

  addIncident(incident: Incident): Evidence {
    const triage = incident.triage ? ` Suspected cause: ${incident.triage.suspectedCause} Impact: ${incident.triage.impact}` : "";
    const fix = incident.fix ? ` Fix (${incident.fix.status}): ${incident.fix.summary}` : "";
    return this.add("incident", {
      id: incident.id,
      title: `${incident.key} ${incident.title}`,
      projectId: incident.projectId,
      occurredAt: incident.detectedAt,
      text: `Incident ${incident.key} (${incident.severity}, ${incident.status}): ${incident.title}.${triage}${fix}`,
    });
  }

  addNote(note: Note): Evidence {
    return this.add("note", {
      id: note.id,
      title: note.title ?? "Director note",
      projectId: note.projectId,
      occurredAt: note.updatedAt,
      actorName: this.name(note.authorId),
      text: `Director's own note: ${truncate(note.body, 500)}`,
    });
  }

  addThread(thread: Thread): Evidence {
    const last = thread.messages[thread.messages.length - 1];
    return this.add("thread", {
      id: thread.id,
      title: thread.subject,
      projectId: thread.projectId,
      occurredAt: thread.updatedAt,
      actorName: this.name(thread.assigneeId),
      text: `${thread.kind} thread (${thread.status}) with ${this.name(thread.assigneeId) ?? "a team member"}: ${thread.subject}.${last ? ` Latest message from ${last.authorName}: ${truncate(last.body, 400)}` : ""}`,
    });
  }

  addDigest(digest: DailyDigest): Evidence {
    return this.add("digest", {
      id: digest.id,
      title: `Daily sync ${digest.date}`,
      projectId: digest.projectId,
      occurredAt: digest.createdAt,
      text: `Daily sync for ${digest.date}: ${digest.headline}. ${digest.summary}`,
    });
  }

  addReport(report: Report): Evidence {
    return this.add("report", {
      id: report.id,
      title: report.title,
      projectId: report.projectId,
      occurredAt: report.createdAt,
      text: `${report.kind.replace("_", " ")} report "${report.title}": ${truncate(report.markdown, 500)}`,
    });
  }

  /** A computed figure. The id should describe what was measured, e.g. "pace:prj_atlas". */
  addMetric(id: string, title: string, text: string, projectId?: string): Evidence {
    return this.add("metric", { id, title, text, projectId, occurredAt: new Date().toISOString() });
  }

  list(): Evidence[] {
    return [...this.items];
  }

  get(ref: string): Evidence | undefined {
    return this.items.find((item) => item.ref === ref);
  }

  /** Citations for the given refs (or all evidence), without the evidence text. */
  citations(refs?: string[]): Citation[] {
    const wanted = refs ? new Set(refs) : undefined;
    return this.items
      .filter((item) => !wanted || wanted.has(item.ref))
      .map(({ ref, type, id, title, projectId, url, occurredAt }) => ({ ref, type, id, title, projectId, url, occurredAt }));
  }

  /** Renders the evidence for a prompt, wrapped as untrusted data. */
  render(label = "evidence", maxChars = 24_000): string {
    if (this.items.length === 0) return wrapUntrusted(label, "(no records found)");
    const lines = this.items.map((item) => {
      const when = item.occurredAt ? isoDate(item.occurredAt) : "";
      const who = item.actorName ? ` · ${item.actorName}` : "";
      return `[${item.ref}] ${when}${who} · ${item.text}`;
    });
    return wrapUntrusted(label, lines.join("\n"), maxChars);
  }
}

// --- retrieval -----------------------------------------------------------------

export interface SearchOptions {
  query?: string;
  limit?: number;
  sinceDays?: number;
  personId?: string;
  kinds?: ProjectEvent["kind"][];
  minImportance?: number;
  now?: Date;
}

/**
 * Lexical search with recency and importance boosts. It is deliberately simple
 * and dependency-free; the interface leaves room for embeddings later.
 */
export function searchEvents(events: ProjectEvent[], options: SearchOptions = {}): ProjectEvent[] {
  const now = options.now ?? new Date();
  const terms = tokenize(options.query ?? "");
  const cutoff = options.sinceDays ? now.getTime() - options.sinceDays * DAY : 0;
  const scored: { event: ProjectEvent; score: number }[] = [];
  for (const event of events) {
    const at = new Date(event.occurredAt).getTime();
    if (at < cutoff) continue;
    if (options.personId && event.actorId !== options.personId) continue;
    if (options.kinds && !options.kinds.includes(event.kind)) continue;
    if (options.minImportance && event.importance < options.minImportance) continue;
    let relevance = 0;
    if (terms.length) {
      const title = tokenize(event.title);
      const body = tokenize(`${event.summary} ${event.areas.join(" ")} ${event.tags.join(" ")} ${event.refs.join(" ")} ${event.actorName ?? ""} ${event.kind} ${event.changeType ?? ""}`);
      for (const term of terms) {
        if (title.includes(term)) relevance += 3;
        else if (title.some((t) => t.startsWith(term) || term.startsWith(t))) relevance += 1.5;
        if (body.includes(term)) relevance += 1.5;
        else if (body.some((t) => t.startsWith(term) || term.startsWith(t))) relevance += 0.5;
      }
      if (relevance === 0) continue;
    }
    const ageDays = Math.max(0, (now.getTime() - at) / DAY);
    const recency = 1 / (1 + ageDays / 7);
    scored.push({ event, score: relevance * 2 + recency * 3 + event.importance * 0.6 });
  }
  scored.sort((a, b) => b.score - a.score || b.event.occurredAt.localeCompare(a.event.occurredAt));
  return scored.slice(0, options.limit ?? 12).map((entry) => entry.event);
}

export function searchTickets(tickets: Ticket[], query: string, limit = 8): Ticket[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  return tickets
    .map((ticket) => {
      const text = tokenize(`${ticket.key} ${ticket.title} ${ticket.description} ${ticket.labels.join(" ")} ${ticket.status} ${ticket.type}`);
      const score = terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
      return { ticket, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.ticket.updatedAt.localeCompare(a.ticket.updatedAt))
    .slice(0, limit)
    .map((entry) => entry.ticket);
}

// --- verification --------------------------------------------------------------

const REF_GROUP = /\[((?:[A-Z]\d{1,3})(?:\s*[,;]\s*[A-Z]\d{1,3})*)\]/g;

/** All reference labels used in a text, in order of first appearance. */
export function extractRefs(text: string): string[] {
  const refs: string[] = [];
  for (const match of text.matchAll(REF_GROUP)) {
    for (const ref of match[1].split(/\s*[,;]\s*/)) if (!refs.includes(ref)) refs.push(ref);
  }
  return refs;
}

interface Claim {
  text: string;
  /** References that support this claim. */
  refs: string[];
}

/**
 * Splits a text into factual claims. A bullet is one claim, cited as a unit.
 * In prose each sentence is a claim; a reference may trail by one sentence
 * ("Helix is at risk. Throughput fell 31% [M1].").
 */
function claims(text: string): Claim[] {
  const out: Claim[] = [];
  const lines = text
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\n+/)
    .map((line) => line.trim())
    // Headings and table rules carry no factual claim.
    .filter((line) => line && !/^#{1,6}\s/.test(line) && !/^[|\-:\s]+$/.test(line));
  for (const line of lines) {
    const substantial = (value: string) => tokenize(value.replace(REF_GROUP, "")).length >= 4;
    if (/^([-*+]|\d+[.)])\s/.test(line) || line.startsWith("|")) {
      if (substantial(line)) out.push({ text: line, refs: extractRefs(line) });
      continue;
    }
    const sentences = line.split(/(?<=[.!?:])\s+(?=[A-Z0-9*_"'(])/).map((sentence) => sentence.trim()).filter(Boolean);
    sentences.forEach((sentence, index) => {
      if (!substantial(sentence)) return;
      const own = extractRefs(sentence);
      out.push({ text: sentence, refs: own.length ? own : extractRefs(sentences[index + 1] ?? "") });
    });
  }
  return out;
}

/**
 * Deterministic grounding check: which references are real, and what share of
 * the factual claims rest on at least one real reference.
 */
export function checkGrounding(text: string, bag: EvidenceBag): GroundingResult {
  const used = extractRefs(text);
  const citedRefs = used.filter((ref) => bag.get(ref));
  const invalidRefs = used.filter((ref) => !bag.get(ref));
  if (bag.size === 0) {
    return { score: 0, citedRefs, invalidRefs, unsupported: [], verdict: "no_evidence" };
  }
  const hedges = /\b(i (could not|couldn't|don't|do not) (find|have|see)|no (record|evidence|data)|not (enough|recorded)|unknown|unclear|you (may|might|could) want to|would you like|i can|suggest|recommend)\b/i;
  const unsupported: string[] = [];
  let supported = 0;
  let counted = 0;
  for (const claim of claims(text)) {
    if (hedges.test(claim.text)) continue;
    counted += 1;
    if (claim.refs.some((ref) => bag.get(ref))) supported += 1;
    else unsupported.push(truncate(claim.text.replace(REF_GROUP, "").replace(/^([-*+]|\d+[.)])\s+/, "").trim(), 160));
  }
  const score = counted === 0 ? 1 : supported / counted;
  const verdict: GroundingResult["verdict"] = invalidRefs.length === 0 && score >= 0.75 ? "grounded" : score >= 0.4 ? "partially_grounded" : "ungrounded";
  return { score: Math.round(score * 100) / 100, citedRefs, invalidRefs, unsupported: unsupported.slice(0, 8), verdict };
}

/** Removes references that point at nothing, so a reader is never sent to a missing source. */
export function stripInvalidRefs(text: string, bag: EvidenceBag): string {
  return text
    .replace(REF_GROUP, (_, group: string) => {
      const valid = group.split(/\s*[,;]\s*/).filter((ref) => bag.get(ref));
      return valid.length ? `[${valid.join(", ")}]` : "";
    })
    .replace(/[ \t]+([.,;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
}
