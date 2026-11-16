import { notFound } from "next/navigation";
import { NotesManager } from "@/components/features/notes/notes-manager";
import { AccessError } from "@/lib/auth/access";
import { requireActor } from "@/lib/auth/current";
import { listNotes } from "@/lib/services/queries";

export const metadata = { title: "Notes" };

export default async function NotesPage({ params }: PageProps<"/projects/[id]/notes">) {
  const { id } = await params;
  const actor = await requireActor();
  const data = await listNotes(actor, id).catch((error: unknown) => {
    if (error instanceof AccessError) return null;
    throw error;
  });
  if (!data) notFound();
  const notes = data.notes.map((note) => ({ id: note.id, title: note.title, body: note.body, pinned: note.pinned, shareWithAssistant: note.shareWithAssistant, updatedAt: note.updatedAt }));
  return <NotesManager projectId={data.project.id} notes={notes} />;
}
