import type { RunEvent } from "@/lib/agents/runtime";
import { AccessError, assertWrite, requireProject } from "@/lib/auth/access";
import { audit, rateLimit } from "@/lib/security/audit";
import { getStore } from "@/lib/store";
import type { Actor, ChatMessage, Conversation, ProposedAction, ReportKind, RunTrigger } from "@/lib/types";
import { byNewest, newId, nowIso, truncate } from "@/lib/util";
import { askAssistant } from "@/lib/workflows/ask";

export interface ConversationSummary {
  id: string;
  title: string;
  projectId?: string;
  projectName?: string;
  updatedAt: string;
  messageCount: number;
}

async function ownConversation(actor: Actor, conversationId: string): Promise<Conversation> {
  const store = await getStore();
  const conversation = await store.get("conversations", conversationId);
  // Conversations are private to the director who started them.
  if (!conversation || conversation.userId !== actor.id) throw new AccessError("Conversation not found", 404);
  return conversation;
}

export async function listConversations(actor: Actor, projectId?: string): Promise<ConversationSummary[]> {
  const store = await getStore();
  const projects = new Map((await store.list("projects")).map((project) => [project.id, project.name]));
  return (await store.list("conversations"))
    .filter((conversation) => conversation.userId === actor.id && (projectId === undefined || conversation.projectId === projectId))
    .sort(byNewest((conversation) => conversation.updatedAt))
    .slice(0, 40)
    .map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      projectId: conversation.projectId,
      projectName: conversation.projectId ? projects.get(conversation.projectId) : undefined,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messages.length,
    }));
}

export async function getConversation(actor: Actor, conversationId: string): Promise<Conversation> {
  return ownConversation(actor, conversationId);
}

export async function deleteConversation(actor: Actor, conversationId: string): Promise<void> {
  await ownConversation(actor, conversationId);
  const store = await getStore();
  await store.remove("conversations", conversationId);
}

export interface SendArgs {
  actor: Actor;
  text: string;
  conversationId?: string;
  projectId?: string;
  trigger: RunTrigger;
  onEvent?: (event: RunEvent) => void;
}

/** Sends one message to the assistant and stores both sides of the exchange. */
export async function sendChatMessage(args: SendArgs): Promise<{ conversation: Conversation; message: ChatMessage }> {
  const text = args.text.trim();
  if (!text) throw new Error("Type a question first.");
  if (text.length > 6000) throw new Error("That message is too long. Shorten it to under 6,000 characters.");
  const limit = rateLimit(`chat:${args.actor.id}`, 30, 5 * 60 * 1000);
  if (!limit.ok) throw new Error(`You are sending messages very quickly. Try again in ${limit.retryAfterSeconds} seconds.`);

  const store = await getStore();
  let conversation: Conversation;
  if (args.conversationId) {
    conversation = await ownConversation(args.actor, args.conversationId);
  } else {
    if (args.projectId) await requireProject(args.actor, args.projectId);
    const now = nowIso();
    conversation = { id: newId("cnv"), userId: args.actor.id, projectId: args.projectId, title: truncate(text, 60), messages: [], createdAt: now, updatedAt: now };
  }
  const history = conversation.messages.slice(-8).map((message) => ({ role: message.role, content: message.content }));
  const userMessage: ChatMessage = { id: newId("msg"), role: "user", content: text, at: nowIso() };
  conversation.messages.push(userMessage);
  await store.put("conversations", conversation);

  const result = await askAssistant({ actor: args.actor, question: text, projectId: conversation.projectId, history, trigger: args.trigger, onEvent: args.onEvent });
  const message: ChatMessage = {
    id: newId("msg"),
    role: "assistant",
    content: result.answer,
    at: nowIso(),
    citations: result.citations,
    actions: result.actions,
    grounding: result.grounding,
    runId: result.run.id,
  };
  conversation.messages.push(message);
  conversation.updatedAt = nowIso();
  await store.put("conversations", conversation);
  return { conversation, message };
}

function findAction(conversation: Conversation, messageId: string, actionId: string): { message: ChatMessage; action: ProposedAction } {
  const message = conversation.messages.find((candidate) => candidate.id === messageId);
  const action = message?.actions?.find((candidate) => candidate.id === actionId);
  if (!message || !action) throw new AccessError("Action not found", 404);
  return { message, action };
}

/** Records the outcome of an action that was completed elsewhere (for example ticket drafts confirmed in a dialog). */
export async function completeAction(actor: Actor, args: { conversationId: string; messageId: string; actionId: string; status: "done" | "dismissed"; resultRef?: string }): Promise<Conversation> {
  const conversation = await ownConversation(actor, args.conversationId);
  const { action } = findAction(conversation, args.messageId, args.actionId);
  action.status = args.status;
  action.resultRef = args.resultRef;
  const store = await getStore();
  await store.put("conversations", conversation);
  return conversation;
}

/**
 * Carries out an action the assistant proposed, after the director clicked it.
 * The payload stored with the proposal is used, never text from the client,
 * and the target person is re-checked against the project team.
 */
export async function executeAction(actor: Actor, args: { conversationId: string; messageId: string; actionId: string }): Promise<{ conversation: Conversation; resultRef: string; href: string }> {
  assertWrite(actor);
  const conversation = await ownConversation(actor, args.conversationId);
  const { action } = findAction(conversation, args.messageId, args.actionId);
  if (action.status !== "proposed") throw new Error("This action was already handled.");
  const project = await requireProject(actor, action.projectId);
  let resultRef: string;
  let href: string;
  if (action.kind === "escalate") {
    const { escalateQuestion } = await import("@/lib/workflows/escalate");
    const thread = await escalateQuestion({
      project,
      actor,
      question: String(action.payload.question ?? ""),
      assigneeId: typeof action.payload.assigneeId === "string" ? action.payload.assigneeId : undefined,
      trigger: "chat",
    });
    resultRef = thread.id;
    href = `/inbox/${thread.id}`;
  } else if (action.kind === "generate_report") {
    const { generateReport } = await import("@/lib/workflows/report");
    const kind = (["progress", "release_notes", "incident"] as const).includes(action.payload.kind as ReportKind) ? (action.payload.kind as ReportKind) : "progress";
    const report = await generateReport({ project, actor, kind, periodDays: typeof action.payload.periodDays === "number" ? action.payload.periodDays : undefined, trigger: "chat" });
    resultRef = report.id;
    href = `/projects/${project.id}/reports/${report.id}`;
  } else {
    throw new Error("This action is completed from its own dialog.");
  }
  action.status = "done";
  action.resultRef = resultRef;
  const store = await getStore();
  await store.put("conversations", conversation);
  await audit(actor, `chat.action_${action.kind}`, { projectId: project.id, target: resultRef });
  return { conversation, resultRef, href };
}
