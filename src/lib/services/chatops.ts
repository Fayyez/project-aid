import { actorFromPerson } from "@/lib/auth/access";
import { config } from "@/lib/config";
import { getStore } from "@/lib/store";
import type { Actor } from "@/lib/types";
import { askAssistant } from "@/lib/workflows/ask";

/**
 * Shared by the Teams and Slack entry points: map the chat identity to a
 * director, ask the assistant, and render the answer as plain chat text.
 */

/** Finds the director whose stored chat handle matches one of the given identifiers. */
export async function directorFromChatIdentity(channel: "teams" | "slack", identifiers: (string | undefined)[]): Promise<Actor | null> {
  const wanted = identifiers.filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase());
  if (wanted.length === 0) return null;
  const store = await getStore();
  const person = (await store.list("people")).find((candidate) => candidate.role !== "member" && Boolean(candidate.handles[channel]) && wanted.includes(String(candidate.handles[channel]).toLowerCase()));
  // Chat entry points are read-only: anything that changes state is confirmed in the portal.
  return person ? actorFromPerson(person, "token", ["read"]) : null;
}

export function toChatText(markdown: string): string {
  return markdown
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\s*\[[A-Z]\d+(?:,\s*[A-Z]\d+)*\]/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

export async function answerInChat(actor: Actor, question: string, timeoutMs?: number): Promise<{ text: string; timedOut: boolean }> {
  const run = askAssistant({ actor, question, trigger: "mcp" }).then((result) => {
    const sources = result.citations.length ? `\n\nBased on ${result.citations.length} project record${result.citations.length === 1 ? "" : "s"} (${result.grounding.verdict.replace("_", " ")}). Open ${config.baseUrl}/runs/${result.run.id} for sources.` : "";
    return { text: `${toChatText(result.answer)}${sources}`, timedOut: false };
  });
  if (!timeoutMs) return run;
  const timeout = new Promise<{ text: string; timedOut: boolean }>((resolve) => setTimeout(() => resolve({ text: `I am still working on that. The full answer will be in the portal: ${config.baseUrl}/chat`, timedOut: true }), timeoutMs));
  return Promise.race([run, timeout]);
}

export const NOT_LINKED = "Your chat account is not linked to a Project Aid director. Ask an administrator to add your chat handle to your profile in Settings -> People.";
