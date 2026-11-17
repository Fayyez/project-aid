"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, toast } from "@/components/ui";
import { syncNowAction } from "@/app/actions";

/** Pulls new work from every connected source of the project and tells the director what arrived. */
export function SyncButton({ projectId, variant = "secondary" }: { projectId: string; variant?: "secondary" | "primary" | "ghost" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const result = await syncNowAction(projectId);
      if (!result.ok) {
        toast({ tone: "danger", title: result.error });
        return;
      }
      const { sources, ingested, incidents, clarifications } = result.data;
      const lines = sources.map((s) => {
        if (s.status === "stubbed") return `${s.name}: not connected${s.detail ? ` (${s.detail})` : ""}`;
        if (s.status === "error") return `${s.name}: failed${s.detail ? ` (${s.detail})` : ""}`;
        return `${s.name}: ${s.items} new item${s.items === 1 ? "" : "s"}`;
      });
      const extra = [incidents > 0 ? `${incidents} incident${incidents === 1 ? "" : "s"} opened` : "", clarifications > 0 ? `${clarifications} clarifying question${clarifications === 1 ? "" : "s"} sent` : ""].filter(Boolean);
      toast({
        tone: sources.some((s) => s.status === "error") ? "warning" : "success",
        title: ingested === 0 ? "Sync finished: nothing new" : `Sync finished: ${ingested} new item${ingested === 1 ? "" : "s"}`,
        description: [...lines, ...extra].join(". ") || "No sources are connected for this project.",
        duration: 9000,
      });
      router.refresh();
    } catch {
      toast({ tone: "danger", title: "The sync could not be completed. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} size="md" loading={busy} onClick={run} icon={busy ? undefined : <RefreshCw size={14} aria-hidden />} title="Pull the latest work from connected sources">
      {busy ? "Syncing…" : "Sync now"}
    </Button>
  );
}
