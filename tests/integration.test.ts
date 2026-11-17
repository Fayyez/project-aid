import { beforeAll, describe, expect, it } from "vitest";
import { actorFromPerson } from "@/lib/auth/access";
import { seedDemoData } from "@/lib/seed";
import * as chat from "@/lib/services/chat";
import * as commands from "@/lib/services/commands";
import * as learning from "@/lib/services/learning";
import * as queries from "@/lib/services/queries";
import { useFreshMemoryStore, type Store } from "@/lib/store";
import type { Actor } from "@/lib/types";
import { askAssistant } from "@/lib/workflows/ask";
import { decideFix, resolveIncident } from "@/lib/workflows/incident";

/**
 * End-to-end checks over the seeded demo portfolio with models switched off,
 * so every agent runs on its deterministic fallback. They prove the workflows
 * hang together, stay grounded and respect access rules without any API key.
 */

let store: Store;
let sara: Actor;
let omar: Actor;

beforeAll(async () => {
  store = useFreshMemoryStore();
  await seedDemoData(store);
  const people = await store.list("people");
  sara = actorFromPerson(people.find((p) => p.id === "per_sara")!, "session");
  omar = actorFromPerson(people.find((p) => p.id === "per_omar")!, "session");
});

describe("portfolio and access control", () => {
  it("shows each director only their own projects", async () => {
    const mine = await queries.getPortfolio(sara);
    const theirs = await queries.getPortfolio(omar);
    expect(mine.projects.map((row) => row.project.id).sort()).toEqual(["prj_atlas", "prj_helix", "prj_pulse"]);
    expect(theirs.projects.map((row) => row.project.id).sort()).toEqual(["prj_helix", "prj_orbit"]);
    await expect(queries.getProjectOverview(sara, "prj_orbit")).rejects.toThrow(/not found/i);
  });

  it("derives health from explicit rules", async () => {
    const portfolio = await queries.getPortfolio(sara);
    const health = Object.fromEntries(portfolio.projects.map((row) => [row.project.id, row.snapshot.health]));
    expect(health.prj_atlas).toBe("green");
    expect(health.prj_helix).not.toBe("green");
    const helix = portfolio.projects.find((row) => row.project.id === "prj_helix")!;
    expect(helix.snapshot.healthReasons.length).toBeGreaterThan(0);
    expect(portfolio.attention.some((item) => item.projectId === "prj_helix")).toBe(true);
  });

  it("never exposes password hashes or reply tokens", async () => {
    const people = await queries.listPeople(sara);
    expect(JSON.stringify(people)).not.toContain("scrypt$");
    const threads = await queries.listThreads(sara);
    expect(threads.every((thread) => thread.replyTokenHash === "")).toBe(true);
  });
});

