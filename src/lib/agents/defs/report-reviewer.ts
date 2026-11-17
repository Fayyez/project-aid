import { z } from "zod";
import { defineAgent } from "@/lib/agents/runtime";
import type { GroundingResult, ReportKind } from "@/lib/types";

export interface ReportReviewerInput {
  kind: ReportKind;
  markdown: string;
  /** `bag.render()` output. */
  evidence: string;
  /** Headings the template requires. */
  requiredHeadings: string[];
  /** Deterministic grounding check of the draft. */
  grounding: GroundingResult;
}

export const ReportReviewSchema = z.object({
  issues: z.array(z.string()).describe("Concrete problems to fix, each one short and actionable. Empty when none."),
  unsupportedClaims: z.array(z.string()).describe("Sentences from the report that the evidence does not support"),
  verdict: z.enum(["pass", "revise"]).describe("revise only when there are claims to remove or real defects to fix"),
});

export type ReportReview = z.infer<typeof ReportReviewSchema>;

export function heuristicReportReview(input: ReportReviewerInput): ReportReview {
  const issues: string[] = [];
  for (const heading of input.requiredHeadings) {
    if (!new RegExp(`^#{1,6}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "mi").test(input.markdown)) issues.push(`Missing the section "${heading}".`);
  }
  if (/<!--/.test(input.markdown)) issues.push("Template guidance comments were left in the report.");
  if (/\{\{\s*\w+\s*\}\}/.test(input.markdown)) issues.push("Template placeholders were left unfilled.");
  if (input.grounding.invalidRefs.length) issues.push(`References that do not exist: ${input.grounding.invalidRefs.join(", ")}.`);
  if (input.grounding.unsupported.length) issues.push(`${input.grounding.unsupported.length} statement(s) carry no citation.`);
  const revise = issues.length > 0 && (input.grounding.verdict !== "grounded" || issues.some((i) => i.startsWith("Missing") || i.includes("comments") || i.includes("placeholders")));
  return { issues, unsupportedClaims: input.grounding.unsupported, verdict: revise ? "revise" : "pass" };
}

export const reportReviewer = defineAgent<ReportReviewerInput, ReportReview>({
  name: "report-reviewer",
  title: "Review the report",
  description: "Checks a draft report against its evidence for unsupported claims, missing sections and leftover template text.",
  tier: "cheap",
  version: "1.0",
  effort: "low",
  maxTokens: 1500,
  system: `You review a draft project report against the evidence it was written from.

Flag: statements the evidence does not support (list them verbatim in unsupportedClaims), statements without citations, references that do not exist, missing template sections, leftover guidance comments or placeholders, numbers that differ from the metric evidence, blame aimed at individuals, and claims stated with more certainty than the evidence allows. Do not rewrite the report. Return verdict "revise" only when something must be fixed; "No recorded activity." is an acceptable section body.`,
  schema: ReportReviewSchema,
  prompt(input) {
    return [
      `Report kind: ${input.kind.replace("_", " ")}`,
      `Required sections: ${input.requiredHeadings.join(", ")}`,
      `Automatic grounding check: ${input.grounding.verdict}, score ${input.grounding.score}, invalid references: ${input.grounding.invalidRefs.join(", ") || "none"}`,
      input.evidence,
      `Draft report:\n<<<\n${input.markdown}\n>>>`,
      "Review the draft.",
    ].join("\n\n");
  },
  fallback: heuristicReportReview,
});
