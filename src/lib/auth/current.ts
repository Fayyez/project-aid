import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStore } from "@/lib/store";
import type { Actor } from "@/lib/types";
import { AccessError, actorFromApiToken, actorFromPerson, bearerFromHeader } from "./access";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/** The signed-in user for the current request, or null. */
export async function getCurrentActor(): Promise<Actor | null> {
  const jar = await cookies();
  const userId = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const store = await getStore();
  const person = await store.get("people", userId);
  // Team members without a director role never get portal access.
  if (!person || person.role === "member") return null;
  return actorFromPerson(person, "session");
}

/** For pages: redirects to the sign-in page when there is no session. */
export async function requireActor(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  return actor;
}

/** For server actions and API routes: throws instead of redirecting. */
export async function requireActorOrThrow(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) throw new AccessError("Sign in required", 401);
  return actor;
}

/** For API routes that accept either a browser session or a personal access token. */
export async function actorFromRequest(request: Request): Promise<Actor | null> {
  const bearer = bearerFromHeader(request.headers.get("authorization"));
  if (bearer) return actorFromApiToken(bearer);
  return getCurrentActor();
}
