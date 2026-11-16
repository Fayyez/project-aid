import type { DeploymentStatus } from "@/lib/types";
import type { DeployMonitor } from "./types";
import { arr, errorDetail, num, rec, requestJson, str, REQUEST_TIMEOUT_MS } from "./http";

const VERCEL_STATES: Record<string, DeploymentStatus> = {
  READY: "success",
  ERROR: "failed",
  BUILDING: "in_progress",
  QUEUED: "in_progress",
  INITIALIZING: "in_progress",
  CANCELED: "rolled_back",
};

export function mapVercelState(state: string | undefined): DeploymentStatus {
  return (state && VERCEL_STATES[state.toUpperCase()]) || "in_progress";
}

export const vercelDeployMonitor: DeployMonitor = {
  provider: "vercel",
  label: "Vercel",
  isConfigured(target, ctx) {
    return Boolean(target.config.projectId && ctx.secret(target.secretEnv ?? "VERCEL_TOKEN"));
  },
  async check(target, ctx, limit) {
    const env = target.secretEnv ?? "VERCEL_TOKEN";
    const { projectId, teamId } = target.config;
    if (!projectId) return { deployments: [], status: "stubbed", detail: "Set projectId in the Vercel deploy target config." };
    const token = ctx.secret(env);
    if (!token) return { deployments: [], status: "stubbed", detail: `Set ${env} to a Vercel access token.` };
    const q = new URLSearchParams({ projectId, limit: String(limit) });
    if (teamId) q.set("teamId", teamId);
    try {
      const data = rec(await requestJson(`https://api.vercel.com/v6/deployments?${q}`, { headers: { Authorization: `Bearer ${token}` } }));
      const deployments = arr(data.deployments)
        .slice(0, limit)
        .map((raw) => {
          const d = rec(raw);
          const created = num(d.createdAt) ?? Date.now();
          const ready = num(d.ready) ?? num(d.buildingAt);
          const status = mapVercelState(str(d.state) ?? str(d.readyState));
          const meta = rec(d.meta);
          const url = str(d.url);
          return {
            environment: str(d.target) ?? target.environment,
            provider: "vercel",
            status,
            commitSha: str(meta.githubCommitSha) ?? str(meta.gitlabCommitSha),
            ref: str(meta.githubCommitRef) ?? str(meta.gitlabCommitRef),
            url: url ? `https://${url}` : undefined,
            externalId: str(d.uid),
            startedAt: new Date(created).toISOString(),
            finishedAt: status !== "in_progress" && ready ? new Date(ready).toISOString() : undefined,
          };
        })
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      return { deployments, status: "ok" };
    } catch (err) {
      return { deployments: [], status: "error", detail: errorDetail(err) };
    }
  },
};

export const healthcheckMonitor: DeployMonitor = {
  provider: "healthcheck",
  label: "HTTP health check",
  isConfigured(target) {
    return Boolean(target.config.url);
  },
  async check(target, ctx) {
    const url = target.config.url;
    if (!url) return { deployments: [], status: "stubbed", detail: "Set url in the health check target config." };
    const started = ctx.now;
    // Stable per check minute so repeated checks within a minute de-duplicate.
    const externalId = `health-${target.id}-${started.toISOString().slice(0, 16)}`;
    let ok = false;
    let excerpt: string | undefined;
    try {
      const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(Math.min(10_000, REQUEST_TIMEOUT_MS)), redirect: "follow" });
      ok = res.status >= 200 && res.status < 300;
      if (!ok) excerpt = `HTTP ${res.status} ${res.statusText}`.trim();
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      excerpt = name === "TimeoutError" || name === "AbortError" ? "Health check timed out after 10s" : "Health check failed: could not connect";
    }
    const finished = new Date();
    return {
      deployments: [
        {
          environment: target.environment,
          provider: "healthcheck",
          status: ok ? "success" : "degraded",
          url,
          externalId,
          startedAt: started.toISOString(),
          finishedAt: finished.toISOString(),
          logExcerpt: excerpt,
        },
      ],
      status: "ok",
    };
  },
};

export const azureDeployMonitor: DeployMonitor = {
  provider: "azure",
  label: "Azure (stub)",
  isConfigured: () => false,
  async check() {
    return { deployments: [], status: "stubbed", detail: "The Azure deploy monitor is not implemented yet; use the health check or GitHub provider for this environment." };
  },
};
