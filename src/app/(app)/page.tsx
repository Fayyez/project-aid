import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Card, CardBody, EmptyState, LinkButton, PageHeader, Stat } from "@/components/ui";
import { AttentionList } from "@/components/features/portfolio/attention-list";
import { LatestFeed } from "@/components/features/portfolio/latest-feed";
import { ProjectCard } from "@/components/features/portfolio/project-card";
import { requireActor } from "@/lib/auth/current";
import { getPortfolio } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Portfolio" };

const healthRank = { red: 0, amber: 1, green: 2 } as const;
const paceRank = { behind: 0, at_risk: 1, unknown: 2, on_track: 3, ahead: 4 } as const;

export default async function PortfolioPage() {
  const actor = await requireActor();
  const view = await getPortfolio(actor);
  const projects = [...view.projects].sort(
    (a, b) => healthRank[a.snapshot.health] - healthRank[b.snapshot.health] || paceRank[a.snapshot.pace.status] - paceRank[b.snapshot.pace.status] || a.project.name.localeCompare(b.project.name),
  );
  const { totals } = view;
  const needAttention = totals.red + totals.amber;

  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Where each project stands right now. Worst health first."
        actions={
          <LinkButton href="/projects/new" variant="primary" icon={<Plus size={16} aria-hidden />}>
            New project
          </LinkButton>
        }
      />

      <div className="space-y-8">
        <section aria-label="Summary">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {[
              { label: "Projects", value: totals.projects, hint: `${totals.green} healthy` },
              { label: "Need attention", value: needAttention, hint: `${totals.red} critical, ${totals.amber} at risk` },
              { label: "Open incidents", value: totals.openIncidents, hint: totals.openIncidents === 0 ? "All clear" : "Across all projects" },
              { label: "Questions waiting", value: totals.openQuestions, hint: totals.unreadAnswers > 0 ? `${totals.unreadAnswers} new answer${totals.unreadAnswers === 1 ? "" : "s"}` : "Sent to the team" },
              { label: "Activity, last 24h", value: totals.eventsLast24h, hint: "Changes recorded" },
            ].map((s) => (
              <Card key={s.label}>
                <CardBody>
                  <Stat label={s.label} value={s.value} hint={s.hint} />
                </CardBody>
              </Card>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
          <div className="min-w-0 space-y-8 xl:col-span-2">
            <AttentionList items={view.attention} />
            <section aria-labelledby="projects-title" className="space-y-3">
              <h2 id="projects-title" className="text-sm font-semibold">
                Your projects
              </h2>
              {projects.length === 0 ? (
                <Card>
                  <EmptyState
                    title="No projects yet"
                    description="Create your first project to start tracking health, pace and deployments."
                    action={
                      <LinkButton href="/projects/new" variant="primary">
                        New project
                      </LinkButton>
                    }
                  />
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {projects.map(({ project, snapshot, teamSize }) => (
                    <ProjectCard key={project.id} project={project} snapshot={snapshot} teamSize={teamSize} />
                  ))}
                </div>
              )}
            </section>
          </div>
          <div className="min-w-0">
            <LatestFeed events={view.recentEvents} />
          </div>
        </div>
      </div>
    </>
  );
}
