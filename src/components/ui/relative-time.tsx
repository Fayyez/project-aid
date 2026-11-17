"use client";

import { useSyncExternalStore } from "react";
import { formatDateTime, relativeTime } from "@/lib/format";

const noop = () => () => {};

function subscribeMinute(cb: () => void) {
  const t = setInterval(cb, 60_000);
  return () => clearInterval(t);
}
const minute = () => Math.floor(Date.now() / 60_000);

export interface RelativeTimeProps {
  /** ISO timestamp. */
  iso: string | undefined;
  className?: string;
  /** Text when `iso` is missing. Defaults to "never". */
  empty?: string;
}

/**
 * Renders the absolute UTC date on the server and first client render (no hydration mismatch),
 * then switches to "5m ago" after mount. The title attribute always holds the full timestamp.
 */
export function RelativeTime({ iso, className, empty }: RelativeTimeProps) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  useSyncExternalStore(subscribeMinute, minute, () => 0);
  if (!iso) return <span className={className}>{empty ?? "never"}</span>;
  return (
    <time dateTime={iso} title={formatDateTime(iso)} suppressHydrationWarning className={className}>
      {mounted ? relativeTime(iso) : formatDateTime(iso)}
    </time>
  );
}
