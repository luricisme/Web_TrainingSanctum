import { prisma } from "@training-sanctum/db";
import { formatLocalTime, toLocalDate } from "@training-sanctum/domain";
import { requirePlannerSession } from "@/lib/planner-sessions";
import { logOperation } from "@/lib/log";
import { ok } from "@/lib/api-response";
import { overdueWhere, startAtFor, userTimezone } from "@/lib/planner-tasks";

/**
 * spec-8-4: the one explicit rollover. Every open Task on a past day moves to
 * the user's today in one transaction; a start time keeps its time of day;
 * estimate and logged minutes are untouched.
 */
export async function PATCH(request: Request): Promise<Response> {
  const result = await requirePlannerSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const tz = await userTimezone(userId);
  const todayDate = toLocalDate(new Date(), tz);
  const today = todayDate.toISOString().slice(0, 10);

  const moved = await prisma.$transaction(async (tx) => {
    const where = overdueWhere(userId, todayDate);
    const timed = await tx.task.findMany({
      where: { ...where, startAt: { not: null } },
      select: { id: true, startAt: true },
    });
    // Untimed Tasks move in one statement; timed ones each need their own start instant.
    // Every write re-applies the overdue filter, so a Task completed or deleted meanwhile is skipped.
    let count = (
      await tx.task.updateMany({ where: { ...where, startAt: null }, data: { localDay: todayDate } })
    ).count;
    for (const row of timed) {
      const { count: n } = await tx.task.updateMany({
        where: { ...where, id: row.id },
        data: {
          localDay: todayDate,
          startAt: startAtFor(today, formatLocalTime(row.startAt!, tz), tz),
        },
      });
      count += n;
    }
    return count;
  }, { timeout: 30_000 });
  logOperation("planner.task.move-overdue", { count: moved });
  return ok({ moved });
}
