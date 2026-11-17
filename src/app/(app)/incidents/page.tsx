import type { Metadata } from "next";
import { IncidentList } from "@/components/features/incidents/incident-list";
import { PageHeader } from "@/components/ui";
import { requireActor } from "@/lib/auth/current";
import { listIncidents } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Incidents" };

export default async function IncidentsPage() {
  const actor = await requireActor();
  const incidents = await listIncidents(actor);
  return (
    <>
      <PageHeader title="Incidents" description="Failed deployments and outages across your projects, with a first assessment and a proposed fix." />
      <IncidentList incidents={incidents} />
    </>
  );
}
