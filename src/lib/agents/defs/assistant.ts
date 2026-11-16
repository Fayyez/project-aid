import { z } from "zod";
import { defineAgent, defineTextAgent, defineToolAgent } from "@/lib/agents/runtime";
import type { ToolSpec } from "@/lib/llm";
import { wrapUntrusted } from "@/lib/security/redact";
import type { Evidence } from "@/lib/types";
import { isoDate, tokenize, truncate, uniq } from "@/lib/util";

// ---------------------------------------------------------------------------
// Router: decides which projects, which angle and which follow-up action
// ---------------------------------------------------------------------------

const INTENTS = ["status", "activity", "people", "incident", "deployment", "tickets", "risk", "compare", "other"] as const;
export type Intent = (typeof INTENTS)[number];

export interface RouterInput {
  question: string;
  /** Projects the director is allowed to see. */
  projects: { id: string; key: string; name: string; client: string }[];
  /** Set when the chat is opened inside one project. */
  currentProjectId?: string;
  people: string[];
  history: { role: "user" | "assistant"; content: string }[];
}

export const RouteSchema = z.object({
  intent: z.enum(INTENTS),
  projectKeys: z.array(z.string()).describe("Keys of the projects the question is about, taken only from the provided list. Empty means the whole portfolio."),
  people: z.array(z.string()).describe("Names of team members the question is about, taken only from the provided list"),
  timeframeDays: z.number().describe("How far back to look, in days. 1 for today, 7 for this week. Use 7 when not stated."),
  searchQuery: z.string().describe("Three to eight keywords to search the project records with"),
  action: z.enum(["none", "create_tickets", "escalate", "generate_report"]).describe("An action the director is asking for, if any"),
  reportKind: z.enum(["progress", "release_notes", "incident"]).nullable(),
});

export type Route = z.infer<typeof RouteSchema>;

export function heuristicRoute(input: RouterInput): Route {
  const q = input.question.toLowerCase();
  const mentioned = input.projects.filter((project) => {
    const names = [project.key.toLowerCase(), ...tokenize(project.name).filter((t) => t.length > 3), ...tokenize(project.client).filter((t) => t.length > 4)];
    return names.some((name) => new RegExp(`\\b${name.replace(/[^a-z0-9]/g, ".")}\\b`).test(q));
  });
  const current = input.projects.find((project) => project.id === input.currentProjectId);
  const projectKeys = mentioned.length ? mentioned.map((p) => p.key) : current ? [current.key] : [];
  const people = input.people.filter((name) => {
    const first = name.split(" ")[0].toLowerCase();
    return q.includes(name.toLowerCase()) || new RegExp(`\\b${first}\\b`).test(q);
  });

  let intent: Intent = "other";
  if (/\b(incident|outage|sev[1-4]|down|root cause|postmortem|what broke|went wrong)\b/.test(q)) intent = "incident";
  else if (/\b(deploy(ed|ment|ments)?|release[ds]?|rollback|production|staging|shipped|went live|version)\b/.test(q)) intent = "deployment";
  else if (people.length || /\b(who|contribut|workload|team member|performance|productiv|capacity)\b/.test(q)) intent = "people";
  else if (/\b(ticket|backlog|todo|to-do|pending|blocked|blocker|assigned|priorit|bug[s]?)\b/.test(q)) intent = "tickets";
  else if (/\b(risk|slip|late|delay|behind|concern|worr|attention|trouble|at risk)\b/.test(q)) intent = "risk";
  else if (/\b(compare|versus|vs\.?|across|which project|portfolio|all projects)\b/.test(q)) intent = "compare";
  else if (/\b(status|progress|health|on track|how is|how are|update|summary|overview|pace|where are we)\b/.test(q)) intent = "status";
  else if (/\b(what (changed|happened|was done)|changes|commits?|merged|worked on|activity|yesterday|today|this week|recent(ly)?)\b/.test(q)) intent = "activity";

  let timeframeDays = 7;
  if (/\btoday\b|\blast 24\b/.test(q)) timeframeDays = 1;
  else if (/\byesterday\b/.test(q)) timeframeDays = 2;
  else if (/\b(two weeks|fortnight|14 days|last sprint)\b/.test(q)) timeframeDays = 14;
  else if (/\b(month|30 days)\b/.test(q)) timeframeDays = 30;
  else if (/\b(quarter|90 days)\b/.test(q)) timeframeDays = 90;
  else if (intent === "status" || intent === "risk" || intent === "compare") timeframeDays = 14;

  let action: Route["action"] = "none";
  let reportKind: Route["reportKind"] = null;
  if (/\b(creat|rais|log|open|fil|mak|turn|convert)\w*\b.{0,40}\btickets?\b|\binto (a )?tickets?\b/.test(q)) action = "create_tickets";
  else if (/\b(escalate|ask (the )?(team|dev|developer|him|her|them|\w+ about)|check with|follow up with|ping)\b/.test(q)) action = "escalate";
  else if (/\b(generate|write|prepare|draft|create|produce)\b.{0,30}\b(report|release notes)\b/.test(q)) {
    action = "generate_report";
    reportKind = /release notes/.test(q) ? "release_notes" : /incident|postmortem/.test(q) ? "incident" : "progress";
  }
  const stop = new Set(["project", "projects", "status", "update", "tell", "show", "give", "please", "latest", "current", "week", "today", "yesterday"]);
  const searchQuery = uniq(tokenize(input.question).filter((t) => !stop.has(t))).slice(0, 8).join(" ");
  return { intent, projectKeys, people, timeframeDays, searchQuery, action, reportKind };
}

