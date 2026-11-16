import { reportReviewer } from "@/lib/agents/defs/report-reviewer";
import { reportWriter, stripComments, type BucketEntry, type ReportWriterInput } from "@/lib/agents/defs/report-writer";
import { codeStep, runAgent, runTextAgent, withRun, type RunEvent } from "@/lib/agents/runtime";
import { EvidenceBag, checkGrounding, extractRefs, loadPeople, loadProjectData, stripInvalidRefs, type ProjectData } from "@/lib/knowledge/evidence";
import { computePace } from "@/lib/metrics";
import { audit } from "@/lib/security/audit";
import { getStore } from "@/lib/store";
import { DEFAULT_TEMPLATES, TEMPLATE_LABELS, renderTemplate } from "@/lib/templates";
import type { Actor, Health, Incident, PaceMetrics, Project, ProjectEvent, Report, ReportKind, RunTrigger, Ticket } from "@/lib/types";
import { DAY, HOUR, formatDate, isoDate, newId, truncate, uniq } from "@/lib/util";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "9-16 Nov 2026", "28 Oct - 4 Nov 2026" or "28 Dec 2026 - 4 Jan 2027". */
export function formatPeriod(start: Date, end: Date): string {
  const [sd, sm, sy] = [start.getUTCDate(), MONTHS[start.getUTCMonth()], start.getUTCFullYear()];
  const [ed, em, ey] = [end.getUTCDate(), MONTHS[end.getUTCMonth()], end.getUTCFullYear()];
  if (sy !== ey) return `${sd} ${sm} ${sy} - ${ed} ${em} ${ey}`;
  if (sm !== em) return `${sd} ${sm} - ${ed} ${em} ${ey}`;
  return sd === ed ? `${ed} ${em} ${ey}` : `${sd}-${ed} ${em} ${ey}`;
}

/**
 * Simple health rule, shown to the client as the "Health" cell:
 *  red   - pace is "behind", or an open SEV1/SEV2 incident exists
 *  amber - pace is "at_risk", or any other open incident, or three or more blocked tickets
 *  green - otherwise
 */
export function healthOf(pace: PaceMetrics, incidents: Incident[]): Health {
  const open = incidents.filter((i) => i.status !== "resolved");
  if (pace.status === "behind" || open.some((i) => i.severity === "SEV1" || i.severity === "SEV2")) return "red";
  if (pace.status === "at_risk" || open.length > 0 || pace.blockedTickets >= 3) return "amber";
  return "green";
}

const inRange = (iso: string | undefined, from: number, to: number) => {
  if (!iso) return false;
  const at = new Date(iso).getTime();
  return at >= from && at <= to;
};
const closedAt = (t: Ticket) => (t.status === "done" ? (t.closedAt ?? t.updatedAt) : undefined);
const byImportance = (a: ProjectEvent, b: ProjectEvent) => b.importance - a.importance || b.occurredAt.localeCompare(a.occurredAt);

