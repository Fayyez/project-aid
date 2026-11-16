import type { SourceConfig } from "@/lib/types";
import type { ConnectorContext, FetchResult, RawItem, SourceConnector } from "./types";
import { arr, basicAuth, errorDetail, newerOf, num, rec, requestJson, str } from "./http";

const API_VERSION = "api-version=7.1";
const MAX_COMMITS = 30;
const MAX_FILES = 200;
const MAX_PRS = 50;
const MAX_WORK_ITEMS = 100;

interface Target {
  base: string;
  project: string;
  repository?: string;
}

function targetOf(source: SourceConfig): Target | undefined {
  const { organization, project, repository, baseUrl } = source.config;
  const base = (baseUrl?.trim() || (organization ? `https://dev.azure.com/${encodeURIComponent(organization.trim())}` : "")).replace(/\/$/, "");
  if (!base || !project?.trim()) return undefined;
  return { base, project: project.trim(), repository: repository?.trim() || undefined };
}

function authHeaders(pat: string): Record<string, string> {
  return { Authorization: basicAuth("", pat), Accept: "application/json" };
}

function actor(identity: unknown): RawItem["actor"] {
  const i = rec(identity);
  return { name: str(i.name) ?? str(i.displayName), email: str(i.email) ?? str(i.uniqueName), handle: str(i.uniqueName) };
}

function projectUrl(t: Target): string {
  return `${t.base}/${encodeURIComponent(t.project)}`;
}

async function repositories(t: Target, headers: Record<string, string>): Promise<{ id: string; name: string }[]> {
  if (t.repository) return [{ id: t.repository, name: t.repository }];
  const data = rec(await requestJson(`${projectUrl(t)}/_apis/git/repositories?${API_VERSION}`, { headers }));
  return arr(data.value)
    .map((r) => ({ id: str(rec(r).id) ?? "", name: str(rec(r).name) ?? "" }))
    .filter((r) => r.id)
    .slice(0, 5);
}

async function fetchCommits(t: Target, repo: { id: string; name: string }, since: string, headers: Record<string, string>): Promise<RawItem[]> {
  const q = new URLSearchParams({ "searchCriteria.fromDate": since, "searchCriteria.$top": String(MAX_COMMITS) });
  const base = `${projectUrl(t)}/_apis/git/repositories/${encodeURIComponent(repo.id)}`;
  const list = arr(rec(await requestJson(`${base}/commits?${q}&${API_VERSION}`, { headers })).value).slice(0, MAX_COMMITS);
  const items: RawItem[] = [];
  for (const raw of list) {
    const c = rec(raw);
    const id = str(c.commitId);
    if (!id) continue;
    let files: string[] = [];
    let changeCount: number | undefined;
    try {
      // Only the list of changed paths: file contents are never downloaded.
      const changes = rec(await requestJson(`${base}/commits/${encodeURIComponent(id)}/changes?${API_VERSION}`, { headers }));
      const all = arr(changes.changes)
        .map((ch) => str(rec(rec(ch).item).path))
        .filter((p): p is string => Boolean(p));
      changeCount = all.length;
      files = all.slice(0, MAX_FILES);
    } catch {
      // commit without file list is still useful
    }
    const comment = str(c.comment) ?? "";
    const author = rec(c.author);
    items.push({
      source: "azure-devops",
      kind: "commit",
      externalId: id,
      url: str(c.remoteUrl),
      title: comment.split("\n")[0].slice(0, 200) || id.slice(0, 8),
      body: comment,
      files,
      stats: { filesChanged: changeCount },
      actor: { name: str(author.name), email: str(author.email) },
      occurredAt: str(author.date) ?? str(rec(c.committer).date) ?? new Date().toISOString(),
      repo: repo.name,
    });
  }
  return items;
}

