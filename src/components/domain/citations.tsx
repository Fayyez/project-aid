import { ExternalLink } from "lucide-react";
import type { Citation } from "@/lib/types";
import { cn } from "../ui";

export interface CitationChipProps {
  citation: Citation;
  /** Link target. Defaults to `citation.url` (opens in a new tab) when present. */
  href?: string;
  /** DOM id, e.g. `cite-E1` so inline markers can jump to it. */
  id?: string;
  className?: string;
}

/** `[E1] Title` pill. Inline markers in <Markdown> link to `#cite-<ref>`. */
export function CitationChip({ citation, href, id, className }: CitationChipProps) {
  const target = href ?? citation.url;
  const external = !!target && /^https?:/i.test(target);
  const body = (
    <>
      <span className="font-mono text-[11px] font-semibold text-accent">{citation.ref}</span>
      <span className="max-w-56 truncate text-fg">{citation.title}</span>
      {external ? <ExternalLink size={11} aria-hidden className="shrink-0 text-subtle" /> : null}
    </>
  );
  const cls = cn("inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 text-xs", target && "hover:border-line-strong hover:bg-surface-3", className);
  const title = `${citation.type}: ${citation.title}`;
  if (target) {
    return (
      <a id={id} href={target} title={title} className={cls} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {body}
      </a>
    );
  }
  return (
    <span id={id} title={title} className={cls}>
      {body}
    </span>
  );
}

export interface CitationListProps {
  citations: Citation[];
  /** Build a link for each citation (e.g. to an event page). */
  hrefFor?: (c: Citation) => string | undefined;
  className?: string;
}

/** Wrapping list of chips. Each item gets `id="cite-<ref>"` as the target of inline markers. */
export function CitationList({ citations, hrefFor, className }: CitationListProps) {
  if (citations.length === 0) return null;
  return (
    <ul aria-label="Sources" className={cn("flex flex-wrap gap-1.5", className)}>
      {citations.map((c) => (
        <li key={c.ref} className="max-w-full scroll-mt-20 target:[&>*]:border-accent target:[&>*]:bg-accent-soft">
          <CitationChip citation={c} id={`cite-${c.ref}`} href={hrefFor?.(c)} />
        </li>
      ))}
    </ul>
  );
}
