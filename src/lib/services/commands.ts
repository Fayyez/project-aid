import { AccessError, assertAdmin, assertWrite, requireProject } from "@/lib/auth/access";
import { hashPassword } from "@/lib/auth/password";
import { parseDocument } from "@/lib/connectors";
import type { RawItem } from "@/lib/connectors/types";
import { audit } from "@/lib/security/audit";
import { buildScenario, SCENARIOS } from "@/lib/seed/simulator";
import { getStore } from "@/lib/store";
import {
  DEFAULT_FEATURES,
  DEFAULT_PRIVACY,
  type Actor,
  type DeployTarget,
  type FeatureFlags,
  type MessageChannel,
  type Milestone,
  type Note,
  type Person,
  type PrivacySettings,
  type Project,
  type ReportKind,
  type SourceConfig,
  type TeamAssignment,
} from "@/lib/types";
import { newId, nowIso, truncate } from "@/lib/util";
import { ingestItems, syncProject, type IngestResult, type SyncResult } from "@/lib/workflows/ingest";
import { refreshSnapshot } from "./snapshot";

/**
 * Write operations. Each one checks that the caller may write to the project,
 * validates its input, records an audit entry and keeps the snapshot current.
 */

async function writableProject(actor: Actor, projectId: string): Promise<Project> {
  assertWrite(actor);
  return requireProject(actor, projectId);
}

async function saveProject(actor: Actor, project: Project, action: string, detail?: string): Promise<Project> {
  const store = await getStore();
  const next = { ...project, updatedAt: nowIso() };
  await store.put("projects", next);
  await audit(actor, action, { projectId: project.id, detail });
  await refreshSnapshot(next);
  return next;
}

const clean = (value: string | undefined, max: number) => (value ?? "").trim().slice(0, max);

// --- projects ------------------------------------------------------------------

export interface NewProjectInput {
  name: string;
  key: string;
  client: string;
  description?: string;
  startDate: string;
  targetDate: string;
  /** Start with a simulated activity source so the project is explorable immediately. */
  withDemoSource?: boolean;
}

export async function createProject(actor: Actor, input: NewProjectInput): Promise<Project> {
  assertWrite(actor);
  if (actor.role === "member") throw new AccessError("Only directors can create projects");
  const name = clean(input.name, 80);
  const key = clean(input.key, 10).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!name) throw new Error("Give the project a name.");
  if (key.length < 2) throw new Error("The project key needs at least two letters or digits.");
  const start = new Date(input.startDate);
  const target = new Date(input.targetDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(target.getTime())) throw new Error("Enter valid start and target dates.");
  if (target <= start) throw new Error("The target date must be after the start date.");
  const store = await getStore();
  if ((await store.list("projects")).some((project) => project.key === key)) throw new Error(`The key ${key} is already used by another project.`);
  const now = nowIso();
  const project: Project = {
    id: newId("prj"),
    key,
    name,
    client: clean(input.client, 80) || "Internal",
    description: clean(input.description, 600),
    status: "active",
    pdIds: [actor.id],
    team: [],
    sources: input.withDemoSource ? [{ id: newId("src"), kind: "simulated", name: "Simulated activity (demo)", enabled: true, config: {}, lastSyncStatus: "never" }] : [],
    deployTargets: input.withDemoSource ? [{ id: newId("dpt"), environment: "production", provider: "simulated", config: {} }] : [],
    features: { ...DEFAULT_FEATURES },
    privacy: { ...DEFAULT_PRIVACY },
    milestones: [],
    startDate: start.toISOString(),
    targetDate: target.toISOString(),
    templates: {},
    notifyChannel: "in_app",
    createdAt: now,
    updatedAt: now,
  };
  return saveProject(actor, project, "project.created", project.name);
}

export async function updateProjectDetails(actor: Actor, projectId: string, patch: Partial<Pick<Project, "name" | "client" | "description" | "status" | "startDate" | "targetDate" | "notifyChannel">>): Promise<Project> {
  const project = await writableProject(actor, projectId);
  const next: Project = { ...project };
  if (patch.name !== undefined) next.name = clean(patch.name, 80) || project.name;
  if (patch.client !== undefined) next.client = clean(patch.client, 80) || project.client;
  if (patch.description !== undefined) next.description = clean(patch.description, 600);
  if (patch.status && ["active", "paused", "completed"].includes(patch.status)) next.status = patch.status;
  if (patch.notifyChannel && ["in_app", "teams", "email", "slack"].includes(patch.notifyChannel)) next.notifyChannel = patch.notifyChannel as MessageChannel;
  for (const field of ["startDate", "targetDate"] as const) {
    const value = patch[field];
    if (value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) throw new Error("Enter a valid date.");
      next[field] = date.toISOString();
    }
  }
  if (new Date(next.targetDate) <= new Date(next.startDate)) throw new Error("The target date must be after the start date.");
  return saveProject(actor, next, "project.updated");
}

