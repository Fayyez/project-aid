import { z } from "zod";
import { fixProposer, fixReviewer, incidentInvestigator, incidentTriager, type FixOutput, type ReviewOutput, type TriageOutput } from "@/lib/agents/defs/incident";
import { codeStep, runAgent, runToolAgent, withRun, type RunEvent } from "@/lib/agents/runtime";
import { assertProjectAccess, assertWrite } from "@/lib/auth/access";
import { openDraftPullRequestStub } from "@/lib/connectors";
import { EvidenceBag, extractRefs, loadPeople, loadProjectData, searchEvents, stripInvalidRefs, type ProjectData } from "@/lib/knowledge/evidence";
import type { ToolSpec } from "@/lib/llm";
import { audit } from "@/lib/security/audit";
import { getStore } from "@/lib/store";
import type { Actor, Deployment, FixProposal, FixReview, Incident, IncidentTriage, Project, ProjectEvent, RunTrigger } from "@/lib/types";
import { DAY, HOUR, isoDate, newId, nowIso, truncate } from "@/lib/util";

const OPEN = new Set<Incident["status"]>(["detected", "triaging", "fix_proposed", "awaiting_approval", "escalated"]);
const MAX_REVIEW_ROUNDS = 2;

/** Mechanical checks applied to every proposal, whatever the reviewer says. */
export function safetyChecks(fix: FixOutput): { name: string; passed: boolean; detail: string }[] {
  const text = `${fix.summary}\n${fix.steps.join("\n")}\n${fix.patch ?? ""}`;
  const destructive = /\b(drop\s+(table|database|schema)|truncate\s+table|delete\s+from\s+\w+\s*;|rm\s+-rf|force[- ]push|push\s+--force|--no-verify|skip (the )?(review|tests|ci)|disable (the )?(tests|checks|auth))/i.exec(text);
  return [
    { name: "No destructive operations", passed: !destructive, detail: destructive ? `Contains "${destructive[0]}".` : "No destructive or review-bypassing commands found." },
    { name: "Rollback plan present", passed: fix.rollbackPlan.trim().length >= 20, detail: fix.rollbackPlan.trim().length >= 20 ? "A rollback plan is described." : "The rollback plan is missing or too thin." },
    { name: "Test plan present", passed: fix.testPlan.length >= 2, detail: `${fix.testPlan.length} verification step${fix.testPlan.length === 1 ? "" : "s"}.` },
    { name: "No secrets in the proposal", passed: !/(api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{12,}/i.test(text), detail: "Scanned for credential-like values." },
  ];
}

function incidentTools(bag: EvidenceBag, data: ProjectData, failedAt: string): ToolSpec[] {
  const render = (refs: string[]) =>
    refs.length
      ? refs
          .map((ref) => bag.get(ref))
          .map((item) => (item ? `[${item.ref}] ${item.occurredAt ? isoDate(item.occurredAt) : ""}${item.actorName ? ` · ${item.actorName}` : ""} · ${item.text}` : ""))
          .join("\n")
      : "No matching records.";
  const now = new Date(failedAt);
  return [
    {
      name: "search_activity",
      description: "Search the project's activity before the failure by keywords (for example a file, table or component named in the log).",
      inputSchema: z.object({ query: z.string(), days: z.number().describe("How many days before the failure to search") }),
      async run(input) {
        const days = typeof input.days === "number" && input.days > 0 ? Math.min(input.days, 60) : 7;
        return render(searchEvents(data.events, { query: String(input.query ?? ""), sinceDays: days, limit: 8, now }).map((event) => bag.addEvent(event).ref));
      },
    },
    {
      name: "get_deployments",
      description: "List recent deployments for an environment, newest first, including their status and log excerpt.",
      inputSchema: z.object({ environment: z.string().nullable() }),
      async run(input) {
        const env = typeof input.environment === "string" ? input.environment.toLowerCase() : "";
        return render(data.deployments.filter((d) => !env || d.environment.toLowerCase().includes(env)).slice(0, 6).map((d) => bag.addDeployment(d).ref));
      },
    },
    {
      name: "get_past_incidents",
      description: "List earlier incidents on this project with their causes and fixes, to spot a recurrence.",
      inputSchema: z.object({ limit: z.number() }),
      async run() {
        return render(data.incidents.filter((i) => !OPEN.has(i.status)).slice(0, 4).map((i) => bag.addIncident(i).ref));
      },
    },
  ];
}

async function nextIncidentKey(project: Project): Promise<string> {
  const store = await getStore();
  const existing = (await store.list("incidents")).filter((incident) => incident.projectId === project.id);
  const highest = existing.reduce((max, incident) => Math.max(max, Number(/(\d+)$/.exec(incident.key)?.[1] ?? 0)), 0);
  return `${project.key}-INC-${highest + 1}`;
}

export interface IncidentArgs {
  project: Project;
  deployment: Deployment;
  actor: Actor;
  trigger: RunTrigger;
  onEvent?: (event: RunEvent) => void;
}

/**
 * Incident workflow, started when a production deployment fails:
 * investigator (tools) -> triager -> fix proposer <-> independent reviewer
 * (up to two rounds, plus mechanical safety checks) -> escalation policy.
 * Nothing is applied automatically: the outcome is a reviewed proposal that
 * waits for a human decision, and the owner is contacted when policy says so.
 */
export async function openIncidentFromDeployment(args: IncidentArgs): Promise<Incident | null> {
  const { project, deployment, actor } = args;
  const store = await getStore();
  const existing = (await store.list("incidents")).filter((incident) => incident.projectId === project.id);
  const duplicate = existing.find(
    (incident) => incident.trigger.deploymentId === deployment.id || (OPEN.has(incident.status) && incident.trigger.kind === "deployment" && Date.now() - new Date(incident.detectedAt).getTime() < 2 * HOUR),
  );
  if (duplicate) return null;

  const failedAt = deployment.finishedAt ?? deployment.startedAt;
  const incident: Incident = {
    id: newId("inc"),
    projectId: project.id,
    key: await nextIncidentKey(project),
    title: `${deployment.environment} deployment ${deployment.status}`,
    status: "triaging",
    severity: /prod/i.test(deployment.environment) ? "SEV2" : "SEV3",
    detectedAt: nowIso(),
    trigger: { kind: "deployment", deploymentId: deployment.id, detail: `Deployment${deployment.version ? ` of ${deployment.version}` : ""} to ${deployment.environment} ${deployment.status}` },
    reviews: [],
    timeline: [{ at: nowIso(), actor: "Project Aid", text: `Detected: ${deployment.environment} deployment ${deployment.status}${deployment.version ? ` (${deployment.version})` : ""}. Automatic triage started.` }],
  };
  await store.put("incidents", incident);
  const note = (text: string, who = "Project Aid") => incident.timeline.push({ at: nowIso(), actor: who, text });

  const { run } = await withRun(
    { workflow: "incident", title: `Triage ${incident.key}: ${incident.title}`, actor, project, trigger: args.trigger, input: `${incident.trigger.detail}. ${truncate(deployment.logExcerpt, 200)}`, onEvent: args.onEvent },
    async (ctx) => {
      const [data, people] = await Promise.all([loadProjectData(project), loadPeople()]);
      const bag = new EvidenceBag(people);
      const log = deployment.logExcerpt ?? "";

      const collected = await codeStep(
        ctx,
        "collect",
        "Collect changes since the last healthy deployment",
        `${deployment.environment} failed at ${failedAt}`,
        () => {
          bag.addDeployment(deployment);
          const lastGood = data.deployments.find((d) => d.environment === deployment.environment && d.status === "success" && d.startedAt < deployment.startedAt);
          if (lastGood) bag.addDeployment(lastGood);
          const from = lastGood ? new Date(lastGood.finishedAt ?? lastGood.startedAt).getTime() : new Date(failedAt).getTime() - 3 * DAY;
          const to = new Date(failedAt).getTime() + 5 * 60_000;
          const window = data.events.filter((event) => {
            const at = new Date(event.occurredAt).getTime();
            return at >= from && at <= to && ["commit", "pull_request", "work_item", "release"].includes(event.kind);
          });
          // Most recent first, capped so a long gap between releases stays readable.
          window.slice(0, 20).forEach((event) => bag.addEvent(event));
          searchEvents(data.events, { query: log, sinceDays: 7, limit: 5, now: new Date(failedAt) }).forEach((event) => bag.addEvent(event));
          return { lastGood, changes: window.length };
        },
        (r) => `${r.changes} change${r.changes === 1 ? "" : "s"} since ${r.lastGood ? `${r.lastGood.version ?? "the last healthy deployment"}` : "three days ago (no earlier healthy deployment on record)"}`,
      );

      const findings = await runToolAgent(ctx, incidentInvestigator, { projectName: project.name, environment: deployment.environment, failureDetail: incident.trigger.detail, log, failedAt, evidence: bag.list(), tools: incidentTools(bag, data, failedAt) });

      const assessed: TriageOutput = await runAgent(ctx, incidentTriager, { projectName: project.name, environment: deployment.environment, failureDetail: incident.trigger.detail, log, failedAt, findings, evidence: bag.list(), evidenceBlock: bag.render("evidence") });

      // Suspects must be real evidence; the owner is derived in code from the record, not from model text.
      const suspectRefs = assessed.suspectRefs.filter((ref) => bag.get(ref)?.type === "event");
      const suspectEvents = suspectRefs.map((ref) => data.events.find((event) => event.id === bag.get(ref)?.id)).filter((event): event is ProjectEvent => Boolean(event));
      const onTeam = (personId?: string) => Boolean(personId && project.team.some((member) => member.personId === personId));
      const ownerId = suspectEvents.map((event) => event.actorId).find(onTeam) ?? (onTeam(deployment.triggeredById) ? deployment.triggeredById : undefined) ?? project.team[0]?.personId;
      const usedRefs = Array.from(new Set([...extractRefs(`${assessed.summary} ${assessed.suspectedCause}`), ...suspectRefs])).filter((ref) => bag.get(ref));
      const triage: IncidentTriage = {
        summary: stripInvalidRefs(assessed.summary, bag),
        suspectedCause: stripInvalidRefs(assessed.suspectedCause, bag),
        confidence: Math.min(1, Math.max(0, Number(assessed.confidence) || 0)),
        suspectEventIds: suspectEvents.map((event) => event.id),
        suspectOwnerId: ownerId,
        impact: assessed.impact,
        nextSteps: assessed.nextSteps.slice(0, 5),
        evidence: bag.citations(usedRefs),
      };
      incident.title = truncate(assessed.title, 100) || incident.title;
      incident.severity = assessed.severity;
      incident.triage = triage;
      note(`Triage: ${incident.severity}. ${truncate(triage.suspectedCause, 240)} (confidence ${Math.round(triage.confidence * 100)}%).`);
      await store.put("incidents", incident);

      let approved = false;
      if (project.features.autoFixProposals) {
        let proposal: FixOutput | undefined;
        let review: ReviewOutput | undefined;
        for (let round = 1; round <= MAX_REVIEW_ROUNDS; round++) {
          proposal = await runAgent(
            ctx,
            fixProposer,
            {
              projectName: project.name,
              environment: deployment.environment,
              triage: { ...assessed, suspectRefs },
              log,
              lastGoodVersion: collected.lastGood?.version,
              evidenceBlock: bag.render("evidence"),
              previous: proposal && review ? { summary: proposal.summary, steps: proposal.steps, concerns: review.concerns } : undefined,
            },
            { title: round === 1 ? "Propose a fix" : `Revise the fix (round ${round})` },
          );
          const current = proposal;
          const checks = await codeStep(ctx, "safety-checks", "Run mechanical safety checks", current.summary, () => safetyChecks(current), (list) => list.map((c) => `${c.passed ? "pass" : "FAIL"}: ${c.name}`).join("; "));
          review = await runAgent(ctx, fixReviewer, { projectName: project.name, triage: { ...assessed, suspectRefs }, fix: current, round, safetyChecks: checks, evidenceBlock: bag.render("evidence") }, { title: `Independent review (round ${round})` });
          // A failed mechanical check can never be overridden by the reviewing model.
          const mechanicalFailure = checks.some((check) => !check.passed);
          const verdict: FixReview["verdict"] = mechanicalFailure && review.verdict === "approve" ? "revise" : review.verdict;
          const entry: FixReview = { round, reviewer: "fix-reviewer", verdict, concerns: [...(mechanicalFailure ? checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`) : []), ...review.concerns].slice(0, 8), checks: [...checks, ...review.checks] };
          incident.reviews.push(entry);
          note(`Fix proposal round ${round} reviewed: ${verdict}${entry.concerns.length ? ` (${entry.concerns.length} concern${entry.concerns.length === 1 ? "" : "s"})` : ""}.`, "fix-reviewer");
          review = { ...review, verdict, concerns: entry.concerns };
          if (verdict !== "revise") break;
        }
        if (proposal && review) {
          approved = review.verdict === "approve";
          const fix: FixProposal = {
            kind: proposal.kind,
            summary: stripInvalidRefs(proposal.summary, bag),
            steps: proposal.steps.map((step) => stripInvalidRefs(step, bag)),
            patch: proposal.patch ?? undefined,
            targetRepo: suspectEvents[0]?.repo,
            risk: proposal.risk,
            rollbackPlan: proposal.rollbackPlan,
            testPlan: proposal.testPlan,
            revision: incident.reviews.length,
            status: review.verdict === "reject" ? "rejected" : "proposed",
          };
          incident.fix = fix;
          incident.status = approved ? "awaiting_approval" : "fix_proposed";
        }
      } else {
        note("Fix proposals are switched off for this project; triage only.");
      }

      // Escalation policy, in code: when in doubt, a person is brought in.
      const reasons: string[] = [];
      if (incident.severity === "SEV1" || incident.severity === "SEV2") reasons.push(`${incident.severity} incident`);
      if (triage.confidence < 0.5) reasons.push("the cause is not confirmed");
      if (!project.features.autoFixProposals) reasons.push("no automatic fix proposal");
      else if (!approved) reasons.push("the proposed fix did not pass internal review");
      const policy = await codeStep(ctx, "escalation-policy", "Decide whether to bring in a person", `severity ${incident.severity}, confidence ${triage.confidence}, review ${approved ? "approved" : "not approved"}`, () => ({ escalate: reasons.length > 0 && Boolean(ownerId), reasons }), (r) => (r.escalate ? `Escalate: ${r.reasons.join("; ")}` : "No escalation needed; waiting for director approval"));

      if (policy.escalate && ownerId) {
        try {
          const { escalateQuestion } = await import("./escalate");
          const owner = people.get(ownerId);
          const thread = await escalateQuestion({
            project,
            actor,
            kind: "incident",
            assigneeId: ownerId,
            question: `${incident.key}: ${incident.title}. Can you confirm the cause and whether the proposed fix is safe?`,
            context: `${triage.summary}\nSuspected cause: ${triage.suspectedCause}${incident.fix ? `\nProposed fix: ${incident.fix.summary}` : ""}`,
            relatedEventIds: triage.suspectEventIds,
            relatedIncidentId: incident.id,
            trigger: args.trigger,
          });
          incident.escalation = { personId: ownerId, reason: policy.reasons.join("; "), threadId: thread.id, at: nowIso() };
          if (!incident.fix || !approved) incident.status = "escalated";
          note(`Escalated to ${owner?.name ?? "the change owner"}: ${policy.reasons.join("; ")}.`);
        } catch (error) {
          note(`Escalation could not be sent: ${error instanceof Error ? error.message : "unknown error"}.`);
        }
      }

      incident.runId = ctx.run.id;
      await store.put("incidents", incident);
      const event: ProjectEvent = {
        id: newId("evt"),
        projectId: project.id,
        source: "system",
        kind: "incident",
        externalId: incident.id,
        title: `${incident.key} opened: ${incident.title}`,
        summary: truncate(`${triage.summary} ${incident.fix ? `Proposed fix: ${incident.fix.summary}` : ""}`.replace(/\s*\[[A-Z]\d+(?:,\s*[A-Z]\d+)*\]/g, ""), 500),
        actorName: "Project Aid",
        occurredAt: incident.detectedAt,
        ingestedAt: nowIso(),
        areas: [],
        tags: ["incident", incident.severity.toLowerCase()],
        importance: 5,
        changeType: "other",
        clarity: "clear",
        userFacing: true,
        refs: [incident.key],
        summarizedBy: { provider: "system", model: "-", mode: "none" },
      };
      await store.put("events", event);
      return incident;
    },
    (result) => `${result.key} ${result.severity}: ${result.status}`,
  );
  incident.runId = run.id;
  await store.put("incidents", incident);
  await audit(actor, "incident.opened", { projectId: project.id, target: incident.key, detail: incident.title });
  const { refreshSnapshot } = await import("@/lib/services/snapshot");
  await refreshSnapshot(project);
  return incident;
}

/** When a later production deployment succeeds, open incidents for that environment are marked mitigated. */
export async function noteRecovery(project: Project, deployment: Deployment): Promise<Incident[]> {
  if (deployment.status !== "success") return [];
  const store = await getStore();
  const open = (await store.list("incidents")).filter((incident) => incident.projectId === project.id && OPEN.has(incident.status) && incident.trigger.kind === "deployment");
  const touched: Incident[] = [];
  for (const incident of open) {
    const failed = incident.trigger.deploymentId ? await store.get("deployments", incident.trigger.deploymentId) : null;
    if (failed && failed.environment !== deployment.environment) continue;
    if (failed && failed.startedAt >= deployment.startedAt) continue;
    incident.status = "mitigated";
    incident.timeline.push({ at: nowIso(), actor: "Project Aid", text: `A later ${deployment.environment} deployment${deployment.version ? ` (${deployment.version})` : ""} succeeded. Marked as mitigated; confirm and resolve when you are satisfied.` });
    await store.put("incidents", incident);
    touched.push(incident);
  }
  return touched;
}

async function loadIncident(actor: Actor, incidentId: string): Promise<{ incident: Incident; project: Project }> {
  const store = await getStore();
  const incident = await store.get("incidents", incidentId);
  const project = incident ? await store.get("projects", incident.projectId) : null;
  assertProjectAccess(actor, project);
  if (!incident) throw new Error("Incident not found");
  return { incident, project };
}

/** A director approves or rejects the reviewed fix. Approval hands it to the owner; it never changes code by itself. */
export async function decideFix(args: { actor: Actor; incidentId: string; decision: "approved" | "rejected"; comment?: string }): Promise<Incident> {
  assertWrite(args.actor);
  const { incident, project } = await loadIncident(args.actor, args.incidentId);
  if (!incident.fix) throw new Error("This incident has no fix proposal.");
  if (incident.fix.status !== "proposed") throw new Error(`The fix was already ${incident.fix.status}.`);
  const store = await getStore();
  incident.fix.status = args.decision;
  incident.fix.decidedById = args.actor.id;
  incident.fix.decidedAt = nowIso();
  if (args.decision === "approved") {
    const pr = openDraftPullRequestStub();
    incident.timeline.push({ at: nowIso(), actor: args.actor.name, text: `Approved the proposed fix${args.comment ? `: ${truncate(args.comment, 200)}` : ""}. ${truncate(pr.detail, 240)}` });
    incident.status = incident.escalation ? "escalated" : "fix_proposed";
  } else {
    incident.timeline.push({ at: nowIso(), actor: args.actor.name, text: `Rejected the proposed fix${args.comment ? `: ${truncate(args.comment, 200)}` : ""}.` });
    incident.status = "escalated";
  }
  await store.put("incidents", incident);
  await audit(args.actor, `incident.fix_${args.decision}`, { projectId: project.id, target: incident.key, detail: args.comment });
  return incident;
}

/** Marks an incident resolved and writes the incident report. */
export async function resolveIncident(args: { actor: Actor; incidentId: string; note?: string }): Promise<Incident> {
  assertWrite(args.actor);
  const { incident, project } = await loadIncident(args.actor, args.incidentId);
  if (incident.status === "resolved") return incident;
  const store = await getStore();
  incident.status = "resolved";
  incident.resolvedAt = nowIso();
  if (incident.fix?.status === "approved") incident.fix.status = "applied";
  incident.timeline.push({ at: nowIso(), actor: args.actor.name, text: `Resolved${args.note ? `: ${truncate(args.note, 240)}` : "."}` });
  await store.put("incidents", incident);
  if (project.features.reports) {
    try {
      const { generateReport } = await import("./report");
      const report = await generateReport({ project, actor: args.actor, kind: "incident", incidentId: incident.id, trigger: "manual" });
      incident.reportId = report.id;
      await store.put("incidents", incident);
    } catch (error) {
      incident.timeline.push({ at: nowIso(), actor: "Project Aid", text: `The incident report could not be generated: ${error instanceof Error ? truncate(error.message, 160) : "unknown error"}.` });
      await store.put("incidents", incident);
    }
  }
  await audit(args.actor, "incident.resolved", { projectId: project.id, target: incident.key });
  const { refreshSnapshot } = await import("@/lib/services/snapshot");
  await refreshSnapshot(project);
  return incident;
}