async function fetchPullRequests(t: Target, repo: { id: string; name: string }, since: string, headers: Record<string, string>): Promise<RawItem[]> {
  const q = new URLSearchParams({ "searchCriteria.status": "all", $top: String(MAX_PRS) });
  const base = `${projectUrl(t)}/_apis/git/repositories/${encodeURIComponent(repo.id)}`;
  const list = arr(rec(await requestJson(`${base}/pullrequests?${q}&${API_VERSION}`, { headers })).value);
  const items: RawItem[] = [];
  for (const raw of list) {
    const pr = rec(raw);
    const at = str(pr.closedDate) ?? str(pr.creationDate);
    if (!at || at < since) continue;
    const status = str(pr.status);
    const id = num(pr.pullRequestId);
    items.push({
      source: "azure-devops",
      kind: "pull_request",
      externalId: `pr-${id}`,
      url: id !== undefined ? `${projectUrl(t)}/_git/${encodeURIComponent(repo.name)}/pullrequest/${id}` : undefined,
      title: str(pr.title) ?? `Pull request ${id}`,
      body: str(pr.description),
      actor: actor(pr.createdBy),
      occurredAt: at,
      repo: repo.name,
      branch: str(pr.sourceRefName)?.replace(/^refs\/heads\//, ""),
      meta: {
        state: status === "active" ? "open" : status === "completed" ? "merged" : "closed",
        target: str(pr.targetRefName)?.replace(/^refs\/heads\//, "") ?? "",
        draft: String(pr.isDraft === true),
      },
    });
  }
  return items;
}

async function fetchWorkItems(t: Target, since: string, headers: Record<string, string>): Promise<RawItem[]> {
  // WIQL only supports day precision, so filter again on the exact timestamp below.
  const day = since.slice(0, 10);
  const project = t.project.replace(/'/g, "''");
  const query = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${project}' AND [System.ChangedDate] >= '${day}' ORDER BY [System.ChangedDate] DESC`;
  const wiql = rec(
    await requestJson(`${projectUrl(t)}/_apis/wit/wiql?$top=${MAX_WORK_ITEMS}&${API_VERSION}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    }),
  );
  const ids = arr(wiql.workItems)
    .map((w) => num(rec(w).id))
    .filter((n): n is number => n !== undefined)
    .slice(0, MAX_WORK_ITEMS);
  if (ids.length === 0) return [];
  const details = rec(await requestJson(`${t.base}/_apis/wit/workitems?ids=${ids.join(",")}&$expand=none&${API_VERSION}`, { headers }));
  const items: RawItem[] = [];
  for (const raw of arr(details.value)) {
    const w = rec(raw);
    const f = rec(w.fields);
    const changed = str(f["System.ChangedDate"]);
    if (!changed || changed < since) continue;
    const id = num(w.id);
    items.push({
      source: "azure-devops",
      kind: "work_item",
      externalId: `wi-${id}`,
      url: id !== undefined ? `${t.base}/${encodeURIComponent(t.project)}/_workitems/edit/${id}` : undefined,
      title: str(f["System.Title"]) ?? `Work item ${id}`,
      body: str(f["System.Description"]),
      actor: actor(f["System.ChangedBy"]),
      occurredAt: changed,
      meta: {
        state: str(f["System.State"]) ?? "",
        type: str(f["System.WorkItemType"]) ?? "",
        assignee: str(rec(f["System.AssignedTo"]).displayName) ?? "",
        iteration: str(f["System.IterationPath"]) ?? "",
      },
    });
  }
  return items;
}

export const azureDevOpsConnector: SourceConnector = {
  kind: "azure-devops",
  label: "Azure DevOps / TFS",
  defaultSecretEnv: "AZURE_DEVOPS_PAT",
  configHelp: [
    { key: "organization", label: "Organisation (cloud)", required: false, placeholder: "contoso" },
    { key: "project", label: "Project", required: true, placeholder: "Atlas" },
    { key: "repository", label: "Repository (all repos if empty)", required: false, placeholder: "atlas-api" },
    { key: "baseUrl", label: "Base URL (on-prem TFS or collection URL)", required: false, placeholder: "https://dev.azure.com/contoso" },
  ],
  isConfigured(source, ctx) {
    return targetOf(source) !== undefined && Boolean(ctx.secret(source.secretEnv ?? "AZURE_DEVOPS_PAT"));
  },
  async fetch(source: SourceConfig, ctx: ConnectorContext): Promise<FetchResult> {
    const env = source.secretEnv ?? "AZURE_DEVOPS_PAT";
    const t = targetOf(source);
    if (!t) return { items: [], status: "stubbed", detail: "Set project and either organization or baseUrl for this Azure DevOps source." };
    const pat = ctx.secret(env);
    if (!pat) return { items: [], status: "stubbed", detail: `Set ${env} to a personal access token with Code (read) and Work Items (read) scopes.` };
    const headers = authHeaders(pat);
    try {
      const repos = await repositories(t, headers);
      const perRepo = await Promise.all(
        repos.map(async (r) => [...(await fetchCommits(t, r, ctx.since, headers)), ...(await fetchPullRequests(t, r, ctx.since, headers))]),
      );
      const workItems = await fetchWorkItems(t, ctx.since, headers);
      const items = [...perRepo.flat(), ...workItems];
      const cursor = items.reduce<string | undefined>((acc, i) => newerOf(acc, i.occurredAt), undefined);
      return { items, cursor, status: "ok" };
    } catch (err) {
      return { items: [], status: "error", detail: errorDetail(err) };
    }
  },
};
