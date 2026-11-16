import { ArrowLeft, Route } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CitationList, GroundingBadge, Markdown } from "@/components/domain";
import { FeedbackButtons } from "@/components/features/feedback-buttons";
import { ReportActions } from "@/components/features/reports/report-actions";
import { Badge, Card, CardBody, RelativeTime } from "@/components/ui";
import { AccessError } from "@/lib/auth/access";
import { requireActor } from "@/lib/auth/current";
import { shortDate } from "@/lib/format";
import { getReport } from "@/lib/services/queries";
import { TEMPLATE_LABELS } from "@/lib/templates";

export const metadata = { title: "Report" };

/** Printing keeps only the report: the sidebar, top bar and project tabs are hidden. */
const PRINT_CSS = `
@media print {
  body aside, body header, body nav, [data-print-hide] { display: none !important; }
  [class*="min-h-dvh"] { display: block !important; }
  main#main { max-width: none !important; padding: 0 !important; }
  body, main#main { background: #fff !important; color: #111 !important; }
  .report-sheet { border: 0 !important; box-shadow: none !important; background: #fff !important; }
  .report-sheet a { color: inherit !important; text-decoration: none !important; }
}
`;

export default async function ReportPage({ params }: PageProps<"/projects/[id]/reports/[reportId]">) {
  const { id, reportId } = await params;
  const actor = await requireActor();
  const data = await getReport(actor, reportId).catch((error: unknown) => {
    if (error instanceof AccessError) return null;
    throw error;
  });
  if (!data || data.project.id !== id) notFound();
  const { report } = data;
  const kind = TEMPLATE_LABELS[report.kind].label;

  return (
    <article className="space-y-6">
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/projects/${id}/reports`} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
          <ArrowLeft size={14} aria-hidden /> All reports
        </Link>
        <ReportActions title={report.title} markdown={report.markdown} />
      </div>

      <Card className="report-sheet">
        <CardBody className="space-y-4 sm:p-6">
          <div className="space-y-2 border-b border-line pb-4">
            <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{report.title}</h2>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
              <Badge tone={report.kind === "incident" ? "danger" : report.kind === "release_notes" ? "accent" : "info"}>{kind}</Badge>
              <span>
                {shortDate(report.periodStart)} to {shortDate(report.periodEnd)}
              </span>
              <span aria-hidden>·</span>
              <span>
                Created <RelativeTime iso={report.createdAt} />
              </span>
              {report.grounding ? <GroundingBadge grounding={report.grounding} /> : null}
            </div>
          </div>
          <Markdown content={report.markdown} citations={report.citations} />
        </CardBody>
      </Card>

      <section aria-labelledby="sources-heading" className="space-y-2">
        <h2 id="sources-heading" className="text-sm font-semibold">
          Sources
        </h2>
        {report.citations.length === 0 ? <p className="text-[13px] text-muted">This report does not cite any recorded activity.</p> : <CitationList citations={report.citations} />}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 print:hidden">
        {report.runId ? (
          <Link href={`/runs/${report.runId}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline">
            <Route size={14} aria-hidden /> How this was written
          </Link>
        ) : (
          <span className="text-[13px] text-muted">No run trace was recorded for this report.</span>
        )}
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <span>Was this report useful?</span>
          <FeedbackButtons target={{ type: "report", id: report.id }} projectId={id} runId={report.runId} />
        </div>
      </div>
    </article>
  );
}
