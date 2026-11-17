import { prisma } from "@training-sanctum/db";
import type { SessionSummary } from "@training-sanctum/domain";
import { requirePlannerSession, toSessionSummary } from "@/lib/planner-sessions";
import { ok } from "@/lib/api-response";

/** spec-9-2: the user's running session, or `{ data: null }`. */
export async function GET(request: Request): Promise<Response> {
  const result = await requirePlannerSession(request);
  if (result.response) return result.response;

  const row = await prisma.pomodoroSession.findFirst({
    where: { userId: result.session.user.id, endedAt: null },
  });
  return ok<SessionSummary | null>(row ? toSessionSummary(row) : null);
}
