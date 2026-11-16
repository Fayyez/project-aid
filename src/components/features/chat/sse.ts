import type { ChatMessage, RunStep } from "@/lib/types";

export interface ChatStreamHandlers {
  onStep: (step: RunStep) => void;
  onDelta: (text: string) => void;
  onDone: (data: { conversationId: string; message: ChatMessage }) => void;
  onError: (error: string) => void;
}

/** Posts a question to the chat endpoint and dispatches the server-sent events it streams back. */
export async function streamChat(body: { text: string; conversationId?: string; projectId?: string }, handlers: ChatStreamHandlers, signal?: AbortSignal): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/chat", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" }, signal });
  } catch (error) {
    if (signal?.aborted) return;
    handlers.onError(error instanceof Error ? "Could not reach the server. Check your connection and try again." : "Something went wrong.");
    return;
  }
  if (!response.ok || !response.body) {
    let message = "The assistant could not answer right now.";
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* keep the generic message */
    }
    handlers.onError(message);
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  const dispatch = (block: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (data.length === 0) return;
    let payload: unknown;
    try {
      payload = JSON.parse(data.join("\n"));
    } catch {
      return;
    }
    if (event === "step") handlers.onStep(payload as RunStep);
    else if (event === "delta") handlers.onDelta((payload as { text: string }).text);
    else if (event === "done") {
      finished = true;
      handlers.onDone(payload as { conversationId: string; message: ChatMessage });
    } else if (event === "error") {
      finished = true;
      handlers.onError((payload as { error: string }).error);
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        dispatch(buffer.slice(0, index));
        buffer = buffer.slice(index + 2);
      }
    }
    if (buffer.trim()) dispatch(buffer);
  } catch {
    if (signal?.aborted) return;
  }
  if (!finished && !signal?.aborted) handlers.onError("The answer was interrupted. Please try again.");
}
