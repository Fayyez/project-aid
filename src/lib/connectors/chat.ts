import type { SourceConfig } from "@/lib/types";
import type { ConnectorContext, FetchResult, RawItem, SourceConnector } from "./types";
import { arr, errorDetail, htmlToText, newerOf, rec, requestJson, str } from "./http";

const GRAPH = "https://graph.microsoft.com/v1.0";
const MAX_MESSAGES = 50;

function finish(items: RawItem[]): FetchResult {
  const cursor = items.reduce<string | undefined>((acc, i) => newerOf(acc, i.occurredAt), undefined);
  return { items, cursor, status: "ok" };
}

function bodyText(body: unknown): string {
  const b = rec(body);
  const content = str(b.content) ?? "";
  return str(b.contentType)?.toLowerCase() === "html" ? htmlToText(content) : content.trim();
}

function graphHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

// ---------------------------------------------------------------------------
// Microsoft Teams (Graph channel messages)
// ---------------------------------------------------------------------------

export const teamsConnector: SourceConnector = {
  kind: "teams",
  label: "Microsoft Teams",
  defaultSecretEnv: "MS_GRAPH_TOKEN",
  configHelp: [
    { key: "teamId", label: "Team id", required: true },
    { key: "channelId", label: "Channel id", required: true, placeholder: "19:...@thread.tacv2" },
  ],
  isConfigured(source, ctx) {
    return Boolean(source.config.teamId && source.config.channelId && ctx.secret(source.secretEnv ?? "MS_GRAPH_TOKEN"));
  },
  async fetch(source: SourceConfig, ctx: ConnectorContext): Promise<FetchResult> {
    const env = source.secretEnv ?? "MS_GRAPH_TOKEN";
    const { teamId, channelId } = source.config;
    if (!teamId || !channelId) return { items: [], status: "stubbed", detail: "Set teamId and channelId for this Teams source." };
    const token = ctx.secret(env);
    if (!token) return { items: [], status: "stubbed", detail: `Set ${env} to a Microsoft Graph bearer token with ChannelMessage.Read.All.` };
    try {
      const url = `${GRAPH}/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages?$top=${MAX_MESSAGES}`;
      const data = rec(await requestJson(url, { headers: graphHeaders(token) }));
      const items: RawItem[] = [];
      for (const raw of arr(data.value)) {
        const m = rec(raw);
        const id = str(m.id);
        const at = str(m.lastModifiedDateTime) ?? str(m.createdDateTime);
        if (!id || !at || at < ctx.since || str(m.messageType) !== "message") continue;
        const user = rec(rec(m.from).user);
        const text = bodyText(m.body);
        const subject = str(m.subject);
        items.push({
          source: "teams",
          kind: "message",
          externalId: id,
          url: str(m.webUrl),
          title: subject ?? (text.split("\n")[0].slice(0, 120) || "Teams message"),
          body: text,
          actor: { name: str(user.displayName), handle: str(user.id) },
          occurredAt: at,
          meta: { channelId, importance: str(m.importance) ?? "normal" },
        });
      }
      return finish(items);
    } catch (err) {
      return { items: [], status: "error", detail: errorDetail(err) };
    }
  },
};

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------

