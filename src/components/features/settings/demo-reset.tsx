"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { resetDemoAction } from "@/app/actions";
import { Button, Callout, Card, CardBody, CardHeader, Dialog } from "@/components/ui";
import { useAction } from "./use-action";

export function DemoReset() {
  const { run, pending, router } = useAction();
  const [open, setOpen] = useState(false);

  async function reset() {
    const result = await run(() => resetDemoAction(), { success: "Demo data reset" });
    if (result.ok) {
      setOpen(false);
      router.push("/");
    }
  }

  return (
    <Card as="section" aria-labelledby="demo-heading">
      <CardHeader title={<span id="demo-heading">Demo data</span>} description="Administrators only." />
      <CardBody className="space-y-4">
        <Callout tone="warning" title="This replaces everything">
          Resetting deletes all projects, notes, reports, lessons, tokens and audit history you have created and restores the original demo data. It cannot be undone.
        </Callout>
        <Button variant="danger" icon={<RotateCcw size={14} />} onClick={() => setOpen(true)}>
          Reset demo data
        </Button>
      </CardBody>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="Reset all demo data?"
        description="Everything created since the demo was seeded will be lost for everyone who uses this deployment."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" loading={pending} onClick={reset}>
              Yes, reset everything
            </Button>
          </>
        }
      />
    </Card>
  );
}
