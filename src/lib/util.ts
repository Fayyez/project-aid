import { randomBytes, createHash } from "node:crypto";

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export { isoDate, truncate, relativeTime, formatDate, formatDateTime, shortDate } from "./format";

export function nowIso(): string {
  return new Date().toISOString();
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

export function daysAgo(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - days * DAY);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function byNewest<T>(pick: (item: T) => string | undefined) {
  return (a: T, b: T) => (pick(b) ?? "").localeCompare(pick(a) ?? "");
}

export function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of items) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Run async work over items with a fixed number of concurrent workers. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have how i in is it its of on or our that the their this to was we what when where which who why will with you your about any can did do does had into not than then there these they were would should could been being over under also just".split(
    " ",
  ),
);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9_\-.#]*/g) ?? []).filter((t) => t.length > 1 && !STOPWORDS.has(t));
}
