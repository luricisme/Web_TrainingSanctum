import { prisma } from "@training-sanctum/db";
import {
  TASK_CATEGORY_NAME_TAKEN,
  type TaskCategorySummary,
  createTaskCategorySchema,
  nextClassColor,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { fail, ok, readJson, validationFailure } from "@/lib/api-response";

const nameTaken = () =>
  fail(400, "VALIDATION_ERROR", TASK_CATEGORY_NAME_TAKEN, {
    name: TASK_CATEGORY_NAME_TAKEN,
  });

export async function GET(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const rows = await prisma.taskCategory.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      _count: { select: { tasks: true } },
    },
  });
  const data: TaskCategorySummary[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    taskCount: c._count.tasks,
  }));
  return ok(data);
}

export async function POST(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const body = await readJson(request);
  if (body === null) {
    return fail(400, "INVALID_JSON", "Request body must be JSON.");
  }
  const parsed = createTaskCategorySchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);

  const existing = await prisma.taskCategory.findMany({
    where: { userId },
    select: { name: true },
  });
  const lower = parsed.data.name.toLowerCase();
  if (existing.some((c) => c.name.toLowerCase() === lower)) return nameTaken();

  try {
    const created = await prisma.taskCategory.create({
      data: {
        userId,
        name: parsed.data.name,
        color: parsed.data.color ?? nextClassColor(existing.length),
      },
    });
    const data: TaskCategorySummary = {
      id: created.id,
      name: created.name,
      color: created.color,
      taskCount: 0,
    };
    return ok(data, 201);
  } catch (error) {
    if (isUniqueViolation(error)) return nameTaken();
    throw error;
  }
}
