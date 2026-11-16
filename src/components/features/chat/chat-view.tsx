"use client";

import { useRouter } from "next/navigation";
import { MessagesSquare, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Drawer, EmptyState, cn } from "@/components/ui";
import type { ConversationSummary } from "@/lib/services/chat";
import type { ChatMessage, Conversation, ProposedAction, RunStep } from "@/lib/types";
import { AgentStrip } from "./agent-strip";
import { Composer } from "./composer";
import { ConversationList } from "./conversation-list";
import { AssistantMessage, ErrorMessage, StreamingMessage, UserMessage } from "./message";
import { streamChat } from "./sse";

const PORTFOLIO_SUGGESTIONS = [
  "Which projects need my attention this week?",
  "What shipped yesterday?",
  "Are there any open incidents I should know about?",
  "Which tickets are blocked across my projects?",
  "Who is waiting on an answer from the team?",
  "Summarise last week for my projects",
];
const PROJECT_SUGGESTIONS = ["What is at risk?", "What changed in the last two days?", "Who is working on what?", "Is production healthy?", "Which tickets are blocked?"];

interface Props {
  userName: string;
  projectId?: string;
  projectName?: string;
  conversations: ConversationSummary[];
  conversation?: Conversation;
  initialQuery?: string;
  basePath: string;
  /** Tailwind height classes for the panel; depends on what sits above it. */
  heightClass?: string;
}

export function ChatView({ userName, projectId, projectName, conversations, conversation, initialQuery, basePath, heightClass = "h-[calc(100dvh-11.5rem)]" }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(conversation?.messages ?? []);
  const [conversationId, setConversationId] = useState<string | undefined>(conversation?.id);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<{ text: string; message: string } | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [actionHrefs, setActionHrefs] = useState<Record<string, string>>({});
  const scroller = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const autoSent = useRef(false);
  const idRef = useRef(conversationId);
  idRef.current = conversationId;

  const suggestions = projectId ? PROJECT_SUGGESTIONS : PORTFOLIO_SUGGESTIONS;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [messages.length, steps.length, streamText, error]);

  const send = useCallback(
    async (raw: string, options: { retry?: boolean } = {}) => {
      const text = raw.trim();
      if (!text) return;
      setError(null);
      setStreaming(true);
      setSteps([]);
      setStreamText("");
      if (!options.retry) {
        setMessages((prev) => [...prev, { id: `local_${Date.now()}`, role: "user", content: text, at: new Date().toISOString() }]);
        setInput("");
      }
      const controller = new AbortController();
      abort.current = controller;
      await streamChat(
        { text, conversationId: idRef.current, projectId },
        {
          onStep: (step) => setSteps((prev) => (prev.some((s) => s.id === step.id) ? prev.map((s) => (s.id === step.id ? step : s)) : [...prev, step])),
          onDelta: (chunk) => setStreamText((prev) => prev + chunk),
          onDone: ({ conversationId: id, message }) => {
            setMessages((prev) => [...prev, message]);
            setStreaming(false);
            setStreamText("");
            setSteps([]);
            if (idRef.current !== id) {
              idRef.current = id;
              setConversationId(id);
              window.history.replaceState(null, "", `${basePath}?c=${id}`);
            }
            router.refresh();
          },
          onError: (message) => {
            setStreaming(false);
            setStreamText("");
            setSteps([]);
            setError({ text, message });
          },
        },
        controller.signal,
      );
    },
    [projectId, basePath, router],
  );

  // Auto-send ?q=<text> once, then drop it from the address bar so a reload does not ask again.
  useEffect(() => {
    if (!initialQuery || autoSent.current || conversation) return;
    autoSent.current = true;
    window.history.replaceState(null, "", basePath);
    void send(initialQuery);
  }, [initialQuery, conversation, basePath, send]);

  useEffect(() => () => abort.current?.abort(), []);

  function updateAction(messageId: string, action: ProposedAction, href?: string) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, actions: m.actions?.map((a) => (a.id === action.id ? action : a)) } : m)));
    if (href) setActionHrefs((prev) => ({ ...prev, [action.id]: href }));
  }

  const list = (
    <ConversationList
      conversations={conversations}
      activeId={conversationId}
      basePath={basePath}
      onNavigate={() => setListOpen(false)}
      onDeleted={(id) => {
        setListOpen(false);
        if (id === conversationId) router.push(basePath);
        else router.refresh();
      }}
    />
  );

  const empty = messages.length === 0 && !streaming && !error;

  return (
    <div className={cn("grid min-h-[30rem] grid-cols-1 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]", heightClass)}>
      <aside className="hidden min-h-0 overflow-hidden rounded-lg border border-line bg-surface shadow-card lg:block" aria-label="Conversation history">
        {list}
      </aside>
      <Drawer open={listOpen} onClose={() => setListOpen(false)} title="Conversations" side="left" width="20rem">
        {list}
      </Drawer>

      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-card" aria-label="Conversation">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2 lg:hidden">
          <Button size="sm" variant="secondary" icon={<MessagesSquare size={14} />} onClick={() => setListOpen(true)}>
            Conversations
          </Button>
        </div>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
          {empty ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center py-6 text-center">
              <EmptyState
                icon={<Sparkles size={20} />}
                title={projectName ? `Ask about ${projectName}` : "Ask about your projects"}
                description="Answers are checked against what your teams actually did, and every claim links to its source."
              />
              <ul className="mt-2 flex flex-wrap justify-center gap-2" aria-label="Suggested questions">
                {suggestions.map((q) => (
                  <li key={q}>
                    <button type="button" onClick={() => void send(q)} className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[13px] text-fg shadow-card transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-accent">
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ol className="mx-auto max-w-3xl space-y-5" aria-label="Messages">
              {messages.map((m) =>
                m.role === "user" ? (
                  <UserMessage key={m.id} message={m} name={userName} />
                ) : (
                  <AssistantMessage key={m.id} message={m} conversationId={conversationId ?? ""} projectId={projectId} onActionChange={updateAction} actionHrefs={actionHrefs} />
                ),
              )}
              {streaming ? (
                <li className="space-y-3 pl-[2.375rem]">
                  <AgentStrip steps={steps} />
                </li>
              ) : null}
              {streaming && streamText ? <StreamingMessage text={streamText} /> : null}
              {error ? <ErrorMessage error={error.message} onRetry={() => void send(error.text, { retry: true })} /> : null}
            </ol>
          )}
        </div>
        <div className={cn(streaming && "opacity-95")}>
          <Composer value={input} onChange={setInput} onSubmit={() => void send(input)} disabled={streaming} projectScoped={Boolean(projectId)} />
        </div>
      </section>
    </div>
  );
}
