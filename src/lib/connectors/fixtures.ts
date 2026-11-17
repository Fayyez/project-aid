import type { DeployTarget, Person, Project, SourceConfig } from "@/lib/types";
import type { ConnectorContext } from "./types";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function makeProject(): Project {
  return { id: "p1", key: "ATLAS", name: "Atlas", client: "Acme", description: "", status: "active", pdIds: [], team: [], sources: [], deployTargets: [], privacy: {}, features: {}, milestones: [], startDate: "2026-01-01", targetDate: "2026-12-01", templates: {}, notifyChannel: "in_app", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" } as unknown as Project;
}

export function makeCtx(secrets: Record<string, string> = {}, since = "2026-03-01T00:00:00.000Z", now = new Date("2026-03-10T10:15:30Z")): ConnectorContext {
  return { project: makeProject(), since, now, secret: (name) => (name ? secrets[name] : undefined) };
}

export function makeSource(kind: SourceConfig["kind"], config: Record<string, string>, secretEnv?: string): SourceConfig {
  return { id: "s1", kind, name: kind, enabled: true, config, secretEnv };
}

export function makeTarget(provider: DeployTarget["provider"], config: Record<string, string>): DeployTarget {
  return { id: "t1", environment: "production", provider, config };
}

export function makePerson(): Person {
  return { id: "u1", name: "Dana", email: "dana@example.com", role: "member", handles: {}, createdAt: "2026-01-01T00:00:00Z" };
}
