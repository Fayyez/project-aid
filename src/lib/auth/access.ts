import { randomBytes } from "node:crypto";
import { getStore } from "@/lib/store";
import type { Actor, ApiToken, Person, Project } from "@/lib/types";
import { newId, nowIso, sha256 } from "@/lib/util";

export class AccessError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 404 = 403,
  ) {
    super(message);
    this.name = "AccessError";
  }
}

export const SYSTEM_ACTOR: Actor = { id: "system", name: "Project Aid", role: "admin", via: "system", scopes: ["read", "write"] };

export function actorFromPerson(person: Person, via: Actor["via"], scopes: Actor["scopes"] = ["read", "write"]): Actor {
  return { id: person.id, name: person.name, role: person.role, via, scopes };
}

/** Only admins and the project's directors may see a project. */
export function canAccessProject(actor: Actor, project: Project): boolean {
  if (actor.via === "system" || actor.role === "admin") return true;
  return actor.role === "pd" && project.pdIds.includes(actor.id);
}

export function assertProjectAccess(actor: Actor, project: Project | null | undefined): asserts project is Project {
  // The same error for "missing" and "not yours" avoids leaking which projects exist.
  if (!project || !canAccessProject(actor, project)) throw new AccessError("Project not found", 404);
}

export function assertWrite(actor: Actor): void {
  if (!actor.scopes.includes("write")) throw new AccessError("This credential is read-only");
}

export function assertAdmin(actor: Actor): void {
  if (actor.role !== "admin" && actor.via !== "system") throw new AccessError("Administrator access required");
}

export async function visibleProjects(actor: Actor): Promise<Project[]> {
  const store = await getStore();
  const projects = await store.list("projects");
  return projects.filter((project) => canAccessProject(actor, project)).sort((a, b) => a.name.localeCompare(b.name));
}

export async function requireProject(actor: Actor, projectId: string): Promise<Project> {
  const store = await getStore();
  const project = await store.get("projects", projectId);
  assertProjectAccess(actor, project);
  return project;
}

// --- personal access tokens (used by MCP and API clients) ---------------------

const TOKEN_PREFIX = "pa_";

export async function createApiToken(actor: Actor, name: string, scopes: ApiToken["scopes"]): Promise<{ token: string; record: ApiToken }> {
  const secret = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
  const record: ApiToken = {
    id: newId("tok"),
    userId: actor.id,
    name: name.trim().slice(0, 60) || "Personal token",
    tokenHash: sha256(secret),
    prefix: secret.slice(0, 9),
    scopes,
    createdAt: nowIso(),
  };
  const store = await getStore();
  await store.put("tokens", record);
  return { token: secret, record };
}

/** Resolves a bearer token to an actor, or null. */
export async function actorFromApiToken(token: string | undefined | null): Promise<Actor | null> {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const store = await getStore();
  const hash = sha256(token);
  const record = (await store.list("tokens")).find((candidate) => candidate.tokenHash === hash);
  if (!record) return null;
  const person = await store.get("people", record.userId);
  if (!person || person.role === "member") return null;
  await store.put("tokens", { ...record, lastUsedAt: nowIso() });
  return actorFromPerson(person, "token", record.scopes);
}

export function bearerFromHeader(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
