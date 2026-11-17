import { notFound } from "next/navigation";
import { DeploymentsManager } from "@/components/features/settings/deployments-manager";
import { DetailsForm } from "@/components/features/settings/details-form";
import { FeatureToggles } from "@/components/features/settings/feature-toggles";
import { MilestonesManager } from "@/components/features/settings/milestones-manager";
import { PrivacyForm } from "@/components/features/settings/privacy-form";
import { SourcesManager } from "@/components/features/settings/sources-manager";
import { TeamManager } from "@/components/features/settings/team-manager";
import { TemplatesEditor, type TemplateInfo } from "@/components/features/settings/templates-editor";
import { Callout, Tabs } from "@/components/ui";
import { AccessError } from "@/lib/auth/access";
import { requireActor } from "@/lib/auth/current";
import { listConnectors } from "@/lib/connectors";
import { getProjectSettings } from "@/lib/services/queries";
import { DEFAULT_TEMPLATES, TEMPLATE_LABELS, templatePlaceholders } from "@/lib/templates";
import type { ReportKind } from "@/lib/types";

export const metadata = { title: "Project settings" };

const TABS = [
  { value: "details", label: "Details" },
  { value: "features", label: "Features" },
  { value: "privacy", label: "Privacy and code" },
  { value: "sources", label: "Sources" },
  { value: "deployments", label: "Deployments" },
  { value: "team", label: "Team" },
  { value: "milestones", label: "Milestones" },
  { value: "templates", label: "Report templates" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export default async function ProjectSettingsPage({ params, searchParams }: PageProps<"/projects/[id]/settings">) {
  const { id } = await params;
  const query = await searchParams;
  const rawTab = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab: TabValue = TABS.find((candidate) => candidate.value === rawTab)?.value ?? "details";
  const actor = await requireActor();
  const data = await getProjectSettings(actor, id).catch((error: unknown) => {
    if (error instanceof AccessError) return null;
    throw error;
  });
  if (!data) notFound();
  const { project, people, team } = data;

  let content: React.ReactNode;
  switch (tab) {
    case "details":
      content = <DetailsForm projectId={project.id} initial={{ name: project.name, client: project.client, description: project.description, status: project.status, startDate: project.startDate, targetDate: project.targetDate, notifyChannel: project.notifyChannel }} />;
      break;
    case "features":
      content = <FeatureToggles projectId={project.id} features={project.features} />;
      break;
    case "privacy":
      content = <PrivacyForm projectId={project.id} initial={project.privacy} />;
      break;
    case "sources":
      content = (
        <SourcesManager
          projectId={project.id}
          sources={project.sources.map((source) => ({ id: source.id, kind: source.kind, name: source.name, enabled: source.enabled, config: source.config, secretEnv: source.secretEnv, lastSyncAt: source.lastSyncAt, lastSyncStatus: source.lastSyncStatus, lastSyncDetail: source.lastSyncDetail }))}
          connectors={listConnectors().map((connector) => ({ kind: connector.kind, label: connector.label, configHelp: connector.configHelp, defaultSecretEnv: connector.defaultSecretEnv }))}
        />
      );
      break;
    case "deployments":
      content = <DeploymentsManager projectId={project.id} targets={project.deployTargets.map((target) => ({ id: target.id, environment: target.environment, provider: target.provider, config: target.config, secretEnv: target.secretEnv }))} />;
      break;
    case "team":
      content = (
        <TeamManager
          projectId={project.id}
          pdIds={project.pdIds}
          people={people.map((person) => ({ id: person.id, name: person.name, email: person.email, title: person.title, role: person.role }))}
          members={team.map((member) => ({ id: member.id, name: member.name, email: member.email, title: member.title, role: member.role, projectRole: member.projectRole, areas: member.areas, allocationPct: member.allocationPct }))}
        />
      );
      break;
    case "milestones":
      content = <MilestonesManager projectId={project.id} milestones={project.milestones} />;
      break;
    case "templates": {
      const placeholders = Array.from(new Set(Object.values(DEFAULT_TEMPLATES).flatMap((template) => templatePlaceholders(template))));
      const templates: TemplateInfo[] = (Object.keys(TEMPLATE_LABELS) as ReportKind[]).map((kind) => ({
        kind,
        label: TEMPLATE_LABELS[kind].label,
        description: TEMPLATE_LABELS[kind].description,
        defaultText: DEFAULT_TEMPLATES[kind],
        override: project.templates[kind],
        placeholders,
      }));
      content = <TemplatesEditor projectId={project.id} templates={templates} />;
      break;
    }
  }

  const isNew = (Array.isArray(query.new) ? query.new[0] : query.new) === "1";

  return (
    <div className="space-y-5">
      {isNew ? (
        <Callout tone="success" title="Project created">
          Next: connect your sources (the Sources tab) and add your team (the Team tab) so the assistant has activity and people to work with.
        </Callout>
      ) : null}
      <Tabs param="tab" defaultValue="details" label="Project settings sections" items={TABS.map((item) => ({ label: item.label, value: item.value }))} />
      {content}
    </div>
  );
}
