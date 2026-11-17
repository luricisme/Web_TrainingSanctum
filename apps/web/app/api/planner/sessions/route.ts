import { prisma } from "@training-sanctum/db";
import {
  parsePomodoroSettings,
  planNextSession,
  startSessionSchema,
} from "@training-sanctum/domain";
import { requirePlannerSession, toSessionSummary } from "@/lib/planner-sessions";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { HttpError, fail, ok, readJson, validationFailure } from "@/lib/api-response";
import { logOperation } from "@/lib/log";

const RUNNING_MESSAGE = "A session is already running.";

/** spec-9-2: starts a session; the server sets `startedAt` and the planned length. */
export async function POST(request: Request): Promise<Response> {
  const result = await requirePlannerSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const body = await readJson(request);
  if (body === null) return fail(400, "INVALID_JSON", "Request body must be JSON.");
  const parsed = startSessionSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);
  const { taskId, kind, overrun } = parsed.data;

  try {
    const row = await prisma.$transaction(async (tx) => {
      // Serialize this user's starts so two concurrent requests leave one row.
      await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { pomodoroSettings: true },
      });
      const task = await tx.task.findFirst({
        where: { id: taskId, userId },
        include: {
          sessions: { select: { kind: true, actualMinutes: true, overrun: true } },
        },
      });
      if (!task) throw new HttpError(404, "NOT_FOUND", "Task not found.");

      const running = await tx.pomodoroSession.findFirst({
        where: { userId, endedAt: null },
        select: { id: true },
      });
      if (running) throw new HttpError(409, "SESSION_RUNNING", RUNNING_MESSAGE);

      const plan = planNextSession(
        { task, kind, overrun, sessions: task.sessions },
        parsePomodoroSettings(user.pomodoroSettings)
      );
      if (plan.refusal !== undefined) throw new HttpError(409, "SESSION_REFUSED", plan.refusal);

      return tx.pomodoroSession.create({
        data: {
          userId,
          taskId,
          kind,
          plannedMinutes: plan.plannedMinutes,
          startedAt: new Date(),
          overrun,
        },
      });
    });
    logOperation("planner.session.start", { sessionId: row.id, taskId, kind, overrun });
    return ok(toSessionSummary(row), 201);
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    if (isUniqueViolation(error)) return fail(409, "SESSION_RUNNING", RUNNING_MESSAGE);
    throw error;
  }
}
