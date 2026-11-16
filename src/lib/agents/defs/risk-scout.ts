import { z } from "zod";
import { defineAgent } from "@/lib/agents/runtime";
import { cite, type AnalysisInput } from "@/lib/agents/defs/activity-analyst";
import { truncate } from "@/lib/util";

export const RiskScoutSchema = z.object({
  risks: z
    .array(
      z.object({
        text: z.string().describe("One sentence naming the risk and its likely effect on delivery, citing references inline like [T4]"),
        refs: z.array(z.string()),
      }),
    )
    .describe("Risks and blockers, most serious first, at most six"),
  nextUp: z
    .array(
      z.object({
        text: z.string().describe("One sentence on what is coming next or needs attention, citing references inline"),
        refs: z.array(z.string()),
      }),
    )
    .describe("What is coming next, at most five"),
});

export type RiskScouting = z.infer<typeof RiskScoutSchema>;

export function heuristicRiskScouting(input: AnalysisInput): RiskScouting {
  const risks: RiskScouting["risks"] = [];
  const nextUp: RiskScouting["nextUp"] = [];
  for (const item of input.items) {
    const t = truncate(item.title, 90);
    const add = (text: string) => risks.push({ text: cite(text, [item.ref]), refs: [item.ref] });
    if (item.flags.includes("open_incident")) add(`Open incident: ${t}.`);
    if (item.flags.includes("failed")) add(`Deployment problem: ${t}.`);
    if (item.flags.includes("blocked")) add(`Blocked ticket: ${t}.`);
    if (item.flags.includes("pace_risk")) add(`Pace concern: ${truncate(item.summary, 160)}`);
    if (item.flags.includes("unclear")) add(`A significant change has no stated purpose: ${t}.`);
    if (item.flags.includes("open_question")) add(`Open question awaiting an answer: ${t}.`);
    if (item.flags.includes("milestone_upcoming")) nextUp.push({ text: cite(`Upcoming milestone: ${t} (${truncate(item.summary, 120)}).`, [item.ref]), refs: [item.ref] });
    else if (item.flags.includes("in_progress") || item.flags.includes("todo_priority")) nextUp.push({ text: cite(`Continue: ${t}.`, [item.ref]), refs: [item.ref] });
  }
  return { risks: risks.slice(0, 6), nextUp: nextUp.slice(0, 5) };
}

export const riskScout = defineAgent<AnalysisInput, RiskScouting>({
  name: "risk-scout",
  title: "Scout risks and next steps",
  description: "Finds blockers, falling pace, failed deployments, unclear changes and open questions, and lists what is coming next.",
  tier: "cheap",
  version: "1.0",
  effort: "low",
  maxTokens: 2000,
  system: `You look for delivery risks in a window of project activity and say what is coming next.

Consider blocked tickets, falling or insufficient pace, failed or degraded deployments, open incidents, significant changes whose purpose is unclear, unanswered questions and approaching milestones. Report only risks the evidence supports, each with inline references like [T4] or [D1, M2]. Do not speculate, do not pad the list, and return an empty list when there is nothing to flag. Numbers such as progress and pace are given as metric evidence; quote them, never recompute them.`,
  schema: RiskScoutSchema,
  prompt(input) {
    return [`Project: ${input.projectName}`, `Window: ${input.window}`, input.evidence, "List the risks and what is coming next."].join("\n");
  },
  fallback: heuristicRiskScouting,
});
