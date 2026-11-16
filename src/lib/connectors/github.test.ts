import { afterEach, describe, expect, it, vi } from "vitest";
import { githubConnector, githubDeployMonitor, openDraftPullRequestStub } from "./github";
import { jsonResponse, makeCtx, makeSource, makeTarget } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

const commitList = [
  { sha: "aaa111", commit: { message: "Fix login", author: { date: "2026-03-05T10:00:00Z" } } },
  { sha: "bbb222", commit: { message: "Add API", author: { date: "2026-03-06T12:00:00Z" } } },
];
const detail = (sha: string, patch: string) => ({
  sha,
  html_url: `https://github.com/acme/web/commit/${sha}`,
  author: { login: "dana" },
  commit: { message: sha === "aaa111" ? "Fix login\n\nBody" : "Add API", author: { name: "Dana", email: "d@x.io", date: sha === "aaa111" ? "2026-03-05T10:00:00Z" : "2026-03-06T12:00:00Z" } },
  stats: { additions: 3, deletions: 1 },
  files: [{ filename: "src/a.ts", patch }],
});

function router(handlers: Record<string, unknown>) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    for (const [frag, body] of Object.entries(handlers)) if (url.includes(frag)) return jsonResponse(body);
    return jsonResponse([]);
  });
}

describe("githubConnector", () => {
  it("maps commits, PRs and issues, truncates diffs and returns the newest cursor", async () => {
    const fetchMock = router({
      "/commits/aaa111": detail("aaa111", "x".repeat(50_000)),
      "/commits/bbb222": detail("bbb222", "@@ -1 +1 @@"),
      "/commits?": commitList,
      "/pulls?": [
        { number: 7, title: "PR", state: "closed", merged_at: "2026-03-08T00:00:00Z", updated_at: "2026-03-08T00:00:00Z", user: { login: "dana" }, head: { ref: "f" }, base: { ref: "main" } },
        { number: 3, title: "old", state: "open", updated_at: "2026-01-01T00:00:00Z" },
      ],
      "/issues?": [
        { number: 9, title: "Bug", state: "open", updated_at: "2026-03-07T00:00:00Z", user: { login: "bob" } },
        { number: 7, title: "PR", pull_request: {}, updated_at: "2026-03-08T00:00:00Z" },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await githubConnector.fetch(makeSource("github", { owner: "acme", repo: "web" }), makeCtx({ GITHUB_TOKEN: "t0k" }));
    expect(res.status).toBe("ok");
    const commits = res.items.filter((i) => i.kind === "commit");
    expect(commits).toHaveLength(2);
    expect(commits[0].actor).toEqual({ name: "Dana", email: "d@x.io", handle: "dana" });
    expect(commits[0].diff!.length).toBeLessThanOrEqual(20_000);
    expect(commits[0].stats).toMatchObject({ additions: 3, deletions: 1, filesChanged: 1 });
    const prs = res.items.filter((i) => i.kind === "pull_request");
    expect(prs).toHaveLength(1);
    expect(prs[0].meta?.state).toBe("merged");
    expect(res.items.filter((i) => i.kind === "issue").map((i) => i.title)).toEqual(["Bug"]);
    expect(res.cursor).toBe("2026-03-08T00:00:00Z");
    const auth = (fetchMock.mock.calls[0][1]?.headers ?? {}) as Record<string, string>;
    expect(auth.Authorization).toBe("Bearer t0k");
    expect(auth["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  it("works unauthenticated and reports it, without an Authorization header", async () => {
    const fetchMock = router({});
    vi.stubGlobal("fetch", fetchMock);
    const res = await githubConnector.fetch(makeSource("github", { owner: "acme", repo: "web" }), makeCtx());
    expect(res.status).toBe("ok");
    expect(res.detail).toMatch(/GITHUB_TOKEN/);
    const headers = (fetchMock.mock.calls[0][1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("is stubbed when owner/repo are missing and never throws on errors", async () => {
    expect(githubConnector.isConfigured(makeSource("github", { owner: "acme" }), makeCtx())).toBe(false);
    const stub = await githubConnector.fetch(makeSource("github", {}), makeCtx());
    expect(stub.status).toBe("stubbed");
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ message: "nope" }, 404)));
    const err = await githubConnector.fetch(makeSource("github", { owner: "a", repo: "b" }), makeCtx({ GITHUB_TOKEN: "secret-value" }));
    expect(err.status).toBe("error");
    expect(err.detail).not.toContain("secret-value");
  });
});

describe("githubDeployMonitor", () => {
  it("maps deployments and statuses", async () => {
    vi.stubGlobal("fetch", router({
      "/statuses": [{ state: "success", environment_url: "https://app.example.com", created_at: "2026-03-05T10:05:00Z" }],
      "/deployments?": [{ id: 5, sha: "abc", ref: "main", environment: "production", created_at: "2026-03-05T10:00:00Z" }],
    }));
    const res = await githubDeployMonitor.check(makeTarget("github", { owner: "a", repo: "b" }), makeCtx(), 5);
    expect(res.deployments[0]).toMatchObject({ status: "success", commitSha: "abc", ref: "main", url: "https://app.example.com", externalId: "5" });
  });

  it("falls back to workflow runs", async () => {
    vi.stubGlobal("fetch", router({
      "/actions/runs": { workflow_runs: [{ id: 1, status: "completed", conclusion: "failure", head_sha: "def", head_branch: "main", html_url: "u", run_started_at: "2026-03-05T10:00:00Z", updated_at: "2026-03-05T10:03:00Z" }] },
      "/repos/a/b?": {},
    }));
    const res = await githubDeployMonitor.check(makeTarget("github", { owner: "a", repo: "b" }), makeCtx(), 5);
    expect(res.deployments[0]).toMatchObject({ environment: "ci", status: "failed" });
  });
});

describe("openDraftPullRequestStub", () => {
  it("never writes", () => {
    expect(openDraftPullRequestStub().status).toBe("stubbed");
  });
});
