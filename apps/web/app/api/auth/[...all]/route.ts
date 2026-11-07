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

// Registration is the one endpoint spec-1-2's frozen Boundaries require to
// answer in the shared `{error:{code,message,fields}}` envelope (AD-10)
// instead of Better Auth's own flat `{code,message}` body. Scoped to this
// one path so every other auth endpoint (sign-in, session, ...) keeps
// Better Auth's native error shape, which its own client-side error
// handling (and future stories built on it) expect.
const ENVELOPE_WRAPPED_PATHS = new Set(["/api/auth/sign-up/email"]);

export async function POST(request: Request): Promise<Response> {
  const response = await betterAuthPost(request);

  if (response.ok || !ENVELOPE_WRAPPED_PATHS.has(new URL(request.url).pathname)) {
    return response;
  }

  const body = (await response.clone().json().catch(() => null)) as
    | { code?: string; message?: string }
    | null;

  if (!body?.code) {
    return response;
  }

  const envelope: ErrorEnvelope = {
    error: {
      code: body.code,
      message: body.message ?? body.code,
      ...(body.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
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

  return new Response(JSON.stringify(envelope), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
