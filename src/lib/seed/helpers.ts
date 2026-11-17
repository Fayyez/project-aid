/**
 * Small deterministic helpers shared by the seed modules: a seeded PRNG and
 * time placement that mimics a team working Monday to Friday, 09:00-18:00 in
 * UTC+5 (Karachi / Lahore).
 */

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly gen: () => number;
  constructor(seed: number | string) {
    this.gen = mulberry32(typeof seed === "string" ? hashSeed(seed) : seed);
  }
  next(): number {
    return this.gen();
  }
  float(min: number, max: number): number {
    return min + this.gen() * (max - min);
  }
  /** Inclusive integer range. */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }
  chance(p: number): boolean {
    return this.gen() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.gen() * items.length)];
  }
  hex(length: number): string {
    let out = "";
    while (out.length < length) out += Math.floor(this.gen() * 16).toString(16);
    return out;
  }
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
/** Team working timezone offset from UTC, in hours. */
export const LOCAL_OFFSET_H = 5;

/**
 * When something happened, relative to the seed time.
 *  h: exactly this many hours ago (never snapped)
 *  d: about this many days ago, moved to a weekday working hour
 *  y: yesterday (UTC date) at this UTC hour, e.g. 7.5 = 07:30 UTC
 */
export type When = { h: number } | { d: number } | { y: number };

export const H = (hours: number): When => ({ h: hours });
export const D = (days: number): When => ({ d: days });
export const Y = (utcHour: number): When => ({ y: utcHour });

/** Moves a timestamp to the nearest plausible working time (weekday, 09:00-18:00 local). */
export function snapWork(t: Date, rng: Rng): Date {
  let local = t.getTime() + LOCAL_OFFSET_H * HOUR_MS;
  const dow = new Date(local).getUTCDay();
  if (dow === 0) local -= 2 * DAY_MS;
  else if (dow === 6) local -= DAY_MS;
  const hour = new Date(local).getUTCHours() + new Date(local).getUTCMinutes() / 60;
  if (hour < 9 || hour >= 18) {
    const midnight = Math.floor(local / DAY_MS) * DAY_MS;
    local = midnight + Math.round(rng.float(9, 17.6) * 60) * 60_000;
  }
  return new Date(local - LOCAL_OFFSET_H * HOUR_MS);
}

export function resolveWhen(now: Date, when: When, rng: Rng): Date {
  if ("h" in when) return new Date(now.getTime() - when.h * HOUR_MS);
  if ("y" in when) {
    const midnight = Math.floor(now.getTime() / DAY_MS) * DAY_MS;
    return new Date(midnight - DAY_MS + when.y * HOUR_MS);
  }
  let t = snapWork(new Date(now.getTime() - when.d * DAY_MS), rng);
  for (let i = 0; i < 6 && t.getTime() > now.getTime() - 2 * HOUR_MS; i++) {
    t = snapWork(new Date(t.getTime() - DAY_MS), rng);
  }
  return t;
}

/** Start of the UTC day (0..) as YYYY-MM-DD, `back` days before `now`. */
export function utcDate(now: Date, back: number): string {
  return new Date(now.getTime() - back * DAY_MS).toISOString().slice(0, 10);
}

export const iso = (d: Date): string => d.toISOString();

export function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

export function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

export function lcFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
