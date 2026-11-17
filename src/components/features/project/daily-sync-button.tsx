"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, toast } from "@/components/ui";
import { runDailySyncAction } from "@/app/actions";

export function DailySyncButton({ projectId, hasDigest }: { projectId: string; hasDigest: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const result = await runDailySyncAction(projectId);
      if (!result.ok) {
        toast({ tone: "danger", title: result.error });
        return;
      }
      toast({ tone: "success", title: "Today's sync is ready" });
      router.replace(`/projects/${projectId}/daily`);
      router.refresh();
    } catch {
      toast({ tone: "danger", title: "The daily sync could not be generated. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button variant="primary" loading={busy} onClick={run} icon={busy ? undefined : <Sparkles size={14} aria-hidden />}>
        {busy ? "Generating…" : hasDigest ? "Generate today's sync" : "Generate the first sync"}
      </Button>
      {busy ? (
        <p role="status" className="text-xs text-muted">
          Reading recent activity, writing the summary and checking it against the sources. This can take up to a minute.
        </p>
      ) : null}
    </div>
  );
}
