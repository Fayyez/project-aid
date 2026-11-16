"use client";

import { Check, GraduationCap, Plus, X } from "lucide-react";
import { useState } from "react";
import { addLessonAction, decideLessonAction } from "@/app/actions";
import { useAction } from "@/components/features/settings/use-action";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, RelativeTime, Select, Textarea } from "@/components/ui";

export interface LessonItem {
  id: string;
  scope: string;
  scopeLabel: string;
  agent: string;
  agentLabel: string;
  text: string;
  rationale: string;
  source: string;
  status: "proposed" | "active" | "retired";
  createdAt: string;
}

export interface AgentOption {
  name: string;
  title: string;
}

const SOURCE_LABEL: Record<string, string> = { feedback: "From feedback", clarification: "From a clarification", manual: "Added by a director", reflection: "From reflection" };

function LessonRow({ lesson }: { lesson: LessonItem }) {
  const { run, pending } = useAction();
  const decide = (decision: "active" | "retired", success: string) => run(() => decideLessonAction(lesson.id, decision), { success });
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="break-words text-sm font-medium">{lesson.text}</p>
          {lesson.rationale ? <p className="break-words text-[13px] text-muted">Why: {lesson.rationale}</p> : null}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <Badge tone={lesson.scope === "global" ? "accent" : "info"}>{lesson.scopeLabel}</Badge>
            <Badge>Applies to {lesson.agentLabel}</Badge>
            <span>{SOURCE_LABEL[lesson.source] ?? lesson.source}</span>
            <span aria-hidden>·</span>
            <RelativeTime iso={lesson.createdAt} />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {lesson.status === "proposed" ? (
            <>
              <Button size="sm" variant="primary" icon={<Check size={13} />} loading={pending} onClick={() => decide("active", "Lesson approved")}>
                Approve
              </Button>
              <Button size="sm" variant="ghost" icon={<X size={13} />} disabled={pending} onClick={() => decide("retired", "Lesson dismissed")}>
                Dismiss
              </Button>
            </>
          ) : lesson.status === "active" ? (
            <Button size="sm" variant="secondary" loading={pending} onClick={() => decide("retired", "Lesson retired")}>
              Retire
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function LessonGroup({ title, description, lessons, empty }: { title: string; description: string; lessons: LessonItem[]; empty: string }) {
  return (
    <section aria-label={title}>
      <div className="border-b border-line bg-surface-2/60 px-4 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {title} <span className="font-normal normal-case">({lessons.length})</span>
        </h3>
        <p className="text-xs text-muted">{description}</p>
      </div>
      {lessons.length === 0 ? <p className="px-4 py-3 text-[13px] text-muted">{empty}</p> : <ul className="divide-y divide-line">{lessons.map((lesson) => <LessonRow key={lesson.id} lesson={lesson} />)}</ul>}
    </section>
  );
}

export function LessonsPanel({ lessons, projects, agents }: { lessons: LessonItem[]; projects: { id: string; name: string }[]; agents: AgentOption[] }) {
  const { run, pending } = useAction();
  const [scope, setScope] = useState("global");
  const [agent, setAgent] = useState("all");
  const [text, setText] = useState("");
  const proposed = lessons.filter((lesson) => lesson.status === "proposed");
  const active = lessons.filter((lesson) => lesson.status === "active");
  const retired = lessons.filter((lesson) => lesson.status === "retired");

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const result = await run(() => addLessonAction({ scope, agent, text }), { success: "Guidance added" });
    if (result.ok) setText("");
  }

  return (
    <Card as="section" aria-labelledby="lessons-heading">
      <CardHeader title={<span id="lessons-heading">Lessons</span>} description="Approved lessons are added to the instructions of the agents they target, so future answers follow them." />
      {lessons.length === 0 ? (
        <CardBody>
          <EmptyState icon={<GraduationCap size={20} />} title="No lessons yet" description="Rate answers with a thumbs up or down, then use Learn from feedback, or add guidance yourself below." />
        </CardBody>
      ) : (
        <div className="divide-y divide-line">
          <LessonGroup title="Waiting for your decision" description="Proposed from feedback. Nothing changes until you approve." lessons={proposed} empty="Nothing is waiting for approval." />
          <LessonGroup title="Active" description="Currently added to agent instructions." lessons={active} empty="No active lessons." />
          {retired.length > 0 ? <LessonGroup title="Retired" description="No longer used." lessons={retired} empty="" /> : null}
        </div>
      )}
      <form onSubmit={add} className="space-y-3 border-t border-line p-4">
        <h3 className="text-sm font-semibold">Add guidance</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Applies to project">
            <Select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="global">Everything (global)</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Agent">
            <Select value={agent} onChange={(event) => setAgent(event.target.value)}>
              <option value="all">All agents</option>
              {agents.map((option) => (
                <option key={option.name} value={option.name}>
                  {option.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Guidance" hint="One clear instruction, for example: Always state the date a risk was first noticed.">
          <Textarea rows={2} value={text} maxLength={600} onChange={(event) => setText(event.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" icon={<Plus size={14} />} loading={pending} disabled={!text.trim()}>
            Add guidance
          </Button>
        </div>
      </form>
    </Card>
  );
}
