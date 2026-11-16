"use client";

import Link from "next/link";
import { ArrowRight, Check, FileText, ListPlus, Send, X } from "lucide-react";
import { useState } from "react";
import { completeChatActionAction, executeChatActionAction } from "@/app/actions";
import { Button, toast } from "@/components/ui";
import { TicketDraftDialog } from "@/components/features/ticket-drafts";
import type { ProposedAction } from "@/lib/types";

function resultHref(action: ProposedAction): string | undefined {
  const ref = action.resultRef;
  if (!ref) return undefined;
  if (action.kind === "escalate") return `/inbox/${ref}`;
  if (action.kind === "generate_report") return `/projects/${action.projectId}/reports/${ref}`;
  if (action.kind === "create_tickets") return `/projects/${action.projectId}/tickets?q=${encodeURIComponent(ref.split(",")[0].trim())}`;
  return undefined;
}

const ICONS = { create_tickets: ListPlus, escalate: Send, generate_report: FileText, save_note: FileText, open_incident: FileText } as const;

interface Props {
  action: ProposedAction;
  conversationId: string;
  messageId: string;
  /** Called with the updated action so the parent can keep its copy in sync. */
  onChange: (action: ProposedAction, href?: string) => void;
  href?: string;
}

/** A suggestion from the assistant. Nothing happens until the director clicks. */
export function ActionCard({ action, conversationId, messageId, onChange, href }: Props) {
  const [busy, setBusy] = useState<"run" | "dismiss" | null>(null);
  const [dialog, setDialog] = useState(false);
  const Icon = ICONS[action.kind];
  const ids = { conversationId, messageId, actionId: action.id };

  async function run() {
    if (action.kind === "create_tickets") {
      setDialog(true);
      return;
    }
    setBusy("run");
    const result = await executeChatActionAction(ids);
    setBusy(null);
    if (!result.ok) {
      toast({ tone: "danger", title: result.error });
      return;
    }
    onChange({ ...action, status: "done", resultRef: result.data.resultRef }, result.data.href);
  }

  async function dismiss() {
    setBusy("dismiss");
    const result = await completeChatActionAction({ ...ids, status: "dismissed" });
    setBusy(null);
    if (!result.ok) {
      toast({ tone: "danger", title: result.error });
      return;
    }
    onChange({ ...action, status: "dismissed" });
  }

  async function created(keys: string[]) {
    setDialog(false);
    const resultRef = keys.join(", ");
    const result = await completeChatActionAction({ ...ids, status: "done", resultRef });
    if (!result.ok) toast({ tone: "danger", title: result.error });
    onChange({ ...action, status: "done", resultRef });
  }

  const link = href ?? resultHref(action);
  const verb = action.kind === "escalate" ? "Send question" : action.kind === "generate_report" ? "Generate report" : action.kind === "create_tickets" ? "Review ticket drafts" : "Do it";

  return (
    <div className="rounded-lg border border-accent-line bg-accent-soft/50 p-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{action.status === "proposed" ? "Suggested next step" : action.status === "done" ? "Done" : "Dismissed"}</p>
          <p className="text-[13px] font-medium">{action.label}</p>
          {action.description ? <p className="mt-0.5 text-[13px] text-muted">{action.description}</p> : null}
          {action.kind === "escalate" && typeof action.payload.question === "string" && action.status === "proposed" ? <p className="mt-1 rounded-md border border-line bg-surface p-2 text-[13px]">&ldquo;{action.payload.question}&rdquo;</p> : null}
          {action.status === "proposed" ? (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" loading={busy === "run"} disabled={busy !== null} onClick={() => void run()}>
                {verb}
              </Button>
              <Button size="sm" variant="ghost" loading={busy === "dismiss"} disabled={busy !== null} onClick={() => void dismiss()}>
                Dismiss
              </Button>
              <span className="self-center text-xs text-muted">Nothing happens until you click.</span>
            </div>
          ) : action.status === "done" ? (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
              <Check size={14} aria-hidden className="text-success" />
              <span className="min-w-0 break-words">{action.kind === "create_tickets" && action.resultRef ? `Created ${action.resultRef}` : "Completed"}</span>
              {link ? (
                <Link href={link} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                  {action.kind === "escalate" ? "Open the conversation" : action.kind === "generate_report" ? "Open the report" : "View tickets"} <ArrowRight size={13} aria-hidden />
                </Link>
              ) : null}
            </p>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
              <X size={14} aria-hidden /> You dismissed this suggestion.
            </p>
          )}
        </div>
      </div>
      {action.kind === "create_tickets" ? (
        <TicketDraftDialog
          projectId={action.projectId}
          open={dialog}
          onClose={() => setDialog(false)}
          initialText={typeof action.payload.text === "string" ? action.payload.text : undefined}
          autoDraft
          onCreated={(keys) => void created(keys)}
        />
      ) : null}
    </div>
  );
}
