import { activityAnalyst, type AnalysisInput, type DigestItem } from "@/lib/agents/defs/activity-analyst";
import { digestEditor } from "@/lib/agents/defs/digest-editor";
import { releaseNotesWriter, type ReleaseNotes } from "@/lib/agents/defs/release-notes-writer";
import { riskScout } from "@/lib/agents/defs/risk-scout";
import { codeStep, runAgent, withRun, type RunEvent } from "@/lib/agents/runtime";
import { EvidenceBag, checkGrounding, extractRefs, loadPeople, loadProjectData, stripInvalidRefs } from "@/lib/knowledge/evidence";
import { computePace } from "@/lib/metrics";
import { audit } from "@/lib/security/audit";
import { getStore } from "@/lib/store";
import type { Actor, DailyDigest, PaceMetrics, ProjectEvent, Project, ReleaseCard, RunTrigger, Ticket } from "@/lib/types";
import { DAY, isoDate, truncate, uniq } from "@/lib/util";

const MAX_EVENTS = 40;

interface Gathered {
  bag: EvidenceBag;
  items: DigestItem[];
  windowEvents: ProjectEvent[];
  stats: DailyDigest["stats"];
  pace: PaceMetrics;
  windowLabel: string;
  windowStart: string;
}

function within(iso: string | undefined, from: number, to: number): boolean {
  if (!iso) return false;
  const at = new Date(iso).getTime();
  return at >= from && at <= to;
}

function flagsForTicket(ticket: Ticket, extra: string[]): string[] {
  const flags = [...extra];
  if (ticket.status === "blocked") flags.push("blocked");
  if (ticket.status === "in_progress" || ticket.status === "in_review") flags.push("in_progress");
  return flags;
}

/**
 * Daily sync: what changed since the last digest (at least 24 hours, at most 72), written up
 * by three analysts working in parallel and merged by an editor. Re-running on the same date
 * replaces that day's digest.
 */