describe("assistant", () => {
  it("answers a project question with valid citations and a full agent trace", async () => {
    const result = await askAssistant({ actor: sara, question: "How is Helix doing and what is at risk?", trigger: "chat" });
    expect(result.projectIds).toEqual(["prj_helix"]);
    expect(result.citations.length).toBeGreaterThan(2);
    expect(result.grounding.invalidRefs).toEqual([]);
    expect(result.grounding.verdict).toBe("grounded");
    for (const citation of result.citations) {
      if (citation.type === "event") expect(await store.get("events", citation.id)).not.toBeNull();
      if (citation.type === "ticket") expect(await store.get("tickets", citation.id)).not.toBeNull();
    }
    const agents = result.run.steps.map((step) => step.agent);
    expect(agents).toEqual(expect.arrayContaining(["router", "retrieve", "researcher", "composer", "verifier"]));
    expect(result.run.steps.filter((step) => step.mode === "llm")).toHaveLength(0);
  });

  it("fans out across the portfolio and stays inside the caller's projects", async () => {
    const result = await askAssistant({ actor: sara, question: "Which of my projects need attention this week?", trigger: "chat" });
    expect(result.projectIds.length).toBeGreaterThan(1);
    expect(result.projectIds).not.toContain("prj_orbit");
    expect(result.run.steps.filter((step) => step.agent === "researcher").length).toBe(result.projectIds.length);
    expect(result.answer).not.toMatch(/Orbit/);
  });

  it("refuses a project the caller cannot see", async () => {
    await expect(askAssistant({ actor: sara, question: "Status?", projectId: "prj_orbit", trigger: "chat" })).rejects.toThrow(/not found/i);
  });

  it("proposes actions instead of taking them", async () => {
    const { message, conversation } = await chat.sendChatMessage({ actor: sara, projectId: "prj_atlas", text: "Please escalate to the team: is the 3-D Secure work going to make the release?", trigger: "chat" });
    const action = message.actions?.find((candidate) => candidate.kind === "escalate");
    expect(action?.status).toBe("proposed");
    const before = (await store.list("threads")).length;
    const done = await chat.executeAction(sara, { conversationId: conversation.id, messageId: message.id, actionId: action!.id });
    expect((await store.list("threads")).length).toBe(before + 1);
    expect(done.href).toMatch(/^\/inbox\//);
    await expect(chat.executeAction(sara, { conversationId: conversation.id, messageId: message.id, actionId: action!.id })).rejects.toThrow(/already handled/);
    await expect(chat.getConversation(omar, conversation.id)).rejects.toThrow(/not found/i);
  });
});

describe("incident workflow", () => {
  it("triages a failed production deployment, reviews a fix and waits for a human", async () => {
    const result = await commands.runScenario(sara, "prj_atlas", "failed-deploy");
    expect(result.incidents).toHaveLength(1);
    const incident = result.incidents[0];
    expect(incident.triage?.suspectedCause).toBeTruthy();
    expect(incident.triage?.suspectEventIds.length).toBeGreaterThan(0);
    expect(incident.fix?.status).toBe("proposed");
    expect(incident.reviews.length).toBeGreaterThan(0);
    expect(incident.reviews.at(-1)?.checks.some((check) => check.name === "No destructive operations")).toBe(true);
    // A SEV2 incident always brings in the owner of the suspect change.
    expect(incident.escalation?.threadId).toBeTruthy();
    const detail = await queries.getIncident(sara, incident.id);
    const agents = detail.run!.steps.map((step) => step.agent);
    expect(agents).toEqual(expect.arrayContaining(["collect", "incident-investigator", "incident-triager", "fix-proposer", "safety-checks", "fix-reviewer", "escalation-policy"]));

    const snapshot = (await queries.getProjectOverview(sara, "prj_atlas")).snapshot;
    expect(snapshot.health).toBe("red");

    await expect(decideFix({ actor: omar, incidentId: incident.id, decision: "approved" })).rejects.toThrow(/not found/i);
    const approved = await decideFix({ actor: sara, incidentId: incident.id, decision: "approved" });
    expect(approved.fix?.status).toBe("approved");
    const resolved = await resolveIncident({ actor: sara, incidentId: incident.id, note: "Reverted and redeployed." });
    expect(resolved.status).toBe("resolved");
    expect(resolved.reportId).toBeTruthy();
    const report = await queries.getReport(sara, resolved.reportId!);
    expect(report.report.markdown).toContain(incident.key);
  });

  it("does not open a second incident for the same failure window", async () => {
    const before = (await queries.listIncidents(sara, "prj_helix")).length;
    await commands.runScenario(sara, "prj_helix", "failed-deploy");
    await commands.runScenario(sara, "prj_helix", "failed-deploy");
    expect((await queries.listIncidents(sara, "prj_helix")).length).toBe(before + 1);
  });
});

describe("ingestion safety", () => {
  it("redacts credentials before anything is stored", async () => {
    const result = await commands.runScenario(sara, "prj_atlas", "secret-leak");
    expect(result.redactions).toBeGreaterThan(0);
    const stored = JSON.stringify(result.events);
    expect(stored).not.toMatch(/sk_live_|AKIA[A-Z0-9]{12,}/);
    expect(result.events.some((event) => event.tags.includes("secrets-redacted"))).toBe(true);
  });

  it("flags instruction-like content and does not let it change project health", async () => {
    const before = (await queries.getProjectOverview(sara, "prj_pulse")).snapshot.health;
    const result = await commands.runScenario(sara, "prj_pulse", "prompt-injection");
    expect(result.events.some((event) => event.tags.includes("possible-injection"))).toBe(true);
    expect((await queries.getProjectOverview(sara, "prj_pulse")).snapshot.health).toBe(before);
    const audit = await store.list("audit");
    expect(audit.some((entry) => entry.action === "security.possible_injection")).toBe(true);
  });

  it("asks the author about an unclear major change", async () => {
    const result = await commands.runScenario(sara, "prj_atlas", "unclear-change");
    expect(result.clarifications).toHaveLength(1);
    expect(result.clarifications[0].kind).toBe("clarification");
  });

  it("keeps code away from models on metadata-only projects", async () => {
    const result = await commands.runScenario(sara, "prj_pulse", "feature-burst");
    expect(result.events.every((event) => event.details === undefined)).toBe(true);
    expect(result.run.steps.filter((step) => step.agent === "summarizer").every((step) => step.mode === "heuristic")).toBe(true);
  });
});

describe("learning loop", () => {
  it("turns criticism into a proposed lesson that a director must approve", async () => {
    const outcome = await learning.reflect(sara);
    expect(outcome.processed).toBeGreaterThan(0);
    const view = await learning.getLearning(sara);
    const proposed = view.lessons.filter((lesson) => lesson.status === "proposed");
    expect(proposed.length).toBeGreaterThan(0);
    const decided = await learning.decideLesson(sara, proposed[0].id, "active");
    expect(decided.status).toBe("active");
    expect(view.quality.runs).toBeGreaterThan(0);
  });

  it("replays pinned questions as a regression suite", async () => {
    const outcome = await learning.runEvals(sara);
    expect(outcome.total).toBeGreaterThan(0);
    expect(outcome.results.every((evalCase) => evalCase.lastResult !== undefined)).toBe(true);
  });
});
