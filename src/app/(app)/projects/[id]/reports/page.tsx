import { FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GenerateReportPanel } from "@/components/features/reports/generate-report-panel";
import { GroundingBadge } from "@/components/domain";
import { Badge, Callout, Card, CardHeader, EmptyState, RelativeTime, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { AccessError } from "@/lib/auth/access";
import { requireActor } from "@/lib/auth/current";
import { shortDate } from "@/lib/format";
import { listIncidents, listReports } from "@/lib/services/queries";
import { TEMPLATE_LABELS } from "@/lib/templates";
import type { ReportKind } from "@/lib/types";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ params }: PageProps<"/projects/[id]/reports">) {
  const { id } = await params;
  const actor = await requireActor();
  const data = await Promise.all([listReports(actor, id), listIncidents(actor, id)]).catch((error: unknown) => {
    if (error instanceof AccessError) return null;
    throw error;
  });
  if (!data) notFound();
  const [{ project, reports }, incidents] = data;
  const kinds = (Object.keys(TEMPLATE_LABELS) as ReportKind[]).map((kind) => ({ kind, label: TEMPLATE_LABELS[kind].label, description: TEMPLATE_LABELS[kind].description }));
  const sorted = [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-6">
      {project.features.reports ? (
        <GenerateReportPanel projectId={project.id} kinds={kinds} incidents={incidents.map((incident) => ({ id: incident.id, label: `${incident.key}: ${incident.title}` }))} />
      ) : (
        <Callout tone="info" title="Reports are turned off for this project">
          Report generation is disabled, so the button is hidden. Existing reports stay available below. Turn it back on under{" "}
          <Link href={`/projects/${project.id}/settings?tab=features`} className="font-medium text-accent hover:underline">
            Settings, Features
          </Link>
          .
        </Callout>
      )}

      <Card as="section" aria-labelledby="reports-heading">
        <CardHeader title={<span id="reports-heading">Reports</span>} description={`${sorted.length} ${sorted.length === 1 ? "report" : "reports"}, newest first.`} />
        {sorted.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<FileText size={20} />} title="No reports yet" description="Generate a progress report, release notes or an incident report. Each one is saved here with its sources." />
          </div>
        ) : (
          <Table className="rounded-none border-0 shadow-none" containerClassName="rounded-none border-0 shadow-none">
            <THead>
              <Tr hover={false}>
                <Th>Title</Th>
                <Th>Kind</Th>
                <Th>Period</Th>
                <Th>Created</Th>
                <Th>Grounding</Th>
              </Tr>
            </THead>
            <TBody>
              {sorted.map((report) => (
                <Tr key={report.id}>
                  <Td className="min-w-56 max-w-md">
                    <Link href={`/projects/${project.id}/reports/${report.id}`} className="font-medium text-fg hover:text-accent hover:underline">
                      {report.title}
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={report.kind === "incident" ? "danger" : report.kind === "release_notes" ? "accent" : "info"}>{TEMPLATE_LABELS[report.kind].label}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap" muted>
                    {shortDate(report.periodStart)} to {shortDate(report.periodEnd)}
                  </Td>
                  <Td className="whitespace-nowrap" muted>
                    <RelativeTime iso={report.createdAt} />
                  </Td>
                  <Td>{report.grounding ? <GroundingBadge grounding={report.grounding} /> : <span className="text-muted">Not checked</span>}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
