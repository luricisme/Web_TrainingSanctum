import { prisma } from "@training-sanctum/db";
import { compareTasks, reorderTasksSchema } from "@training-sanctum/domain";
import { requirePlannerSession } from "@/lib/planner-sessions";
import { logOperation } from "@/lib/log";
import { fail, ok, readJson, validationFailure } from "@/lib/api-response";
import { taskInclude, toTaskSummary, userTimezone } from "@/lib/planner-tasks";

/**
 * Drag to reorder in Planner -> Tasks: `ids` is the day's open Tasks, top
 * first, and each gets its index as `sortOrder`. Ids that are not the user's
 * Tasks on that day are refused, so a stale list never reorders another day.
 * Returns the day's Tasks in their new order.
 */
export async function PUT(request: Request): Promise<Response> {
  const result = await requirePlannerSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const body = await readJson(request);
  if (body === null) return fail(400, "INVALID_JSON", "Request body must be JSON.");
  const parsed = reorderTasksSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);
  const { day, ids } = parsed.data;
  const localDay = new Date(`${day}T00:00:00.000Z`);

  const owned = await prisma.task.count({ where: { id: { in: ids }, userId, localDay } });
  if (owned !== ids.length) {
    return fail(409, "CONFLICT", "The task list changed. Reload and try again.");
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.task.updateMany({ where: { id, userId, localDay }, data: { sortOrder: index } })
    )
  );
  logOperation("planner.task.reorder", { localDay: day, count: ids.length });

  const tz = await userTimezone(userId);
  const rows = await prisma.task.findMany({ where: { userId, localDay }, include: taskInclude });
  rows.sort(compareTasks);
  return ok(rows.map((r) => toTaskSummary(r, tz)));
}
