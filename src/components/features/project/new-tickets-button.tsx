"use client";

import { MessageSquarePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { TicketDraftDialog } from "@/components/features/ticket-drafts";

export function NewTicketsButton({ projectId, team }: { projectId: string; team: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" icon={<MessageSquarePlus size={14} aria-hidden />} onClick={() => setOpen(true)}>
        Turn a message into tickets
      </Button>
      <TicketDraftDialog projectId={projectId} open={open} onClose={() => setOpen(false)} team={team} onCreated={() => router.refresh()} />
    </>
  );
}
