"use client";

import { ListPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { TicketDraftDialog } from "@/components/features/ticket-drafts";

/** Opens the ticket drafting dialog pre-filled with a message from the activity feed. Mounted only once opened. */
export function EventToTicketsButton({ projectId, text, team }: { projectId: string; text: string; team: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={<ListPlus size={14} aria-hidden />}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        Turn into tickets
      </Button>
      {mounted ? <TicketDraftDialog projectId={projectId} open={open} onClose={() => setOpen(false)} initialText={text} autoDraft team={team} onCreated={() => router.refresh()} /> : null}
    </>
  );
}
