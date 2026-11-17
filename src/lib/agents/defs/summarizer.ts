import { z } from "zod";
import { defineAgent } from "@/lib/agents/runtime";
import type { RawItem } from "@/lib/connectors/types";
import { wrapUntrusted } from "@/lib/security/redact";
import type { ChangeType } from "@/lib/types";
import { clamp, truncate, uniq } from "@/lib/util";

export interface SummarizerInput {
  projectName: string;
  /** Areas the team has declared, used as preferred vocabulary. */
  knownAreas: string[];
  /** Already redacted. `diff` is absent when the project's privacy mode forbids reading code. */
  item: RawItem;
  actorName?: string;
}

const CHANGE_TYPES = ["feature", "fix", "refactor", "chore", "docs", "test", "infra", "security", "other"] as const;

export const SummarySchema = z.object({
  title: z.string().describe("Plain-language title, at most 90 characters, no ticket prefixes or commit jargon"),
  summary: z.string().describe("One to three sentences for a non-developer project director: what changed and why it matters"),
  changeType: z.enum(CHANGE_TYPES),
  importance: z.number().describe("Integer 1-5. 1 noise, 3 normal work, 5 critical or client-visible"),
  clarity: z.enum(["clear", "unclear"]).describe("unclear only when this is a significant change whose purpose cannot be determined"),
  userFacing: z.boolean(),
  areas: z.array(z.string()).describe("Up to 4 short lowercase product or code areas"),
  tags: z.array(z.string()).describe("Up to 5 short lowercase tags"),
  refs: z.array(z.string()).describe("Ticket keys or issue numbers mentioned, e.g. ATLAS-142"),
});

export type Summary = z.infer<typeof SummarySchema>;

const AREA_RULES: [area: string, pattern: RegExp][] = [
  ["auth", /\b(auth|login|oauth|sso|session|password|token|rbac|permission)/i],
  ["payments", /\b(payment|checkout|billing|invoice|stripe|refund|capture)/i],
  ["database", /\b(migration|schema|sql|prisma|database|\bdb\b|index(es)?\b)/i],
  ["infra", /(dockerfile|docker-compose|\.github\/|terraform|helm|k8s|kubernetes|ci\b|pipeline|deploy|nginx|vercel\.json)/i],
  ["api", /\b(api|endpoint|controller|route|graphql|rest)\b/i],
  ["frontend", /(\.tsx|\.jsx|\.css|\.scss|component|frontend|\bui\b|page\b)/i],
  ["mobile", /\b(android|ios|react-native|flutter|mobile)\b/i],
  ["reporting", /\b(report|dashboard|analytics|chart|export)\b/i],
  ["notifications", /\b(notification|email|sms|push|webhook)\b/i],
  ["tests", /(\.test\.|\.spec\.|__tests__|\be2e\b|playwright|jest|vitest)/i],
  ["docs", /(readme|\.md\b|docs\/|changelog)/i],
  ["security", /\b(security|vulnerab|cve-|xss|csrf|injection|secret|encrypt)/i],
  ["performance", /\b(performance|latency|cache|caching|slow|optimi[sz]e|n\+1)\b/i],
];

const SENSITIVE = new Set(["auth", "payments", "database", "infra", "security"]);
const VAGUE = /^(wip|misc|stuff|temp|tmp|minor|updates?|changes?|fix(es)?|more|cleanup|work in progress)\b[\s.!]*$|^(wip|misc)\b/i;

