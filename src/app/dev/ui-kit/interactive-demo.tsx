"use client";

import { Download, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Dialog, Drawer, DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, Field, Input, SegmentedControl, Textarea, useToast } from "@/components/ui";

/** Client-only demos: anything that needs state or event handlers. */
export function InteractiveDemo() {
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [range, setRange] = useState("7d");
  const { toast } = useToast();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => setDialog(true)}>
          Open dialog
        </Button>
        <Button variant="secondary" onClick={() => setDrawer(true)}>
          Open drawer
        </Button>
        <DropdownMenu label="Row actions" trigger={<MoreHorizontal size={16} />} triggerClassName="border border-line-strong bg-surface size-9 justify-center px-0">
          <DropdownMenuItem icon={<Pencil />} onSelect={() => toast({ title: "Edit clicked" })}>
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem icon={<Download />} href="/dev/ui-kit">
            Export (link)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<Trash2 />} danger onSelect={() => toast({ title: "Deleted", tone: "danger" })}>
            Delete
          </DropdownMenuItem>
        </DropdownMenu>
        <DropdownMenu label="Menu with chevron" trigger="Project actions" chevron align="start" triggerClassName="border border-line-strong bg-surface shadow-card">
          <DropdownMenuItem onSelect={() => toast({ title: "Report queued", tone: "success" })}>Generate report</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => toast({ title: "Digest running", tone: "info" })}>Run daily sync</DropdownMenuItem>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Date range" value={range} onChange={setRange} options={[{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }]} />
        <span className="text-[13px] text-muted">
          Selected: <code className="font-mono text-xs">{range}</code>
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => toast({ title: "Saved", description: "Project settings updated.", tone: "success" })}>
          Success toast
        </Button>
        <Button size="sm" onClick={() => toast({ title: "Sync is slow", description: "GitHub rate limit reached.", tone: "warning" })}>
          Warning toast
        </Button>
        <Button size="sm" onClick={() => toast({ title: "Could not reach Jira", tone: "danger" })}>
          Danger toast
        </Button>
        <Button size="sm" onClick={() => toast("Copied to clipboard")}>
          Info toast
        </Button>
      </div>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Create ticket"
        description="Turn this message into a ticket on ATLAS."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setDialog(false);
                toast({ title: "Ticket created", description: "ATLAS-142", tone: "success" });
              }}
            >
              Create ticket
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" required>
            <Input defaultValue="Checkout totals wrong with discount codes" />
          </Field>
          <Field label="Description" hint="Markdown supported.">
            <Textarea defaultValue="Reported by the client on Teams: totals drop below zero when a 100% code is stacked." />
          </Field>
        </div>
      </Dialog>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="ATLAS-128" description="Fix flaky payment webhook retries" footer={<Button onClick={() => setDrawer(false)}>Close</Button>}>
        <div className="space-y-3 p-5 text-[13px] text-muted">
          <p>Slide-over for detail views that should not lose the list behind them.</p>
          <p>It uses the native dialog element, so focus is trapped and Esc closes it.</p>
        </div>
      </Drawer>
    </div>
  );
}
