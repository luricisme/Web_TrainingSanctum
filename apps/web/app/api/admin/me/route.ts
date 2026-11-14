import { ok } from "@/lib/api-response";
import { requireAdmin } from "@/lib/session";

/** Story 7.1: the one admin route; proves `requireAdmin()`. */
export async function GET(request: Request) {
  const { session, response } = await requireAdmin(request);
  if (response) return response;
  return ok({
    email: session.user.email,
    role: (session.user as { role?: string }).role ?? "user",
  });
}
