import { afterEach, describe, expect, it, vi } from "vitest";
import { healthcheckMonitor, vercelDeployMonitor } from "./deploy";
import { jsonResponse, makeCtx, makeTarget } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("vercelDeployMonitor", () => {
  it("maps Vercel states", async () => {
    const mk = (uid: string, state: string, createdAt: number, target: string | null = "production") => ({ uid, state, createdAt, target, url: `${uid}.vercel.app`, meta: { githubCommitSha: "abc", githubCommitRef: "main" } });
    const fetchMock = vi.fn(async (_url: string) =>
      jsonResponse({ deployments: [mk("d1", "READY", 5), mk("d2", "ERROR", 4), mk("d3", "BUILDING", 3), mk("d4", "QUEUED", 2), mk("d5", "CANCELED", 1, null)] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await vercelDeployMonitor.check(makeTarget("vercel", { projectId: "prj", teamId: "team" }), makeCtx({ VERCEL_TOKEN: "v" }), 10);
    expect(res.deployments.map((d) => d.status)).toEqual(["success", "failed", "in_progress", "in_progress", "rolled_back"]);
    expect(res.deployments[0]).toMatchObject({ commitSha: "abc", ref: "main", url: "https://d1.vercel.app", environment: "production" });
    expect(res.deployments[4].environment).toBe("production"); // falls back to the configured environment
    expect(String(fetchMock.mock.calls[0][0])).toContain("projectId=prj&limit=10&teamId=team");
  });

  it("is stubbed without a token", async () => {
    const res = await vercelDeployMonitor.check(makeTarget("vercel", { projectId: "prj" }), makeCtx(), 3);
    expect(res.status).toBe("stubbed");
    expect(res.detail).toContain("VERCEL_TOKEN");
  });
});

describe("healthcheckMonitor", () => {
  it("records success on 2xx with a per-minute external id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
    const res = await healthcheckMonitor.check(makeTarget("healthcheck", { url: "https://x.test/health" }), makeCtx(), 1);
    expect(res.deployments[0].status).toBe("success");
    expect(res.deployments[0].externalId).toBe("health-t1-2026-03-10T10:15");
  });

  it("records degraded with an excerpt on a bad status or network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 503, statusText: "Service Unavailable" })));
    let res = await healthcheckMonitor.check(makeTarget("healthcheck", { url: "https://x.test" }), makeCtx(), 1);
    expect(res.deployments[0]).toMatchObject({ status: "degraded", logExcerpt: "HTTP 503 Service Unavailable" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    res = await healthcheckMonitor.check(makeTarget("healthcheck", { url: "https://x.test" }), makeCtx(), 1);
    expect(res.deployments[0].status).toBe("degraded");
    expect(res.deployments[0].logExcerpt).toMatch(/could not connect/);
  });
});