export const router = defineAgent<RouterInput, Route>({
  name: "router",
  title: "Route the question",
  description: "Works out which projects and people a director's question is about, what kind of answer is needed, and whether an action is being requested.",
  tier: "cheap",
  version: "1.0",
  effort: "low",
  maxTokens: 800,
  system: `You route questions from a project director to the right project specialists. You do not answer the question.

Choose projects only from the list provided, by their key. If the question is clearly about the whole portfolio, or names no project and no current project is set, return an empty projectKeys list. If a current project is set and the question names no other project, use the current project. Resolve follow-up questions ("and what about staging?") using the conversation so far. Choose people only from the provided names.`,
  schema: RouteSchema,
  prompt(input) {
    return [
      `Projects: ${input.projects.map((p) => `${p.key} = ${p.name} (client ${p.client})`).join("; ")}`,
      `Current project: ${input.projects.find((p) => p.id === input.currentProjectId)?.key ?? "none (portfolio view)"}`,
      `Team members: ${input.people.join(", ") || "none"}`,
      input.history.length ? `Conversation so far:\n${input.history.slice(-6).map((m) => `${m.role}: ${truncate(m.content, 300)}`).join("\n")}` : "",
      wrapUntrusted("question", input.question, 4000),
    ]
      .filter(Boolean)
      .join("\n\n");
  },
  fallback: heuristicRoute,
});

// ---------------------------------------------------------------------------
// Researcher: one per project, digs through the project record with tools
// ---------------------------------------------------------------------------

export interface ResearcherInput {
  question: string;
  projectName: string;
  intent: Intent;
  timeframeDays: number;
  /** Evidence already gathered for this project. */
  evidence: Evidence[];
  /** Read-only lookups bound to this project; results are added to the shared evidence. */
  tools: ToolSpec[];
}

export function evidenceLines(evidence: Evidence[], max = 60): string {
  return evidence
    .slice(0, max)
    .map((item) => `[${item.ref}] ${item.occurredAt ? isoDate(item.occurredAt) : ""}${item.actorName ? ` · ${item.actorName}` : ""} · ${item.text}`)
    .join("\n");
}

