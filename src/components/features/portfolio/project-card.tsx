import Link from "next/link";
import { MessageCircleQuestion, MessageSquareText, Siren, Users } from "lucide-react";
import { Badge, Card, CardBody, LinkButton } from "@/components/ui";
import { ProgressBar, Sparkline } from "@/components/charts";
import { DeployBadge, HealthBadge, PaceBadge } from "@/components/domain";
import type { Project, ProjectSnapshot } from "@/lib/types";

const paceTone = { ahead: "success", on_track: "success", at_risk: "warning", behind: "danger", unknown: "neutral" } as const;

/** One project on the portfolio page: health, pace, deployments and the counts a director scans for. */
export function ProjectCard({ project, snapshot, teamSize }: { project: Project; snapshot: ProjectSnapshot; teamSize: number }) {
  const { pace } = snapshot;
  const base = `/projects/${project.id}`;
  return (
    <Card as="article" className="flex min-w-0 flex-col" aria-labelledby={`proj-${project.id}`}>
      <CardBody className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id={`proj-${project.id}`} className="truncate text-base font-semibold">
              <Link href={base} className="hover:underline">
                {project.name}
              </Link>
            </h3>
            <p className="truncate text-[13px] text-muted">
              {project.client} · <span className="font-mono text-xs">{project.key}</span>
            </p>
          </div>
          <HealthBadge health={snapshot.health} />
        </div>

        <p className="text-[13px] leading-relaxed text-fg">{snapshot.headline}</p>

        <div className="space-y-2">
          <ProgressBar value={pace.progressPct} marker={pace.timeElapsedPct} tone="auto" label="Scope done" size="md" showValue />
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted">
            <span>
              {Math.round(pace.progressPct)}% done · {Math.round(pace.timeElapsedPct)}% of time used
            </span>
            <PaceBadge status={pace.status} />
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">Tickets closed per week</p>
            <p className="text-[13px] tabular-nums">
              <span className="font-semibold">{pace.velocity.toFixed(1)}</span> / week
              <span className={pace.velocityTrendPct < 0 ? " text-warning" : " text-muted"}>
                {" "}
                ({pace.velocityTrendPct > 0 ? "+" : ""}
                {Math.round(pace.velocityTrendPct)}%)
              </span>
            </p>
          </div>
          <Sparkline data={pace.weeklyThroughput} kind="bars" tone={paceTone[pace.status]} width={110} height={32} title="Tickets closed per week" />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Deployments</p>
          {snapshot.deploy.length === 0 ? (
            <p className="text-[13px] text-muted">No environments tracked yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
              {snapshot.deploy.map((d) => (
                <li key={d.environment} className="flex items-center gap-1.5 text-[13px]">
                  <span className="capitalize text-muted">{d.environment}</span>
                  <DeployBadge status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-[13px]">
          <span className="inline-flex items-center gap-1.5">
            {snapshot.openIncidents > 0 ? <Badge tone="danger" icon={<Siren size={12} aria-hidden />}>{snapshot.openIncidents} open incident{snapshot.openIncidents === 1 ? "" : "s"}</Badge> : <span className="text-muted">No open incidents</span>}
          </span>
          <span className="inline-flex items-center gap-1.5">
            {snapshot.openQuestions > 0 ? <Badge tone="info" icon={<MessageCircleQuestion size={12} aria-hidden />}>{snapshot.openQuestions} question{snapshot.openQuestions === 1 ? "" : "s"} waiting</Badge> : <span className="text-muted">No open questions</span>}
          </span>
          <span className="inline-flex items-center gap-1 text-muted">
            <Users size={14} aria-hidden /> {teamSize} on the team
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <LinkButton href={base} variant="secondary" size="sm">
            Open project
          </LinkButton>
          <LinkButton href={`${base}/chat`} variant="ghost" size="sm" icon={<MessageSquareText size={14} aria-hidden />}>
            Ask about this project
          </LinkButton>
        </div>
      </CardBody>
    </Card>
  );
}
