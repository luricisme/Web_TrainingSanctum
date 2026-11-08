/**
 * Session guard for Route Handlers (spec-1-3, architecture spine "Auth").
 *
 * Every non-auth Route Handler calls this first. Returns `{ session }` for a
 * valid session cookie, or `{ response }` — a `401` in the standard error
 * envelope — which the handler returns as-is.
 */
import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { ErrorEnvelope } from "@training-sanctum/domain";

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export type SessionResult =
  | { session: Session; response?: undefined }
  | { session?: undefined; response: Response };

export async function requireSession(request: Request): Promise<SessionResult> {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    const body: ErrorEnvelope = {
      error: { code: "UNAUTHENTICATED", message: "Authentication required." },
    };
    return { response: Response.json(body, { status: 401 }) };
  }

  return { session };
}

/**
 * Server-component session lookup (spec-1-5). Cached per request so the shell
 * layout and the auth-page layouts share one real `auth.api.getSession` check.
 */
export const getServerSession = cache(async () =>
  auth.api.getSession({ headers: await headers() })
);
