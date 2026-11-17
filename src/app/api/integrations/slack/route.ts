import { after } from "next/server";
import { errorMessage } from "@/lib/action-result";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/security/audit";
import { verifySlackSignature } from "@/lib/security/signatures";
import { NOT_LINKED, answerInChat, directorFromChatIdentity } from "@/lib/services/chatops";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const ephemeral = (text: string) => Response.json({ response_type: "ephemeral", text });

/**
 * Slack slash command endpoint (for example "/aid which projects need me?").
 * Slack needs an answer within three seconds, so the request is acknowledged
 * at once and the answer is posted to the command's response URL afterwards.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (!verifySlackSignature(config.slackSigningSecret, body, request.headers.get("x-slack-request-timestamp"), request.headers.get("x-slack-signature"))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  const form = new URLSearchParams(body);
  const actor = await directorFromChatIdentity("slack", [form.get("user_id") ?? undefined, form.get("user_name") ?? undefined]);
  if (!actor) return ephemeral(NOT_LINKED);
  if (!rateLimit(`slack:${actor.id}`, 20, 5 * 60_000).ok) return ephemeral("You are asking very quickly. Try again in a few minutes.");
  const question = (form.get("text") ?? "").trim();
  if (!question) return ephemeral("Ask me about your projects, for example: /aid which projects need my attention?");

  // Only ever post back to Slack itself, whatever the form claims.
  let responseUrl: URL | null = null;
  try {
    const candidate = new URL(form.get("response_url") ?? "");
    if (candidate.protocol === "https:" && candidate.hostname === "hooks.slack.com") responseUrl = candidate;
  } catch {
    responseUrl = null;
  }
  if (!responseUrl) return ephemeral("Slack did not provide a response address for this command.");
  const target = responseUrl;
  after(async () => {
    let text: string;
    try {
      text = (await answerInChat(actor, question)).text;
    } catch (error) {
      text = errorMessage(error);
    }
    await fetch(target, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ response_type: "ephemeral", text }), signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
  });
  return ephemeral("Looking through your projects...");
}