export async function setFeature(actor: Actor, projectId: string, feature: keyof FeatureFlags, enabled: boolean): Promise<Project> {
  const project = await writableProject(actor, projectId);
  if (!(feature in DEFAULT_FEATURES)) throw new Error("Unknown feature.");
  return saveProject(actor, { ...project, features: { ...project.features, [feature]: Boolean(enabled) } }, "project.feature_changed", `${feature} = ${enabled}`);
}

export async function setPrivacy(actor: Actor, projectId: string, patch: Partial<PrivacySettings>): Promise<Project> {
  const project = await writableProject(actor, projectId);
  const privacy = { ...project.privacy };
  if (patch.codeSummaryMode && ["cloud", "local", "metadata-only"].includes(patch.codeSummaryMode)) privacy.codeSummaryMode = patch.codeSummaryMode;
  if (typeof patch.storeRawCode === "boolean") privacy.storeRawCode = patch.storeRawCode;
  if (typeof patch.redactSecrets === "boolean") privacy.redactSecrets = patch.redactSecrets;
  return saveProject(actor, { ...project, privacy }, "project.privacy_changed", JSON.stringify(privacy));
}

const SOURCE_KINDS = new Set(["github", "azure-devops", "jira", "teams", "outlook", "slack", "simulated"]);
const ENV_NAME = /^[A-Z][A-Z0-9_]{2,60}$/;

function cleanConfig(config: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(config ?? {})) {
    if (/^[A-Za-z][A-Za-z0-9]{0,30}$/.test(key) && typeof value === "string" && value.trim()) out[key] = value.trim().slice(0, 300);
  }
  return out;
}

/** Adds or updates a source. Credentials are referenced by environment variable name only. */
export async function upsertSource(actor: Actor, projectId: string, input: { id?: string; kind: string; name: string; enabled: boolean; config: Record<string, string>; secretEnv?: string }): Promise<Project> {
  const project = await writableProject(actor, projectId);
  if (!SOURCE_KINDS.has(input.kind)) throw new Error("Unsupported source kind.");
  const secretEnv = clean(input.secretEnv, 60);
  if (secretEnv && !ENV_NAME.test(secretEnv)) throw new Error("The credential must be the name of an environment variable, for example GITHUB_TOKEN. Never paste the secret itself.");
  const existing = project.sources.find((source) => source.id === input.id);
  const source: SourceConfig = {
    ...(existing ?? { id: newId("src"), lastSyncStatus: "never" as const }),
    kind: input.kind as SourceConfig["kind"],
    name: clean(input.name, 80) || input.kind,
    enabled: Boolean(input.enabled),
    config: cleanConfig(input.config),
    secretEnv: secretEnv || undefined,
  };
  const sources = existing ? project.sources.map((s) => (s.id === existing.id ? source : s)) : [...project.sources, source];
  return saveProject(actor, { ...project, sources }, existing ? "project.source_updated" : "project.source_added", `${source.kind}: ${source.name}`);
}

export async function removeSource(actor: Actor, projectId: string, sourceId: string): Promise<Project> {
  const project = await writableProject(actor, projectId);
  return saveProject(actor, { ...project, sources: project.sources.filter((source) => source.id !== sourceId) }, "project.source_removed", sourceId);
}

