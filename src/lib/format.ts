/** Formatting helpers that are safe to import from client components. */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function isoDate(date: Date | string): string {
  return (typeof date === "string" ? new Date(date) : date).toISOString().slice(0, 10);
}

export function truncate(text: string | undefined | null, max: number): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function relativeTime(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return "never";
  const diff = now.getTime() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? "ago" : "from now";
  if (abs < 60_000) return "just now";
  if (abs < HOUR) return `${Math.round(abs / 60_000)}m ${suffix}`;
  if (abs < DAY) return `${Math.round(abs / HOUR)}h ${suffix}`;
  if (abs < 30 * DAY) return `${Math.round(abs / DAY)}d ${suffix}`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}
