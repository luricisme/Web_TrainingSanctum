import { prisma, type Prisma } from "@training-sanctum/db";
import {
  type SessionSummary,
  applyXpDelta,
  levelForXp,
  plannerXp,
} from "@training-sanctum/domain";
import { requireSession, type SessionResult } from "@/lib/session";
import { HttpError } from "@/lib/api-response";
import { logOperation } from "@/lib/log";

type SessionRow = Prisma.PomodoroSessionGetPayload<object>;

export function toSessionSummary(row: SessionRow): SessionSummary {
  return {
    id: row.id,
    taskId: row.taskId,
    kind: row.kind,
    plannedMinutes: row.plannedMinutes,
    actualMinutes: row.actualMinutes,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    overrun: row.overrun,
  };
}

/**
 * Ends a session inside a transaction (spec-9-2). Locks the Task row then the
 * user row (same order as `done`), re-reads the session so a racing end is a
 * no-op, and for a FOCUS session with >= 1 actual minute writes one
 * FOCUS_SESSION XpEvent, the cached `cultivationXp` and `Task.loggedMinutes`.
 * `endedAt` is supplied by the caller (route: now; sweep: the planned end);
 * `completed` counts the full planned length.
 */
export async function endSessionTx(
  tx: Prisma.TransactionClient,
  userId: string,
  sessionId: string,
  endedAt: Date,
  options: { completed: boolean }
): Promise<{ session: SessionRow; xp: number; changed: boolean }> {
  const first = await tx.pomodoroSession.findFirst({ where: { id: sessionId, userId } });
  if (!first) throw new HttpError(404, "NOT_FOUND", "Session not found.");
  await tx.$queryRaw`SELECT id FROM "tasks" WHERE id = ${first.taskId} AND "userId" = ${userId} FOR UPDATE`;
  const session = await tx.pomodoroSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw new HttpError(404, "NOT_FOUND", "Session not found.");
  if (session.endedAt !== null) return { session, xp: 0, changed: false };

  const plannedMs = session.plannedMinutes * 60000;
  const elapsedMs = Math.max(endedAt.getTime() - session.startedAt.getTime(), 0);
  const actualMinutes = options.completed
    ? session.plannedMinutes
    : Math.floor(Math.min(elapsedMs, plannedMs) / 60000);

  const updated = await tx.pomodoroSession.update({
    where: { id: sessionId },
    data: { endedAt, actualMinutes },
  });

  let xp = 0;
  if (session.kind === "FOCUS" && actualMinutes >= 1) {
    const task = await tx.task.findUniqueOrThrow({
      where: { id: session.taskId },
      select: { localDay: true },
    });
    await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { cultivationXp: true },
    });
    xp = plannerXp(levelForXp(current.cultivationXp).bo, "FOCUS_SESSION");
    await tx.xpEvent.create({
      data: {
        userId,
        localDay: task.localDay,
        questKind: null,
        delta: xp,
        reason: "FOCUS_SESSION",
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: { cultivationXp: applyXpDelta(current.cultivationXp, xp) },
    });
    await tx.task.update({
      where: { id: session.taskId },
      data: { loggedMinutes: { increment: actualMinutes } },
    });
  }
  return { session: updated, xp, changed: true };
}

/**
 * Closes the user's running session when its planned end has passed, at that
 * planned end (assumption: a session found expired counts as completed).
 */
export async function sweepExpiredSession(userId: string, now = new Date()): Promise<void> {
  const running = await prisma.pomodoroSession.findFirst({
    where: { userId, endedAt: null },
  });
  if (!running) return;
  const plannedEnd = new Date(running.startedAt.getTime() + running.plannedMinutes * 60000);
  if (plannedEnd.getTime() > now.getTime()) return;

  try {
    const { xp, changed } = await prisma.$transaction((tx) =>
      endSessionTx(tx, userId, running.id, plannedEnd, { completed: true })
    );
    if (changed) {
      logOperation("planner.session.expire", { sessionId: running.id, xp });
    }
  } catch (error) {
    // The session or its Task was deleted since the read: nothing to close.
    if (error instanceof HttpError && error.status === 404) return;
    throw error;
  }
}

/** `requireSession` plus the expired-session sweep, for every `/api/planner/**` route. */
export async function requirePlannerSession(request: Request): Promise<SessionResult> {
  const result = await requireSession(request);
  if (result.response) return result;
  await sweepExpiredSession(result.session.user.id);
  return result;
}
