"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, toast } from "@/components/ui";
import { uploadDocumentAction } from "@/app/actions";

export function UploadDocument({ projectId }: { projectId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) {
      toast({ tone: "warning", title: "Choose a file first." });
      return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      data.set("file", file);
      const result = await uploadDocumentAction(projectId, data);
      if (!result.ok) {
        toast({ tone: "danger", title: result.error });
        return;
      }
      toast({ tone: "success", title: "Document added", description: `${result.data.events} item${result.data.events === 1 ? "" : "s"} added to the activity feed.` });
      if (input.current) input.current.value = "";
      setFileName("");
      router.refresh();
    } catch {
      toast({ tone: "danger", title: "The document could not be uploaded. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium shadow-card hover:bg-surface-2 focus-within:ring-2 focus-within:ring-ring/40">
        <Upload size={14} aria-hidden />
        <span>Upload a document</span>
        <input ref={input} type="file" name="file" accept=".docx,.xlsx,.csv,.md,.txt" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
      </label>
      {fileName ? (
        <>
          <span className="max-w-48 truncate text-[13px] text-muted" title={fileName}>
            {fileName}
          </span>
          <Button type="submit" variant="primary" size="md" loading={busy}>
            {busy ? "Reading…" : "Add to activity"}
          </Button>
        </>
      ) : (
        <span className="text-xs text-muted">Word, Excel, CSV, Markdown or text, up to 5 MB.</span>
      )}
    </form>
  );
}
