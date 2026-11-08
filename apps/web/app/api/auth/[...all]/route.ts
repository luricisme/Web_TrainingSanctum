/**
 * Better Auth's Next.js App Router catch-all handler.
 *
 * The one documented exception to "every Route Handler requires a session
 * cookie" (architecture spine, Consistency Conventions → Auth): this route
 * IS the auth surface (sign-up, sign-in, session, sign-out, ...), so it is
 * necessarily unauthenticated at the edge.
 */
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import type { ErrorEnvelope } from "@training-sanctum/domain";

const { GET, POST: betterAuthPost } = toNextJsHandler(auth);

export { GET };

// Registration (spec-1-2) and sign-in (spec-1-3) failures answer in the
// shared `{error:{code,message,fields?}}` envelope (AD-10) instead of Better
// Auth's own flat `{code,message}` body. Scoped to these paths so every
// other auth endpoint (session, ...) keeps Better Auth's native error shape.
const ENVELOPE_WRAPPED_PATHS = new Set([
  "/api/auth/sign-up/email",
  "/api/auth/sign-in/email",
]);

export async function POST(request: Request): Promise<Response> {
  const response = await betterAuthPost(request);

  if (response.ok || !ENVELOPE_WRAPPED_PATHS.has(new URL(request.url).pathname)) {
    return response;
  }

  const body = (await response.clone().json().catch(() => null)) as
    | { code?: string; message?: string }
    | null;

  // Bodies without a `code` (e.g. the rate limiter's 429, which returns only
  // `{message}` or non-JSON) are still wrapped, with a status-derived code.
  const code =
    body?.code ?? (response.status === 429 ? "RATE_LIMITED" : "AUTH_ERROR");
  const message =
    body?.message ??
    (body?.code
      ? body.code
      : response.status === 429
        ? "Too many requests. Please try again later."
        : "Authentication failed.");

  const envelope: ErrorEnvelope = {
    error: {
      code,
      message,
      ...(body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
        ? {
            fields: {
              email: body.message ?? "An account with this email already exists.",
            },
          }
        : {}),
    },
  };

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(envelope), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
