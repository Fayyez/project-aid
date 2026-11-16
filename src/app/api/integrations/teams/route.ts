import { errorMessage } from "@/lib/action-result";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/security/audit";
import { verifyTeamsSignature } from "@/lib/security/signatures";
import { NOT_LINKED, answerInChat, directorFromChatIdentity } from "@/lib/services/chatops";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface TeamsActivity {
  text?: string;
  from?: { id?: string; name?: string; aadObjectId?: string };
}

const reply = (text: string) => Response.json({ type: "message", text });

/**
 * Microsoft Teams "outgoing webhook" endpoint: a director @mentions the bot in
 * a channel and gets the assistant's answer in the thread. Teams signs each
 * call with the shared secret and expects an answer within about ten seconds.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (!verifyTeamsSignature(config.teamsOutgoingWebhookSecret, body, request.headers.get("authorization"))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  let activity: TeamsActivity;
  try {
    activity = JSON.parse(body) as TeamsActivity;
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }
  const actor = await directorFromChatIdentity("teams", [activity.from?.aadObjectId, activity.from?.id, activity.from?.name]);
  if (!actor) return reply(NOT_LINKED);
  if (!rateLimit(`teams:${actor.id}`, 20, 5 * 60_000).ok) return reply("You are asking very quickly. Try again in a few minutes.");
  // Remove the @mention markup and any other tags Teams adds.
  const question = String(activity.text ?? "").replace(/<at>.*?<\/at>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
  if (!question) return reply("Ask me about your projects, for example: which projects need my attention?");
  try {
    return reply((await answerInChat(actor, question, 8000)).text);
  } catch (error) {
    return reply(errorMessage(error));
  }
}
