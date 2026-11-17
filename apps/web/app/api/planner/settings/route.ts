import { prisma } from "@training-sanctum/db";
import {
  type PomodoroSettings,
  parsePomodoroSettings,
  updatePomodoroSettingsSchema,
} from "@training-sanctum/domain";
import { requirePlannerSession } from "@/lib/planner-sessions";
import { fail, ok, readJson, zodFields } from "@/lib/api-response";
import { logOperation } from "@/lib/log";

/** spec-9-1: the user's Pomodoro settings. A bad stored value reads as the defaults. */
export async function GET(request: Request): Promise<Response> {
  const result = await requirePlannerSession(request);
  if (result.response) return result.response;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: result.session.user.id },
    select: { pomodoroSettings: true },
  });
  const data: PomodoroSettings = parsePomodoroSettings(user.pomodoroSettings);
  return ok(data);
}

/**
 * Merges a partial update into the stored settings in one transaction under a
 * `users` row lock, so concurrent patches of different keys both land.
 */
export async function PATCH(request: Request): Promise<Response> {
  const result = await requirePlannerSession(request);
  if (result.response) return result.response;

  const body = await readJson(request);
  if (body === null) {
    return fail(400, "INVALID_JSON", "Request body must be JSON.");
  }
  const parsed = updatePomodoroSettingsSchema.safeParse(body);
  if (!parsed.success) {
    const fields = zodFields(parsed.error);
    // An unknown key is reported against that key, not the whole body.
    for (const issue of parsed.error.issues) {
      if (issue.code === "unrecognized_keys") {
        delete fields.body;
        for (const key of issue.keys) fields[key] = "Unknown setting.";
      }
    }
    return fail(400, "VALIDATION_ERROR", "Check the highlighted fields.", fields);
  }

  const userId = result.session.user.id;
  const merged = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { pomodoroSettings: true },
    });
    const next: PomodoroSettings = {
      ...parsePomodoroSettings(user.pomodoroSettings),
      ...parsed.data,
    };
    await tx.user.update({ where: { id: userId }, data: { pomodoroSettings: next } });
    return next;
  });

  logOperation("planner.settings.update", { userId, keys: Object.keys(parsed.data) });
  return ok(merged);
}
