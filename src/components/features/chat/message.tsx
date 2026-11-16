"use client";

import Link from "next/link";
import { ChevronDown, Route, TriangleAlert, RotateCcw } from "lucide-react";
import { CitationList, GroundingBadge, Markdown } from "@/components/domain";
import { ActionCard } from "./action-card";
import { citationHref } from "./links";
import { FeedbackButtons } from "@/components/features/feedback-buttons";
import { Avatar, Button, RelativeTime, Tooltip } from "@/components/ui";
import type { ChatMessage, ProposedAction } from "@/lib/types";

export function UserMessage({ message, name }: { message: ChatMessage; name: string }) {
  return (
    <li className="flex justify-end gap-2.5">
      <div className="min-w-0 max-w-[85%]">
        <div className="rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-sm text-accent-fg">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <p className="mt-1 text-right text-[11px] text-subtle">
          <RelativeTime iso={message.at} />
        </p>
      </div>
      <Avatar name={name} size="sm" />
    </li>
  );
}

interface AssistantProps {
  message: ChatMessage;
  conversationId: string;
  projectId?: string;
  onActionChange: (messageId: string, action: ProposedAction, href?: string) => void;
  actionHrefs: Record<string, string>;
}

export function AssistantMessage({ message, conversationId, projectId, onActionChange, actionHrefs }: AssistantProps) {
  const citations = message.citations ?? [];
  const unsupported = message.grounding?.unsupported ?? [];
  const pid = projectId ?? citations.find((c) => c.projectId)?.projectId;
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
        PA
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="rounded-2xl rounded-tl-sm border border-line bg-surface px-4 py-3 shadow-card">
          <p className="sr-only">Project Aid replied</p>
          <Markdown content={message.content} citations={citations} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
          {message.grounding ? (
            <Tooltip content={unsupported.length ? "Some statements could not be matched to a source. Expand below to see them." : "Every statement was matched to a source."}>
              <GroundingBadge grounding={message.grounding} />
            </Tooltip>
          ) : null}
          {message.runId ? (
            <Link href={`/runs/${message.runId}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg hover:underline">
              <Route size={12} aria-hidden /> How this was answered
            </Link>
          ) : null}
          <span className="text-xs text-subtle">
            <RelativeTime iso={message.at} />
          </span>
          <div className="ml-auto">
            <FeedbackButtons target={{ type: "chat_message", id: message.id, conversationId }} projectId={pid} runId={message.runId} initial={message.feedback} />
          </div>
        </div>

        {unsupported.length > 0 ? (
          <details className="group rounded-lg border border-warning-line bg-warning-soft/60 px-3 py-2 text-[13px]">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-warning [&::-webkit-details-marker]:hidden">
              <TriangleAlert size={14} aria-hidden />
              {unsupported.length} {unsupported.length === 1 ? "statement" : "statements"} could not be checked against a source
              <ChevronDown size={14} aria-hidden className="ml-auto transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-fg">
              {unsupported.map((u, i) => (
                <li key={i} className="break-words">
                  {u}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {citations.length > 0 ? (
          <details className="group rounded-lg border border-line px-3 py-2 text-[13px]">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
              Sources <span className="rounded-full bg-surface-3 px-1.5 text-xs tabular-nums text-muted">{citations.length}</span>
              <ChevronDown size={14} aria-hidden className="ml-auto text-muted transition-transform group-open:rotate-180" />
            </summary>
            <CitationList className="mt-2" citations={citations} hrefFor={(c) => citationHref(c, projectId)} />
          </details>
        ) : null}

        {message.actions && message.actions.length > 0 ? (
          <div className="space-y-2">
            {message.actions.map((a) => (
              <ActionCard key={a.id} action={a} conversationId={conversationId} messageId={message.id} href={actionHrefs[a.id]} onChange={(next, href) => onActionChange(message.id, next, href)} />
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function StreamingMessage({ text }: { text: string }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
        PA
      </span>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-sm border border-line bg-surface px-4 py-3 shadow-card" aria-live="polite" aria-busy="true">
          <Markdown content={text} />
          <span aria-hidden className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-accent" />
        </div>
      </div>
    </li>
  );
}

export function ErrorMessage({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert size={14} />
      </span>
      <div role="alert" className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-danger-line bg-danger-soft px-4 py-3 text-sm">
        <p className="font-medium text-danger">The assistant could not answer</p>
        <p className="mt-0.5 break-words text-fg">{error}</p>
        <Button className="mt-2" size="sm" variant="secondary" icon={<RotateCcw size={13} />} onClick={onRetry}>
          Try again
        </Button>
      </div>
    </li>
  );
}
