"use client";

import { Download, Printer } from "lucide-react";
import { Button, CopyButton, toast } from "@/components/ui";

function fileName(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${slug || "report"}.md`;
}

export function ReportActions({ title, markdown }: { title: string; markdown: string }) {
  function download() {
    try {
      const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName(title);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ tone: "danger", title: "Could not download the file." });
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <span className="inline-flex h-7 items-center rounded-md border border-line-strong bg-surface text-fg shadow-card hover:bg-surface-2">
        <CopyButton value={markdown} label="Copy markdown" className="h-7 text-[13px] text-fg">
          Copy markdown
        </CopyButton>
      </span>
      <Button size="sm" icon={<Download size={14} />} onClick={download}>
        Download .md
      </Button>
      <Button size="sm" variant="ghost" icon={<Printer size={14} />} onClick={() => window.print()}>
        Print
      </Button>
    </div>
  );
}
