import { prisma } from "@training-sanctum/db";
import { endSessionTx, requirePlannerSession, toSessionSummary } from "@/lib/planner-sessions";
import { HttpError, ok } from "@/lib/api-response";
import { logOperation } from "@/lib/log";

type Context = { params: Promise<{ id: string }> };

/** spec-9-2: ends a session now. Ending an ended session returns it unchanged. */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  const result = await requirePlannerSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  try {
    const { session, xp, changed } = await prisma.$transaction((tx) =>
      endSessionTx(tx, userId, id, new Date(), { completed: false })
    );
    if (changed) {
      logOperation("planner.session.end", {
        sessionId: id,
        actualMinutes: session.actualMinutes,
        xp,
      });
    }
    return ok(toSessionSummary(session));
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    throw error;
  }
}
