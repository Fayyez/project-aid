import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IncidentList } from "@/components/features/incidents/incident-list";
import { AccessError } from "@/lib/auth/access";
import { requireActor } from "@/lib/auth/current";
import { listIncidents } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Incidents" };

export default async function ProjectIncidentsPage({ params }: PageProps<"/projects/[id]/incidents">) {
  const actor = await requireActor();
  const { id } = await params;
  try {
    const incidents = await listIncidents(actor, id);
    return <IncidentList incidents={incidents} showProject={false} />;
  } catch (error) {
    if (error instanceof AccessError) notFound();
    throw error;
  }
}
