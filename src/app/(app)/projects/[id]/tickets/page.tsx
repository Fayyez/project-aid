import { notFound } from "next/navigation";
import { Search, Ticket as TicketIcon } from "lucide-react";
import { Button, Card, CardBody, EmptyState, Input, LinkButton, Select, Tabs } from "@/components/ui";
import { NewTicketsButton } from "@/components/features/project/new-tickets-button";
import { TicketsTable } from "@/components/features/project/tickets-table";
import { AccessError } from "@/lib/auth/access";
import { requireActor } from "@/lib/auth/current";
import { listTickets } from "@/lib/services/queries";
import type { TicketStatus } from "@/lib/types";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const OPEN: TicketStatus[] = ["todo", "in_progress", "in_review", "blocked"];

export default async function TicketsPage({ params, searchParams }: PageProps<"/projects/[id]/tickets">) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requireActor();
  const status = first(sp.status) || "all";
  const q = first(sp.q).trim();
  const assignee = first(sp.assignee);

  let data;
  try {
    data = await listTickets(actor, id, { q: q || undefined });
  } catch (error) {
    if (error instanceof AccessError) notFound();
    throw error;
  }
  const { project, tickets, team, counts } = data;
  const sum = (list: TicketStatus[]) => list.reduce((n, s) => n + counts[s], 0);
  const tabs = [
    { label: "All", value: "all", count: sum(Object.keys(counts) as TicketStatus[]) },
    { label: "Open", value: "open", count: sum(OPEN) },
    { label: "Blocked", value: "blocked", count: counts.blocked },
    { label: "In progress", value: "in_progress", count: counts.in_progress + counts.in_review },
    { label: "Done", value: "done", count: counts.done },
  ];
  const statusFilter: Record<string, TicketStatus[] | undefined> = {
    open: OPEN,
    blocked: ["blocked"],
    in_progress: ["in_progress", "in_review"],
    done: ["done"],
  };
  const allowed = statusFilter[status];
  const shown = tickets.filter((t) => (!allowed || allowed.includes(t.status)) && (!assignee || (assignee === "none" ? !t.assigneeId : t.assigneeId === assignee)));
  const today = new Date().toISOString();
  const overdueIds = shown.filter((t) => t.dueDate && t.dueDate < today).map((t) => t.id);
  const teamOptions = team.map((m) => ({ id: m.id, name: m.name }));
  const filtered = Boolean(q || assignee || (status !== "all" && allowed));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-muted">Everything planned for this project. Change a status or an owner right in the list; open a row for the details.</p>
        {project.features.ticketing ? <NewTicketsButton projectId={id} team={teamOptions} /> : null}
      </div>

      <Tabs param="status" label="Filter by status" defaultValue="all" items={tabs} />

      <Card>
        <CardBody>
          <form method="get" role="search" aria-label="Search tickets" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="status" value={status} />
            <div className="min-w-0 flex-1 basis-56">
              <label htmlFor="t-q" className="mb-1 block text-xs font-medium text-muted">
                Search
              </label>
              <Input id="t-q" name="q" defaultValue={q} placeholder="Key, title or description" />
            </div>
            <div className="w-full sm:w-52">
              <label htmlFor="t-a" className="mb-1 block text-xs font-medium text-muted">
                Assignee
              </label>
              <Select id="t-a" name="assignee" defaultValue={assignee}>
                <option value="">Everyone</option>
                <option value="none">Unassigned</option>
                {teamOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="secondary" icon={<Search size={14} aria-hidden />}>
              Search
            </Button>
            {filtered ? (
              <LinkButton href={`/projects/${id}/tickets`} variant="ghost">
                Clear
              </LinkButton>
            ) : null}
          </form>
        </CardBody>
      </Card>

      {shown.length === 0 ? (
        <EmptyState
          icon={<TicketIcon size={20} />}
          title={filtered ? "No tickets match" : "No tickets yet"}
          description={filtered ? "Try another status tab or clear the search." : "Paste a client message and turn it into tickets, or sync a connected tracker."}
          action={!filtered && project.features.ticketing ? <NewTicketsButton projectId={id} team={teamOptions} /> : undefined}
        />
      ) : (
        <>
          <p className="text-xs text-muted" role="status">
            {shown.length} ticket{shown.length === 1 ? "" : "s"}
          </p>
          <TicketsTable projectId={id} tickets={shown} team={teamOptions} overdueIds={overdueIds} />
        </>
      )}
    </div>
  );
}
