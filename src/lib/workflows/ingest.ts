import { summarizer } from "@/lib/agents/defs/summarizer";
import { codeStep, runAgent, withRun, type RunEvent } from "@/lib/agents/runtime";
import { getConnector, getDeployMonitor, makeConnectorContext, registerConnector, registerDeployMonitor } from "@/lib/connectors";
import type { RawItem } from "@/lib/connectors/types";
import { pickProvider } from "@/lib/llm";
import { audit } from "@/lib/security/audit";
import { looksLikeInjection, redactSecrets } from "@/lib/security/redact";
import { simulatedConnector, simulatedDeployMonitor } from "@/lib/seed/simulator";
import { getStore } from "@/lib/store";
import type { Actor, AgentRun, Deployment, Incident, Person, Project, ProjectEvent, RunTrigger, SourceConfig, Thread } from "@/lib/types";
import { DAY, mapLimit, newId, nowIso, truncate, uniq } from "@/lib/util";

// The demo connector lives with the seed data; register it alongside the real ones.
registerConnector(simulatedConnector);
registerDeployMonitor(simulatedDeployMonitor);

export interface IngestResult {
  events: ProjectEvent[];
  skipped: number;
  redactions: number;
  deployments: Deployment[];
  incidents: Incident[];
  clarifications: Thread[];
  run: AgentRun;
}

/** Maps an external identity (login, email or name) to a known person. */
export function resolvePerson(people: Person[], actor: RawItem["actor"]): Person | undefined {
  if (!actor) return undefined;
  const handle = actor.handle?.toLowerCase();
  const email = actor.email?.toLowerCase();
  const name = actor.name?.toLowerCase().trim();
  return (
    people.find((person) => handle && Object.values(person.handles).some((value) => value?.toLowerCase() === handle)) ??
    people.find((person) => email && person.email.toLowerCase() === email) ??
    people.find((person) => name && person.name.toLowerCase() === name)
  );
}

/** Applies redaction and the project's code privacy mode before any model sees the item. */
function prepareItem(project: Project, item: RawItem): { item: RawItem; redactions: number; injection: boolean } {
  let redactions = 0;
  const clean = (text: string | undefined) => {
    if (!text) return text;
    if (!project.privacy.redactSecrets) return text;
    const result = redactSecrets(text);
    redactions += Object.values(result.findings).reduce((sum, count) => sum + count, 0);
    return result.text;
  };
  const injection = looksLikeInjection(`${item.title}\n${item.body ?? ""}\n${item.diff ?? ""}`);
  const mode = project.privacy.codeSummaryMode;
  // "local" without a local model, and "metadata-only", both mean: no model reads the code.
  const mayReadCode = mode === "cloud" || (mode === "local" && pickProvider("cheap", { handlesCode: true, privacy: project.privacy }) !== null);
  const prepared: RawItem = {
    ...item,
    title: clean(item.title) ?? "",
    body: clean(item.body),
    diff: mayReadCode ? clean(item.diff) : undefined,
    deployment: item.deployment ? { ...item.deployment, logExcerpt: clean(item.deployment.logExcerpt) } : undefined,
  };
  return { item: prepared, redactions, injection };
}

export interface IngestArgs {
  project: Project;
  items: RawItem[];
  actor: Actor;
  trigger: RunTrigger;
  source?: SourceConfig;
  onEvent?: (event: RunEvent) => void;
  /** Skip the follow-up workflows (incident triage, clarifying questions). Used by bulk imports. */
  skipFollowUps?: boolean;
}

/**
 * The ingestion pipeline: de-duplicate, redact, summarise each item on the
 * cheap tier, store it as a grounded event, then trigger follow-up workflows.
 */