/** Generates a progress, incident or release-notes report from cited evidence and the project's template. */
export async function generateReport(args: { project: Project; actor: Actor; kind: ReportKind; periodDays?: number; incidentId?: string; trigger: RunTrigger; onEvent?: (e: RunEvent) => void }): Promise<Report> {
  const { project, actor, kind } = args;
  if (!project.features.reports) throw new Error(`Reports are disabled for project ${project.name}.`);
  if (kind === "incident" && !args.incidentId) throw new Error("An incident report needs an incidentId.");
  const store = await getStore();
  const now = new Date();
  const label = TEMPLATE_LABELS[kind].label;

  const { result } = await withRun(
    { workflow: "report", title: `${label} for ${project.name}`, actor, project, trigger: args.trigger, input: `${kind} report for ${project.name}`, onEvent: args.onEvent },
    async (ctx) => {
      const prepared = await codeStep(
        ctx,
        "gather-evidence",
        "Gather evidence and fill template",
        `${kind} report for ${project.name}`,
        async () => {
          const data: ProjectData = await loadProjectData(project, actor);
          const people = await loadPeople();
          const incident = kind === "incident" ? data.incidents.find((i) => i.id === args.incidentId) : undefined;
          if (kind === "incident" && !incident) throw new Error(`Incident ${args.incidentId} was not found in project ${project.name}.`);

          const endMs = now.getTime();
          const days = args.periodDays ?? (kind === "release_notes" ? 14 : 7);
          const startMs = incident ? new Date(incident.detectedAt).getTime() - 48 * HOUR : endMs - days * DAY;
          const start = new Date(startMs);
          const period = formatPeriod(start, now);
          const bag = new EvidenceBag(people);
          const buckets: Record<string, BucketEntry[]> = {};
          const push = (bucket: string, text: string, refs: string[]) => (buckets[bucket] ??= []).push({ text, refs });
          const pace = computePace(project, data.tickets, now);
          const health = healthOf(pace, data.incidents);

          const periodEvents = data.events.filter((e) => inRange(e.occurredAt, startMs, endMs)).sort(byImportance);
          const closed = data.tickets.filter((t) => inRange(closedAt(t), startMs, endMs));
          const opened = data.tickets.filter((t) => inRange(t.createdAt, startMs, endMs));
          const periodDeployments = data.deployments.filter((d) => inRange(d.finishedAt ?? d.startedAt, startMs, endMs));
          const addEvent = (e: ProjectEvent) => bag.addEvent(e).ref;
          const addTicket = (t: Ticket) => bag.addTicket(t).ref;
          const paceRef = bag.addMetric(`pace:${project.id}:${isoDate(now)}`, "Pace and progress", `Progress ${pace.progressPct}% of scoped tickets done; ${pace.timeElapsedPct}% of schedule elapsed; pace ${pace.status}; velocity ${pace.velocity} tickets per week (${pace.velocityTrendPct}% vs previous four weeks); ${pace.openTickets} open, ${pace.blockedTickets} blocked. ${pace.explanation}`, project.id).ref;
          const upcoming = project.milestones.filter((m) => m.status !== "done").sort((a, b) => a.dueDate.localeCompare(b.dueDate));

          if (kind === "progress") {
            const events = periodEvents.slice(0, 50);
            events.forEach(addEvent);
            const blocked = data.tickets.filter((t) => t.status === "blocked");
            const inProgress = data.tickets.filter((t) => t.status === "in_progress" || t.status === "in_review");
            const next = data.tickets.filter((t) => t.status === "todo").sort((a, b) => a.priority.localeCompare(b.priority)).slice(0, 8);
            for (const t of closed.slice(0, 20)) push("delivered", `Completed ${t.key}: ${t.title}.`, [addTicket(t)]);
            for (const e of events.filter((ev) => ev.importance >= 4 || ev.userFacing).slice(0, 8)) push("delivered", `${e.title}. ${truncate(e.summary, 160)}`, [addEvent(e)]);
            for (const t of inProgress.slice(0, 10)) push("in_progress", `${t.key}: ${t.title} is ${t.status.replace("_", " ")}${t.dueDate ? `, due ${isoDate(t.dueDate)}` : ""}.`, [addTicket(t)]);
            for (const t of blocked.slice(0, 8)) push("risks", `Blocked: ${t.key} ${t.title}.`, [addTicket(t)]);
            for (const e of periodEvents.filter((ev) => ev.clarity === "unclear").slice(0, 3)) push("risks", `A significant change has no stated purpose: ${e.title}.`, [addEvent(e)]);
            if (pace.status === "behind" || pace.status === "at_risk") push("risks", `Pace is ${pace.status.replace("_", " ")}: ${truncate(pace.explanation, 200)}`, [paceRef]);
            for (const i of data.incidents.filter((x) => x.status !== "resolved").slice(0, 3)) push("risks", `Open incident ${i.key} (${i.severity}): ${i.title}.`, [bag.addIncident(i).ref]);
            for (const th of data.threads.filter((x) => x.status === "open").slice(0, 4)) push("risks", `Open question: ${th.subject}.`, [bag.addThread(th).ref]);
            for (const d of periodDeployments.slice(0, 6)) {
              const ref = bag.addDeployment(d).ref;
              push(d.status === "failed" || d.status === "degraded" ? "risks" : "delivered", `Deployment to ${d.environment}${d.version ? ` of ${d.version}` : ""}: ${d.status}.`, [ref]);
            }
            for (const t of next) push("next", `Planned: ${t.key} ${t.title} (${t.priority}).`, [addTicket(t)]);
            for (const m of upcoming.slice(0, 2)) push("next", `Work toward milestone "${m.name}", due ${isoDate(m.dueDate)}.`, [bag.addMetric(`milestone:${m.id}`, `Milestone ${m.name}`, `Milestone "${m.name}" is ${m.status.replace("_", " ")} and due ${isoDate(m.dueDate)}.`, project.id).ref]);
            const m0 = upcoming[0];
            if (m0) push("milestone", `${m0.name}, due ${isoDate(m0.dueDate)}`, [bag.addMetric(`milestone:${m0.id}`, `Milestone ${m0.name}`, "", project.id).ref]);
            push("summary", `The project is ${health} and pace is ${pace.status.replace("_", " ")}, with ${pace.progressPct}% of scoped tickets done against ${pace.timeElapsedPct}% of the schedule elapsed.`, [paceRef]);
            if (closed.length || opened.length) push("summary", `In this period ${closed.length} ticket${closed.length === 1 ? " was" : "s were"} closed and ${opened.length} opened.`, closed.length ? [addTicket(closed[0])] : [addTicket(opened[0])]);
          } else if (kind === "release_notes") {
            const userEvents = periodEvents.filter((e) => e.userFacing).slice(0, 40);
            userEvents.forEach(addEvent);
            const releaseTickets = closed.filter((t) => t.type === "feature" || t.type === "bug");
            for (const e of userEvents) {
              const text = `${e.title}. ${truncate(e.summary, 160)}`;
              if (e.changeType === "feature") push("features", text, [addEvent(e)]);
              else if (e.changeType === "fix") push("fixes", text, [addEvent(e)]);
              else push("improvements", text, [addEvent(e)]);
            }
            for (const t of releaseTickets.slice(0, 20)) push(t.type === "feature" ? "features" : "fixes", `${t.title} (${t.key}).`, [addTicket(t)]);
            for (const t of data.tickets.filter((x) => x.type === "bug" && x.status !== "done" && x.status !== "cancelled" && (x.priority === "P0" || x.priority === "P1")).slice(0, 5)) push("known", `${t.key}: ${t.title} is still ${t.status.replace("_", " ")}.`, [addTicket(t)]);
            for (const d of periodDeployments.slice(0, 8)) {
              const ref = bag.addDeployment(d).ref;
              push("summary", `Deployment to ${d.environment}${d.version ? ` of ${d.version}` : ""}: ${d.status}.`, [ref]);
              if (d.status === "degraded" || d.status === "rolled_back") push("upgrade", `The ${d.environment} deployment ${d.version ?? ""} ended as ${d.status.replace("_", " ")}; check behaviour after upgrading.`, [ref]);
            }
            if (userEvents.length || releaseTickets.length) push("summary", `This release covers ${userEvents.length} user-facing change${userEvents.length === 1 ? "" : "s"} and ${releaseTickets.length} completed feature or bug ticket${releaseTickets.length === 1 ? "" : "s"}.`, [userEvents[0] ? addEvent(userEvents[0]) : addTicket(releaseTickets[0])]);
          } else if (incident) {
            const incRef = bag.addIncident(incident).ref;
            const suspects = (incident.triage?.suspectEventIds ?? []).map((id) => data.events.find((e) => e.id === id)).filter((e): e is ProjectEvent => Boolean(e));
            suspects.forEach(addEvent);
            const trigger = incident.trigger.deploymentId ? data.deployments.find((d) => d.id === incident.trigger.deploymentId) : undefined;
            const depRef = trigger ? bag.addDeployment(trigger).ref : undefined;
            periodEvents.slice(0, 30).forEach(addEvent);
            for (const d of periodDeployments.slice(0, 5)) bag.addDeployment(d);
            const refs = depRef ? [incRef, depRef] : [incRef];
            push("summary", `${incident.key} (${incident.severity}) ${incident.title} is ${incident.status.replace("_", " ")}.${incident.resolvedAt ? ` It was resolved on ${formatDate(incident.resolvedAt)}.` : ""}`, [incRef]);
            if (incident.triage) {
              push("impact", incident.triage.impact, [incRef]);
              push("cause", `Suspected cause (confidence ${Math.round(incident.triage.confidence * 100)}%): ${incident.triage.suspectedCause}`, [incRef]);
              for (const s of suspects) push("cause", `Suspect change: ${s.title}.`, [addEvent(s)]);
              for (const step of incident.triage.nextSteps) push("followup", step, [incRef]);
            }
            if (trigger) push("cause", `The incident was detected after a ${trigger.environment} deployment (${trigger.status}).`, refs);
            for (const entry of incident.timeline) push("timeline", `${entry.at.slice(0, 16).replace("T", " ")} UTC - ${entry.text}`, [incRef]);
            if (incident.fix) {
              push("resolution", `Fix (${incident.fix.kind}, ${incident.fix.status}): ${incident.fix.summary}`, [incRef]);
              for (const s of incident.fix.steps) push("followup", s, [incRef]);
            }
            for (const r of incident.reviews) {
              push("wentwell", `Fix review round ${r.round}: ${r.verdict}${r.concerns.length ? `, concerns: ${r.concerns.join("; ")}` : ""}.`, [incRef]);
            }
          }
          const template = project.templates[kind] ?? DEFAULT_TEMPLATES[kind];
          const filled = renderTemplate(template, {
            project_name: project.name,
            client: project.client,
            period,
            date: isoDate(now),
            prepared_by: actor.name,
            health: health.charAt(0).toUpperCase() + health.slice(1),
            progress_pct: pace.progressPct,
            pace_status: pace.status.replace("_", " "),
            incident_key: incident?.key,
            severity: incident?.severity,
          });
          return { bag, buckets, template: filled, period, startMs, incident };
        },
        (p) => `${p.bag.size} evidence records, ${Object.keys(p.buckets).length} populated sections`,
      );

      const { bag, buckets, period, incident } = prepared;
      const headings = Array.from(prepared.template.matchAll(/^#{2,6}\s+(.+?)\s*$/gm)).map((m) => m[1]);
      const writerInput: ReportWriterInput = { kind, projectName: project.name, periodLabel: period, template: prepared.template, evidence: bag.render(), buckets };
      const finish = (text: string) => stripInvalidRefs(stripComments(text), bag).trim();

      let markdown = finish(await runTextAgent(ctx, reportWriter, writerInput, { stream: Boolean(args.onEvent) }));
      const review = async (text: string) => {
        const grounding = checkGrounding(text, bag);
        const verdict = await runAgent(ctx, reportReviewer, { kind, markdown: text, evidence: bag.render(), requiredHeadings: headings, grounding });
        return { grounding, verdict };
      };
      let reviewed = await review(markdown);
      const writerStep = ctx.run.steps.filter((s) => s.agent === reportWriter.name).pop();
      if (reviewed.verdict.verdict === "revise" && writerStep?.mode === "llm") {
        const notes = uniq([...reviewed.verdict.issues, ...reviewed.verdict.unsupportedClaims.map((c) => `Remove or support: ${c}`)]);
        markdown = finish(await runTextAgent(ctx, reportWriter, { ...writerInput, revisionNotes: notes }, { stream: false, title: "Revise the report" }));
        reviewed = { grounding: checkGrounding(markdown, bag), verdict: reviewed.verdict };
      }
      ctx.run.grounding = reviewed.grounding;

      return codeStep(
        ctx,
        "store-report",
        "Store the report",
        `${kind} report`,
        async () => {
          const used = extractRefs(markdown).filter((ref) => bag.get(ref));
          const title = `${project.name} - ${incident ? `${label} ${incident.key}` : label}, ${period}`;
          const report: Report = {
            id: newId("rep"),
            projectId: project.id,
            kind,
            title,
            periodStart: new Date(prepared.startMs).toISOString(),
            periodEnd: now.toISOString(),
            markdown: `${markdown}\n`,
            citations: bag.citations(used),
            grounding: reviewed.grounding,
            createdById: actor.id,
            createdAt: new Date().toISOString(),
            runId: ctx.run.id,
            relatedIncidentId: incident?.id,
          };
          await store.put("reports", report);
          await audit(actor, "report.generate", { projectId: project.id, target: report.id, detail: `${kind}, grounding ${reviewed.grounding.verdict}` });
          return report;
        },
        (r) => `stored ${r.id}: ${r.citations.length} citations, grounding ${r.grounding?.verdict}`,
      );
    },
    (r) => r.title,
  );
  return result;
}