export const slackConnector: SourceConnector = {
  kind: "slack",
  label: "Slack",
  defaultSecretEnv: "SLACK_BOT_TOKEN",
  configHelp: [{ key: "channelId", label: "Channel id", required: true, placeholder: "C0123456789" }],
  isConfigured(source, ctx) {
    return Boolean(source.config.channelId && ctx.secret(source.secretEnv ?? "SLACK_BOT_TOKEN"));
  },
  async fetch(source: SourceConfig, ctx: ConnectorContext): Promise<FetchResult> {
    const env = source.secretEnv ?? "SLACK_BOT_TOKEN";
    const channelId = source.config.channelId;
    if (!channelId) return { items: [], status: "stubbed", detail: "Set channelId for this Slack source." };
    const token = ctx.secret(env);
    if (!token) return { items: [], status: "stubbed", detail: `Set ${env} to a Slack bot token with channels:history.` };
    try {
      const q = new URLSearchParams({ channel: channelId, oldest: String(new Date(ctx.since).getTime() / 1000), limit: "100" });
      const data = rec(await requestJson(`https://slack.com/api/conversations.history?${q}`, { headers: { Authorization: `Bearer ${token}` } }));
      if (data.ok !== true) return { items: [], status: "error", detail: `Slack API error: ${str(data.error) ?? "unknown"}` };
      const items: RawItem[] = [];
      for (const raw of arr(data.messages)) {
        const m = rec(raw);
        const ts = str(m.ts);
        const text = str(m.text);
        if (!ts || !text || str(m.subtype) === "channel_join") continue;
        items.push({
          source: "slack",
          kind: "message",
          externalId: `${channelId}:${ts}`,
          title: text.split("\n")[0].slice(0, 120),
          body: text,
          actor: { handle: str(m.user) ?? str(m.bot_id), name: str(m.username) },
          occurredAt: new Date(Number(ts) * 1000).toISOString(),
          meta: { channelId, threadTs: str(m.thread_ts) ?? "" },
        });
      }
      return finish(items);
    } catch (err) {
      return { items: [], status: "error", detail: errorDetail(err) };
    }
  },
};

// ---------------------------------------------------------------------------
// Outlook mail
// ---------------------------------------------------------------------------

export const outlookConnector: SourceConnector = {
  kind: "outlook",
  label: "Outlook mail",
  defaultSecretEnv: "MS_GRAPH_TOKEN",
  configHelp: [
    { key: "mailbox", label: "Shared mailbox address (uses /me when empty)", required: false, placeholder: "project@acme.com" },
    { key: "subjectContains", label: "Only messages whose subject contains", required: false, placeholder: "[ATLAS]" },
  ],
  isConfigured(source, ctx) {
    return Boolean(ctx.secret(source.secretEnv ?? "MS_GRAPH_TOKEN"));
  },
  async fetch(source: SourceConfig, ctx: ConnectorContext): Promise<FetchResult> {
    const env = source.secretEnv ?? "MS_GRAPH_TOKEN";
    const token = ctx.secret(env);
    if (!token) return { items: [], status: "stubbed", detail: `Set ${env} to a Microsoft Graph bearer token with Mail.Read.` };
    const mailbox = source.config.mailbox?.trim();
    const needle = source.config.subjectContains?.trim().toLowerCase();
    try {
      const q = new URLSearchParams({
        $filter: `receivedDateTime ge ${ctx.since}`,
        $orderby: "receivedDateTime desc",
        $top: String(MAX_MESSAGES),
        $select: "id,subject,body,from,receivedDateTime,webLink",
      });
      const root = mailbox ? `${GRAPH}/users/${encodeURIComponent(mailbox)}` : `${GRAPH}/me`;
      const data = rec(await requestJson(`${root}/messages?${q}`, { headers: graphHeaders(token) }));
      const items: RawItem[] = [];
      for (const raw of arr(data.value)) {
        const m = rec(raw);
        const id = str(m.id);
        const at = str(m.receivedDateTime);
        const subject = str(m.subject) ?? "(no subject)";
        if (!id || !at) continue;
        if (needle && !subject.toLowerCase().includes(needle)) continue;
        const from = rec(rec(m.from).emailAddress);
        items.push({
          source: "outlook",
          kind: "message",
          externalId: id,
          url: str(m.webLink),
          title: subject,
          body: bodyText(m.body),
          actor: { name: str(from.name), email: str(from.address) },
          occurredAt: at,
        });
      }
      return finish(items);
    } catch (err) {
      return { items: [], status: "error", detail: errorDetail(err) };
    }
  },
};
