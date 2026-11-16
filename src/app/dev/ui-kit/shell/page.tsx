import type { Metadata } from "next";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { AppShell, ProjectTabs } from "@/components/shell";

export const metadata: Metadata = { title: "Shell preview" };

async function signOut() {
  "use server";
}

/** Demonstrates the AppShell and ProjectTabs with static sample data. */
export default function ShellPreview() {
  return (
    <AppShell
      user={{ name: "Dana Whitfield", email: "dana.whitfield@example.com", role: "pd" }}
      projects={[
        { id: "atlas", name: "Atlas Commerce", key: "ATLAS", health: "green" },
        { id: "borealis", name: "Borealis Mobile", key: "BORE", health: "amber" },
        { id: "cobalt", name: "Cobalt Data Platform", key: "COBA", health: "red" },
      ]}
      counts={{ inbox: 3, incidents: 1 }}
      llm={{ mode: "heuristic", label: "Heuristic mode" }}
      signOutAction={signOut}
    >
      <PageHeader title="Atlas Commerce" description="Shell preview with the per-project tab bar." breadcrumbs={[{ label: "Portfolio", href: "/" }, { label: "Atlas Commerce" }]} />
      <ProjectTabs projectId="atlas" className="mb-5" />
      <Card>
        <CardBody className="text-[13px] text-muted">Page content goes here. The content column is capped at 1400px.</CardBody>
      </Card>
    </AppShell>
  );
}
