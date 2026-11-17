import type { Deployment, DeploymentStatus, SourceConfig } from "@/lib/types";
import type { ConnectorContext, DeployMonitor, FetchResult, RawItem, SourceConnector } from "./types";
import { arr, errorDetail, newerOf, num, rec, requestJson, str } from "./http";

const API = "https://api.github.com";
const MAX_COMMITS = 30;
const MAX_DIFF_CHARS = 20_000;
const PER_PAGE = 50;

function headers(token: string | undefined): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "project-aid",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function gh(path: string, token: string | undefined): Promise<unknown> {
  return requestJson(`${API}${path}`, { headers: headers(token) });
}

function actorOf(user: unknown, commitAuthor?: unknown): RawItem["actor"] {
  const u = rec(user);
  const c = rec(commitAuthor);
  return { name: str(c.name) ?? str(u.login), email: str(c.email), handle: str(u.login) };
}

function repoOf(source: SourceConfig): { owner: string; repo: string } | undefined {
  const owner = source.config.owner?.trim();
  const repo = source.config.repo?.trim();
  return owner && repo ? { owner, repo } : undefined;
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

async function fetchCommits(owner: string, repo: string, branch: string | undefined, since: string, token: string | undefined): Promise<RawItem[]> {
  const q = new URLSearchParams({ since, per_page: String(MAX_COMMITS) });
  if (branch) q.set("sha", branch);
  const list = arr(await gh(`/repos/${enc(owner)}/${enc(repo)}/commits?${q}`, token)).slice(0, MAX_COMMITS);
  const items: RawItem[] = [];
  for (const entry of list) {
    const sha = str(rec(entry).sha);
    if (!sha) continue;
    let detail = rec(entry);
    try {
      detail = rec(await gh(`/repos/${enc(owner)}/${enc(repo)}/commits/${enc(sha)}`, token));
    } catch {
      // keep the list-level data when the detail call fails
    }
    const commit = rec(detail.commit);
    const author = rec(commit.author);
    const message = str(commit.message) ?? "";
    const files = arr(detail.files).map(rec);
    const stats = rec(detail.stats);
    const diff = files
      .map((f) => `--- ${str(f.filename) ?? "?"}\n${str(f.patch) ?? "(no textual patch)"}`)
      .join("\n")
      .slice(0, MAX_DIFF_CHARS);
    items.push({
      source: "github",
      kind: "commit",
      externalId: sha,
      url: str(detail.html_url),
      title: message.split("\n")[0].slice(0, 200) || sha.slice(0, 7),
      body: message,
      diff: diff || undefined,
      files: files.map((f) => str(f.filename)).filter((f): f is string => Boolean(f)),
      stats: { additions: num(stats.additions), deletions: num(stats.deletions), filesChanged: files.length },
      actor: actorOf(detail.author, author),
      occurredAt: str(author.date) ?? str(rec(commit.committer).date) ?? new Date().toISOString(),
      repo: `${owner}/${repo}`,
      branch,
    });
  }
  return items;
}

async function fetchPulls(owner: string, repo: string, since: string, token: string | undefined): Promise<RawItem[]> {
  const q = new URLSearchParams({ state: "all", sort: "updated", direction: "desc", per_page: String(PER_PAGE) });
  const list = arr(await gh(`/repos/${enc(owner)}/${enc(repo)}/pulls?${q}`, token));
  const items: RawItem[] = [];
  for (const raw of list) {
    const pr = rec(raw);
    const updated = str(pr.updated_at);
    if (!updated || updated < since) continue;
    const state = str(pr.state) === "open" ? "open" : str(pr.merged_at) ? "merged" : "closed";
    const number = num(pr.number);
    items.push({
      source: "github",
      kind: "pull_request",
      externalId: `pr-${number ?? str(pr.id) ?? updated}`,
      url: str(pr.html_url),
      title: str(pr.title) ?? `Pull request #${number}`,
      body: str(pr.body),
      stats: { additions: num(pr.additions), deletions: num(pr.deletions), filesChanged: num(pr.changed_files) },
      actor: actorOf(pr.user),
      occurredAt: updated,
      repo: `${owner}/${repo}`,
      branch: str(rec(pr.head).ref),
      meta: {
        state,
        number: String(number ?? ""),
        base: str(rec(pr.base).ref) ?? "",
        draft: String(pr.draft === true),
        labels: arr(pr.labels).map((l) => str(rec(l).name)).filter(Boolean).join(","),
      },
    });
  }
  return items;
}

async function fetchIssues(owner: string, repo: string, since: string, token: string | undefined): Promise<RawItem[]> {
  const q = new URLSearchParams({ state: "all", since, sort: "updated", direction: "desc", per_page: String(PER_PAGE) });
  const list = arr(await gh(`/repos/${enc(owner)}/${enc(repo)}/issues?${q}`, token));
  const items: RawItem[] = [];
  for (const raw of list) {
    const issue = rec(raw);
    if (issue.pull_request !== undefined) continue; // the issues API also returns PRs
    const number = num(issue.number);
    items.push({
      source: "github",
      kind: "issue",
      externalId: `issue-${number ?? str(issue.id)}`,
      url: str(issue.html_url),
      title: str(issue.title) ?? `Issue #${number}`,
      body: str(issue.body),
      actor: actorOf(issue.user),
      occurredAt: str(issue.updated_at) ?? str(issue.created_at) ?? new Date().toISOString(),
      repo: `${owner}/${repo}`,
      meta: {
        state: str(issue.state) ?? "",
        number: String(number ?? ""),
        labels: arr(issue.labels).map((l) => str(rec(l).name)).filter(Boolean).join(","),
        assignee: str(rec(issue.assignee).login) ?? "",
      },
    });
  }
  return items;
}

export const githubConnector: SourceConnector = {
  kind: "github",
  label: "GitHub",
  defaultSecretEnv: "GITHUB_TOKEN",
  configHelp: [
    { key: "owner", label: "Owner or organisation", required: true, placeholder: "acme" },
    { key: "repo", label: "Repository", required: true, placeholder: "web-app" },
    { key: "branch", label: "Branch (default branch if empty)", required: false, placeholder: "main" },
  ],
  // The token is optional: public repositories work unauthenticated with lower rate limits.
  isConfigured(source) {
    return repoOf(source) !== undefined;
  },
  async fetch(source: SourceConfig, ctx: ConnectorContext): Promise<FetchResult> {
    const target = repoOf(source);
    if (!target) return { items: [], status: "stubbed", detail: "Set the owner and repo config keys for this GitHub source." };
    const token = ctx.secret(source.secretEnv ?? "GITHUB_TOKEN");
    const branch = source.config.branch?.trim() || undefined;
    try {
      const [commits, pulls, issues] = await Promise.all([
        fetchCommits(target.owner, target.repo, branch, ctx.since, token),
        fetchPulls(target.owner, target.repo, ctx.since, token),
        fetchIssues(target.owner, target.repo, ctx.since, token),
      ]);
      const items = [...commits, ...pulls, ...issues];
      const cursor = items.reduce<string | undefined>((acc, i) => newerOf(acc, i.occurredAt), undefined);
      return {
        items,
        cursor,
        status: "ok",
        detail: token ? undefined : "Unauthenticated (set GITHUB_TOKEN for private repositories and higher rate limits).",
      };
    } catch (err) {
      return { items: [], status: "error", detail: errorDetail(err) };
    }
  },
};

// ---------------------------------------------------------------------------
// Deploy monitor
// ---------------------------------------------------------------------------

type DeploymentRecord = Omit<Deployment, "id" | "projectId">;

function mapDeployState(state: string | undefined): DeploymentStatus {
  switch (state) {
    case "success":
      return "success";
    case "failure":
    case "error":
      return "failed";
    case "inactive":
      return "rolled_back";
    default:
      return "in_progress"; // pending, queued, in_progress, none
  }
}

function mapRun(status: string | undefined, conclusion: string | undefined): DeploymentStatus {
  if (status !== "completed") return "in_progress";
  if (conclusion === "success") return "success";
  if (conclusion === "cancelled") return "rolled_back";
  return "failed";
}

async function deploymentsFromApi(owner: string, repo: string, environment: string | undefined, limit: number, token: string | undefined): Promise<DeploymentRecord[]> {
  const q = new URLSearchParams({ per_page: String(limit) });
  if (environment) q.set("environment", environment);
  const list = arr(await gh(`/repos/${enc(owner)}/${enc(repo)}/deployments?${q}`, token)).slice(0, limit);
  const out: DeploymentRecord[] = [];
  for (const raw of list) {
    const d = rec(raw);
    const id = num(d.id);
    let latest: Record<string, unknown> = {};
    if (id !== undefined) {
      try {
        latest = rec(arr(await gh(`/repos/${enc(owner)}/${enc(repo)}/deployments/${id}/statuses?per_page=1`, token))[0]);
      } catch {
        // treat as no status yet
      }
    }
    const started = str(d.created_at) ?? new Date().toISOString();
    const status = mapDeployState(str(latest.state));
    out.push({
      environment: environment ?? str(d.environment) ?? "production",
      provider: "github",
      status,
      commitSha: str(d.sha),
      ref: str(d.ref),
      url: str(latest.environment_url) ?? str(latest.target_url) ?? str(latest.log_url),
      externalId: id !== undefined ? String(id) : undefined,
      startedAt: started,
      finishedAt: status === "in_progress" ? undefined : (str(latest.created_at) ?? str(d.updated_at)),
    });
  }
  return out;
}

async function deploymentsFromRuns(owner: string, repo: string, environment: string, limit: number, token: string | undefined): Promise<DeploymentRecord[]> {
  const info = rec(await gh(`/repos/${enc(owner)}/${enc(repo)}`, token));
  const branch = str(info.default_branch) ?? "main";
  const q = new URLSearchParams({ branch, per_page: String(limit) });
  const runs = arr(rec(await gh(`/repos/${enc(owner)}/${enc(repo)}/actions/runs?${q}`, token)).workflow_runs).slice(0, limit);
  return runs.map((raw): DeploymentRecord => {
    const r = rec(raw);
    const status = mapRun(str(r.status), str(r.conclusion));
    return {
      environment,
      provider: "github",
      status,
      commitSha: str(r.head_sha),
      ref: str(r.head_branch) ?? branch,
      url: str(r.html_url),
      externalId: `run-${num(r.id) ?? ""}`,
      startedAt: str(r.run_started_at) ?? str(r.created_at) ?? new Date().toISOString(),
      finishedAt: status === "in_progress" ? undefined : str(r.updated_at),
    };
  });
}

export const githubDeployMonitor: DeployMonitor = {
  provider: "github",
  label: "GitHub Deployments",
  isConfigured(target) {
    return Boolean(target.config.owner && target.config.repo);
  },
  async check(target, ctx, limit) {
    const { owner, repo, environment } = target.config;
    if (!owner || !repo) return { deployments: [], status: "stubbed", detail: "Set owner and repo in the deploy target config." };
    const token = ctx.secret(target.secretEnv ?? "GITHUB_TOKEN");
    try {
      let deployments = await deploymentsFromApi(owner, repo, environment, limit, token);
      if (deployments.length === 0) deployments = await deploymentsFromRuns(owner, repo, environment ?? "ci", limit, token);
      deployments.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      return { deployments, status: "ok" };
    } catch (err) {
      return { deployments: [], status: "error", detail: errorDetail(err) };
    }
  },
};

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

export async function createGithubIssue(args: { owner: string; repo: string; title: string; body: string; labels?: string[]; token: string }): Promise<{ id: string; url: string }> {
  const data = rec(
    await requestJson(`${API}/repos/${enc(args.owner)}/${enc(args.repo)}/issues`, {
      method: "POST",
      headers: { ...headers(args.token), "Content-Type": "application/json" },
      body: JSON.stringify({ title: args.title, body: args.body, labels: args.labels }),
    }),
  );
  return { id: String(num(data.number) ?? str(data.id) ?? ""), url: str(data.html_url) ?? "" };
}

/** STUB: intentionally performs no write. */
export function openDraftPullRequestStub(_args?: { owner: string; repo: string; branch?: string; title?: string; patch?: string }): { status: "stubbed"; detail: string } {
  return {
    status: "stubbed",
    detail:
      "Applying a patch is not implemented. It requires a GitHub token with contents:write and pull_requests:write permission, and an explicit human approval before any code is changed.",
  };
}
