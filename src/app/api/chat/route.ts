import type { RunEvent } from "@/lib/agents/runtime";
import { errorMessage } from "@/lib/action-result";
import { getCurrentActor } from "@/lib/auth/current";
import { sendChatMessage } from "@/lib/services/chat";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Streams one assistant turn as server-sent events:
 *   event: step   data: RunStep        (an agent started or finished)
 *   event: delta  data: { text }       (a chunk of the answer)
 *   event: done   data: { conversationId, message }
 *   event: error  data: { error }
 */
export async function POST(request: Request) {
  const actor = await getCurrentActor();
  if (!actor) return Response.json({ error: "Sign in required" }, { status: 401 });
  // Same-origin only: the session cookie must not be usable from another site.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return Response.json({ error: "Cross-site request refused" }, { status: 403 });

  let body: { text?: unknown; conversationId?: unknown; projectId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text : "";
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : undefined;
  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          open = false;
        }
      };
      const onEvent = (event: RunEvent) => {
        if (event.type === "step_started" || event.type === "step_finished") send("step", event.step);
        else if (event.type === "delta") send("delta", { text: event.text });
      };
      try {
        const { conversation, message } = await sendChatMessage({ actor, text, conversationId, projectId, trigger: "chat", onEvent });
        send("done", { conversationId: conversation.id, message });
      } catch (error) {
        send("error", { error: errorMessage(error) });
      } finally {
        open = false;
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
}
