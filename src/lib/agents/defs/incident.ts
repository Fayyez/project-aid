import { z } from "zod";
import { defineAgent, defineToolAgent } from "@/lib/agents/runtime";
import type { ToolSpec } from "@/lib/llm";
import { wrapUntrusted } from "@/lib/security/redact";
import type { Evidence } from "@/lib/types";
import { clamp, tokenize, truncate, uniq } from "@/lib/util";
import { evidenceLines } from "./assistant";

// ---------------------------------------------------------------------------
// Shared: ranking of suspect changes, used by the deterministic fallbacks
// ---------------------------------------------------------------------------

export interface Suspect {
  ref: string;
  title: string;
  score: number;
  why: string[];
}

const RISKY = /\b(migration|schema|database|config|env|secret|auth|payment|deploy|docker|pipeline|dependenc|upgrade|cache|timeout|index|refactor|intent unclear)\b/i;

/** Scores candidate changes against the failure log: shared terms, risky areas, recency. */
export function rankSuspects(candidates: Evidence[], log: string, failedAt: string): Suspect[] {
  const logTerms = new Set(tokenize(log).filter((term) => term.length > 3));
  const failed = new Date(failedAt).getTime();
  return candidates
    // The failure itself, and earlier incidents, are evidence but never suspects.
    .filter((item) => item.type === "event" && !/^(deployment|incident|release|clarification):/.test(item.text))
    .map((item) => {
      const terms = uniq(tokenize(item.text));
      const overlap = terms.filter((term) => logTerms.has(term));
      const why: string[] = [];
      let score = 0;
      if (overlap.length) {
        score += Math.min(6, overlap.length * 2);
        why.push(`shares terms with the failure log (${overlap.slice(0, 4).join(", ")})`);
      }
      if (RISKY.test(item.text)) {
        score += 2;
        why.push("touches a risky area");
      }
      const hours = item.occurredAt ? (failed - new Date(item.occurredAt).getTime()) / 3_600_000 : 99;
      if (hours >= 0 && hours <= 6) {
        score += 2;
        why.push(`landed ${hours < 1 ? "less than an hour" : `${Math.round(hours)}h`} before the failure`);
      } else if (hours >= 0 && hours <= 24) score += 1;
      if (/^(commit|pull request)/.test(item.text)) score += 1;
      return { ref: item.ref, title: item.title, score, why };
    })
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Investigator: gathers and weighs the facts with read-only tools
// ---------------------------------------------------------------------------

export interface InvestigatorInput {
  projectName: string;
  environment: string;
  failureDetail: string;
  log: string;
  failedAt: string;
  evidence: Evidence[];
  tools: ToolSpec[];
}

export const incidentInvestigator = defineToolAgent<InvestigatorInput>({
  name: "incident-investigator",
  title: "Investigate the failure",
  description: "Looks at the failed deployment, its log and the changes since the last healthy release, and reports what most likely broke.",
  tier: "smart",
  version: "1.0",
  effort: "medium",
  maxTokens: 3000,
  maxIterations: 6,
  system: `You are the on-call investigator for a software project. A deployment has failed or a service is degraded. Establish what changed and what most plausibly caused the failure.

Work like a careful engineer: read the failure log first, then compare it with the changes made since the last healthy deployment. Use the tools to look up anything missing. Prefer the simplest explanation that fits the log. Report: (1) what the log shows, (2) the changes that could explain it, ranked, each with its reference like [E4] and the reasoning, (3) what would confirm or rule out the leading explanation, (4) anything you could not determine. Cite only references from the evidence or tool results. Do not propose a fix.`,
  tools: (input) => input.tools,
  prompt(input) {
    return [
      `Project: ${input.projectName}. Environment: ${input.environment}. Failure time: ${input.failedAt}.`,
      `What was detected: ${truncate(input.failureDetail, 400)}`,
      wrapUntrusted("failure log", input.log || "(no log captured)", 6000),
      wrapUntrusted("evidence", evidenceLines(input.evidence) || "(nothing gathered yet)", 20_000),
    ].join("\n\n");
  },
  fallback(input) {
    const suspects = rankSuspects(input.evidence, input.log, input.failedAt).slice(0, 4);
    const errorLine = input.log.split("\n").find((line) => /error|exception|fail|denied|timeout|refused/i.test(line));
    const lines = [`- The ${input.environment} deployment failed.${errorLine ? ` The log reports: "${truncate(errorLine.trim(), 200)}".` : " No log excerpt was captured."}`];
    if (suspects.length === 0) lines.push("- No changes were recorded between the last healthy deployment and the failure, so the cause could not be narrowed down from the record.");
    for (const suspect of suspects) lines.push(`- Candidate: ${suspect.title} [${suspect.ref}]${suspect.why.length ? `: ${suspect.why.join("; ")}` : ""}.`);
    lines.push("- To confirm: reproduce on staging with the leading candidate reverted, and compare the log.");
    return lines.join("\n");
  },
});

// ---------------------------------------------------------------------------
// Triager: turns the investigation into a structured assessment
// ---------------------------------------------------------------------------

export interface TriagerInput {
  projectName: string;
  environment: string;
  failureDetail: string;
  log: string;
  failedAt: string;
  findings: string;
  evidence: Evidence[];
  evidenceBlock: string;
}

export const TriageSchema = z.object({
  title: z.string().describe("Short incident title, at most 80 characters"),
  severity: z.enum(["SEV1", "SEV2", "SEV3", "SEV4"]).describe("SEV1 production down or data at risk; SEV2 production deployment failed or major feature broken; SEV3 degraded or non-production; SEV4 minor"),
  summary: z.string().describe("Two or three sentences a project director can read, with references"),
  suspectedCause: z.string().describe("The most likely cause, stated with appropriate uncertainty, with references"),
  confidence: z.number().describe("0 to 1: how well the evidence supports the suspected cause"),
  suspectRefs: z.array(z.string()).describe("References of the changes most likely responsible, most likely first"),
  impact: z.string().describe("Who and what is affected right now"),
  nextSteps: z.array(z.string()).describe("Two to four concrete next steps"),
});

export type TriageOutput = z.infer<typeof TriageSchema>;

export const incidentTriager = defineAgent<TriagerInput, TriageOutput>({
  name: "incident-triager",
  title: "Assess severity and likely cause",
  description: "Weighs the investigation and states severity, likely cause, confidence, impact and next steps.",
  tier: "smart",
  version: "1.0",
  effort: "medium",
  maxTokens: 2500,
  system: `You are the incident commander for a software project. From the investigator's findings and the evidence, produce a calm, accurate assessment for a project director.

Be honest about uncertainty: confidence above 0.8 requires the log to point directly at a specific change. If no change explains the failure, say so and keep confidence low. Cite references like [E4] for every factual statement and list as suspects only references that exist in the evidence. Do not propose code changes here.`,
  schema: TriageSchema,
  prompt(input) {
    return [
      `Project: ${input.projectName}. Environment: ${input.environment}. Failure time: ${input.failedAt}.`,
      `What was detected: ${truncate(input.failureDetail, 400)}`,
      wrapUntrusted("failure log", input.log || "(no log captured)", 6000),
      wrapUntrusted("investigator findings", input.findings, 8000),
      input.evidenceBlock,
    ].join("\n\n");
  },
  fallback(input) {
    const suspects = rankSuspects(input.evidence, input.log, input.failedAt);
    const top = suspects[0];
    const production = /prod/i.test(input.environment);
    const errorLine = input.log.split("\n").find((line) => /error|exception|fail|denied|timeout|refused/i.test(line))?.trim();
    // Rules can point at a suspect but cannot confirm it, so confidence is capped.
    const confidence = top ? clamp(0.25 + top.score * 0.06, 0.25, 0.7) : 0.15;
    // The last clause of the error line is usually the human-readable part.
    const cause = errorLine ? (errorLine.split(/:\s+/).pop() ?? errorLine).replace(/^\(.*?\)\s*/, "").trim() : "";
    const deployRef = input.evidence.find((item) => item.type === "deployment")?.ref;
    return {
      title: truncate(`${input.environment.replace(/^[a-z]/, (c) => c.toUpperCase())} deployment failed${cause ? `: ${cause}` : ""}`, 80),
      severity: production ? "SEV2" : "SEV3",
      summary: `The ${input.environment} deployment of ${input.projectName} failed${deployRef ? ` [${deployRef}]` : ""}.${errorLine ? ` The log reports "${truncate(errorLine, 160)}".` : ""}${top ? ` The most likely trigger is "${top.title}" [${top.ref}].` : " No recent change clearly explains it."}`,
      suspectedCause: top ? `Probably "${top.title}" [${top.ref}]: it ${top.why.join(" and ") || "is the most recent change before the failure"}. This is inferred from the record and has not been confirmed.` : "Unknown. No change recorded since the last healthy deployment matches the failure log.",
      confidence: Math.round(confidence * 100) / 100,
      suspectRefs: suspects.filter((s) => s.score > 0).slice(0, 3).map((s) => s.ref),
      impact: production ? "The new release is not live. Users remain on the previous version if the platform kept it running; anything that depended on this release is delayed." : `The ${input.environment} environment is not on the latest build; testing of the newest changes is blocked.`,
      nextSteps: [
        top ? `Confirm with the author whether "${top.title}" can be reverted safely.` : "Have the on-call engineer read the full deployment log.",
        "Keep the last healthy version serving traffic.",
        "Reproduce on staging before redeploying.",
      ],
    };
  },
});

// ---------------------------------------------------------------------------
// Fix proposer and independent reviewer
// ---------------------------------------------------------------------------

export interface FixProposerInput {
  projectName: string;
  environment: string;
  triage: TriageOutput;
  log: string;
  lastGoodVersion?: string;
  evidenceBlock: string;
  /** Present on revision rounds. */
  previous?: { summary: string; steps: string[]; concerns: string[] };
}

export const FixSchema = z.object({
  kind: z.enum(["patch", "revert", "config", "runbook"]).describe("revert: undo a change; patch: a code change; config: a setting; runbook: operational steps only"),
  summary: z.string().describe("One or two sentences on what the fix does and why it addresses the cause"),
  steps: z.array(z.string()).describe("Ordered, concrete steps an engineer can follow"),
  patch: z.string().nullable().describe("A unified diff sketch when the change is small and clear from the evidence, otherwise null. Never invent code you have not seen."),
  risk: z.enum(["low", "medium", "high"]),
  rollbackPlan: z.string().describe("How to undo this fix if it makes things worse"),
  testPlan: z.array(z.string()).describe("Checks that prove the fix worked, including one on staging before production"),
});

export type FixOutput = z.infer<typeof FixSchema>;

export const fixProposer = defineAgent<FixProposerInput, FixOutput>({
  name: "fix-proposer",
  title: "Propose a fix",
  description: "Proposes the safest fix for the incident: usually a revert or a small, well-understood change, with rollback and test plans.",
  tier: "smart",
  version: "1.0",
  effort: "medium",
  maxTokens: 3500,
  system: `You are a senior engineer proposing a fix for a production incident. Your proposal goes to an independent reviewer and then to a human, who must approve it before anything is applied. You cannot run or merge anything.

Prefer the smallest, most reversible action that restores service: reverting the offending change beats patching forward unless the revert itself is risky (for example a database migration that already ran). You have summaries of changes, not the source code, so do not write code you have not seen: give a patch only when the change is evident from the evidence, otherwise describe the change precisely and leave patch null. Always include a rollback plan and a test plan that starts on staging. Never suggest destructive or irreversible operations (dropping data, force pushes, disabling checks, skipping review). When this is a revision, address every reviewer concern explicitly.`,
  schema: FixSchema,
  prompt(input) {
    return [
      `Project: ${input.projectName}. Environment: ${input.environment}.${input.lastGoodVersion ? ` Last healthy version: ${input.lastGoodVersion}.` : ""}`,
      `Assessment:\n- Severity: ${input.triage.severity}\n- Summary: ${input.triage.summary}\n- Suspected cause (confidence ${input.triage.confidence}): ${input.triage.suspectedCause}\n- Suspect changes: ${input.triage.suspectRefs.join(", ") || "none identified"}`,
      wrapUntrusted("failure log", input.log || "(no log captured)", 6000),
      input.evidenceBlock,
      input.previous ? `Your previous proposal was sent back.\nPrevious summary: ${input.previous.summary}\nPrevious steps:\n${input.previous.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\nReviewer concerns to address:\n${input.previous.concerns.map((c) => `- ${c}`).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  },
  fallback(input) {
    const suspect = input.triage.suspectRefs[0];
    const uncertain = input.triage.confidence < 0.5 || !suspect;
    const migration = /migration|schema|column|table/i.test(`${input.log} ${input.triage.suspectedCause}`);
    const steps: string[] = [];
    if (input.previous || uncertain) steps.push("Reproduce the failure on staging with the current build and capture the full log, to confirm the cause before changing anything.");
    if (suspect) steps.push(`Revert the suspect change [${suspect}] on a branch${migration ? ", including a down-migration if its migration already ran on any environment" : ""}.`);
    else steps.push("Identify the failing step from the full deployment log with the on-call engineer.");
    steps.push("Deploy the branch to staging and run the smoke tests.", `Redeploy to ${input.environment} once staging is green${input.lastGoodVersion ? `; until then keep ${input.lastGoodVersion} serving traffic` : ""}.`, "Open a follow-up ticket to reintroduce the change with a test that covers this failure.");
    return {
      kind: suspect ? "revert" : "runbook",
      summary: suspect ? `Revert the change most likely responsible [${suspect}] and redeploy, restoring the last known-good behaviour while the change is fixed properly.` : "No single change explains the failure, so this is an investigation runbook rather than a code fix.",
      steps,
      patch: null,
      risk: migration ? "medium" : "low",
      rollbackPlan: input.lastGoodVersion ? `Redeploy ${input.lastGoodVersion}, the last healthy version, and re-apply the reverted commit on a branch for further work.` : "Redeploy the previous healthy build and re-apply the reverted commit on a branch for further work.",
      testPlan: ["Staging deployment completes without the error seen in the log.", "Smoke tests pass on staging (sign-in and the main user journey).", `After release, the ${input.environment} health check stays green for 15 minutes.`],
    };
  },
});

export interface FixReviewerInput {
  projectName: string;
  triage: TriageOutput;
  fix: FixOutput;
  round: number;
  /** Results of the mechanical safety checks, included so the reviewer sees them. */
  safetyChecks: { name: string; passed: boolean; detail: string }[];
  evidenceBlock: string;
}

export const ReviewSchema = z.object({
  verdict: z.enum(["approve", "revise", "reject"]).describe("approve: safe to put in front of a human for approval; revise: fixable gaps; reject: wrong or unsafe approach"),
  concerns: z.array(z.string()).describe("Specific, actionable concerns. Empty when approving without reservations."),
  checks: z.array(z.object({ name: z.string(), passed: z.boolean(), detail: z.string() })).describe("Your own review checks: addresses the cause, reversible, tested on staging first, proportionate risk"),
});

export type ReviewOutput = z.infer<typeof ReviewSchema>;

export const fixReviewer = defineAgent<FixReviewerInput, ReviewOutput>({
  name: "fix-reviewer",
  title: "Review the proposed fix",
  description: "An independent reviewer that challenges the proposed fix before a human sees it: does it address the cause, is it reversible, is it tested, is the risk proportionate.",
  tier: "smart",
  version: "1.0",
  effort: "medium",
  maxTokens: 2500,
  system: `You are an independent reviewer of a proposed incident fix. You did not write it and your job is to find what is wrong with it before a human is asked to approve it.

Check: does it address the suspected cause, or only a symptom; is the suspected cause well enough supported to act on (if confidence is low, the plan must confirm the cause first); is every step reversible; does testing start on staging; is anything destructive, irreversible, or bypassing review; is the stated risk honest. Approve only when you would be comfortable putting your name on it. Ask for revision when the gaps are fixable, and say exactly what to change. Reject when the approach is wrong or unsafe.`,
  schema: ReviewSchema,
  prompt(input) {
    return [
      `Project: ${input.projectName}. Review round ${input.round}.`,
      `Assessment: ${input.triage.summary}\nSuspected cause (confidence ${input.triage.confidence}): ${input.triage.suspectedCause}`,
      `Proposed fix (${input.fix.kind}, stated risk ${input.fix.risk}): ${input.fix.summary}\nSteps:\n${input.fix.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\nRollback: ${input.fix.rollbackPlan}\nTests:\n${input.fix.testPlan.map((t) => `- ${t}`).join("\n")}${input.fix.patch ? `\nPatch:\n${truncate(input.fix.patch, 4000)}` : ""}`,
      `Mechanical safety checks:\n${input.safetyChecks.map((c) => `- ${c.passed ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`).join("\n")}`,
      input.evidenceBlock,
    ].join("\n\n");
  },
  fallback(input) {
    const plan = `${input.fix.summary} ${input.fix.steps.join(" ")}`.toLowerCase();
    const addressesCause = input.triage.suspectRefs.length === 0 ? input.fix.kind === "runbook" : input.triage.suspectRefs.some((ref) => plan.includes(`[${ref.toLowerCase()}]`));
    const confirmsFirst = /reproduce|confirm|verify the cause/.test(plan);
    const stagingFirst = input.fix.testPlan.concat(input.fix.steps).some((line) => /staging/i.test(line));
    const checks = [
      { name: "Addresses the suspected cause", passed: addressesCause, detail: addressesCause ? "The plan targets the suspect change." : "The plan does not reference the suspect change." },
      { name: "Cause confirmed before acting", passed: input.triage.confidence >= 0.5 || confirmsFirst, detail: input.triage.confidence >= 0.5 ? `Confidence ${input.triage.confidence} is sufficient.` : confirmsFirst ? "Plan reproduces the failure first." : `Confidence is only ${input.triage.confidence} and the plan does not confirm the cause first.` },
      { name: "Tested on staging first", passed: stagingFirst, detail: stagingFirst ? "Staging verification is included." : "No staging verification step." },
      { name: "Proportionate risk", passed: input.fix.risk !== "high", detail: `Stated risk: ${input.fix.risk}.` },
    ];
    const failedSafety = input.safetyChecks.filter((check) => !check.passed);
    const concerns = [...failedSafety.map((check) => `${check.name}: ${check.detail}`), ...checks.filter((check) => !check.passed).map((check) => check.detail)];
    const destructive = failedSafety.some((check) => /destructive/i.test(check.name));
    return { verdict: destructive ? "reject" : concerns.length ? "revise" : "approve", concerns, checks };
  },
});
