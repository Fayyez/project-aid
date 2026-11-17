import type { ReportKind } from "../types";

export const DEFAULT_TEMPLATES: Record<ReportKind, string> = {
  progress: `# Progress report: {{project_name}}

- **Client:** {{client}}
- **Period:** {{period}}
- **Date:** {{date}}
- **Prepared by:** {{prepared_by}}

## Executive summary

<!-- Three to five sentences for the client. Lead with overall health and whether the project is on pace, then the one thing they most need to know. -->

## Status at a glance

<!-- Fill the table. Keep each cell to a few words. Name the next milestone with its due date. -->

| Item | Status |
| --- | --- |
| Health | {{health}} |
| Progress | {{progress_pct}}% of scoped tickets done |
| Pace | {{pace_status}} |
| Next milestone | |

## What was delivered

<!-- Bullets for work completed this period, written as outcomes the client can use. Reference the ticket or event key where one exists. -->

## In progress

<!-- Work started but not finished, with the expected completion date for each item. -->

## Risks and blockers

<!-- Each risk or blocker on its own line: what it is, its effect on scope or date, and who is acting on it. Leave out anything already resolved. -->

## Decisions needed from the client

<!-- Decisions the client must make, the date each is needed by, and what happens if it is late. Write "None" if there are none. -->

## Next period plan

<!-- The priorities for the coming period, in order, with the milestone each one supports. -->
`,

  incident: `# Incident report: {{incident_key}}

- **Project:** {{project_name}}
- **Client:** {{client}}
- **Severity:** {{severity}}
- **Period:** {{period}}
- **Date:** {{date}}
- **Prepared by:** {{prepared_by}}

## Summary

<!-- Two or three sentences: what broke, who was affected, how long it lasted, and whether it is now resolved. -->

## Impact

<!-- Who and what was affected, for how long, and the measurable effect (failed requests, unavailable features, any data exposure). -->

## Timeline

<!-- Dated entries in UTC from first signal to resolution. Include detection, escalation, mitigation and client communication. -->

## Root cause

<!-- The cause the evidence supports, stated plainly. Separate confirmed facts from suspected causes and say which is which. -->

## Resolution

<!-- What was done to restore service, and what remains to make the fix permanent. -->

## What went well / what did not

<!-- Two short lists: what helped the response, and what slowed it down or made the impact larger. Describe process and tooling, not individuals. -->

## Follow-up actions

<!-- One row per action. Each action has a single owner and a due date. -->

| Action | Owner | Due |
| --- | --- | --- |
|  |  |  |
`,

  release_notes: `# Release notes: {{project_name}}

- **Release:** {{period}}
- **Date:** {{date}}
- **Prepared by:** {{prepared_by}}

## Highlights

<!-- Two or three sentences on the most important change in this release, in plain language for the client. -->

## New features

<!-- One bullet per user-facing feature: what it does and who it helps. -->

## Improvements

<!-- Smaller changes that make existing features faster, clearer or more reliable. -->

## Fixes

<!-- Bugs fixed in this release, described by the symptom the user saw. -->

## Known issues

<!-- Open problems users may notice, with a workaround where one exists. Write "None" if there are none. -->

## Upgrade notes

<!-- Anything the client must do or check before or after upgrading: configuration changes, downtime, changed behaviour. Write "None" if there are none. -->
`,
};

export const TEMPLATE_LABELS: Record<ReportKind, { label: string; description: string }> = {
  progress: {
    label: "Progress report",
    description: "Status for the client: health, progress, pace, what was delivered and decisions needed.",
  },
  incident: {
    label: "Incident report",
    description: "Post-incident write-up with impact, timeline, root cause and follow-up actions.",
  },
  release_notes: {
    label: "Release notes",
    description: "Customer-facing summary of what shipped, what was fixed and what to check before upgrading.",
  },
};

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

/**
 * Replaces `{{name}}` placeholders with the given values. Placeholders with no value
 * (unknown names or undefined) are left as written so the writer can see them.
 */
export function renderTemplate(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(PLACEHOLDER, (match: string, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) return match;
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/** Unique placeholder names in the order they first appear. */
export function templatePlaceholders(template: string): string[] {
  const names: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}