function detectChangeType(text: string, files: string[]): ChangeType {
  const head = text.toLowerCase();
  const conventional = /^(feat|fix|refactor|chore|docs|test|ci|build|perf|security|style)(\(.+?\))?!?:/.exec(head)?.[1];
  if (conventional) {
    const map: Record<string, ChangeType> = { feat: "feature", fix: "fix", refactor: "refactor", chore: "chore", docs: "docs", test: "test", ci: "infra", build: "infra", perf: "refactor", security: "security", style: "chore" };
    return map[conventional];
  }
  if (/\b(security|vulnerab|cve-|xss|csrf)\b/.test(head)) return "security";
  if (/\b(hotfix|bug|fix(e[sd])?|broken|crash|regression|error|fail(s|ing|ed)?)\b/.test(head)) return "fix";
  if (/\b(add(s|ed)?|implement(s|ed)?|introduc(e|es|ed)|new|support|enable[sd]?|feature)\b/.test(head)) return "feature";
  if (/\b(refactor|restructur|clean ?up|simplif|rename)\b/.test(head)) return "refactor";
  if (/\b(doc(s|umentation)?|readme|changelog)\b/.test(head)) return "docs";
  if (/\b(test(s|ing)?|coverage|e2e)\b/.test(head)) return "test";
  if (/\b(deploy|pipeline|docker|terraform|ci|infra|migration|config)\b/.test(head)) return "infra";
  if (/\b(bump|upgrade|dependenc|deps|lint|format)\b/.test(head)) return "chore";
  if (files.length && files.every((file) => /\.(md|txt)$/i.test(file))) return "docs";
  return "other";
}

/** Rule-based summary used when no model may read the item. */
export function heuristicSummary(input: SummarizerInput): Summary {
  const { item } = input;
  const files = item.files ?? [];
  const haystack = `${item.title}\n${item.body ?? ""}\n${files.join("\n")}`;
  const lines = (item.stats?.additions ?? 0) + (item.stats?.deletions ?? 0);
  const fileCount = item.stats?.filesChanged ?? files.length;
  const known = input.knownAreas.filter((area) => new RegExp(`\\b${area.replace(/[^a-z0-9]/gi, ".")}`, "i").test(haystack));
  const areas = uniq([...known, ...AREA_RULES.filter(([, pattern]) => pattern.test(haystack)).map(([area]) => area)]).slice(0, 4);
  const refs = uniq(haystack.match(/\b[A-Z][A-Z0-9]{1,9}-\d+\b/g) ?? []).slice(0, 6);
  const isCode = item.kind === "commit" || item.kind === "pull_request";
  const who = input.actorName ?? item.actor?.name ?? "A team member";
  const firstLine = item.title.split("\n")[0].trim();
  const cleanTitle = truncate(firstLine.replace(/^(feat|fix|refactor|chore|docs|test|ci|build|perf|security|style)(\(.+?\))?!?:\s*/i, "").replace(/^\w/, (c) => c.toUpperCase()), 90) || "Untitled change";

  let changeType = detectChangeType(firstLine, files);
  let importance = 2;
  let userFacing = false;
  let clarity: Summary["clarity"] = "clear";
  let summary: string;
  const tags: string[] = [item.kind.replace("_", "-")];

  if (item.kind === "deployment" && item.deployment) {
    const d = item.deployment;
    changeType = "infra";
    const failed = d.status === "failed" || d.status === "degraded";
    importance = failed ? 5 : d.environment === "production" ? 3 : 2;
    userFacing = d.environment === "production";
    tags.push(d.environment, d.status);
    const log = d.logExcerpt ? ` ${truncate(d.logExcerpt.split("\n").find((line) => /error|fail|exception|denied|timeout/i.test(line)) ?? d.logExcerpt, 200)}` : "";
    summary = `Deployment${d.version ? ` of ${d.version}` : ""} to ${d.environment} ${d.status === "success" ? "succeeded" : d.status === "in_progress" ? "is in progress" : d.status.replace("_", " ")}.${failed ? log : ""}`;
  } else if (isCode) {
    importance = 2;
    if (lines > 400 || fileCount > 15) importance += 1;
    if (areas.some((area) => SENSITIVE.has(area))) importance += 1;
    if (item.kind === "pull_request" && item.meta?.state === "merged") importance = Math.max(importance, 3);
    userFacing = (changeType === "feature" || changeType === "fix") && !areas.every((area) => area === "tests" || area === "docs" || area === "infra");
    if (VAGUE.test(firstLine) && (lines > 300 || fileCount > 10)) {
      clarity = "unclear";
      importance = Math.max(importance, 4);
    }
    const bodyLine = truncate((item.body ?? "").split("\n").map((line) => line.trim()).filter((line) => line && line !== firstLine)[0], 180);
    const scope = fileCount ? ` Touches ${fileCount} file${fileCount === 1 ? "" : "s"}${areas.length ? ` in ${areas.join(", ")}` : ""}${lines ? ` (+${item.stats?.additions ?? 0}/-${item.stats?.deletions ?? 0})` : ""}.` : "";
    summary = clarity === "unclear" ? `${who} pushed a large change with the message "${truncate(firstLine, 60)}"; its purpose is not stated.${scope}` : `${who} ${item.kind === "pull_request" ? `${item.meta?.state === "merged" ? "merged" : "opened"} a pull request` : "committed"}: ${cleanTitle}.${bodyLine ? ` ${bodyLine}` : ""}${scope}`;
  } else if (item.kind === "message") {
    const fromClient = item.meta?.fromClient === "true" || /client/i.test(item.meta?.role ?? "");
    importance = fromClient ? 4 : 2;
    if (/\b(urgent|asap|blocker|blocked|escalat|unhappy|concern|deadline|down|outage|broken)\b/i.test(haystack)) importance = Math.min(5, importance + 1);
    userFacing = fromClient;
    changeType = "other";
    tags.push(fromClient ? "client" : "team");
    summary = `${who} wrote: ${truncate(item.body ?? item.title, 260)}`;
  } else {
    importance = item.kind === "document" || item.kind === "release" ? 3 : 2;
    summary = truncate(item.body ?? item.title, 260) || cleanTitle;
    if (item.meta?.state) tags.push(item.meta.state.toLowerCase());
  }

  if (/\b(revert|rollback|hotfix|outage|incident|sev[12])\b/i.test(haystack)) importance = Math.max(importance, 4);

  return {
    title: cleanTitle,
    summary: truncate(summary, 420),
    changeType,
    importance: clamp(Math.round(importance), 1, 5),
    clarity,
    userFacing,
    areas,
    tags: uniq(tags).slice(0, 5),
    refs,
  };
}