export async function runDailySync(args: { project: Project; actor: Actor; trigger: RunTrigger; date?: string; onEvent?: (e: RunEvent) => void }): Promise<DailyDigest> {
  const { project, actor } = args;
  if (!project.features.dailySync) throw new Error(`Daily sync is disabled for project ${project.name}.`);
  const store = await getStore();
  const now = new Date();
  const date = args.date ?? isoDate(now);
  const digestId = `dig_${project.id}_${date}`;

  const { result } = await withRun(
    { workflow: "daily-sync", title: `Daily sync for ${project.name}, ${date}`, actor, project, trigger: args.trigger, input: `${project.name} ${date}`, onEvent: args.onEvent },
    async (ctx) => {
      // 1. Retrieval: window, evidence, computed figures.
      const gathered = await codeStep<Gathered>(
        ctx,
        "gather-activity",
        "Gather activity and metrics",
        `Window for ${project.name}`,
        async () => {
          const data = await loadProjectData(project, actor);
          const people = await loadPeople();
          const previous = data.digests.find((d) => d.id !== digestId);
          const nowMs = now.getTime();
          const prevMs = previous ? new Date(previous.createdAt).getTime() : nowMs - 3 * DAY;
          const startMs = Math.min(Math.max(prevMs, nowMs - 3 * DAY), nowMs - DAY);
          const windowLabel = `${new Date(startMs).toISOString().slice(0, 16).replace("T", " ")} to ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`;

          const windowEvents = data.events.filter((e) => within(e.occurredAt, startMs, nowMs));
          const closed = data.tickets.filter((t) => t.status === "done" && within(t.closedAt ?? t.updatedAt, startMs, nowMs));
          const opened = data.tickets.filter((t) => within(t.createdAt, startMs, nowMs));
          const blocked = data.tickets.filter((t) => t.status === "blocked");
          const deployments = data.deployments.filter((d) => within(d.finishedAt ?? d.startedAt, startMs, nowMs));
          const openIncidents = data.incidents.filter((i) => i.status !== "resolved");
          const openThreads = data.threads.filter((t) => t.status === "open");
          const pace = computePace(project, data.tickets, now);

          const bag = new EvidenceBag(people);
          const items: DigestItem[] = [];
          const ranked = [...windowEvents].sort((a, b) => b.importance - a.importance || b.occurredAt.localeCompare(a.occurredAt)).slice(0, MAX_EVENTS);
          for (const event of ranked) {
            const ev = bag.addEvent(event);
            items.push({ ref: ev.ref, type: "event", title: event.title, summary: event.summary, areas: event.areas, importance: event.importance, changeType: event.changeType, userFacing: event.userFacing, flags: event.clarity === "unclear" ? ["unclear"] : [] });
          }
          const addTicket = (ticket: Ticket, extra: string[]) => {
            const ev = bag.addTicket(ticket);
            const existing = items.find((i) => i.ref === ev.ref);
            if (existing) existing.flags.push(...extra);
            else items.push({ ref: ev.ref, type: "ticket", title: ticket.title, summary: truncate(ticket.description, 160), areas: [], importance: ticket.priority === "P0" ? 5 : ticket.priority === "P1" ? 4 : 3, userFacing: false, flags: flagsForTicket(ticket, extra) });
          };
          closed.slice(0, 12).forEach((t) => addTicket(t, ["closed"]));
          opened.slice(0, 12).forEach((t) => addTicket(t, ["opened"]));
          blocked.slice(0, 8).forEach((t) => addTicket(t, ["blocked"]));
          data.tickets.filter((t) => (t.status === "in_progress" || t.status === "todo") && (t.priority === "P0" || t.priority === "P1")).slice(0, 5).forEach((t) => addTicket(t, ["todo_priority"]));
          for (const deployment of deployments.slice(0, 8)) {
            const ev = bag.addDeployment(deployment);
            const failed = deployment.status === "failed" || deployment.status === "degraded" || deployment.status === "rolled_back";
            items.push({ ref: ev.ref, type: "deployment", title: ev.title, summary: truncate(ev.text, 160), areas: ["deploy"], importance: failed ? 5 : 3, userFacing: deployment.environment === "production", flags: failed ? ["failed"] : [] });
          }
          for (const incident of openIncidents.slice(0, 5)) {
            const ev = bag.addIncident(incident);
            items.push({ ref: ev.ref, type: "incident", title: ev.title, summary: truncate(ev.text, 160), areas: [], importance: 5, userFacing: false, flags: ["open_incident"] });
          }
          for (const thread of openThreads.slice(0, 5)) {
            const ev = bag.addThread(thread);
            items.push({ ref: ev.ref, type: "thread", title: thread.subject, summary: truncate(ev.text, 160), areas: [], importance: 3, userFacing: false, flags: ["open_question"] });
          }
          const paceRisk = pace.status === "behind" || pace.status === "at_risk" || pace.velocityTrendPct <= -20;
          const paceEv = bag.addMetric(`pace:${project.id}:${date}`, "Pace and progress", `Progress ${pace.progressPct}% of scoped tickets done; ${pace.timeElapsedPct}% of schedule elapsed; pace ${pace.status}; ${pace.blockedTickets} blocked, ${pace.openTickets} open. ${pace.explanation}`, project.id);
          items.push({ ref: paceEv.ref, type: "metric", title: "Pace and progress", summary: pace.explanation, areas: [], importance: 3, userFacing: false, flags: paceRisk ? ["pace_risk"] : [] });
          const upcoming = project.milestones.filter((m) => m.status !== "done" && new Date(m.dueDate).getTime() - nowMs <= 14 * DAY).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3);
          for (const m of upcoming) {
            const ev = bag.addMetric(`milestone:${m.id}`, `Milestone ${m.name}`, `Milestone "${m.name}" is ${m.status.replace("_", " ")} and due ${isoDate(m.dueDate)}.`, project.id);
            items.push({ ref: ev.ref, type: "metric", title: m.name, summary: `due ${isoDate(m.dueDate)}, ${m.status.replace("_", " ")}`, areas: [], importance: 3, userFacing: false, flags: ["milestone_upcoming", ...(m.status === "at_risk" ? ["pace_risk"] : [])] });
          }

          const stats: DailyDigest["stats"] = {
            events: windowEvents.length,
            commits: windowEvents.filter((e) => e.kind === "commit").length,
            ticketsClosed: closed.length,
            ticketsOpened: opened.length,
            deployments: deployments.length,
            contributors: uniq(windowEvents.map((e) => e.actorId ?? e.actorName).filter((v): v is string => Boolean(v))).length,
          };
          return { bag, items, windowEvents, stats, pace, windowLabel, windowStart: new Date(startMs).toISOString() };
        },
        (g) => `${g.stats.events} events, ${g.stats.ticketsClosed} tickets closed, ${g.stats.deployments} deployments, ${g.bag.size} evidence records`,
      );

      const { bag, items, windowEvents, stats, windowLabel } = gathered;
      const statsLine = `${stats.events} event${stats.events === 1 ? "" : "s"}, ${stats.commits} commit${stats.commits === 1 ? "" : "s"}, ${stats.ticketsClosed} ticket${stats.ticketsClosed === 1 ? "" : "s"} closed, ${stats.ticketsOpened} opened, ${stats.deployments} deployment${stats.deployments === 1 ? "" : "s"}, ${stats.contributors} contributor${stats.contributors === 1 ? "" : "s"}`;

      let headline: string;
      let summary: string;
      let highlights: string[] = [];
      let risks: string[] = [];
      let nextUp: string[] = [];
      let rawCards: ReleaseNotes["cards"] = [];

      if (windowEvents.length === 0) {
        headline = "No recorded activity in this period";
        summary = `No activity was recorded for ${project.name} between ${windowLabel}. ${stats.ticketsClosed || stats.ticketsOpened ? `Ticket changes: ${stats.ticketsClosed} closed, ${stats.ticketsOpened} opened.` : "No ticket changes were recorded either."}`;
        const paceItem = items.find((i) => i.type === "metric" && i.flags.includes("pace_risk"));
        if (paceItem) risks = [`${paceItem.summary} [${paceItem.ref}]`];
      } else {
        // 2. Three analysts in parallel.
        const input: AnalysisInput = { projectName: project.name, window: windowLabel, evidence: bag.render(), items };
        const [analysis, notes, scouting] = await Promise.all([
          runAgent(ctx, activityAnalyst, input, { group: "analysis" }),
          project.features.releaseNotes ? runAgent(ctx, releaseNotesWriter, input, { group: "analysis" }) : Promise.resolve<ReleaseNotes>({ cards: [] }),
          runAgent(ctx, riskScout, input, { group: "analysis" }),
        ]);
        rawCards = notes.cards;
        // 3. Editor merges them.
        const draft = await runAgent(ctx, digestEditor, { projectName: project.name, date, window: windowLabel, statsLine, analysis, cards: notes.cards, scouting, evidence: bag.render() });
        headline = truncate(draft.headline, 140);
        summary = draft.summary;
        highlights = draft.highlights;
        risks = draft.risks;
        nextUp = draft.nextUp;
      }

      // 4. Verify, persist, audit.
      return codeStep(
        ctx,
        "store-digest",
        "Verify citations and store the digest",
        `digest ${digestId}`,
        async () => {
          const clean = (text: string) => stripInvalidRefs(text, bag).trim();
          summary = clean(summary);
          highlights = highlights.map(clean).filter(Boolean);
          risks = risks.map(clean).filter(Boolean);
          nextUp = nextUp.map(clean).filter(Boolean);
          const eventById = new Map(windowEvents.map((e) => [e.id, e]));
          const cards: ReleaseCard[] = [];
          const cardRefs: string[] = [];
          for (const card of rawCards) {
            const refs = card.refs.map((r) => r.replace(/[[\]\s]/g, "")).filter((r) => bag.get(r)?.type === "event");
            const eventIds = uniq(refs.map((r) => bag.get(r)?.id).filter((id): id is string => Boolean(id)));
            if (!eventIds.length) continue; // a card nothing supports is dropped
            cardRefs.push(...refs);
            cards.push({
              id: `card_${digestId}_${cards.length + 1}`,
              title: truncate(card.title, 90),
              summary: stripInvalidRefs(card.summary, bag).trim(),
              changeType: card.changeType,
              audience: card.audience,
              eventIds,
              contributorIds: uniq(eventIds.map((id) => eventById.get(id)?.actorId).filter((id): id is string => Boolean(id))),
            });
          }
          const text = [headline, summary, ...highlights, ...risks, ...nextUp].join("\n");
          const used = uniq([...extractRefs(text), ...cardRefs]).filter((ref) => bag.get(ref));
          const grounding = checkGrounding([summary, ...highlights, ...risks, ...nextUp].join("\n"), bag);
          ctx.run.grounding = grounding;
          const digest: DailyDigest = {
            id: digestId,
            projectId: project.id,
            date,
            headline,
            summary,
            highlights,
            risks,
            nextUp,
            cards,
            stats,
            citations: bag.citations(used),
            createdAt: new Date().toISOString(),
            runId: ctx.run.id,
          };
          await store.put("digests", digest);
          await audit(actor, "digest.generate", { projectId: project.id, target: digest.id, detail: `${stats.events} events, grounding ${grounding.verdict}` });
          return digest;
        },
        (d) => `stored ${d.id}: ${d.highlights.length} highlights, ${d.risks.length} risks, ${d.cards.length} cards, ${d.citations.length} citations`,
      );
    },
    (d) => d.headline,
  );
  return result;
}
