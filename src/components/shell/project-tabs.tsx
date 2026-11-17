import { Tabs } from "../ui";

export interface ProjectTabsProps {
  projectId: string;
  className?: string;
}

/** Per-project tab bar. Render it in `/projects/[id]/layout.tsx` under the project header. */
export function ProjectTabs({ projectId, className }: ProjectTabsProps) {
  const base = `/projects/${projectId}`;
  return (
    <Tabs
      label="Project sections"
      className={className}
      items={[
        { label: "Overview", href: base, exact: true },
        { label: "Daily sync", href: `${base}/daily` },
        { label: "Activity", href: `${base}/activity` },
        { label: "Tickets", href: `${base}/tickets` },
        { label: "Incidents", href: `${base}/incidents` },
        { label: "Reports", href: `${base}/reports` },
        { label: "Team", href: `${base}/team` },
        { label: "Chat", href: `${base}/chat` },
        { label: "Notes", href: `${base}/notes` },
        { label: "Settings", href: `${base}/settings` },
      ]}
    />
  );
}
