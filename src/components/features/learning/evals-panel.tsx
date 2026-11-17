"use client";

import { CircleCheck, CircleX, ListChecks, Play, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { addEvalAction, removeEvalAction, runEvalsAction } from "@/app/actions";
import { useAction } from "@/components/features/settings/use-action";
import { Badge, Button, Callout, Card, CardBody, CardHeader, EmptyState, Field, RelativeTime, Select, Textarea, toast } from "@/components/ui";

export interface EvalItem {
  id: string;
  question: string;
  mustMention: string[];
  projectName?: string;
  lastResult?: { at: string; passed: boolean; groundingScore: number; missing: string[]; runId?: string };
}

function EvalRow({ item }: { item: EvalItem }) {
  const { run, pending } = useAction();
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="break-words text-sm font-medium">{item.question}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={item.projectName ? "info" : "neutral"}>{item.projectName ?? "Any project"}</Badge>
            {item.mustMention.map((fact) => (
              <span key={fact} className="max-w-full break-words rounded border border-line bg-surface-2 px-1.5 py-0.5 text-xs">
                {fact}
              </span>
            ))}
          </div>
        </div>
        <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} loading={pending} aria-label={`Remove question: ${item.question}`} onClick={() => run(() => removeEvalAction(item.id), { success: "Question removed" })}>
          Remove
        </Button>
      </div>
      {item.lastResult ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <Badge tone={item.lastResult.passed ? "success" : "danger"} icon={item.lastResult.passed ? <CircleCheck /> : <CircleX />}>
            {item.lastResult.passed ? "Passed" : "Failed"}
          </Badge>
          <span>Grounding {Math.round(item.lastResult.groundingScore * 100)}%</span>
          <span>
            Run <RelativeTime iso={item.lastResult.at} />
          </span>
          {item.lastResult.missing.length > 0 ? <span className="text-danger">Missing: {item.lastResult.missing.join(", ")}</span> : null}
          {item.lastResult.runId ? (
            <Link href={`/runs/${item.lastResult.runId}`} className="text-accent hover:underline">
              View run
            </Link>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted">Not run yet.</p>
      )}
    </li>
  );
}

export function EvalsPanel({ items, projects }: { items: EvalItem[]; projects: { id: string; name: string }[] }) {
  const { run, pending } = useAction();
  const [question, setQuestion] = useState("");
  const [facts, setFacts] = useState("");
  const [projectId, setProjectId] = useState("");

  async function runAll() {
    const result = await run(() => runEvalsAction(), {});
    if (result.ok) toast({ tone: result.data.passed === result.data.total ? "success" : "warning", title: `${result.data.passed} of ${result.data.total} questions passed` });
  }
  async function add(event: React.FormEvent) {
    event.preventDefault();
    const result = await run(() => addEvalAction({ question, mustMention: facts.split("\n").map((line) => line.trim()).filter(Boolean), projectId: projectId || undefined }), { success: "Question pinned" });
    if (result.ok) {
      setQuestion("");
      setFacts("");
    }
  }

  return (
    <Card as="section" aria-labelledby="evals-heading">
      <CardHeader
        title={<span id="evals-heading">Regression questions</span>}
        description="Pinned questions the assistant must keep answering correctly. Run them after changing lessons or templates."
        actions={
          <Button variant="secondary" size="sm" icon={<Play size={14} />} loading={pending} disabled={items.length === 0} onClick={runAll}>
            Run all
          </Button>
        }
      />
      {pending ? (
        <div className="px-4 pt-4">
          <Callout tone="info" title="Running the questions">
            Each question is answered like a real one, so this can take a minute or more.
          </Callout>
        </div>
      ) : null}
      {items.length === 0 ? (
        <CardBody>
          <EmptyState icon={<ListChecks size={20} />} title="No regression questions" description="Pin a question you care about and the facts a good answer must contain." />
        </CardBody>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <EvalRow key={item.id} item={item} />
          ))}
        </ul>
      )}
      <form onSubmit={add} className="space-y-3 border-t border-line p-4">
        <h3 className="text-sm font-semibold">Pin a question</h3>
        <Field label="Question">
          <Textarea rows={2} value={question} maxLength={400} onChange={(event) => setQuestion(event.target.value)} placeholder="Is the Atlas project on track for its target date?" />
        </Field>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field label="Facts the answer must mention" hint="One per line. A good answer includes every one.">
            <Textarea rows={3} value={facts} onChange={(event) => setFacts(event.target.value)} placeholder={"on track\nbeta milestone"} />
          </Field>
          <Field label="Project">
            <Select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">Any project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" icon={<Plus size={14} />} loading={pending} disabled={!question.trim()}>
            Pin question
          </Button>
        </div>
      </form>
    </Card>
  );
}