export async function upsertDeployTarget(actor: Actor, projectId: string, input: { id?: string; environment: string; provider: string; config: Record<string, string>; secretEnv?: string }): Promise<Project> {
  const project = await writableProject(actor, projectId);
  if (!["vercel", "github", "healthcheck", "azure", "simulated"].includes(input.provider)) throw new Error("Unsupported deployment provider.");
  const environment = clean(input.environment, 40).toLowerCase();
  if (!environment) throw new Error("Name the environment, for example production.");
  const secretEnv = clean(input.secretEnv, 60);
  if (secretEnv && !ENV_NAME.test(secretEnv)) throw new Error("The credential must be the name of an environment variable.");
  const config = cleanConfig(input.config);
  if (input.provider === "healthcheck" && !/^https:\/\//i.test(config.url ?? "")) throw new Error("A health check needs an https URL.");
  const existing = project.deployTargets.find((target) => target.id === input.id);
  const target: DeployTarget = { id: existing?.id ?? newId("dpt"), environment, provider: input.provider as DeployTarget["provider"], config, secretEnv: secretEnv || undefined };
  const deployTargets = existing ? project.deployTargets.map((t) => (t.id === existing.id ? target : t)) : [...project.deployTargets, target];
  return saveProject(actor, { ...project, deployTargets }, "project.deploy_target_saved", `${environment} via ${target.provider}`);
}

export async function removeDeployTarget(actor: Actor, projectId: string, targetId: string): Promise<Project> {
  const project = await writableProject(actor, projectId);
  return saveProject(actor, { ...project, deployTargets: project.deployTargets.filter((target) => target.id !== targetId) }, "project.deploy_target_removed", targetId);
}

export async function upsertTeamMember(actor: Actor, projectId: string, input: { personId: string; projectRole: string; areas: string[]; allocationPct?: number }): Promise<Project> {
  const project = await writableProject(actor, projectId);
  const store = await getStore();
  if (!(await store.get("people", input.personId))) throw new Error("That person does not exist.");
  const member: TeamAssignment = {
    personId: input.personId,
    projectRole: clean(input.projectRole, 40) || "Engineer",
    areas: input.areas.map((area) => area.trim().toLowerCase()).filter(Boolean).slice(0, 8),
    allocationPct: typeof input.allocationPct === "number" && input.allocationPct > 0 ? Math.min(100, Math.round(input.allocationPct)) : undefined,
  };
  const exists = project.team.some((m) => m.personId === member.personId);
  const team = exists ? project.team.map((m) => (m.personId === member.personId ? member : m)) : [...project.team, member];
  return saveProject(actor, { ...project, team }, "project.team_changed", `${member.personId} as ${member.projectRole}`);
}

export async function removeTeamMember(actor: Actor, projectId: string, personId: string): Promise<Project> {
  const project = await writableProject(actor, projectId);
  return saveProject(actor, { ...project, team: project.team.filter((member) => member.personId !== personId) }, "project.team_changed", `removed ${personId}`);
}

export async function setDirectors(actor: Actor, projectId: string, pdIds: string[]): Promise<Project> {
  const project = await writableProject(actor, projectId);
  const store = await getStore();
  const people = await store.list("people");
  const valid = pdIds.filter((id) => people.some((person) => person.id === id && person.role !== "member"));
  if (valid.length === 0) throw new Error("A project needs at least one director.");
  return saveProject(actor, { ...project, pdIds: Array.from(new Set(valid)) }, "project.directors_changed", valid.join(", "));
}

export async function upsertMilestone(actor: Actor, projectId: string, input: { id?: string; name: string; dueDate: string; status: Milestone["status"]; description?: string }): Promise<Project> {
  const project = await writableProject(actor, projectId);
  const due = new Date(input.dueDate);
  if (!clean(input.name, 80) || Number.isNaN(due.getTime())) throw new Error("A milestone needs a name and a valid due date.");
  const status = (["planned", "in_progress", "done", "at_risk"] as const).includes(input.status) ? input.status : "planned";
  const milestone: Milestone = { id: input.id ?? newId("ms"), name: clean(input.name, 80), dueDate: due.toISOString(), status, description: clean(input.description, 300) || undefined };
  const exists = project.milestones.some((m) => m.id === milestone.id);
  const milestones = (exists ? project.milestones.map((m) => (m.id === milestone.id ? milestone : m)) : [...project.milestones, milestone]).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return saveProject(actor, { ...project, milestones }, "project.milestone_saved", milestone.name);
}

export async function removeMilestone(actor: Actor, projectId: string, milestoneId: string): Promise<Project> {
  const project = await writableProject(actor, projectId);
  return saveProject(actor, { ...project, milestones: project.milestones.filter((m) => m.id !== milestoneId) }, "project.milestone_removed", milestoneId);
}

export async function setTemplate(actor: Actor, projectId: string, kind: ReportKind, template: string | null): Promise<Project> {
  const project = await writableProject(actor, projectId);
  if (!["progress", "incident", "release_notes"].includes(kind)) throw new Error("Unknown report kind.");
  const templates = { ...project.templates };
  if (template && template.trim()) templates[kind] = template.slice(0, 12_000);
  else delete templates[kind];
  return saveProject(actor, { ...project, templates }, "project.template_changed", kind);
}

// --- people --------------------------------------------------------------------

export async function upsertPerson(actor: Actor, input: { id?: string; name: string; email: string; title?: string; role?: Person["role"]; handles?: Person["handles"]; password?: string }): Promise<Person> {
  assertWrite(actor);
  if (actor.role === "member") throw new AccessError("Not allowed");
  const store = await getStore();
  const existing = input.id ? await store.get("people", input.id) : null;
  const name = clean(input.name, 80);
  const email = clean(input.email, 120).toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A person needs a name and a valid email address.");
  const others = (await store.list("people")).filter((person) => person.id !== existing?.id);
  if (others.some((person) => person.email.toLowerCase() === email)) throw new Error("Someone with that email already exists.");
  // Only administrators may grant portal access or change roles.
  let role: Person["role"] = existing?.role ?? "member";
  if (input.role && input.role !== role) {
    assertAdmin(actor);
    role = input.role;
  }
  let passwordHash = existing?.passwordHash;
  if (input.password) {
    assertAdmin(actor);
    if (input.password.length < 10) throw new Error("Passwords need at least 10 characters.");
    passwordHash = hashPassword(input.password);
  }
  const handles: Person["handles"] = {};
  for (const key of ["github", "azureDevOps", "jira", "teams", "slack"] as const) {
    const value = clean(input.handles?.[key] ?? existing?.handles[key], 80);
    if (value) handles[key] = value;
  }
  const person: Person = { id: existing?.id ?? newId("per"), name, email, title: clean(input.title, 80) || undefined, role, passwordHash, handles, createdAt: existing?.createdAt ?? nowIso() };
  await store.put("people", person);
  await audit(actor, existing ? "person.updated" : "person.created", { target: person.id, detail: person.name });
  return person;
}

// --- notes ---------------------------------------------------------------------

export async function saveNote(actor: Actor, projectId: string, input: { id?: string; title?: string; body: string; pinned?: boolean; shareWithAssistant?: boolean }): Promise<Note> {
  const project = await writableProject(actor, projectId);
  const body = clean(input.body, 8000);
  if (!body) throw new Error("Write something first.");
  const store = await getStore();
  const existing = input.id ? await store.get("notes", input.id) : null;
  if (existing && (existing.authorId !== actor.id || existing.projectId !== project.id)) throw new AccessError("Note not found", 404);
  const now = nowIso();
  const note: Note = {
    id: existing?.id ?? newId("note"),
    projectId: project.id,
    authorId: actor.id,
    title: clean(input.title, 120) || undefined,
    body,
    pinned: input.pinned ?? existing?.pinned ?? false,
    shareWithAssistant: input.shareWithAssistant ?? existing?.shareWithAssistant ?? true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await store.put("notes", note);
  return note;
}

export async function deleteNote(actor: Actor, noteId: string): Promise<void> {
  assertWrite(actor);
  const store = await getStore();
  const note = await store.get("notes", noteId);
  if (!note || note.authorId !== actor.id) throw new AccessError("Note not found", 404);
  await store.remove("notes", noteId);
}

// --- ingestion entry points ------------------------------------------------------

export async function syncNow(actor: Actor, projectId: string): Promise<SyncResult> {
  const project = await writableProject(actor, projectId);
  return syncProject({ project, actor, trigger: "manual" });
}

export { SCENARIOS };

/** Injects a demo scenario through the real ingestion pipeline. */
export async function runScenario(actor: Actor, projectId: string, scenarioId: string): Promise<IngestResult> {
  const project = await writableProject(actor, projectId);
  const scenario = SCENARIOS.find((candidate) => candidate.id === scenarioId);
  if (!scenario) throw new Error("Unknown scenario.");
  const store = await getStore();
  const people = await store.list("people");
  const items = buildScenario(project, people, scenario.id, new Date());
  await audit(actor, "simulator.scenario", { projectId: project.id, detail: scenario.label });
  return ingestItems({ project, items, actor, trigger: "simulator" });
}

/** Parses an uploaded project artifact (Word, Excel, CSV, Markdown, text) and ingests it as a document event. */
export async function ingestDocument(actor: Actor, projectId: string, file: { name: string; data: Buffer }): Promise<IngestResult> {
  const project = await writableProject(actor, projectId);
  const parsed = await parseDocument(file.data, file.name);
  const item: RawItem = {
    source: "document",
    kind: "document",
    externalId: `doc:${file.name}:${file.data.length}:${Date.now()}`,
    title: parsed.title || file.name,
    body: parsed.text,
    actor: { name: actor.name },
    occurredAt: nowIso(),
    meta: { format: parsed.format, ...Object.fromEntries(Object.entries(parsed.meta).map(([key, value]) => [key, truncate(value, 80)])) },
  };
  await audit(actor, "document.uploaded", { projectId: project.id, detail: `${file.name} (${file.data.length} bytes)` });
  return ingestItems({ project, items: [item], actor, trigger: "manual" });
}
