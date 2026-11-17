import { AccessError, assertAdmin, assertWrite, createApiToken, visibleProjects } from "@/lib/auth/access";
import { config } from "@/lib/config";
import { listConnectors, listMessengers } from "@/lib/connectors";
import { llmStatus, type LlmStatus } from "@/lib/llm";
import { audit } from "@/lib/security/audit";
import { getStore, resetStore } from "@/lib/store";
import type { Actor, ApiToken, AuditEntry } from "@/lib/types";
import { byNewest } from "@/lib/util";

export interface SetupCheck {
  id: string;
  label: string;
  ok: boolean;
  /** required = the platform is not safe or usable without it. */
  level: "required" | "recommended" | "optional";
  detail: string;
  env?: string;
}

export interface SetupStatus {
  llm: LlmStatus;
  store: "memory" | "redis";
  baseUrl: string;
  checks: SetupCheck[];
  connectors: { kind: string; label: string; defaultSecretEnv?: string; hasDefaultSecret: boolean }[];
  messengers: { channel: string; label: string; configured: boolean }[];
}

/** What is and is not configured. Reports only presence, never values. */
export function getSetupStatus(): SetupStatus {
  const store = config.storeKind;
  const checks: SetupCheck[] = [
    { id: "auth", label: "Session signing secret", ok: Boolean(process.env.AUTH_SECRET), level: "required", env: "AUTH_SECRET", detail: process.env.AUTH_SECRET ? "Sessions are signed with your secret." : config.isProduction ? "Not set: nobody can sign in. Set a long random value." : "Not set: a development-only default is in use." },
    { id: "demo", label: "Demo account password", ok: Boolean(process.env.DEMO_PASSWORD), level: "required", env: "DEMO_PASSWORD", detail: process.env.DEMO_PASSWORD ? "Demo accounts use your password." : config.isProduction ? "Not set: the seeded demo accounts cannot sign in." : "Not set: the development default demo1234 is in use." },
    config.litellmBaseUrl
      ? { id: "llm", label: "LiteLLM gateway", ok: true, level: "recommended", env: "LITELLM_BASE_URL", detail: `Every model call goes through LiteLLM: reasoning on "${config.litellmSmartModel}", summarising on "${config.litellmCheapModel}"${config.litellmLocalModel ? `, private code on "${config.litellmLocalModel}"` : ""}.` }
      : { id: "llm", label: "Model access", ok: config.anthropicConfigured, level: "recommended", env: "ANTHROPIC_API_KEY", detail: config.anthropicConfigured ? `Agents reason on ${config.smartModel} and summarise on ${config.cheapModel}, called directly.` : "Not set: every agent runs on its deterministic fallback. Set ANTHROPIC_API_KEY, or LITELLM_BASE_URL to use a LiteLLM gateway." },
    { id: "store", label: "Durable storage", ok: store === "redis", level: "recommended", env: "UPSTASH_REDIS_REST_URL", detail: store === "redis" ? "Data is stored in Redis." : "Using the in-memory store. On serverless hosting, data resets when an instance restarts; connect Upstash Redis (Vercel Marketplace) for persistence." },
    {
      id: "local",
      label: "Local model for private code",
      ok: Boolean(config.localLlmBaseUrl || (config.litellmBaseUrl && config.litellmLocalModel)),
      level: "optional",
      env: config.litellmBaseUrl ? "LITELLM_LOCAL_MODEL" : "LOCAL_LLM_BASE_URL",
      detail:
        config.litellmBaseUrl && config.litellmLocalModel
          ? `Projects in "local" privacy mode summarise code on "${config.litellmLocalModel}" through LiteLLM.`
          : config.localLlmBaseUrl
            ? `Projects in "local" privacy mode summarise code on ${config.localLlmModel}.`
            : "Not set: projects in \"local\" privacy mode summarise from commit metadata only.",
    },
    { id: "cron", label: "Scheduled sync secret", ok: Boolean(config.cronSecret), level: "optional", env: "CRON_SECRET", detail: config.cronSecret ? "The scheduled sync endpoint is protected." : "Not set: the scheduled sync endpoint refuses all calls." },
    { id: "github-webhook", label: "GitHub webhook secret", ok: Boolean(config.githubWebhookSecret), level: "optional", env: "GITHUB_WEBHOOK_SECRET", detail: config.githubWebhookSecret ? "Incoming GitHub webhooks are verified." : "Not set: the GitHub webhook endpoint refuses all calls." },
    { id: "teams", label: "Microsoft Teams notifications", ok: Boolean(config.teamsWebhookUrl), level: "optional", env: "TEAMS_WEBHOOK_URL", detail: config.teamsWebhookUrl ? "Escalations can be posted to Teams." : "Not set: Teams delivery is recorded as stubbed and messages stay in the in-app inbox." },
    { id: "email", label: "Email notifications", ok: Boolean(config.resendApiKey), level: "optional", env: "RESEND_API_KEY", detail: config.resendApiKey ? "Escalations can be emailed." : "Not set: email delivery is recorded as stubbed." },
    { id: "slack", label: "Slack notifications", ok: Boolean(config.slackWebhookUrl), level: "optional", env: "SLACK_WEBHOOK_URL", detail: config.slackWebhookUrl ? "Escalations can be posted to Slack." : "Not set: Slack delivery is recorded as stubbed." },
  ];
  return {
    llm: llmStatus(),
    store,
    baseUrl: config.baseUrl,
    checks,
    connectors: listConnectors().map((connector) => ({ kind: connector.kind, label: connector.label, defaultSecretEnv: connector.defaultSecretEnv, hasDefaultSecret: Boolean(config.secret(connector.defaultSecretEnv)) })),
    messengers: listMessengers().map((messenger) => ({ channel: messenger.channel, label: messenger.label, configured: messenger.isConfigured() })),
  };
}

