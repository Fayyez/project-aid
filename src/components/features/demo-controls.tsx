"use client";

import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, CardBody, CardHeader, Callout } from "@/components/ui";
import { runScenarioAction } from "@/app/actions";

interface RunSummary {
  scenario: string;
  events: number;
  redactions: number;
  incidentIds: string[];
  clarificationIds: string[];
  runId: string;
}

/** Demo-only panel: injects a canned scenario through the real pipeline so a presenter can show what the system does. */
export function DemoControls({ projectId, scenarios }: { projectId: string; scenarios: { id: string; label: string; description: string }[] }) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);

  async function run(id: string, label: string) {
    setRunning(id);
    setError(null);
    try {
      const result = await runScenarioAction(projectId, id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSummary({ scenario: label, ...result.data });
      router.refresh();
    } catch {
      setError("The scenario could not be run. Please try again.");
    } finally {
      setRunning(null);
    }
  }

  return (
    <Card as="section" aria-labelledby="demo-controls-title" className="border-dashed">
      <CardHeader
        as="h2"
        title={<span id="demo-controls-title" className="inline-flex items-center gap-1.5"><FlaskConical size={14} aria-hidden /> Demo controls</span>}
        description="For demos only. Each scenario adds made-up activity to this project and runs it through the real analysis, so you can see how the system reacts. It can take up to a minute."
      />
      <CardBody className="space-y-4">
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {scenarios.map((s) => (
            <li key={s.id} className="flex min-w-0 items-start justify-between gap-3 rounded-md border border-line p-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{s.label}</p>
                <p className="mt-0.5 text-xs text-muted">{s.description}</p>
              </div>
              <Button size="sm" variant="secondary" loading={running === s.id} disabled={running !== null && running !== s.id} onClick={() => run(s.id, s.label)} aria-label={`Run scenario: ${s.label}`}>
                {running === s.id ? "Running…" : "Run"}
              </Button>
            </li>
          ))}
        </ul>
        {running ? (
          <p role="status" className="text-[13px] text-muted">
            Running the scenario and analysing the new activity. Please wait.
          </p>
        ) : null}
        {error ? <Callout tone="danger" title="Scenario failed">{error}</Callout> : null}
        {summary ? (
          <Callout tone="success" title={`Scenario done: ${summary.scenario}`}>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>
                {summary.events} event{summary.events === 1 ? "" : "s"} ingested.{" "}
                <Link className="font-medium underline" href={`/projects/${projectId}/activity`}>
                  View the activity feed
                </Link>
              </li>
              {summary.redactions > 0 ? <li>{summary.redactions} secret{summary.redactions === 1 ? "" : "s"} redacted before any model saw them.</li> : null}
              {summary.incidentIds.map((id) => (
                <li key={id}>
                  Incident opened. <Link className="font-medium underline" href={`/projects/${projectId}/incidents/${id}`}>View the incident</Link>
                </li>
              ))}
              {summary.clarificationIds.map((id) => (
                <li key={id}>
                  Clarifying question sent to the author. <Link className="font-medium underline" href={`/inbox/${id}`}>Open the thread</Link>
                </li>
              ))}
              <li>
                <Link className="font-medium underline" href={`/runs/${summary.runId}`}>See how the agents handled it</Link>
              </li>
            </ul>
          </Callout>
        ) : null}
      </CardBody>
    </Card>
  );
}
