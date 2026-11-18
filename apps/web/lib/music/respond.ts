import { fail } from "@/lib/api-response";
import { logOperation } from "@/lib/log";

export function musicJson<T>(data: T): Response {
  return Response.json(
    { data },
    { headers: { "Cache-Control": "private, max-age=3600" } }
  );
}

/** Any music failure degrades to 502 in the error envelope; never thrown. */
export function musicFailure(operation: string, error: unknown): Response {
  logOperation(operation, {
    outcome: "failed",
    reason: error instanceof Error ? error.message : "unknown",
  });
  return fail(502, "MUSIC_UNAVAILABLE", "Music is unavailable right now.");
}