export async function ingestItems(args: IngestArgs): Promise<IngestResult> {
  const { project, actor } = args;
  const store = await getStore();
  const { result, run } = await withRun(
    {
      workflow: "ingest",
      title: `Ingest ${args.items.length} item${args.items.length === 1 ? "" : "s"} for ${project.name}`,
      actor,
      project,
      trigger: args.trigger,
      input: args.items.map((item) => `${item.kind}: ${truncate(item.title, 60)}`).join("; "),
      onEvent: args.onEvent,
    },
    async (ctx) => {
      const people = await store.list("people");
      const existing = (await store.list("events")).filter((event) => event.projectId === project.id);
      const seen = new Set(existing.map((event) => `${event.source}:${event.externalId}`));

      const fresh = await codeStep(
        ctx,
        "dedupe",
        "Drop items already ingested",
        `${args.items.length} incoming`,
        () => {
          const unique = new Map<string, RawItem>();
          for (const item of args.items) {
            const key = `${item.source}:${item.externalId}`;
            if (!seen.has(key) && !unique.has(key)) unique.set(key, item);
          }
          return Array.from(unique.values());
        },
        (items) => `${items.length} new, ${args.items.length - items.length} duplicates skipped`,
      );

      let redactions = 0;
      const knownAreas = uniq(project.team.flatMap((member) => member.areas));
      const events = await mapLimit(fresh, 4, async (raw) => {
        const prepared = prepareItem(project, raw);
        redactions += prepared.redactions;
        const person = resolvePerson(people, raw.actor);
        if (prepared.injection) {
          await audit(actor, "security.possible_injection", { projectId: project.id, target: raw.externalId, detail: `Instruction-like text in ${raw.kind} "${truncate(raw.title, 80)}"` });
        }
        const summary = await runAgent(ctx, summarizer, { projectName: project.name, knownAreas, item: prepared.item, actorName: person?.name }, { group: "summaries", title: `Summarise ${raw.kind.replace("_", " ")}: ${truncate(prepared.item.title, 50)}` });
        const step = ctx.run.steps[ctx.run.steps.length - 1];
        const event: ProjectEvent = {
          id: newId("evt"),
          projectId: project.id,
          sourceId: args.source?.id,
          source: raw.source,
          kind: raw.kind,
          externalId: raw.externalId,
          url: raw.url,
          title: truncate(summary.title, 120) || truncate(prepared.item.title, 120),
          summary: truncate(summary.summary, 600),
          details: project.privacy.storeRawCode && prepared.item.diff ? truncate(prepared.item.diff, 8000) : undefined,
          actorId: person?.id,
          actorName: person?.name ?? raw.actor?.name ?? raw.actor?.handle,
          occurredAt: raw.occurredAt,
          ingestedAt: nowIso(),
          repo: raw.repo,
          branch: raw.branch,
          stats: raw.stats,
          areas: summary.areas.map((area) => area.toLowerCase()).slice(0, 4),
          tags: uniq([...summary.tags.map((tag) => tag.toLowerCase()), ...(prepared.injection ? ["possible-injection"] : []), ...(prepared.redactions ? ["secrets-redacted"] : [])]).slice(0, 7),
          importance: Math.min(5, Math.max(1, Math.round(summary.importance))) as ProjectEvent["importance"],
          changeType: summary.changeType,
          clarity: summary.clarity,
          userFacing: summary.userFacing,
          refs: summary.refs.slice(0, 8),
          summarizedBy: { provider: step?.provider ?? "heuristic", model: step?.model ?? "rules", mode: step?.mode === "llm" ? "llm" : "heuristic" },
        };
        return { event, raw: prepared.item, person };
      });

      const deployments: Deployment[] = [];
      await codeStep(
        ctx,
        "persist",
        "Store events and deployments",
        `${events.length} events`,
        async () => {
          await store.putMany("events", events.map((entry) => entry.event));
          const known = (await store.list("deployments")).filter((d) => d.projectId === project.id);
          for (const { raw, person } of events) {
            if (raw.kind !== "deployment" || !raw.deployment) continue;
            const match = known.find((d) => d.externalId && d.externalId === (raw.deployment?.externalId ?? raw.externalId));
            const deployment: Deployment = { ...raw.deployment, id: match?.id ?? newId("dep"), projectId: project.id, externalId: raw.deployment.externalId ?? raw.externalId, triggeredById: raw.deployment.triggeredById ?? person?.id };
            await store.put("deployments", deployment);
            deployments.push(deployment);
          }
          if (redactions) await audit(actor, "security.secrets_redacted", { projectId: project.id, detail: `${redactions} credential-like value(s) removed before summarisation` });
        },
        () => `${events.length} events, ${deployments.length} deployments${redactions ? `, ${redactions} secret(s) redacted` : ""}`,
      );

      return { events: events.map((entry) => entry.event), skipped: args.items.length - fresh.length, redactions, deployments };
    },
    (r) => `${r.events.length} new events, ${r.skipped} duplicates, ${r.deployments.length} deployments`,
  );

  // Follow-ups run as their own traced workflows so each has a readable trace.
  const incidents: Incident[] = [];
  const clarifications: Thread[] = [];
  if (!args.skipFollowUps) {
    if (project.features.deployMonitoring && project.features.incidentTriage) {
      const { openIncidentFromDeployment, noteRecovery } = await import("./incident");
      for (const deployment of result.deployments) {
        if ((deployment.status === "failed" || deployment.status === "degraded") && /prod/i.test(deployment.environment)) {
          const incident = await openIncidentFromDeployment({ project, deployment, actor, trigger: args.trigger, onEvent: args.onEvent });
          if (incident) incidents.push(incident);
        } else if (deployment.status === "success") {
          await noteRecovery(project, deployment);
        }
      }
    }
    if (project.features.clarifyingQuestions) {
      const { askClarification } = await import("./clarify");
      for (const event of result.events) {
        if (event.clarity === "unclear" && event.importance >= 4 && event.actorId) {
          const thread = await askClarification({ project, event, actor, trigger: args.trigger });
          if (thread) clarifications.push(thread);
        }
      }
    }
  }
  if (result.events.length) {
    const { refreshSnapshot } = await import("@/lib/services/snapshot");
    await refreshSnapshot(project);
  }
  return { ...result, incidents, clarifications, run };
}

