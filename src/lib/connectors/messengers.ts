import { config } from "@/lib/config";
import type { MessageChannel } from "@/lib/types";
import type { Messenger, OutboundMessage, SendResult } from "./types";
import { errorDetail, requestJson } from "./http";

function stubbed(channel: MessageChannel, detail: string): SendResult {
  return { channel, status: "stubbed", detail };
}

function failed(channel: MessageChannel, err: unknown): SendResult {
  return { channel, status: "failed", detail: errorDetail(err) };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Slack mrkdwn only needs these three characters escaped. */
function escapeSlack(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const inAppMessenger: Messenger = {
  channel: "in_app",
  label: "In-app inbox",
  isConfigured: () => true,
  async send() {
    return { channel: "in_app", status: "sent" };
  },
};

export const teamsMessenger: Messenger = {
  channel: "teams",
  label: "Microsoft Teams",
  isConfigured: () => Boolean(config.teamsWebhookUrl),
  async send(message: OutboundMessage) {
    const url = config.teamsWebhookUrl;
    if (!url) return stubbed("teams", "Set TEAMS_WEBHOOK_URL to a Teams incoming webhook URL.");
    const card = {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.4",
            body: [
              { type: "TextBlock", text: message.subject, weight: "Bolder", size: "Medium", wrap: true },
              { type: "TextBlock", text: `For ${message.to.name} - ${message.project.name}`, isSubtle: true, wrap: true },
              { type: "TextBlock", text: message.body, wrap: true },
            ],
            actions: message.replyUrl ? [{ type: "Action.OpenUrl", title: "Answer", url: message.replyUrl }] : [],
          },
        },
      ],
    };
    try {
      await requestJson(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(card) }).catch((err: unknown) => {
        // Webhooks often answer with plain text ("1"), which is not JSON; that is still success.
        if (err instanceof Error && err.message === "response was not valid JSON") return {};
        throw err;
      });
      return { channel: "teams", status: "sent" };
    } catch (err) {
      return failed("teams", err);
    }
  },
};

export const slackMessenger: Messenger = {
  channel: "slack",
  label: "Slack",
  isConfigured: () => Boolean(config.slackWebhookUrl),
  async send(message: OutboundMessage) {
    const url = config.slackWebhookUrl;
    if (!url) return stubbed("slack", "Set SLACK_WEBHOOK_URL to a Slack incoming webhook URL.");
    const blocks: unknown[] = [
      { type: "header", text: { type: "plain_text", text: message.subject.slice(0, 150) } },
      { type: "section", text: { type: "mrkdwn", text: escapeSlack(`*${message.to.name}* (${message.project.name})\n${message.body}`).slice(0, 2900) } },
    ];
    if (message.replyUrl) {
      blocks.push({ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Answer" }, url: message.replyUrl, style: "primary" }] });
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.subject, blocks }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { channel: "slack", status: "failed", detail: `HTTP ${res.status} from Slack webhook` };
      return { channel: "slack", status: "sent" };
    } catch (err) {
      return failed("slack", err);
    }
  },
};

export const emailMessenger: Messenger = {
  channel: "email",
  label: "Email (Resend)",
  isConfigured: () => Boolean(config.resendApiKey),
  async send(message: OutboundMessage) {
    const key = config.resendApiKey;
    if (!key) return stubbed("email", "Set RESEND_API_KEY (and optionally EMAIL_FROM) to send email through Resend.");
    const text = message.replyUrl ? `${message.body}\n\nAnswer here: ${message.replyUrl}` : message.body;
    const html =
      `<p>Hi ${escapeHtml(message.to.name)},</p>` +
      `<div style="white-space:pre-wrap">${escapeHtml(message.body)}</div>` +
      (message.replyUrl ? `<p><a href="${escapeHtml(message.replyUrl)}">Answer this question</a></p>` : "") +
      `<p style="color:#666;font-size:12px">${escapeHtml(message.project.name)} - sent by Project Aid</p>`;
    try {
      await requestJson("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: config.emailFrom, to: [message.to.email], subject: message.subject, text, html }),
      });
      return { channel: "email", status: "sent" };
    } catch (err) {
      return failed("email", err);
    }
  },
};
