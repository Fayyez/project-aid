"use client";

import { FileText } from "lucide-react";
import { useState } from "react";
import { generateReportAction } from "@/app/actions";
import { Button, Callout, Card, CardBody, CardHeader, Field, Select } from "@/components/ui";
import { useAction } from "@/components/features/settings/use-action";
import type { ReportKind } from "@/lib/types";

export interface ReportKindOption {
  kind: ReportKind;
  label: string;
  description: string;
}

export interface IncidentOption {
  id: string;
  label: string;
}

export function GenerateReportPanel({ projectId, kinds, incidents }: { projectId: string; kinds: ReportKindOption[]; incidents: IncidentOption[] }) {
  const { run, pending, router } = useAction();
  const [kind, setKind] = useState<ReportKind>("progress");
  const [days, setDays] = useState("14");
  const [incidentId, setIncidentId] = useState(incidents[0]?.id ?? "");
  const description = kinds.find((option) => option.kind === kind)?.description;
  const needsIncident = kind === "incident";

  async function generate() {
    const result = await run(
      () => generateReportAction(projectId, { kind, periodDays: needsIncident ? undefined : Number(days), incidentId: needsIncident ? incidentId : undefined }),
      { success: "Report ready", refresh: false },
    );
    if (result.ok) router.push(`/projects/${projectId}/reports/${result.data.reportId}`);
  }

  return (
    <Card as="section" aria-labelledby="generate-heading">
      <CardHeader title={<span id="generate-heading">Generate a report</span>} description="The assistant writes the report from this project's recorded activity and cites its sources." />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Kind of report" hint={description}>
            <Select value={kind} onChange={(event) => setKind(event.target.value as ReportKind)} disabled={pending}>
              {kinds.map((option) => (
                <option key={option.kind} value={option.kind}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          {needsIncident ? (
            <Field label="Incident" hint={incidents.length === 0 ? "This project has no incidents to report on." : "The report covers this incident from detection to resolution."}>
              <Select value={incidentId} onChange={(event) => setIncidentId(event.target.value)} disabled={pending || incidents.length === 0}>
                {incidents.length === 0 ? <option value="">No incidents</option> : null}
                {incidents.map((incident) => (
                  <option key={incident.id} value={incident.id}>
                    {incident.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Period" hint="How far back to look for activity.">
              <Select value={days} onChange={(event) => setDays(event.target.value)} disabled={pending}>
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
              </Select>
            </Field>
          )}
        </div>
        {pending ? (
          <Callout tone="info" title="Writing the report">
            This can take up to a minute. Stay on this page; you will be taken to the report when it is ready.
          </Callout>
        ) : null}
        <Button variant="primary" icon={<FileText size={15} />} loading={pending} disabled={needsIncident && !incidentId} onClick={generate}>
          {pending ? "Generating..." : "Generate report"}
        </Button>
      </CardBody>
    </Card>
  );
}
