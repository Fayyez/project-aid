"use client";

import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { Select, Table, TBody, Td, Th, THead, Tr, toast } from "@/components/ui";
import { PriorityBadge } from "@/components/domain";
import { updateTicketAction } from "@/app/actions";
import { formatDate } from "@/lib/format";
import type { Ticket, TicketStatus } from "@/lib/types";

const STATUSES: { value: TicketStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "in_review", label: "In review" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

const ORIGIN: Record<Ticket["origin"]["kind"], string> = {
  manual: "Created by hand",
  message: "From a message",
  incident: "From an incident",
  import: "Imported",
  clarification: "From a question",
};

export function TicketsTable({ projectId, tickets, team, overdueIds }: { projectId: string; tickets: Ticket[]; team: { id: string; name: string }[]; overdueIds: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [local, setLocal] = useState<Record<string, { status?: TicketStatus; assigneeId?: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const names = new Map(team.map((m) => [m.id, m.name]));

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function change(ticket: Ticket, patch: { status?: TicketStatus; assigneeId?: string }, label: string) {
    const before = local[ticket.id];
    setLocal((l) => ({ ...l, [ticket.id]: { ...l[ticket.id], ...patch } }));
    setSaving(ticket.id);
    try {
      const result = await updateTicketAction(projectId, ticket.id, patch);
      if (!result.ok) {
        setLocal((l) => ({ ...l, [ticket.id]: before ?? {} }));
        toast({ tone: "danger", title: result.error });
        return;
      }
      toast({ tone: "success", title: `${ticket.key} updated`, description: label, duration: 2500 });
      router.refresh();
    } catch {
      setLocal((l) => ({ ...l, [ticket.id]: before ?? {} }));
      toast({ tone: "danger", title: "The ticket could not be updated. Please try again." });
    } finally {
      setSaving(null);
    }
  }

  return (
    <Table aria-label="Tickets">
      <THead>
        <Tr hover={false}>
          <Th className="w-8">
            <span className="sr-only">Details</span>
          </Th>
          <Th>Key</Th>
          <Th>Title</Th>
          <Th>Type</Th>
          <Th>Priority</Th>
          <Th>Status</Th>
          <Th>Assignee</Th>
          <Th>Due</Th>
          <Th>Origin</Th>
        </Tr>
      </THead>
      <TBody>
        {tickets.map((t) => {
          const status = local[t.id]?.status ?? t.status;
          const assigneeId = local[t.id]?.assigneeId ?? t.assigneeId ?? "";
          const expanded = open.has(t.id);
          const busy = saving === t.id;
          const overdue = overdueIds.includes(t.id) && status !== "done" && status !== "cancelled";
          return (
            <Fragment key={t.id}>
              <Tr>
                <Td className="pr-0">
                  <button
                    type="button"
                    onClick={() => toggle(t.id)}
                    aria-expanded={expanded}
                    aria-controls={`details-${t.id}`}
                    aria-label={`${expanded ? "Hide" : "Show"} details for ${t.key}`}
                    className="inline-flex size-6 items-center justify-center rounded text-muted hover:bg-surface-3 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronRight size={14} aria-hidden className={expanded ? "rotate-90 transition-transform" : "transition-transform"} />
                  </button>
                </Td>
                <Td mono className="whitespace-nowrap">
                  {t.key}
                </Td>
                <Td className="min-w-64 max-w-md">
                  <button type="button" onClick={() => toggle(t.id)} className="text-left font-medium hover:underline">
                    {t.title}
                  </button>
                </Td>
                <Td muted className="capitalize">
                  {t.type}
                </Td>
                <Td>
                  <PriorityBadge priority={t.priority} />
                </Td>
                <Td className="min-w-40">
                  <div>
                    <Select aria-label={`Status of ${t.key}`} value={status} disabled={busy} onChange={(e) => change(t, { status: e.target.value as TicketStatus }, `Status is now ${STATUSES.find((s) => s.value === e.target.value)?.label}`)} className="h-7 w-36 py-0 text-[13px]">
                      {STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </Td>
                <Td className="min-w-40">
                  <Select aria-label={`Assignee of ${t.key}`} value={assigneeId} disabled={busy} onChange={(e) => change(t, { assigneeId: e.target.value }, e.target.value ? `Assigned to ${names.get(e.target.value) ?? "a team member"}` : "Now unassigned")} className="h-7 w-36 py-0 text-[13px]">
                    <option value="">Unassigned</option>
                    {team.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                    {assigneeId && !names.has(assigneeId) ? <option value={assigneeId}>Former team member</option> : null}
                  </Select>
                </Td>
                <Td className="whitespace-nowrap" muted={!overdue}>
                  {t.dueDate ? (
                    <span className={overdue ? "font-medium text-danger" : undefined}>
                      {formatDate(t.dueDate)}
                      {overdue ? " (overdue)" : ""}
                    </span>
                  ) : (
                    "No date"
                  )}
                </Td>
                <Td muted className="whitespace-nowrap">
                  {ORIGIN[t.origin.kind]}
                </Td>
              </Tr>
              {expanded ? (
                <tr id={`details-${t.id}`} className="bg-surface-2/50">
                  <td colSpan={9} className="border-b border-line px-4 py-3">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="min-w-0 space-y-3">
                        <div>
                          <h4 className="text-xs font-semibold text-muted">Description</h4>
                          <p className="mt-1 whitespace-pre-line text-[13px]">{t.description || "No description."}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-muted">Acceptance criteria</h4>
                          {t.acceptanceCriteria.length > 0 ? (
                            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
                              {t.acceptanceCriteria.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-[13px] text-muted">None written yet.</p>
                          )}
                        </div>
                      </div>
                      {t.origin.kind === "message" && t.origin.text ? (
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-muted">Original message</h4>
                          <blockquote className="mt-1 max-h-60 overflow-auto whitespace-pre-line rounded-md border-l-2 border-accent-line bg-surface px-3 py-2 text-[13px] text-muted">{t.origin.text}</blockquote>
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </TBody>
    </Table>
  );
}
