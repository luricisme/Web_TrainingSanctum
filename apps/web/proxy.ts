import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic gate (spec-1-5): cookie-less requests go to /login early. The
 * shell layout does the real session validation, so a stale cookie that gets
 * past here still ends on /login. `/api/**` is excluded: Route Handlers answer
 * 401 through `requireSession`.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!(?:api|_next|login|register)(?:/|$)|favicon\\.ico$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|css|js|map)$).*)",
  ],
};
