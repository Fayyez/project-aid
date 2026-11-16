import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** GitHub: X-Hub-Signature-256 = "sha256=" + hex(HMAC-SHA256(secret, body)). */
export function verifyGithubSignature(secret: string | undefined, body: string, header: string | null): boolean {
  if (!secret || !header) return false;
  return safeEqual(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`, header);
}

/** Slack: X-Slack-Signature = "v0=" + hex(HMAC-SHA256(secret, "v0:" + timestamp + ":" + body)), within five minutes. */
export function verifySlackSignature(secret: string | undefined, body: string, timestamp: string | null, signature: string | null, now: number = Date.now()): boolean {
  if (!secret || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > 300) return false;
  return safeEqual(`v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`, signature);
}

/** Teams outgoing webhook: Authorization = "HMAC " + base64(HMAC-SHA256(base64decode(secret), body)). */
export function verifyTeamsSignature(secret: string | undefined, body: string, header: string | null): boolean {
  if (!secret || !header) return false;
  const expected = `HMAC ${createHmac("sha256", Buffer.from(secret, "base64")).update(Buffer.from(body, "utf8")).digest("base64")}`;
  return safeEqual(expected, header.trim());
}

/** Scheduled jobs: Authorization = "Bearer <CRON_SECRET>". */
export function verifyBearer(secret: string | undefined, header: string | null): boolean {
  if (!secret || !header) return false;
  return safeEqual(`Bearer ${secret}`, header.trim());
}