export const summarizer = defineAgent<SummarizerInput, Summary>({
  name: "summarizer",
  title: "Summarise incoming activity",
  description: "Reads one raw item (commit, pull request, message, document, deployment) and writes a short, director-friendly summary with classification.",
  tier: "cheap",
  version: "1.0",
  effort: "low",
  maxTokens: 1500,
  handlesCode: true,
  system: `You summarise software project activity for a project director who is not reading the code.

Write what changed and why it matters to delivery, in plain language. Do not restate file names unless they are the point. Do not invent intent: if a large change has a vague message and the diff does not make its purpose clear, set clarity to "unclear" and say plainly that the purpose is not stated. Never copy source code, credentials or personal data into the summary. Importance: 1 trivial, 2 routine, 3 notable, 4 significant (large, risky, or touches authentication, payments, data or infrastructure), 5 critical (production failure, security issue, client escalation).`,
  schema: SummarySchema,
  prompt(input) {
    const { item } = input;
    const parts = [
      `Project: ${input.projectName}`,
      `Known areas: ${input.knownAreas.join(", ") || "none declared"}`,
      `Item kind: ${item.kind} from ${item.source}${item.repo ? ` (repository ${item.repo}${item.branch ? `, branch ${item.branch}` : ""})` : ""}`,
      `Author: ${input.actorName ?? item.actor?.name ?? "unknown"}`,
      item.stats ? `Size: ${item.stats.filesChanged ?? item.files?.length ?? 0} files, +${item.stats.additions ?? 0}/-${item.stats.deletions ?? 0}` : "",
      item.deployment ? `Deployment: environment ${item.deployment.environment}, status ${item.deployment.status}${item.deployment.version ? `, version ${item.deployment.version}` : ""}` : "",
      item.meta && Object.keys(item.meta).length ? `Metadata: ${Object.entries(item.meta).map(([key, value]) => `${key}=${truncate(value, 60)}`).join(", ")}` : "",
      wrapUntrusted("title", item.title, 400),
      item.body ? wrapUntrusted("body", item.body, 6000) : "",
      item.files?.length ? wrapUntrusted("files", item.files.slice(0, 60).join("\n"), 3000) : "",
      item.deployment?.logExcerpt ? wrapUntrusted("log", item.deployment.logExcerpt, 3000) : "",
      item.diff ? wrapUntrusted("diff", item.diff, 12_000) : "(The code itself is not available to you; work from the message and file list.)",
    ];
    return parts.filter(Boolean).join("\n");
  },
  fallback: heuristicSummary,
});
