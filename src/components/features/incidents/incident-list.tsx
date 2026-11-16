import Link from "next/link";
import { ShieldCheck, Siren } from "lucide-react";
import { Badge, Card, EmptyState, RelativeTime, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { IncidentStatusBadge, SeverityBadge } from "@/components/domain";
import type { Incident } from "@/lib/types";

type Row = Incident & { projectName: string };

const SEV_RANK = { SEV1: 0, SEV2: 1, SEV3: 2, SEV4: 3 } as const;

function sortIncidents(list: Row[]): Row[] {
  return [...list].sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved") || SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.detectedAt.localeCompare(a.detectedAt));
}

function awaitingApproval(i: Incident): boolean {
  return i.fix?.status === "proposed";
}

/** Open incidents first, then resolved. Used by the portfolio and project incident pages. */
export function IncidentList({ incidents, showProject = true }: { incidents: Row[]; showProject?: boolean }) {
  const rows = sortIncidents(incidents);
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck size={20} />}
        title="No incidents"
        description="When a deployment fails or a health check goes red, the incident shows up here with a first assessment."
      />
    );
  }
  const open = rows.filter((r) => r.status !== "resolved").length;
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted" role="status">
        {open === 0 ? "Nothing is open right now." : `${open} open ${open === 1 ? "incident" : "incidents"}`}, {rows.length - open} resolved.
      </p>
      <Card>
        <Table>
          <THead>
            <Tr hover={false}>
              <Th>Severity</Th>
              <Th>Incident</Th>
              {showProject ? <Th>Project</Th> : null}
              <Th>Status</Th>
              <Th>Fix</Th>
              <Th>Detected</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((i) => (
              <Tr key={i.id}>
                <Td>
                  <SeverityBadge severity={i.severity} />
                </Td>
                <Td className="min-w-64 max-w-md">
                  <Link href={`/projects/${i.projectId}/incidents/${i.id}`} className="group block min-w-0">
                    <span className="font-mono text-xs text-muted">{i.key}</span>
                    <span className="block break-words font-medium group-hover:text-accent group-hover:underline">{i.title}</span>
                  </Link>
                </Td>
                {showProject ? <Td>{i.projectName}</Td> : null}
                <Td>
                  <IncidentStatusBadge status={i.status} />
                </Td>
                <Td>
                  {awaitingApproval(i) ? (
                    <Badge tone="accent" icon={<Siren />}>
                      Awaiting your approval
                    </Badge>
                  ) : i.fix ? (
                    <span className="text-[13px] text-muted">{i.fix.status === "approved" ? "Approved" : i.fix.status === "rejected" ? "Rejected" : i.fix.status === "applied" ? "Applied" : "Proposed"}</span>
                  ) : (
                    <span className="text-[13px] text-subtle">None yet</span>
                  )}
                </Td>
                <Td muted>
                  <RelativeTime iso={i.detectedAt} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
