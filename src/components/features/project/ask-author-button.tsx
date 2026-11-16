"use client";

import { MessageCircleQuestion } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, toast } from "@/components/ui";
import { EscalateDialog } from "@/components/features/escalate-dialog";

/** Opens the escalation dialog with a ready-made question about one change. The dialog is only mounted once opened. */
export function AskAuthorButton({ projectId, eventTitle, authorName }: { projectId: string; eventTitle: string; authorName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const question = `Can you walk me through the change "${eventTitle}"? What does it do, and is there anything I should know about it?`;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={<MessageCircleQuestion size={14} aria-hidden />}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        aria-label={`Ask ${authorName} about: ${eventTitle}`}
      >
        Ask the author
      </Button>
      {mounted ? (
        <EscalateDialog
          projectId={projectId}
          open={open}
          onClose={() => setOpen(false)}
          defaultQuestion={question}
          onSent={() => {
            setOpen(false);
            toast({ tone: "success", title: "Question sent", description: "You will see the answer in your inbox." });
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
