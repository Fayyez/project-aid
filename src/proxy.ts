import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate: requests without a session cookie are sent to the sign-in
 * page before any rendering happens. The cookie's signature and the caller's
 * project access are verified again, server-side, on every page and action.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("pa_session")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Public: sign-in, the tokenised reply page, API routes (they authenticate themselves) and static assets.
  matcher: ["/((?!login|reply|api|dev|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
