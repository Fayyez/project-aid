import { EvalsPanel } from "@/components/features/learning/evals-panel";
import { FeedbackPanel, type FeedbackItem } from "@/components/features/learning/feedback-panel";
import { LessonsPanel } from "@/components/features/learning/lessons-panel";
import { Card, CardBody, CardHeader, PageHeader, Stat, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { requireActor } from "@/lib/auth/current";
import { getLearning } from "@/lib/services/learning";
import { getShellData } from "@/lib/services/queries";

export const metadata = { title: "Learning" };

const percent = (value: number | null) => (value === null ? "-" : `${Math.round(value * 100)}%`);
const money = (value: number) => (value === 0 ? "$0" : value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`);
const seconds = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

const TARGET_LABEL: Record<string, string> = { chat_message: "A chat answer", report: "A report", digest: "A daily summary", ticket: "A ticket", incident: "An incident", event: "An activity item" };

export default async function LearningPage() {
  const actor = await requireActor();
  const [view, shell] = await Promise.all([getLearning(actor), getShellData(actor)]);
  const projects = shell.projects.map((project) => ({ id: project.id, name: project.name }));
  const projectName = new Map(projects.map((project) => [project.id, project.name]));
  const agentTitle = new Map(view.agents.map((agent) => [agent.name, agent.title]));
  const { quality } = view;

  const lessons = view.lessons.map((lesson) => ({
    id: lesson.id,
    scope: lesson.scope,
    scopeLabel: lesson.scope === "global" ? "All projects" : (projectName.get(lesson.scope) ?? "Project"),
    agent: lesson.agent,
    agentLabel: lesson.agent === "all" ? "all agents" : (agentTitle.get(lesson.agent) ?? lesson.agent),
    text: lesson.text,
    rationale: lesson.rationale,
    source: lesson.source,
    status: lesson.status,
    createdAt: lesson.createdAt,
  }));
  const feedback: FeedbackItem[] = view.feedback.map((entry) => ({
    id: entry.id,
    rating: entry.rating,
    comment: entry.comment,
    about: TARGET_LABEL[entry.target.type] ?? entry.target.type,
    href: entry.target.type === "report" && entry.projectId ? `/projects/${entry.projectId}/reports/${entry.target.id}` : undefined,
    runId: entry.runId,
    projectName: entry.projectName,
    userName: entry.userName,
    processed: entry.processed,
    createdAt: entry.createdAt,
  }));
  const evals = view.evals.map((item) => ({ id: item.id, question: item.question, mustMention: item.mustMention, projectName: item.projectId ? projectName.get(item.projectId) : undefined, lastResult: item.lastResult }));

  return (
    <div className="space-y-6">
      <PageHeader title="Learning" description="How the assistant improves: it learns from your ratings, follows the guidance you approve, and is checked against pinned questions." />

      <Card as="section" aria-labelledby="quality-heading">
        <CardHeader title={<span id="quality-heading">Quality</span>} description="Across the projects you can see." />
        <CardBody>
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Answers given" value={quality.answers} />
            <Stat label="Average grounding" value={percent(quality.avgGrounding)} hint="Share of statements backed by a source" />
            <Stat label="Fully grounded" value={percent(quality.groundedShare)} hint="Answers with every claim sourced" />
            <Stat label="Steps on a live model" value={percent(quality.liveShare)} hint="The rest used built-in rules" />
            <Stat label="Model failures" value={quality.modelFailures} hint="Fell back to built-in rules" />
            <Stat label="Estimated cost" value={money(quality.costUsd)} hint={`${quality.runs} runs`} />
            <Stat label="Thumbs up" value={quality.thumbsUp} />
            <Stat label="Thumbs down" value={quality.thumbsDown} />
          </div>
        </CardBody>
      </Card>

      <LessonsPanel lessons={lessons} projects={projects} agents={view.agents.map((agent) => ({ name: agent.name, title: agent.title }))} />

      <FeedbackPanel items={feedback} pending={view.pendingFeedback} />

      <EvalsPanel items={evals} projects={projects} />

      <Card as="section" aria-labelledby="agents-heading">
        <CardHeader title={<span id="agents-heading">Quality by agent</span>} description="How each agent has performed. A high fallback count usually means the model was unavailable or returned something unusable." />
        <CardBody>
          {quality.byAgent.length === 0 ? (
            <p className="text-[13px] text-muted">No agent steps have run yet.</p>
          ) : (
            <Table>
              <THead>
                <Tr hover={false}>
                  <Th>Agent</Th>
                  <Th numeric>Steps</Th>
                  <Th numeric>Live share</Th>
                  <Th numeric>Fallbacks</Th>
                  <Th numeric>Failures</Th>
                  <Th numeric>Avg duration</Th>
                  <Th numeric>Cost</Th>
                </Tr>
              </THead>
              <TBody>
                {quality.byAgent.map((row) => (
                  <Tr key={row.agent}>
                    <Td className="font-medium">{row.title}</Td>
                    <Td numeric>{row.steps}</Td>
                    <Td numeric>{row.steps ? `${Math.round((row.live / row.steps) * 100)}%` : "-"}</Td>
                    <Td numeric>{row.fallbacks}</Td>
                    <Td numeric>{row.failures}</Td>
                    <Td numeric>{seconds(row.avgMs)}</Td>
                    <Td numeric>{money(row.costUsd)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
