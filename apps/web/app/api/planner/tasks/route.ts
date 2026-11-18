import { prisma, Prisma } from "@training-sanctum/db";
import { compareTasks, createTaskSchema, taskDayQuerySchema } from "@training-sanctum/domain";
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

export async function GET(request: Request): Promise<Response> {
  const result = await requirePlannerSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const url = new URL(request.url);
  const parsed = taskDayQuerySchema.safeParse({ day: url.searchParams.get("day") ?? undefined });
  if (!parsed.success) return validationFailure(parsed.error);

  const tz = await userTimezone(userId);
  const rows = await prisma.task.findMany({
    where: { userId, localDay: new Date(`${parsed.data.day}T00:00:00.000Z`) },
    include: taskInclude,
  });
  rows.sort(compareTasks);
  return ok(rows.map((r) => toTaskSummary(r, tz)));
}

export async function POST(request: Request): Promise<Response> {
  const result = await requirePlannerSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const body = await readJson(request);
  if (body === null) return fail(400, "INVALID_JSON", "Request body must be JSON.");
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);
  const input = parsed.data;

  if (!(await ownsCategory(userId, input.categoryId))) {
    return fail(400, "VALIDATION_ERROR", "Check the highlighted fields.", {
      categoryId: "Choose one of your categories.",
    });
  }

  const tz = await userTimezone(userId);
  const created = await prisma.task.create({
    data: {
      userId,
      categoryId: input.categoryId,
      title: input.title,
      localDay: new Date(`${input.localDay}T00:00:00.000Z`),
      startAt: startAtFor(input.localDay, input.startTime ?? null, tz),
      estimateMinutes: input.estimateMinutes,
      musicTrack: input.musicTrack ?? Prisma.JsonNull,
    },
    include: taskInclude,
  });
  logOperation("planner.task.create", { taskId: created.id, localDay: input.localDay });
  return ok(toTaskSummary(created, tz), 201);
}
