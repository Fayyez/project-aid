"use client";

import { useState } from "react";
import { setFeatureAction } from "@/app/actions";
import { Card, CardBody, CardHeader, Switch } from "@/components/ui";
import { FEATURE_LABELS, type FeatureFlags } from "@/lib/types";
import { useAction } from "./use-action";

const EXTRA: Partial<Record<keyof FeatureFlags, string>> = {
  chat: "When off, the chat tab and assistant answers for this project are unavailable.",
  dailySync: "When off, no daily summary is written and the Daily sync tab stays empty.",
  releaseNotes: "When off, merged work is not turned into release note cards.",
  reports: "When off, reports cannot be generated; existing reports remain.",
  ticketing: "When off, messages cannot be converted into tickets.",
  deployMonitoring: "When off, deployment status is not checked or shown.",
  incidentTriage: "When off, failed deployments are recorded but not triaged for you.",
  autoFixProposals: "When off, incidents get a triage but no proposed fix.",
  clarifyingQuestions: "When off, the team is not asked about unclear major changes.",
  escalations: "When off, questions are not routed to team members.",
  contributionInsights: "When off, per-person activity summaries are hidden.",
};

export function FeatureToggles({ projectId, features }: { projectId: string; features: FeatureFlags }) {
  const { run } = useAction();
  const [state, setState] = useState<FeatureFlags>(features);
  const [saving, setSaving] = useState<string | null>(null);
  const keys = Object.keys(FEATURE_LABELS) as (keyof FeatureFlags)[];

  async function toggle(key: keyof FeatureFlags, enabled: boolean) {
    setState((current) => ({ ...current, [key]: enabled }));
    setSaving(key);
    const result = await run(() => setFeatureAction(projectId, key, enabled), { success: `${FEATURE_LABELS[key].label} ${enabled ? "turned on" : "turned off"}` });
    if (!result.ok) setState((current) => ({ ...current, [key]: !enabled }));
    setSaving(null);
  }

  return (
    <Card as="section" aria-labelledby="features-heading">
      <CardHeader title={<span id="features-heading">Features</span>} description="Switch parts of the platform on or off for this project. Changes save immediately." />
      <CardBody>
        <ul className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
          {keys.map((key) => (
            <li key={key} className="min-w-0">
              <Switch
                label={FEATURE_LABELS[key].label}
                description={
                  <>
                    {FEATURE_LABELS[key].description} <span className="text-subtle">{EXTRA[key]}</span>
                  </>
                }
                checked={state[key]}
                disabled={saving === key}
                onChange={(event) => toggle(key, event.target.checked)}
              />
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