export async function resetDemo(actor: Actor): Promise<void> {
  assertWrite(actor);
  assertAdmin(actor);
  await resetStore();
  await audit(actor, "admin.demo_reset");
}

export async function listAudit(actor: Actor, limit = 100): Promise<(AuditEntry & { actorName: string; projectName?: string })[]> {
  const store = await getStore();
  const projects = await visibleProjects(actor);
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const people = new Map((await store.list("people")).map((person) => [person.id, person.name]));
  return (await store.list("audit"))
    .filter((entry) => actor.role === "admin" || entry.actorId === actor.id || (entry.projectId !== undefined && projectNames.has(entry.projectId)))
    .sort(byNewest((entry) => entry.at))
    .slice(0, limit)
    .map((entry) => ({ ...entry, actorName: entry.actorId === "system" ? "Project Aid" : (people.get(entry.actorId) ?? entry.actorId), projectName: entry.projectId ? projectNames.get(entry.projectId) : undefined }));
}

export type TokenView = Omit<ApiToken, "tokenHash">;

export async function listTokens(actor: Actor): Promise<TokenView[]> {
  const store = await getStore();
  return (await store.list("tokens"))
    .filter((token) => token.userId === actor.id)
    .sort(byNewest((token) => token.createdAt))
    .map(({ tokenHash: _hash, ...rest }) => rest);
}

/** Creates a personal access token for MCP and API clients. The secret is returned once. */
export async function createToken(actor: Actor, name: string, scope: "read" | "write"): Promise<{ token: string; record: TokenView }> {
  if (actor.via !== "session") throw new AccessError("Tokens can only be created from the portal.");
  assertWrite(actor);
  const { token, record } = await createApiToken(actor, name, scope === "write" ? ["read", "write"] : ["read"]);
  await audit(actor, "token.created", { target: record.id, detail: `${record.name} (${scope})` });
  const { tokenHash: _hash, ...view } = record;
  return { token, record: view };
}

export async function revokeToken(actor: Actor, tokenId: string): Promise<void> {
  const store = await getStore();
  const token = await store.get("tokens", tokenId);
  if (!token || token.userId !== actor.id) throw new AccessError("Token not found", 404);
  await store.remove("tokens", tokenId);
  await audit(actor, "token.revoked", { target: tokenId });
}