export const researcher = defineToolAgent<ResearcherInput>({
  name: "researcher",
  title: "Research one project",
  description: "A per-project specialist. Reads the evidence already gathered, looks up anything missing with read-only tools, and reports findings with references.",
  tier: "cheap",
  version: "1.0",
  effort: "low",
  maxTokens: 2500,
  maxIterations: 5,
  system: `You are the specialist for one software project. A project director asked a question; your job is to find what the project record says about it and report findings to the writer who will answer.

Start from the evidence provided. Use the tools only when something needed to answer is missing; two or three lookups are normally enough. Report 3 to 8 short findings as bullet points. Every finding must cite the references it rests on, like [E3] or [T2, D1], using only references that appear in the evidence or in tool results. If the record does not answer part of the question, say exactly what is missing instead of guessing. Do not write the final answer and do not give advice.`,
  tools: (input) => input.tools,
  prompt(input) {
    return [
      `Project: ${input.projectName}`,
      `Kind of question: ${input.intent}; look back ${input.timeframeDays} days.`,
      wrapUntrusted("question", input.question, 4000),
      wrapUntrusted("evidence", evidenceLines(input.evidence) || "(nothing gathered yet)", 20_000),
    ].join("\n\n");
  },
  fallback(input) {
    if (input.evidence.length === 0) return `- No records were found for ${input.projectName} that relate to this question.`;
    const order: Record<string, number> = { metric: 0, incident: 1, deployment: 2, event: 3, ticket: 4, thread: 5, digest: 6, note: 7, report: 8 };
    return [...input.evidence]
      .sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9))
      .slice(0, 8)
      .map((item) => `- ${truncate(item.text, 220)} [${item.ref}]`)
      .join("\n");
  },
});

// ---------------------------------------------------------------------------
// Composer: writes the answer the director reads
// ---------------------------------------------------------------------------

export interface ComposerInput {
  question: string;
  directorName: string;
  today: string;
  intent: Intent;
  findings: { projectName: string; text: string }[];
  /** Rendered, wrapped evidence block. */
  evidenceBlock: string;
  evidence: Evidence[];
  history: { role: "user" | "assistant"; content: string }[];
  /** Notes for the writer about actions the system will offer alongside the answer. */
  offered: string[];
}

