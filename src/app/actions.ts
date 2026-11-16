"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { errorMessage, type ActionResult } from "@/lib/action-result";
import { requireProject } from "@/lib/auth/access";
import { requireActorOrThrow } from "@/lib/auth/current";
import { verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth/session";
import { loadPeople, loadProjectData } from "@/lib/knowledge/evidence";
import { audit, rateLimit } from "@/lib/security/audit";
import * as admin from "@/lib/services/admin";
import * as chat from "@/lib/services/chat";
import * as commands from "@/lib/services/commands";
import * as learning from "@/lib/services/learning";
import { getStore } from "@/lib/store";
import type { Actor, FeatureFlags, Feedback, Milestone, Person, PrivacySettings, Project, ReportKind, Ticket } from "@/lib/types";
import type { TicketDraft } from "@/lib/workflows/tickets";

/**
 * Server actions: the only way the browser changes anything. Each one
 * authenticates the caller, delegates to a service (which enforces project
 * access and validates input) and returns an ActionResult.
 */

async function act<T>(fn: (actor: Actor) => Promise<T>, paths: string[] = []): Promise<ActionResult<T>> {
  try {
    const actor = await requireActorOrThrow();
    const data = await fn(actor);
    for (const path of paths) revalidatePath(path, "layout");
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

const projectPath = (projectId: string) => `/projects/${projectId}`;

// --- authentication --------------------------------------------------------------

export async function loginAction(_previous: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`login:${ip}`, 10, 10 * 60 * 1000).ok || !rateLimit(`login:${email}`, 6, 10 * 60 * 1000).ok) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }
  const store = await getStore();
  const person = (await store.list("people")).find((candidate) => candidate.email.toLowerCase() === email);
  // The same message for an unknown account and a wrong password.
  if (!person || person.role === "member" || !verifyPassword(password, person.passwordHash)) {
    await audit({ id: person?.id ?? "anonymous" }, "auth.login_failed", { detail: email.slice(0, 80) });
    return { error: "That email and password do not match an account." };
  }
  const token = createSessionToken(person.id);
  if (!token) return { error: "Sign-in is not configured on this deployment. Set AUTH_SECRET and redeploy." };
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  await audit({ id: person.id }, "auth.login");
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// --- project setup ---------------------------------------------------------------

export async function createProjectAction(input: commands.NewProjectInput): Promise<ActionResult<{ id: string }>> {
  return act(async (actor) => ({ id: (await commands.createProject(actor, input)).id }), ["/"]);
}

export async function updateProjectDetailsAction(projectId: string, patch: Partial<Pick<Project, "name" | "client" | "description" | "status" | "startDate" | "targetDate" | "notifyChannel">>): Promise<ActionResult> {
  return act(async (actor) => (await commands.updateProjectDetails(actor, projectId, patch), null), ["/"]);
}

export async function setFeatureAction(projectId: string, feature: keyof FeatureFlags, enabled: boolean): Promise<ActionResult> {
  return act(async (actor) => (await commands.setFeature(actor, projectId, feature, enabled), null), [projectPath(projectId)]);
}

export async function setPrivacyAction(projectId: string, patch: Partial<PrivacySettings>): Promise<ActionResult> {
  return act(async (actor) => (await commands.setPrivacy(actor, projectId, patch), null), [projectPath(projectId)]);
}

export async function upsertSourceAction(projectId: string, input: { id?: string; kind: string; name: string; enabled: boolean; config: Record<string, string>; secretEnv?: string }): Promise<ActionResult> {
  return act(async (actor) => (await commands.upsertSource(actor, projectId, input), null), [projectPath(projectId)]);
}

export async function removeSourceAction(projectId: string, sourceId: string): Promise<ActionResult> {
  return act(async (actor) => (await commands.removeSource(actor, projectId, sourceId), null), [projectPath(projectId)]);
}

export async function upsertDeployTargetAction(projectId: string, input: { id?: string; environment: string; provider: string; config: Record<string, string>; secretEnv?: string }): Promise<ActionResult> {
  return act(async (actor) => (await commands.upsertDeployTarget(actor, projectId, input), null), [projectPath(projectId)]);
}

export async function removeDeployTargetAction(projectId: string, targetId: string): Promise<ActionResult> {
  return act(async (actor) => (await commands.removeDeployTarget(actor, projectId, targetId), null), [projectPath(projectId)]);
}

export async function upsertTeamMemberAction(projectId: string, input: { personId: string; projectRole: string; areas: string[]; allocationPct?: number }): Promise<ActionResult> {
  return act(async (actor) => (await commands.upsertTeamMember(actor, projectId, input), null), [projectPath(projectId)]);
}

export async function removeTeamMemberAction(projectId: string, personId: string): Promise<ActionResult> {
  return act(async (actor) => (await commands.removeTeamMember(actor, projectId, personId), null), [projectPath(projectId)]);
}

export async function setDirectorsAction(projectId: string, pdIds: string[]): Promise<ActionResult> {
  return act(async (actor) => (await commands.setDirectors(actor, projectId, pdIds), null), ["/"]);
}

export async function upsertMilestoneAction(projectId: string, input: { id?: string; name: string; dueDate: string; status: Milestone["status"]; description?: string }): Promise<ActionResult> {
  return act(async (actor) => (await commands.upsertMilestone(actor, projectId, input), null), [projectPath(projectId)]);
}

export async function removeMilestoneAction(projectId: string, milestoneId: string): Promise<ActionResult> {
  return act(async (actor) => (await commands.removeMilestone(actor, projectId, milestoneId), null), [projectPath(projectId)]);
}

export async function setTemplateAction(projectId: string, kind: ReportKind, template: string | null): Promise<ActionResult> {
  return act(async (actor) => (await commands.setTemplate(actor, projectId, kind, template), null), [projectPath(projectId)]);
}

export async function upsertPersonAction(input: { id?: string; name: string; email: string; title?: string; role?: Person["role"]; handles?: Person["handles"]; password?: string }): Promise<ActionResult<{ id: string }>> {
  return act(async (actor) => ({ id: (await commands.upsertPerson(actor, input)).id }), ["/settings"]);
}

// --- ingestion and generation ------------------------------------------------------

export async function syncNowAction(projectId: string): Promise<ActionResult<{ ingested: number; incidents: number; clarifications: number; sources: { name: string; status: string; detail?: string; items: number }[] }>> {
  return act(async (actor) => {
    const result = await commands.syncNow(actor, projectId);
    return { ingested: result.ingested, incidents: result.incidents.length, clarifications: result.clarifications.length, sources: result.sources.map(({ name, status, detail, items }) => ({ name, status, detail, items })) };
  }, ["/"]);
}

export async function runScenarioAction(projectId: string, scenarioId: string): Promise<ActionResult<{ events: number; incidentIds: string[]; clarificationIds: string[]; redactions: number; runId: string }>> {
  return act(async (actor) => {
    const result = await commands.runScenario(actor, projectId, scenarioId);
    return { events: result.events.length, incidentIds: result.incidents.map((incident) => incident.id), clarificationIds: result.clarifications.map((thread) => thread.id), redactions: result.redactions, runId: result.run.id };
  }, ["/"]);
}

export async function uploadDocumentAction(projectId: string, formData: FormData): Promise<ActionResult<{ events: number; runId: string }>> {
  return act(async (actor) => {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Files are limited to 5 MB.");
    const result = await commands.ingestDocument(actor, projectId, { name: file.name, data: Buffer.from(await file.arrayBuffer()) });
    return { events: result.events.length, runId: result.run.id };
  }, [projectPath(projectId)]);
}

export async function runDailySyncAction(projectId: string): Promise<ActionResult<{ digestId: string }>> {
  return act(async (actor) => {
    const project = await requireProject(actor, projectId);
    const { runDailySync } = await import("@/lib/workflows/daily-sync");
    return { digestId: (await runDailySync({ project, actor, trigger: "manual" })).id };
  }, [projectPath(projectId)]);
}

export async function generateReportAction(projectId: string, input: { kind: ReportKind; periodDays?: number; incidentId?: string }): Promise<ActionResult<{ reportId: string }>> {
  return act(async (actor) => {
    const project = await requireProject(actor, projectId);
    const { generateReport } = await import("@/lib/workflows/report");
    const report = await generateReport({ project, actor, kind: input.kind, periodDays: input.periodDays, incidentId: input.incidentId, trigger: "manual" });
    return { reportId: report.id };
  }, [projectPath(projectId)]);
}

// --- tickets -----------------------------------------------------------------------

export async function draftTicketsAction(projectId: string, text: string): Promise<ActionResult<{ drafts: TicketDraft[]; questions: string[]; runId: string }>> {
  return act(async (actor) => {
    const project = await requireProject(actor, projectId);
    const { draftTicketsFromMessage } = await import("@/lib/workflows/tickets");
    const result = await draftTicketsFromMessage({ project, actor, text, trigger: "manual" });
    return { drafts: result.drafts, questions: result.questions, runId: result.run.id };
  });
}

export async function createTicketsAction(projectId: string, drafts: TicketDraft[], originText?: string): Promise<ActionResult<{ keys: string[] }>> {
  return act(async (actor) => {
    const project = await requireProject(actor, projectId);
    const { createTickets } = await import("@/lib/workflows/tickets");
    const tickets = await createTickets({ project, actor, drafts: drafts.slice(0, 20), originText, originKind: "message" });
    return { keys: tickets.map((ticket) => ticket.key) };
  }, [projectPath(projectId)]);
}

export async function updateTicketAction(projectId: string, ticketId: string, patch: Partial<Pick<Ticket, "status" | "priority" | "assigneeId" | "title" | "description" | "dueDate" | "milestoneId" | "labels">>): Promise<ActionResult> {
  return act(async (actor) => {
    const project = await requireProject(actor, projectId);
    const { updateTicket } = await import("@/lib/workflows/tickets");
    await updateTicket({ project, actor, ticketId, patch });
    return null;
  }, [projectPath(projectId)]);
}

// --- questions to the team -----------------------------------------------------------

export async function suggestOwnersAction(projectId: string, question: string): Promise<ActionResult<{ personId: string; name: string; reason: string }[]>> {
  return act(async (actor) => {
    const project = await requireProject(actor, projectId);
    const [data, people] = await Promise.all([loadProjectData(project, actor), loadPeople()]);
    const { suggestOwner } = await import("@/lib/workflows/escalate");
    return suggestOwner({ project, people: Array.from(people.values()), events: data.events, query: question }).map((s) => ({ personId: s.person.id, name: s.person.name, reason: s.reason }));
  });
}

export async function escalateAction(projectId: string, input: { question: string; assigneeId?: string; context?: string }): Promise<ActionResult<{ threadId: string }>> {
  return act(async (actor) => {
    const project = await requireProject(actor, projectId);
    const { escalateQuestion } = await import("@/lib/workflows/escalate");
    const thread = await escalateQuestion({ project, actor, question: input.question, assigneeId: input.assigneeId, context: input.context, trigger: "manual" });
    return { threadId: thread.id };
  }, ["/inbox", projectPath(projectId)]);
}

export async function replyThreadAction(threadId: string, body: string): Promise<ActionResult> {
  return act(async (actor) => {
    const { postThreadReply } = await import("@/lib/workflows/threads");
    await postThreadReply({ threadId, body, via: "portal", author: { id: actor.id, name: actor.name }, actor });
    return null;
  }, ["/inbox"]);
}

export async function markThreadReadAction(threadId: string): Promise<ActionResult> {
  return act(async (actor) => {
    const { markThreadRead } = await import("@/lib/workflows/threads");
    await markThreadRead({ actor, threadId });
    return null;
  }, ["/inbox"]);
}

export async function closeThreadAction(threadId: string): Promise<ActionResult> {
  return act(async (actor) => {
    const { closeThread } = await import("@/lib/workflows/threads");
    await closeThread({ actor, threadId });
    return null;
  }, ["/inbox"]);
}

/**
 * The public reply link: a team member answers without an account. The only
 * credential is the unguessable token from the message they received.
 */
export async function submitPublicReplyAction(threadId: string, token: string, body: string): Promise<ActionResult> {
  try {
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!rateLimit(`reply:${ip}`, 12, 10 * 60 * 1000).ok) return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
    const { getThreadForReply, postThreadReply } = await import("@/lib/workflows/threads");
    const found = await getThreadForReply(threadId, token);
    if (!found) return { ok: false, error: "This link is not valid any more. Ask the director to send the question again." };
    await postThreadReply({ threadId, body, via: "reply_link", author: { id: found.assignee.id, name: found.assignee.name } });
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

// --- incidents -----------------------------------------------------------------------

export async function decideFixAction(incidentId: string, decision: "approved" | "rejected", comment?: string): Promise<ActionResult> {
  return act(async (actor) => {
    const { decideFix } = await import("@/lib/workflows/incident");
    await decideFix({ actor, incidentId, decision, comment });
    return null;
  }, ["/"]);
}

export async function resolveIncidentAction(incidentId: string, note?: string): Promise<ActionResult<{ reportId?: string }>> {
  return act(async (actor) => {
    const { resolveIncident } = await import("@/lib/workflows/incident");
    const incident = await resolveIncident({ actor, incidentId, note });
    return { reportId: incident.reportId };
  }, ["/"]);
}

// --- notes ---------------------------------------------------------------------------

export async function saveNoteAction(projectId: string, input: { id?: string; title?: string; body: string; pinned?: boolean; shareWithAssistant?: boolean }): Promise<ActionResult<{ id: string }>> {
  return act(async (actor) => ({ id: (await commands.saveNote(actor, projectId, input)).id }), [projectPath(projectId)]);
}

export async function deleteNoteAction(projectId: string, noteId: string): Promise<ActionResult> {
  return act(async (actor) => (await commands.deleteNote(actor, noteId), null), [projectPath(projectId)]);
}

// --- chat ----------------------------------------------------------------------------

export async function executeChatActionAction(input: { conversationId: string; messageId: string; actionId: string }): Promise<ActionResult<{ resultRef: string; href: string }>> {
  return act(async (actor) => {
    const result = await chat.executeAction(actor, input);
    return { resultRef: result.resultRef, href: result.href };
  }, ["/inbox"]);
}

export async function completeChatActionAction(input: { conversationId: string; messageId: string; actionId: string; status: "done" | "dismissed"; resultRef?: string }): Promise<ActionResult> {
  return act(async (actor) => (await chat.completeAction(actor, input), null));
}

export async function deleteConversationAction(conversationId: string): Promise<ActionResult> {
  return act(async (actor) => (await chat.deleteConversation(actor, conversationId), null), ["/chat"]);
}

// --- learning loop -------------------------------------------------------------------

export async function feedbackAction(input: { target: Feedback["target"]; rating: "up" | "down"; comment?: string; projectId?: string; runId?: string }): Promise<ActionResult> {
  return act(async (actor) => (await learning.submitFeedback(actor, input), null), ["/learning"]);
}

export async function reflectAction(projectId?: string): Promise<ActionResult<{ lessons: number; processed: number }>> {
  return act(async (actor) => {
    const result = await learning.reflect(actor, projectId);
    return { lessons: result.lessons.length, processed: result.processed };
  }, ["/learning"]);
}

export async function decideLessonAction(lessonId: string, decision: "active" | "retired"): Promise<ActionResult> {
  return act(async (actor) => (await learning.decideLesson(actor, lessonId, decision), null), ["/learning"]);
}

export async function addLessonAction(input: { scope: string; agent: string; text: string }): Promise<ActionResult> {
  return act(async (actor) => (await learning.addLesson(actor, input), null), ["/learning"]);
}

export async function addEvalAction(input: { question: string; mustMention: string[]; projectId?: string }): Promise<ActionResult> {
  return act(async (actor) => (await learning.addEvalCase(actor, input), null), ["/learning"]);
}

export async function removeEvalAction(evalId: string): Promise<ActionResult> {
  return act(async (actor) => (await learning.removeEvalCase(actor, evalId), null), ["/learning"]);
}

export async function runEvalsAction(): Promise<ActionResult<{ total: number; passed: number }>> {
  return act(async (actor) => {
    const result = await learning.runEvals(actor);
    return { total: result.total, passed: result.passed };
  }, ["/learning"]);
}

// --- administration ------------------------------------------------------------------

export async function resetDemoAction(): Promise<ActionResult> {
  return act(async (actor) => (await admin.resetDemo(actor), null), ["/"]);
}

export async function createTokenAction(name: string, scope: "read" | "write"): Promise<ActionResult<{ token: string; id: string }>> {
  return act(async (actor) => {
    const created = await admin.createToken(actor, name, scope);
    return { token: created.token, id: created.record.id };
  }, ["/settings"]);
}

export async function revokeTokenAction(tokenId: string): Promise<ActionResult> {
  return act(async (actor) => (await admin.revokeToken(actor, tokenId), null), ["/settings"]);
}