export interface SyncResult {
  sources: { sourceId: string; name: string; status: "ok" | "error" | "stubbed" | "skipped"; detail?: string; items: number }[];
  ingested: number;
  incidents: Incident[];
  clarifications: Thread[];
}

/** Pulls every enabled source and deployment target of a project and ingests what is new. */
export async function syncProject(args: { project: Project; actor: Actor; trigger: RunTrigger; onEvent?: (event: RunEvent) => void }): Promise<SyncResult> {
  const store = await getStore();
  const project = (await store.get("projects", args.project.id)) ?? args.project;
  const now = new Date();
  const out: SyncResult = { sources: [], ingested: 0, incidents: [], clarifications: [] };
  const items: { source?: SourceConfig; raw: RawItem[] }[] = [];

  for (const source of project.sources) {
    if (!source.enabled) continue;
    const connector = getConnector(source.kind);
    if (!connector) {
      out.sources.push({ sourceId: source.id, name: source.name, status: "skipped", detail: "No connector for this source kind", items: 0 });
      continue;
    }
    const since = source.cursor ?? source.lastSyncAt ?? new Date(now.getTime() - 14 * DAY).toISOString();
    const ctx = makeConnectorContext(project, since, now);
    const fetched = await connector.fetch(source, ctx);
    source.lastSyncAt = now.toISOString();
    source.lastSyncStatus = fetched.status;
    source.lastSyncDetail = fetched.detail ? truncate(fetched.detail, 200) : undefined;
    if (fetched.cursor) source.cursor = fetched.cursor;
    out.sources.push({ sourceId: source.id, name: source.name, status: fetched.status, detail: source.lastSyncDetail, items: fetched.items.length });
    if (fetched.items.length) items.push({ source, raw: fetched.items });
  }

  if (project.features.deployMonitoring) {
    for (const target of project.deployTargets) {
      const monitor = getDeployMonitor(target.provider);
      if (!monitor) continue;
      const ctx = makeConnectorContext(project, new Date(now.getTime() - 7 * DAY).toISOString(), now);
      const checked = await monitor.check(target, ctx, 5);
      out.sources.push({ sourceId: target.id, name: `${target.environment} (${monitor.label})`, status: checked.status, detail: checked.detail, items: checked.deployments.length });
      const raw: RawItem[] = checked.deployments.map((deployment) => ({
        source: "deploy",
        kind: "deployment",
        externalId: deployment.externalId ?? `${target.id}:${deployment.startedAt}`,
        url: deployment.url,
        title: `Deploy ${deployment.version ?? deployment.commitSha?.slice(0, 7) ?? ""} to ${deployment.environment}: ${deployment.status}`.replace(/\s+/g, " "),
        body: deployment.logExcerpt,
        occurredAt: deployment.finishedAt ?? deployment.startedAt,
        deployment,
      }));
      if (raw.length) items.push({ raw });
    }
  }

  // Save cursors before ingesting so a failure cannot cause the same window to be refetched forever.
  await store.put("projects", { ...project, updatedAt: nowIso() });

  for (const batch of items) {
    const result = await ingestItems({ project, items: batch.raw, actor: args.actor, trigger: args.trigger, source: batch.source, onEvent: args.onEvent });
    out.ingested += result.events.length;
    out.incidents.push(...result.incidents);
    out.clarifications.push(...result.clarifications);
  }
  await audit(args.actor, "project.sync", { projectId: project.id, detail: `${out.ingested} new events from ${out.sources.length} source(s)` });
  return out;
}
