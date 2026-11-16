import { getStore } from "@/lib/store";
import type { Actor, AuditEntry } from "@/lib/types";
import { newId, nowIso, truncate } from "@/lib/util";

/** Appends to the audit trail. Failures are swallowed: auditing must never break a request. */
export async function audit(actor: Actor | { id: string }, action: string, extra: { projectId?: string; target?: string; detail?: string } = {}): Promise<void> {
  try {
    const store = await getStore();
    const entry: AuditEntry = {
      id: newId("aud"),
      at: nowIso(),
      actorId: actor.id,
      action,
      projectId: extra.projectId,
      target: extra.target,
      detail: extra.detail ? truncate(extra.detail, 400) : undefined,
    };
    await store.put("audit", entry);
  } catch {
    /* ignore */
  }
}

// --- fixed-window rate limiter -------------------------------------------------
// Per-instance memory is enough to stop accidental loops and casual abuse of the
// model budget. For hard guarantees across serverless instances, back this with Redis.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): { ok: boolean; remaining: number; retryAfterSeconds: number } {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}
