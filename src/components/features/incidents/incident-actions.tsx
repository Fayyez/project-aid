"use client";

import { useRouter } from "next/navigation";
import { Check, Info, X } from "lucide-react";
import { useState } from "react";
import { decideFixAction, resolveIncidentAction } from "@/app/actions";
import { Button, Field, Textarea, toast } from "@/components/ui";

export function FixDecision({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setBusy(decision);
    const result = await decideFixAction(incidentId, decision, comment.trim() || undefined);
    setBusy(null);
    if (!result.ok) {
      toast({ tone: "danger", title: result.error });
      return;
    }
    toast({ tone: "success", title: decision === "approved" ? "Fix approved" : "Fix rejected" });
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-lg border border-accent-line bg-accent-soft/40 p-4">
      <h3 className="text-sm font-semibold">Your decision</h3>
      <p className="flex items-start gap-2 text-[13px] text-muted">
        <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
        Approving records your decision and hands the plan to the owner. Nothing is merged or deployed automatically.
      </p>
      <Field label="Comment (optional)">
        <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything the owner should know?" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<Check size={14} />} loading={busy === "approved"} disabled={busy !== null} onClick={() => void decide("approved")}>
          Approve fix
        </Button>
        <Button variant="secondary" icon={<X size={14} />} loading={busy === "rejected"} disabled={busy !== null} onClick={() => void decide("rejected")}>
          Reject
        </Button>
      </div>
    </div>
  );
}

export function ResolveForm({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    const result = await resolveIncidentAction(incidentId, note.trim() || undefined);
    setBusy(false);
    if (!result.ok) {
      toast({ tone: "danger", title: result.error });
      return;
    }
    toast({ tone: "success", title: "Incident resolved", description: result.data.reportId ? "An incident report was written." : undefined });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <Field label="Resolution note (optional)" hint="Marking this resolved also writes the incident report. It can take a few seconds.">
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What fixed it, and who confirmed?" />
      </Field>
      <Button variant="secondary" icon={<Check size={14} />} loading={busy} onClick={() => void resolve()}>
        Mark resolved
      </Button>
    </div>
  );
}
