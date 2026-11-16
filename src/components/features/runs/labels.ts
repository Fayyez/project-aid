import type { AgentRun } from "@/lib/types";
import type { Tone } from "@/components/ui";

export const RUN_STATUS_TONE: Record<AgentRun["status"], Tone> = { succeeded: "success", failed: "danger", running: "info" };

/** "release_notes" -> "Release notes" */
export function workflowLabel(workflow: string): string {
  const text = workflow.replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
