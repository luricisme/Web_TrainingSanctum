import { prisma, type Prisma } from "@training-sanctum/db";
import { formatLocalTime, updateTaskSchema } from "@training-sanctum/domain";
import { requirePlannerSession } from "@/lib/planner-sessions";
import { logOperation } from "@/lib/log";
import { fail, ok, readJson, validationFailure } from "@/lib/api-response";
import {
  ownsCategory,
  startAtFor,
  taskInclude,
  toTaskSummary,
  userTimezone,
} from "@/lib/planner-tasks";

type Context = { params: Promise<{ id: string }> };

const notFound = () => fail(404, "NOT_FOUND", "Task not found.");

export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  const result = await requirePlannerSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  const body = await readJson(request);
  if (body === null) return fail(400, "INVALID_JSON", "Request body must be JSON.");
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);
  const input = parsed.data;

  const existing = await prisma.task.findFirst({ where: { id, userId } });
  if (!existing) return notFound();

  if (input.categoryId !== undefined && !(await ownsCategory(userId, input.categoryId))) {
    return fail(400, "VALIDATION_ERROR", "Check the highlighted fields.", {
      categoryId: "Choose one of your categories.",
    });
  }

  const tz = await userTimezone(userId);
  const data: Prisma.TaskUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.categoryId !== undefined) data.categoryId = input.categoryId;
  if (input.estimateMinutes !== undefined) data.estimateMinutes = input.estimateMinutes;
  if (input.done === false) data.done = false;
  if (input.localDay !== undefined || input.startTime !== undefined) {
    const day = input.localDay ?? existing.localDay.toISOString().slice(0, 10);
    const time =
      input.startTime !== undefined
        ? input.startTime
        : existing.startAt
          ? formatLocalTime(existing.startAt, tz)
          : null;
    data.localDay = new Date(`${day}T00:00:00.000Z`);
    data.startAt = startAtFor(day, time, tz);
  }

  const updated = await prisma.task.update({ where: { id }, data, include: taskInclude });
  logOperation("planner.task.update", { taskId: id, fields: Object.keys(data) });
  return ok(toTaskSummary(updated, tz));
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const result = await requirePlannerSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  const { count } = await prisma.task.deleteMany({ where: { id, userId } });
  if (count === 0) return notFound();
  logOperation("planner.task.delete", { taskId: id });
  return ok({ id });
}
