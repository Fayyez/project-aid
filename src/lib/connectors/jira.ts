import type { SourceConfig } from "@/lib/types";
import type { ConnectorContext, FetchResult, RawItem, SourceConnector } from "./types";
import { HttpError, arr, basicAuth, errorDetail, htmlToText, newerOf, rec, requestJson, str } from "./http";

const MAX_RESULTS = 100;

/** Flatten Atlassian Document Format (or a plain string) to text. */
function adfToText(node: unknown): string {
  if (typeof node === "string") return node;
  const n = rec(node);
  const own = str(n.text) ?? "";
  const children = arr(n.content).map(adfToText).join(n.type === "doc" || n.type === "bulletList" || n.type === "orderedList" ? "\n" : "");
  const sep = ["paragraph", "heading", "listItem", "codeBlock"].includes(str(n.type) ?? "") ? "\n" : "";
  return `${own}${children}${sep}`;
}

/** Jira timestamps look like 2026-01-02T10:00:00.000+0100; normalise to ISO. */
function isoOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function jqlDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export const jiraConnector: SourceConnector = {
  kind: "jira",
  label: "Jira",
  defaultSecretEnv: "JIRA_API_TOKEN",
  configHelp: [
    { key: "baseUrl", label: "Jira base URL", required: true, placeholder: "https://acme.atlassian.net" },
    { key: "projectKey", label: "Project key", required: true, placeholder: "ATLAS" },
    { key: "email", label: "Account email for the API token", required: true, placeholder: "svc@acme.com" },
  ],
  isConfigured(source, ctx) {
    const c = source.config;
    return Boolean(c.baseUrl && c.projectKey && c.email && ctx.secret(source.secretEnv ?? "JIRA_API_TOKEN"));
  },
  async fetch(source: SourceConfig, ctx: ConnectorContext): Promise<FetchResult> {
    const env = source.secretEnv ?? "JIRA_API_TOKEN";
    const { baseUrl, projectKey, email } = source.config;
    if (!baseUrl || !projectKey || !email) return { items: [], status: "stubbed", detail: "Set baseUrl, projectKey and email for this Jira source." };
    const token = ctx.secret(env);
    if (!token) return { items: [], status: "stubbed", detail: `Set ${env} to a Jira API token.` };
    const base = baseUrl.replace(/\/$/, "");
    const key = projectKey.replace(/[^A-Za-z0-9_]/g, "");
    const jql = `project = ${key} AND updated >= "${jqlDate(ctx.since)}" ORDER BY updated DESC`;
    const q = new URLSearchParams({
      jql,
      maxResults: String(MAX_RESULTS),
      fields: "summary,description,status,issuetype,priority,assignee,reporter,updated,created",
    });
    try {
      const headers = { Authorization: basicAuth(email, token), Accept: "application/json" };
      // Jira Cloud replaced /search with /search/jql; older/self-hosted servers still use /search.
      let raw: unknown;
      try {
        raw = await requestJson(`${base}/rest/api/3/search/jql?${q}`, { headers });
      } catch (err) {
        if (err instanceof HttpError && (err.status === 404 || err.status === 410)) raw = await requestJson(`${base}/rest/api/3/search?${q}`, { headers });
        else throw err;
      }
      const data = rec(raw);
      const items: RawItem[] = [];
      for (const raw of arr(data.issues)) {
        const issue = rec(raw);
        const f = rec(issue.fields);
        const issueKey = str(issue.key);
        if (!issueKey) continue;
        const reporter = rec(f.reporter);
        const assignee = rec(f.assignee);
        const description = f.description;
        const text = typeof description === "string" ? htmlToText(description) : adfToText(description).trim();
        items.push({
          source: "jira",
          kind: "work_item",
          externalId: issueKey,
          url: `${base}/browse/${issueKey}`,
          title: str(f.summary) ?? issueKey,
          body: text || undefined,
          actor: { name: str(reporter.displayName), email: str(reporter.emailAddress), handle: str(reporter.accountId) },
          occurredAt: isoOf(str(f.updated)) ?? isoOf(str(f.created)) ?? new Date().toISOString(),
          meta: {
            status: str(rec(f.status).name) ?? "",
            type: str(rec(f.issuetype).name) ?? "",
            priority: str(rec(f.priority).name) ?? "",
            assignee: str(assignee.displayName) ?? "",
          },
        });
      }
      const cursor = items.reduce<string | undefined>((acc, i) => newerOf(acc, i.occurredAt), undefined);
      return { items, cursor, status: "ok" };
    } catch (err) {
      return { items: [], status: "error", detail: errorDetail(err) };
    }
  },
};
