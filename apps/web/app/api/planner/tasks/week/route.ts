import { prisma } from "@training-sanctum/db";
import {
  compareTasks,
  parsePomodoroSettings,
  weekDays,
  weekQuerySchema,
} from "@training-sanctum/domain";
import { requirePlannerSession } from "@/lib/planner-sessions";
import { ok, validationFailure } from "@/lib/api-response";
import { taskInclude, toCalendarTask } from "@/lib/planner-tasks";

/** The Monday-to-Sunday week containing `?start=`, each Task with its plan length. */
export async function GET(request: Request): Promise<Response> {
  const result = await requirePlannerSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const url = new URL(request.url);
  const parsed = weekQuerySchema.safeParse({ start: url.searchParams.get("start") ?? undefined });
  if (!parsed.success) return validationFailure(parsed.error);

  const days = weekDays(parsed.data.start);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true, pomodoroSettings: true },
  });
  const settings = parsePomodoroSettings(user.pomodoroSettings);
  const rows = await prisma.task.findMany({
    where: {
      userId,
      localDay: {
        gte: new Date(`${days[0]}T00:00:00.000Z`),
        lte: new Date(`${days[6]}T00:00:00.000Z`),
      },
    },
    include: taskInclude,
  });
  rows.sort(compareTasks);
  return ok(rows.map((r) => toCalendarTask(r, user.timezone, settings)));
}