export const composer = defineTextAgent<ComposerInput>({
  name: "composer",
  title: "Write the answer",
  description: "Turns the specialists' findings into one short, cited answer for the director.",
  tier: "smart",
  version: "1.0",
  effort: "medium",
  maxTokens: 4000,
  system: `You are the personal chief of staff of a project director at a software company. The director runs several client projects at once and reads your answers between meetings, often on a phone.

How to answer:
- Lead with the direct answer in one or two sentences, then the few facts that support it. Stop when the question is answered.
- Use only the findings and evidence provided. Every factual statement carries the reference it rests on, like [E3] or [T2, D1]. Never use a reference that is not in the evidence. Figures such as progress, pace and counts come only from metric evidence.
- If the evidence does not cover something, say so plainly and say who on the team would know. Never fill a gap with a guess.
- When several projects are involved, give each a short labelled section, worst news first.
- Name people when the evidence does. Give dates. Say what needs the director's decision or attention, if anything.
- Plain, calm language. No preamble, no closing offer, no mention of agents, tools or how the answer was produced.
- Markdown is rendered: short paragraphs, a few bullets, bold only for project names or the one key fact.`,
  prompt(input) {
    return [
      `Today is ${input.today}. You are answering ${input.directorName}.`,
      input.history.length ? `Conversation so far:\n${input.history.slice(-6).map((m) => `${m.role}: ${truncate(m.content, 400)}`).join("\n")}` : "",
      wrapUntrusted("question", input.question, 4000),
      `Findings from the project specialists:\n${input.findings.map((f) => `## ${f.projectName}\n${f.text}`).join("\n\n")}`,
      input.evidenceBlock,
      input.offered.length ? `Alongside your answer the director will be offered these one-click actions, so you may refer to them briefly but must not claim they have happened: ${input.offered.join("; ")}.` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  },
  fallback(input) {
    if (input.evidence.length === 0) {
      return "I could not find anything in the project records that answers this. You may want to ask the team directly.";
    }
    const byProject = new Map<string, Evidence[]>();
    for (const item of input.evidence) {
      const key = item.projectId ?? "portfolio";
      byProject.set(key, [...(byProject.get(key) ?? []), item]);
    }
    const sections: string[] = [];
    const names = input.findings.map((f) => f.projectName);
    let index = 0;
    for (const [, items] of byProject) {
      const name = names[index++] ?? "Portfolio";
      const metric = items.find((item) => item.type === "metric");
      const incidents = items.filter((item) => item.type === "incident").slice(0, 2);
      const deploys = items.filter((item) => item.type === "deployment").slice(0, 2);
      const events = items.filter((item) => item.type === "event").slice(0, input.intent === "activity" || input.intent === "people" ? 6 : 4);
      const tickets = items.filter((item) => item.type === "ticket").slice(0, input.intent === "tickets" ? 6 : 3);
      const others = items.filter((item) => ["thread", "note", "digest"].includes(item.type)).slice(0, 2);
      const lines: string[] = [];
      if (metric) lines.push(`${truncate(metric.text, 320)} [${metric.ref}]`);
      const bullet = (item: Evidence) => `- ${item.occurredAt ? `${isoDate(item.occurredAt)}: ` : ""}${truncate(item.text, 200)} [${item.ref}]`;
      const ordered = input.intent === "tickets" ? [...tickets, ...incidents, ...events, ...deploys] : input.intent === "deployment" || input.intent === "incident" ? [...incidents, ...deploys, ...events, ...tickets] : [...incidents, ...events, ...deploys, ...tickets];
      lines.push(...ordered.map(bullet), ...others.map(bullet));
      sections.push(byProject.size > 1 ? `**${name}**\n\n${lines.join("\n")}` : lines.join("\n"));
    }
    return sections.join("\n\n");
  },
});

// ---------------------------------------------------------------------------
// Verifier: an independent check that the answer says only what the record says
// ---------------------------------------------------------------------------

export interface VerifierInput {
  answer: string;
  evidenceBlock: string;
  /** Statements the deterministic check already found without a valid reference. */
  uncited: string[];
}

export const VerifySchema = z.object({
  unsupported: z.array(z.string()).describe("Statements in the answer that the cited evidence does not support, quoted briefly. Empty when everything is supported."),
  verdict: z.enum(["supported", "partially_supported", "unsupported"]),
});

export const verifier = defineAgent<VerifierInput, z.infer<typeof VerifySchema>>({
  name: "verifier",
  title: "Verify the answer against the evidence",
  description: "Independently checks each claim in the answer against the evidence it cites and flags anything unsupported.",
  tier: "cheap",
  version: "1.0",
  effort: "low",
  maxTokens: 1200,
  system: `You are a fact checker. You receive an answer written for a project director and the evidence it was written from. For each factual claim, check that the cited evidence actually says it. Flag claims that go beyond the evidence, misstate a date, person, number or status, or cite evidence that says something else. Statements that openly say information is missing are fine. Judge only against the evidence provided, not your own knowledge.`,
  schema: VerifySchema,
  prompt(input) {
    return [wrapUntrusted("answer", input.answer, 12_000), input.evidenceBlock, input.uncited.length ? `A mechanical check found these statements without a valid reference:\n${input.uncited.map((s) => `- ${s}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
  },
  fallback(input) {
    return { unsupported: input.uncited, verdict: input.uncited.length === 0 ? "supported" : input.uncited.length <= 2 ? "partially_supported" : "unsupported" };
  },
});
