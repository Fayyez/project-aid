import type { ChangeType, Deployment, EventKind, ProjectEvent, Ticket, TicketType } from "@/lib/types";
import { DAY_MS, HOUR_MS, Rng, iso, lcFirst, maxDate, minDate, resolveWhen, snapWork } from "./helpers";
import { personDef, personId } from "./people";
import type { DeploySpec, StorySpec, TicketSpec } from "./stories/types";

export interface Built {
  spec: StorySpec;
  events: ProjectEvent[];
  tickets: Ticket[];
  deployments: Deployment[];
  /** Resolves a story event key to its final id. Throws when unknown. */
  eventId(key: string): string;
  event(key: string): ProjectEvent;
  ticket(n: number): Ticket;
  deployment(n: number): Deployment;
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

const VERBS: { verb: string; type: TicketType; ct: ChangeType }[] = [
  { verb: "Fix", type: "bug", ct: "fix" },
  { verb: "Add tests for", type: "task", ct: "test" },
  { verb: "Speed up", type: "task", ct: "refactor" },
  { verb: "Improve error handling in", type: "task", ct: "fix" },
  { verb: "Add logging to", type: "chore", ct: "chore" },
  { verb: "Document", type: "chore", ct: "docs" },
];

const REVIEW_NOTES = [
  "approved it after asking for one extra test around the failure path",
  "approved it; the main comment was to simplify the error messages shown to users",
  "asked for small naming changes and approved once they were made",
  "signed off after a walkthrough of the edge cases with the author",
  "approved it and asked for a follow-up ticket to tidy a related helper",
];

interface Pending {
  key: string;
  event: ProjectEvent;
  /** Ticket key whose pull request number belongs in this event's text. */
  prFor?: string;
}

function areaRepo(spec: StorySpec, area: string): string {
  return spec.repoByArea?.[area] ?? spec.repo;
}

function defaultChange(type: TicketType): ChangeType {
  if (type === "bug") return "fix";
  if (type === "feature") return "feature";
  return "chore";
}

function defaultImportance(p: string): 1 | 2 | 3 | 4 | 5 {
  if (p === "P0") return 5;
  if (p === "P1") return 4;
  if (p === "P2") return 3;
  return 2;
}

const clampImp = (n: number): 1 | 2 | 3 | 4 | 5 => Math.max(1, Math.min(5, Math.round(n))) as 1 | 2 | 3 | 4 | 5;

export function buildStory(spec: StorySpec, now: Date): Built {
  const rng = new Rng(`story:${spec.projectId}`);
  const startDate = new Date(now.getTime() - spec.startDaysAgo * DAY_MS);
  const nowMs = now.getTime();
  const pending: Pending[] = [];
  const keyIndex = new Map<string, Pending>();

  function pushEvent(item: Pending) {
    if (keyIndex.has(item.key)) throw new Error(`Duplicate event key ${spec.slug}:${item.key}`);
    keyIndex.set(item.key, item);
    pending.push(item);
  }

  function makeEvent(p: {
    kind: EventKind;
    at: Date;
    title: string;
    summary: string;
    details?: string;
    who?: string;
    actor?: string;
    areas: string[];
    tags?: string[];
    imp: 1 | 2 | 3 | 4 | 5;
    ct?: ChangeType;
    unclear?: boolean;
    ui?: boolean;
    refs?: string[];
    repo?: string;
    branch?: string;
    stats?: ProjectEvent["stats"];
    externalId?: string;
  }): ProjectEvent {
    const at = minDate(p.at, new Date(nowMs - 20 * 60_000));
    const ingested = minDate(new Date(at.getTime() + rng.int(2, 25) * 60_000), new Date(nowMs - 60_000));
    const actorName = p.who ? personDef(p.who).name : p.actor;
    return {
      id: "",
      projectId: spec.projectId,
      sourceId: spec.sourceId,
      source: "simulated",
      kind: p.kind,
      externalId: p.externalId,
      title: p.title,
      summary: p.summary,
      ...(p.details ? { details: p.details } : {}),
      ...(p.who ? { actorId: personId(p.who) } : {}),
      ...(actorName ? { actorName } : {}),
      occurredAt: iso(at),
      ingestedAt: iso(ingested),
      ...(p.repo ? { repo: p.repo } : {}),
      ...(p.branch ? { branch: p.branch } : {}),
      ...(p.stats ? { stats: p.stats } : {}),
      areas: p.areas,
      tags: p.tags ?? [],
      importance: p.imp,
      ...(p.ct ? { changeType: p.ct } : {}),
      clarity: p.unclear ? "unclear" : "clear",
      userFacing: p.ui ?? false,
      refs: p.refs ?? [],
      summarizedBy: { provider: "seed", model: "seed", mode: "none" },
    };
  }

  // ---- 1. hand-written events ---------------------------------------------
  for (const e of spec.events) {
    const at = resolveWhen(now, e.w, rng);
    const isCode = e.kind === "commit" || e.kind === "pull_request";
    pushEvent({
      key: e.key,
      event: makeEvent({
        kind: e.kind,
        at,
        title: e.title,
        summary: e.summary,
        details: e.details,
        who: e.who,
        actor: e.actor,
        areas: e.areas,
        tags: e.tags ?? [e.areas[0] ?? "general", ...(e.ct ? [e.ct] : [])],
        imp: e.imp,
        ct: e.ct,
        unclear: e.unclear,
        ui: e.ui,
        refs: e.refs,
        repo: e.repo ?? (isCode ? areaRepo(spec, e.areas[0] ?? "") : undefined),
        branch: isCode ? e.branch ?? "main" : undefined,
        stats: e.stats,
        externalId: e.kind === "commit" ? rng.hex(40) : `${spec.slug}:${e.key}`,
      }),
    });
  }

  // ---- 2. tickets ----------------------------------------------------------
  const tickets: Ticket[] = [];
  const ticketSpecs = new Map<number, { spec: TicketSpec; ticket: Ticket; closedAt?: Date }>();

  /** A time inside week bucket b (b0 = last seven days). */
  function placeInBucket(b: number, j: number, count: number): Date {
    for (let attempt = 0; attempt < 24; attempt++) {
      const day = b * 7 + 0.35 + (j + rng.float(0.1, 0.9)) * (6.3 / count);
      const t = resolveWhen(now, { d: day }, rng);
      const bucket = Math.floor((nowMs - t.getTime()) / (7 * DAY_MS));
      if (bucket === b) return t;
    }
    return new Date(nowMs - (b * 7 + 3.5) * DAY_MS);
  }

  function makeTicket(t: TicketSpec, status: Ticket["status"], closedAt: Date | undefined, overrides?: { description?: string; type?: TicketType; priority?: Ticket["priority"]; ct?: ChangeType }): Ticket {
    const type = overrides?.type ?? t.ty ?? "task";
    const priority = overrides?.priority ?? t.p ?? "P2";
    const msgEvent = t.msg ? keyIndex.get(t.msg.ref)?.event : undefined;
    if (t.msg && !msgEvent) throw new Error(`Ticket ${spec.key}-${t.n} references unknown message event ${t.msg.ref}`);
    let createdAt: Date;
    if (msgEvent) createdAt = new Date(new Date(msgEvent.occurredAt).getTime() + rng.int(25, 90) * 60_000);
    else if (closedAt) createdAt = new Date(closedAt.getTime() - rng.float(3, 12) * DAY_MS);
    else createdAt = new Date(nowMs - (t.c ?? rng.float(2, 14)) * DAY_MS);
    createdAt = maxDate(createdAt, new Date(startDate.getTime() + DAY_MS));
    if (createdAt.getTime() > nowMs - HOUR_MS) createdAt = new Date(nowMs - HOUR_MS);
    let updatedAt: Date;
    if (closedAt) updatedAt = closedAt;
    else if (status === "in_progress" || status === "in_review") updatedAt = new Date(nowMs - rng.float(0.2, 2) * DAY_MS);
    else if (status === "blocked") updatedAt = new Date(nowMs - rng.float(1, 3.5) * DAY_MS);
    else updatedAt = new Date(createdAt.getTime() + rng.float(0.2, 1.5) * DAY_MS);
    updatedAt = minDate(maxDate(updatedAt, createdAt), new Date(nowMs - 30 * 60_000));
    const reporter = t.msg ? t.msg.by : spec.team.includes("farah") && rng.chance(0.5) ? "farah" : spec.lead;
    const ticket: Ticket = {
      id: `tkt_${spec.slug}_${pad(t.n, 3)}`,
      projectId: spec.projectId,
      key: `${spec.key}-${t.n}`,
      title: t.t,
      description: overrides?.description ?? t.why,
      acceptanceCriteria: t.ac ?? [],
      type,
      priority,
      status,
      ...(status === "draft" ? {} : { assigneeId: personId(t.who) }),
      reporterId: personId(reporter),
      labels: t.labels ?? [t.a],
      ...(t.ms !== undefined ? { milestoneId: spec.milestoneIds[t.ms] } : {}),
      estimate: t.est ?? rng.pick([1, 2, 3, 3, 5, 5, 8]),
      origin: t.msg ? { kind: "message", text: t.msg.text } : { kind: "manual" },
      createdAt: iso(createdAt),
      updatedAt: iso(updatedAt),
      ...(closedAt ? { closedAt: iso(closedAt) } : {}),
    };
    return ticket;
  }

  // 2a. recent done tickets (newest first) are placed into buckets b0..b2.
  const recentBuckets = spec.buckets.slice(0, 3);
  const recentTotal = recentBuckets.reduce((a, b) => a + b, 0);
  if (recentTotal !== spec.done.length) {
    throw new Error(`${spec.slug}: done list has ${spec.done.length} tickets but buckets b0-b2 expect ${recentTotal}`);
  }
  let cursor = 0;
  recentBuckets.forEach((count, b) => {
    for (let j = 0; j < count; j++) {
      const t = spec.done[cursor++];
      const closedAt = t.pin ? resolveWhen(now, t.pin, rng) : placeInBucket(b, j, count);
      const ticket = makeTicket(t, "done", closedAt);
      tickets.push(ticket);
      ticketSpecs.set(t.n, { spec: t, ticket, closedAt });
    }
  });

  // 2b. older done tickets are generated from the project's noun list.
  const oldSlots: { b: number; j: number; count: number }[] = [];
  for (let b = 7; b >= 3; b--) {
    const count = spec.buckets[b] ?? 0;
    for (let j = count - 1; j >= 0; j--) oldSlots.push({ b, j, count });
  }
  const nounCount = Math.max(1, spec.histNouns.length);
  oldSlots.forEach((slot, i) => {
    const noun = spec.histNouns[i % nounCount];
    const v = VERBS[(i * 2 + Math.floor(i / nounCount)) % VERBS.length];
    const owners = spec.owners[noun.a] ?? [spec.lead];
    const who = owners[i % owners.length];
    const n = spec.histBase + i;
    const closedAt = placeInBucket(slot.b, slot.j, slot.count);
    const title = `${v.verb} ${noun.noun}`;
    const t: TicketSpec = { n, t: title, why: "", a: noun.a, who, ty: v.type, ms: spec.histMs[slot.b] ?? 0, p: v.type === "bug" ? "P2" : "P3" };
    const ticket = makeTicket(t, "done", closedAt, {
      description: `Routine ${noun.a} work from an earlier sprint: ${lcFirst(title)}. Closed before the current reporting window.`,
      type: v.type,
      priority: t.p,
    });
    tickets.push(ticket);
    ticketSpecs.set(n, { spec: t, ticket });
  });

  // 2c. open tickets.
  for (const t of spec.open) {
    if (!t.s || t.s === "done") throw new Error(`${spec.key}-${t.n}: open tickets need a non-done status`);
    const ticket = makeTicket(t, t.s, undefined);
    tickets.push(ticket);
    ticketSpecs.set(t.n, { spec: t, ticket });
  }

  // ---- 3. events derived from tickets -------------------------------------
  const commitStats = () => ({ additions: rng.int(18, 260), deletions: rng.int(2, 110), filesChanged: rng.int(2, 14) });
  const prStats = () => ({ additions: rng.int(80, 640), deletions: rng.int(15, 260), filesChanged: rng.int(5, 28) });

  function reviewerFor(t: TicketSpec): string {
    if (t.rev) return t.rev;
    if (t.who !== spec.lead && rng.chance(0.7)) return spec.lead;
    const others = spec.team.filter((k) => k !== t.who && k !== "farah");
    return rng.pick(others.length ? others : [spec.lead]);
  }

  function ticketEvents(t: TicketSpec, ticket: Ticket, closedAt?: Date) {
    const key = ticket.key;
    const baseImp = t.imp ?? defaultImportance(ticket.priority);
    const ct = t.ct ?? defaultChange(ticket.type);
    const areas = [t.a, ...(t.areas ?? [])];
    const tags = [t.a, ct, ...(t.ui ? ["client-visible"] : [])];
    const repo = areaRepo(spec, t.a);
    const branch = `${ticket.type === "bug" ? "fix" : "feature"}/${key.toLowerCase()}`;
    const author = personDef(t.who).name;
    const common = { areas, tags, refs: [key], repo, ui: t.ui ?? false, ct };

    if (closedAt) {
      const lastLimit = new Date(closedAt.getTime() - 45 * 60_000);
      const c1 = minDate(snapWork(new Date(closedAt.getTime() - rng.float(0.7, 2.6) * DAY_MS), rng), new Date(closedAt.getTime() - 3 * HOUR_MS));
      pushEvent({
        key: `${key}:commit`,
        event: makeEvent({ ...common, kind: "commit", at: c1, title: t.t, summary: t.why, who: t.who, imp: clampImp(baseImp - 1), branch, stats: commitStats(), externalId: rng.hex(40) }),
      });
      let last = c1;
      if (rng.chance(spec.secondCommitProb)) {
        const c2 = new Date(c1.getTime() + rng.float(4, 20) * HOUR_MS);
        if (c2.getTime() < closedAt.getTime() - 2 * HOUR_MS) {
          const at = snapWork(c2, rng);
          if (at.getTime() < closedAt.getTime() - 2 * HOUR_MS) {
            last = at;
            pushEvent({
              key: `${key}:commit2`,
              event: makeEvent({
                ...common,
                kind: "commit",
                at,
                title: `Add tests and handle edge cases for ${key}`,
                summary: `Follow-up on ${key}: adds tests and covers unusual cases so the change holds up with real data. Part of "${lcFirst(t.t)}".`,
                who: t.who,
                imp: 2,
                ct: "test",
                branch,
                stats: commitStats(),
                externalId: rng.hex(40),
              }),
            });
          }
        }
      }
      const prAt = minDate(maxDate(snapWork(new Date(closedAt.getTime() - rng.float(0.6, 3) * HOUR_MS), rng), new Date(last.getTime() + HOUR_MS)), lastLimit);
      pushEvent({
        key: `${key}:pr`,
        prFor: key,
        event: makeEvent({
          ...common,
          kind: "pull_request",
          at: prAt,
          title: `PR #{PR:${key}} merged: ${t.t}`,
          summary: `Merged after review. ${t.why}`,
          who: t.who,
          imp: baseImp,
          branch,
          stats: prStats(),
          externalId: `${spec.slug}:pr:${key}`,
        }),
      });
      if (rng.chance(spec.reviewProb)) {
        const reviewer = reviewerFor(t);
        const revAt = minDate(maxDate(new Date(prAt.getTime() - rng.float(0.5, 3) * HOUR_MS), new Date(last.getTime() + 20 * 60_000)), new Date(prAt.getTime() - 10 * 60_000));
        pushEvent({
          key: `${key}:review`,
          prFor: key,
          event: makeEvent({
            ...common,
            kind: "review",
            at: revAt,
            title: `Review of PR #{PR:${key}}: ${t.t}`,
            summary: `${personDef(reviewer).name} reviewed ${key} and ${rng.pick(REVIEW_NOTES)}.`,
            who: reviewer,
            imp: clampImp(baseImp - 1),
            externalId: `${spec.slug}:review:${key}`,
          }),
        });
      }
      return;
    }

    const status = ticket.status;
    if (status === "in_progress" || status === "in_review") {
      const c1 = resolveWhen(now, { d: status === "in_review" ? rng.float(1.5, 4.5) : rng.float(0.5, 3) }, rng);
      pushEvent({
        key: `${key}:commit`,
        event: makeEvent({ ...common, kind: "commit", at: c1, title: t.t, summary: `Work in progress on ${key}. ${t.why}`, who: t.who, imp: clampImp(baseImp - 1), branch, stats: commitStats(), externalId: rng.hex(40) }),
      });
      if (status === "in_progress" && rng.chance(0.4)) {
        const c2 = minDate(snapWork(new Date(c1.getTime() + rng.float(6, 30) * HOUR_MS), rng), new Date(nowMs - 2 * HOUR_MS));
        if (c2.getTime() > c1.getTime()) {
          pushEvent({
            key: `${key}:commit2`,
            event: makeEvent({ ...common, kind: "commit", at: c2, title: `Continue ${lcFirst(t.t)}`, summary: `Further progress on ${key}; the core of the change is in place and the author is now filling in the remaining cases.`, who: t.who, imp: 2, branch, stats: commitStats(), externalId: rng.hex(40) }),
          });
        }
      }
      if (status === "in_review") {
        const reviewer = reviewerFor(t);
        const prAt = minDate(new Date(c1.getTime() + rng.float(2, 9) * HOUR_MS), new Date(nowMs - 3 * HOUR_MS));
        pushEvent({
          key: `${key}:pr`,
          prFor: key,
          event: makeEvent({
            ...common,
            kind: "pull_request",
            at: maxDate(prAt, new Date(c1.getTime() + 30 * 60_000)),
            title: `PR #{PR:${key}} opened: ${t.t}`,
            summary: `${author} opened a pull request for ${key} and asked ${personDef(reviewer).name} to review. ${t.why}`,
            who: t.who,
            imp: baseImp,
            branch,
            stats: prStats(),
            externalId: `${spec.slug}:pr:${key}`,
          }),
        });
      }
    } else if (status === "blocked") {
      const c1 = resolveWhen(now, { d: rng.float(5, 8) }, rng);
      pushEvent({
        key: `${key}:commit`,
        event: makeEvent({ ...common, kind: "commit", at: c1, title: `Start ${lcFirst(t.t)}`, summary: `Initial groundwork for ${key}. ${t.why}`, who: t.who, imp: 2, branch, stats: commitStats(), externalId: rng.hex(40) }),
      });
      pushEvent({
        key: `${key}:blocked`,
        event: makeEvent({
          ...common,
          kind: "work_item",
          at: new Date(ticket.updatedAt),
          title: `${key} blocked: ${t.t}`,
          summary: t.note ?? `${key} cannot move forward until an outside dependency is resolved.`,
          who: t.who,
          imp: 4,
          tags: [t.a, "blocked"],
          repo: undefined,
          ct: undefined,
        }),
      });
    }
  }

  for (const [, rec] of ticketSpecs) {
    const { spec: ts, ticket, closedAt } = rec;
    // Only tickets with activity inside the 21-day window produce events.
    const within = closedAt ? nowMs - closedAt.getTime() < 21 * DAY_MS : true;
    if (within) ticketEvents(ts, ticket, closedAt);
    if (ts.msg && nowMs - new Date(ticket.createdAt).getTime() < 21 * DAY_MS) {
      const by = ts.msg.by;
      pushEvent({
        key: `${ticket.key}:created`,
        event: makeEvent({
          kind: "work_item",
          at: new Date(ticket.createdAt),
          title: `${ticket.key} created from a message: ${ts.t}`,
          summary: `A message in the project chat was converted into ticket ${ticket.key} (${ticket.priority}, ${ticket.type}) and assigned to ${personDef(ts.who).name}. ${ts.why}`,
          who: by,
          areas: [ts.a],
          tags: [ts.a, "from-message"],
          imp: 3,
          refs: [ticket.key],
        }),
      });
    }
  }

  // ---- 4. deployments ------------------------------------------------------
  const deployments: Deployment[] = [];
  const deploySpecs = new Map<number, DeploySpec>();
  for (const d of spec.deployments) {
    deploySpecs.set(d.n, d);
    const start = resolveWhen(now, d.w, rng);
    const shaEvent = d.shaOf ? keyIndex.get(d.shaOf)?.event : undefined;
    if (d.shaOf && !shaEvent) throw new Error(`Deployment ${d.n} references unknown event ${d.shaOf}`);
    const deployment: Deployment = {
      id: `dep_${spec.slug}_${pad(d.n, 2)}`,
      projectId: spec.projectId,
      environment: d.env,
      provider: "simulated",
      status: d.status,
      version: d.version,
      commitSha: shaEvent?.externalId ?? rng.hex(40),
      ref: "main",
      externalId: `run_${spec.slug}_${pad(d.n, 2)}`,
      startedAt: iso(start),
      finishedAt: iso(new Date(start.getTime() + d.mins * 60_000)),
      triggeredById: personId(d.who),
      ...(d.log ? { logExcerpt: d.log } : {}),
    };
    deployments.push(deployment);
    const failed = d.status === "failed";
    if (d.noEvent) continue;
    pushEvent({
      key: `dep:${d.n}`,
      event: makeEvent({
        kind: "deployment",
        at: new Date(start.getTime() + d.mins * 60_000),
        title: failed ? `${d.env === "production" ? "Production" : "Staging"} deployment ${d.version} failed` : `${d.version} deployed to ${d.env}`,
        summary: d.note,
        who: d.who,
        areas: ["infra"],
        tags: [d.env, d.status, "deployment"],
        imp: d.imp ?? (d.env === "production" ? (failed ? 5 : 4) : 2),
        ct: "infra",
        ui: d.env === "production" && d.status === "success",
        refs: [],
        repo: spec.repo,
        externalId: deployment.externalId,
      }),
    });
  }

  // ---- 5. order, number and link -------------------------------------------
  pending.sort((a, b) => a.event.occurredAt.localeCompare(b.event.occurredAt));
  const prNumbers = new Map<string, number>();
  let nextPr = spec.prBase;
  for (const p of pending) {
    if (p.prFor && p.key.endsWith(":pr")) prNumbers.set(p.prFor, nextPr++);
  }
  const replacePr = (text: string): string => text.replace(/#\{PR:([A-Z0-9-]+)\}/g, (_m, k: string) => `#${prNumbers.get(k) ?? 0}`);
  const idByKey = new Map<string, string>();
  const eventByKey = new Map<string, ProjectEvent>();
  pending.forEach((p, i) => {
    p.event.id = `evt_${spec.slug}_${pad(i + 1, 3)}`;
    p.event.title = replacePr(p.event.title);
    p.event.summary = replacePr(p.event.summary);
    if (p.event.externalId) p.event.externalId = replacePr(p.event.externalId);
    idByKey.set(p.key, p.event.id);
    eventByKey.set(p.key, p.event);
  });
  for (const [, rec] of ticketSpecs) {
    if (rec.spec.msg) rec.ticket.origin.ref = idByKey.get(rec.spec.msg.ref);
  }
  tickets.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));

  return {
    spec,
    events: pending.map((p) => p.event),
    tickets,
    deployments,
    eventId(key) {
      const id = idByKey.get(key);
      if (!id) throw new Error(`Unknown event key ${spec.slug}:${key}`);
      return id;
    },
    event(key) {
      const e = eventByKey.get(key);
      if (!e) throw new Error(`Unknown event key ${spec.slug}:${key}`);
      return e;
    },
    ticket(n) {
      const t = ticketSpecs.get(n);
      if (!t) throw new Error(`Unknown ticket ${spec.key}-${n}`);
      return t.ticket;
    },
    deployment(n) {
      const d = deployments.find((x) => x.id === `dep_${spec.slug}_${pad(n, 2)}`);
      if (!d) throw new Error(`Unknown deployment ${n}`);
      return d;
    },
  };
}
