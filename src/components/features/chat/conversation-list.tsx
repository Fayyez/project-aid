"use client";

import Link from "next/link";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteConversationAction } from "@/app/actions";
import { Button, IconButton, RelativeTime, cn, toast } from "@/components/ui";
import type { ConversationSummary } from "@/lib/services/chat";

interface Props {
  conversations: ConversationSummary[];
  activeId?: string;
  basePath: string;
  onNavigate?: () => void;
  onDeleted: (id: string) => void;
}

export function ConversationList({ conversations, activeId, basePath, onNavigate, onDeleted }: Props) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  async function remove(id: string) {
    setDeleting(id);
    const result = await deleteConversationAction(id);
    setDeleting(null);
    setConfirm(null);
    if (!result.ok) {
      toast({ tone: "danger", title: result.error });
      return;
    }
    onDeleted(id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-3">
        <Link href={basePath} onClick={onNavigate} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface text-sm font-medium shadow-card hover:bg-surface-2">
          <MessageSquarePlus size={15} aria-hidden /> New conversation
        </Link>
      </div>
      <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? <p className="px-2 py-3 text-[13px] text-muted">No conversations yet. Ask your first question.</p> : null}
        <ul className="space-y-0.5">
          {conversations.map((c) => {
            const active = c.id === activeId;
            return (
              <li key={c.id} className={cn("group relative rounded-md", active ? "bg-accent-soft" : "hover:bg-surface-2")}>
                <Link href={`${basePath}?c=${c.id}`} onClick={onNavigate} aria-current={active ? "page" : undefined} className="block min-w-0 rounded-md px-2.5 py-2 pr-9">
                  <span className={cn("block truncate text-[13px]", active ? "font-semibold text-accent" : "font-medium")}>{c.title}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                    {c.projectName ? <span className="truncate">{c.projectName}</span> : null}
                    <RelativeTime iso={c.updatedAt} className="shrink-0" />
                  </span>
                </Link>
                {confirm === c.id ? (
                  <div className="flex items-center gap-1 px-2 pb-2">
                    <Button size="sm" variant="danger" loading={deleting === c.id} onClick={() => void remove(c.id)}>
                      Delete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                      Keep
                    </Button>
                  </div>
                ) : (
                  <IconButton label={`Delete conversation: ${c.title}`} size="sm" className="absolute right-1 top-1.5 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100" onClick={() => setConfirm(c.id)}>
                    <Trash2 size={14} />
                  </IconButton>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
