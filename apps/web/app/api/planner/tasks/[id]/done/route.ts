import { prisma } from "@training-sanctum/db";
import { applyXpDelta, levelForXp, plannerXp, toLocalDate } from "@training-sanctum/domain";
import { requirePlannerSession } from "@/lib/planner-sessions";
import { logOperation } from "@/lib/log";
import { HttpError, ok } from "@/lib/api-response";
import { taskInclude, toTaskSummary } from "@/lib/planner-tasks";

type Context = { params: Promise<{ id: string }> };

/**
 * spec-8-3: marks a Task done. The Task row is locked, then `done` is set and,
 * when `xpAwardedAt` is still null, one TASK_DONE XpEvent, the cached
 * `cultivationXp` and `xpAwardedAt` are written in the same transaction, so
 * repeated or concurrent calls (and reopen then done) award once.
 */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  const result = await requirePlannerSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });

  try {
    const { data, xp } = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "tasks" WHERE id = ${id} AND "userId" = ${userId} FOR UPDATE`;
      const task = await tx.task.findFirst({ where: { id, userId } });
      if (!task) throw new HttpError(404, "NOT_FOUND", "Task not found.");

      let awarded = 0;
      let xpAwardedAt: Date | undefined;
      if (task.xpAwardedAt === null) {
        // Serialize this user's XP writers so two Tasks never overwrite each other's total.
        await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
        const current = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { cultivationXp: true },
        });
        awarded = plannerXp(levelForXp(current.cultivationXp).bo, "TASK_DONE");
        await tx.xpEvent.create({
          data: {
            userId,
            localDay: toLocalDate(new Date(), user.timezone),
            questKind: null,
            delta: awarded,
            reason: "TASK_DONE",
          },
        });
        await tx.user.update({
          where: { id: userId },
          data: { cultivationXp: applyXpDelta(current.cultivationXp, awarded) },
        });
        xpAwardedAt = new Date();
      }
      const updated = await tx.task.update({
        where: { id },
        data: { done: true, ...(xpAwardedAt ? { xpAwardedAt } : {}) },
        include: taskInclude,
      });
      return { data: toTaskSummary(updated, user.timezone), xp: awarded };
    });
    logOperation("planner.task.done", { taskId: id, xp });
    return ok(data);
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    throw error;
  }
}
