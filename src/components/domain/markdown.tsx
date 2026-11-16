import type { ComponentProps, ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Citation } from "@/lib/types";
import { cn } from "../ui";

/** Matches `[E1]`, `[E1][E4]`, `[E1, E4]`, `[E1,T3][D2]`. */
const MARKER_RUN = /(?:\[[A-Z]\d+(?:\s*,\s*[A-Z]\d+)*\])+/g;
const REF = /[A-Z]\d+/g;

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, string>; hChildren?: unknown[] };
}

/** Remark plugin: turns reference markers in plain text into `<sup data-cite="E1">` elements. */
function remarkCitations() {
  return (tree: MdNode) => {
    const walk = (node: MdNode) => {
      if (!node.children || node.type === "link" || node.type === "linkReference" || node.type === "code" || node.type === "inlineCode") return;
      const next: MdNode[] = [];
      for (const child of node.children) {
        if (child.type !== "text" || !child.value || !MARKER_RUN.test(child.value)) {
          MARKER_RUN.lastIndex = 0;
          walk(child);
          next.push(child);
          continue;
        }
        MARKER_RUN.lastIndex = 0;
        const text = child.value;
        let last = 0;
        for (const m of text.matchAll(MARKER_RUN)) {
          const start = m.index ?? 0;
          if (start > last) next.push({ type: "text", value: text.slice(last, start) });
          for (const ref of m[0].match(REF) ?? []) {
            next.push({ type: "citation", data: { hName: "sup", hProperties: { "data-cite": ref }, hChildren: [{ type: "text", value: ref }] } });
          }
          last = start + m[0].length;
        }
        if (last < text.length) next.push({ type: "text", value: text.slice(last) });
      }
      node.children = next;
    };
    walk(tree);
  };
}

export interface MarkdownProps {
  content: string;
  /** Used to resolve inline `[E1]` markers to titles (tooltip). */
  citations?: Citation[];
  className?: string;
}

/**
 * Renders markdown (GFM) with `.prose-aid`. Raw HTML is not rendered. Links open in a new tab.
 * `<Markdown content={report.markdown} citations={report.citations} />`
 */
export function Markdown({ content, citations, className }: MarkdownProps) {
  const byRef = new Map((citations ?? []).map((c) => [c.ref, c]));

  const components: Components = {
    a({ href, children, node: _node, ...rest }: ComponentProps<"a"> & { node?: unknown }) {
      void _node;
      const internal = href?.startsWith("#");
      return (
        <a href={href} {...rest} {...(internal ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
          {children}
        </a>
      );
    },
    sup({ node: _node, children, ...rest }: ComponentProps<"sup"> & { node?: unknown; "data-cite"?: string }) {
      void _node;
      const ref = (rest as { "data-cite"?: string })["data-cite"];
      if (!ref) return <sup>{children as ReactNode}</sup>;
      const c = byRef.get(ref);
      return (
        <sup className="cite">
          <a
            href={`#cite-${ref}`}
            title={c ? `${ref} · ${c.title}` : ref}
            aria-label={c ? `Source ${ref}: ${c.title}` : `Source ${ref}`}
            className={cn(
              "inline-flex min-w-4 items-center justify-center rounded px-1 py-px font-mono text-[10px] font-semibold leading-none no-underline",
              c ? "bg-accent-soft text-accent hover:brightness-95" : "bg-surface-3 text-muted",
            )}
          >
            {ref}
          </a>
        </sup>
      );
    },
    table({ node: _node, children, ...rest }: ComponentProps<"table"> & { node?: unknown }) {
      void _node;
      return (
        <div className="prose-table">
          <table {...rest}>{children}</table>
        </div>
      );
    },
  };

  return (
    <div className={cn("prose-aid", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkCitations]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
