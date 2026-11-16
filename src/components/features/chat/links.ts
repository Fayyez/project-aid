import type { Citation } from "@/lib/types";

/** Where a citation leads in the portal, when it has a page. */
export function citationHref(c: Citation, fallbackProjectId?: string): string | undefined {
  const pid = c.projectId ?? fallbackProjectId;
  switch (c.type) {
    case "event":
      return pid ? `/projects/${pid}/activity?q=${encodeURIComponent(c.title)}` : undefined;
    case "ticket": {
      if (!pid) return undefined;
      const key = /[A-Z][A-Z0-9]+-\d+/.exec(c.title)?.[0] ?? c.title;
      return `/projects/${pid}/tickets?q=${encodeURIComponent(key)}`;
    }
    case "incident":
      return pid ? `/projects/${pid}/incidents/${c.id}` : undefined;
    case "thread":
      return `/inbox/${c.id}`;
    case "report":
      return pid ? `/projects/${pid}/reports/${c.id}` : undefined;
    case "digest":
      return pid ? `/projects/${pid}/daily` : undefined;
    default:
      return undefined;
  }
}
