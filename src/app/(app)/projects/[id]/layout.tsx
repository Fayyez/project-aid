import { notFound } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { Badge, LinkButton, PageHeader } from "@/components/ui";
import { HealthBadge } from "@/components/domain";
import { ProjectTabs } from "@/components/shell";
import { SyncButton } from "@/components/features/sync-button";
import { AccessError } from "@/lib/auth/access";
import { requireActor } from "@/lib/auth/current";
import { getProjectOverview } from "@/lib/services/queries";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  const { id } = await params;
  const actor = await requireActor();
  let overview;
  try {
    overview = await getProjectOverview(actor, id);
  } catch (error) {
    if (error instanceof AccessError) notFound();
    throw error;
  }
  const { project, snapshot } = overview;
  return (
    <>
      <PageHeader
        title={project.name}
        description={project.client}
        breadcrumbs={[{ label: "Portfolio", href: "/" }, { label: project.name }]}
        meta={
          <>
            <HealthBadge health={snapshot.health} />
            <Badge tone="neutral">
              <span className="font-mono">{project.key}</span>
            </Badge>
            {project.status !== "active" ? <Badge tone="warning">{project.status === "paused" ? "Paused" : "Completed"}</Badge> : null}
          </>
        }
        actions={
          <>
            <LinkButton href={`/projects/${id}/chat`} variant="secondary" icon={<MessageSquareText size={14} aria-hidden />}>
              Ask
            </LinkButton>
            <SyncButton projectId={id} />
          </>
        }
        className="mb-3"
      />
      <ProjectTabs projectId={id} className="mb-6" />
      {children}
    </>
  );
}
