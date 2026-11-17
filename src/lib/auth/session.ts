import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";

export const SESSION_COOKIE = "pa_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

interface SessionPayload {
  uid: string;
  exp: number;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** Creates a signed, expiring session token: base64url(payload).signature */
export function createSessionToken(userId: string, now: Date = new Date()): string | null {
  const secret = config.authSecret;
  if (!secret) return null;
  const payload: SessionPayload = { uid: userId, exp: Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** Returns the user id when the token is authentic and unexpired. */
export function verifySessionToken(token: string | undefined, now: Date = new Date()): string | null {
  const secret = config.authSecret;
  if (!secret || !token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < now.getTime()) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
