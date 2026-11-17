import { prisma } from "@training-sanctum/db";
import {
  TASK_CATEGORY_NAME_TAKEN,
  type DeleteTaskCategoryInput,
  type TaskCategorySummary,
  deleteTaskCategorySchema,
  updateTaskCategorySchema,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { logOperation } from "@/lib/log";
import {
  HttpError,
  fail,
  ok,
  readJson,
  validationFailure,
} from "@/lib/api-response";

type Context = { params: Promise<{ id: string }> };

const notFound = () => fail(404, "NOT_FOUND", "Category not found.");
const nameTaken = () =>
  fail(400, "VALIDATION_ERROR", TASK_CATEGORY_NAME_TAKEN, {
    name: TASK_CATEGORY_NAME_TAKEN,
  });

export async function PATCH(
  request: Request,
  { params }: Context
): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  const body = await readJson(request);
  if (body === null) {
    return fail(400, "INVALID_JSON", "Request body must be JSON.");
  }
  const parsed = updateTaskCategorySchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);

  const mine = await prisma.taskCategory.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  if (!mine.some((c) => c.id === id)) return notFound();
  if (parsed.data.name !== undefined) {
    const lower = parsed.data.name.toLowerCase();
    // Another row with the same name in any case is taken; the row itself may change case.
    if (mine.some((c) => c.id !== id && c.name.toLowerCase() === lower)) {
      return nameTaken();
    }
  }

  try {
    const { count } = await prisma.taskCategory.updateMany({
      where: { id, userId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
      },
    });
    if (count === 0) return notFound();
  } catch (error) {
    if (isUniqueViolation(error)) return nameTaken();
    throw error;
  }
  const updated = await prisma.taskCategory.findFirst({
    where: { id, userId },
    select: { id: true, name: true, color: true, _count: { select: { tasks: true } } },
  });
  if (!updated) return notFound();
  const data: TaskCategorySummary = {
    id: updated.id,
    name: updated.name,
    color: updated.color,
    taskCount: updated._count.tasks,
  };
  return ok(data);
}

export async function DELETE(
  request: Request,
  { params }: Context
): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  // A category with no tasks needs no choice, so the body is optional then.
  const raw = await readJson(request);
  const probe = await prisma.taskCategory.findFirst({
    where: { id, userId },
    select: { _count: { select: { tasks: true } } },
  });
  if (!probe) return notFound();

  let input: DeleteTaskCategoryInput | null = null;
  if (raw !== null) {
    const parsed = deleteTaskCategorySchema.safeParse(raw);
    if (parsed.success) input = parsed.data;
    else if (probe._count.tasks > 0) return validationFailure(parsed.error);
  } else if (probe._count.tasks > 0) {
    return fail(400, "INVALID_JSON", "Request body must be JSON.");
  }

  try {
    // AD-11: every row changes or none do.
    const summary = await prisma.$transaction(async (tx) => {
      const source = await tx.taskCategory.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!source) throw new HttpError(404, "NOT_FOUND", "Category not found.");
      const tasks = await tx.task.count({ where: { categoryId: id, userId } });

      if (tasks === 0) {
        await tx.taskCategory.delete({ where: { id } });
        return { mode: "none" as const, tasks: 0 };
      }
      if (!input) {
        throw new HttpError(400, "VALIDATION_ERROR", "Choose what happens to its tasks.", {
          mode: "Choose what happens to its tasks.",
        });
      }

      if (input.mode === "delete") {
        await tx.task.deleteMany({ where: { categoryId: id, userId } });
        await tx.taskCategory.delete({ where: { id } });
        return { mode: "delete" as const, tasks };
      }

      if (input.targetId === id) {
        throw new HttpError(400, "VALIDATION_ERROR", "Choose a different category.", {
          targetId: "Choose a different category.",
        });
      }
      const target = await tx.taskCategory.findFirst({
        where: { id: input.targetId, userId },
        select: { id: true },
      });
      if (!target) {
        throw new HttpError(400, "VALIDATION_ERROR", "Choose a category to move tasks to.", {
          targetId: "Choose a category to move tasks to.",
        });
      }
      await tx.task.updateMany({
        where: { categoryId: id, userId },
        data: { categoryId: target.id },
      });
      await tx.taskCategory.delete({ where: { id } });
      return { mode: "move" as const, tasks, targetId: target.id };
    });

    logOperation("task-category.delete", { ...summary, categoryId: id, outcome: "success" });
    return ok({ id, ...summary });
  } catch (error) {
    if (error instanceof HttpError) {
      logOperation("task-category.delete", {
        categoryId: id,
        outcome: `rejected:${error.status}`,
      });
      return error.toResponse();
    }
    logOperation("task-category.delete", {
      categoryId: id,
      outcome: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(500, "INTERNAL_ERROR", "Could not delete the category. Nothing was changed.");
  }
}
