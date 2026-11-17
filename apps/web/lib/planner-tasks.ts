import { prisma, type Prisma } from "@training-sanctum/db";
import {
  type TaskSummary,
  formatLocalTime,
  localDateTimeToInstant,
} from "@training-sanctum/domain";

export const taskInclude = {
  category: { select: { id: true, name: true, color: true } },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function toTaskSummary(row: TaskRow, timeZone: string): TaskSummary {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    localDay: row.localDay.toISOString().slice(0, 10),
    startTime: row.startAt ? formatLocalTime(row.startAt, timeZone) : null,
    estimateMinutes: row.estimateMinutes,
    loggedMinutes: row.loggedMinutes,
    done: row.done,
  };
}

/** `startAt` for a day (`YYYY-MM-DD`) and `HH:MM` in the user's timezone (AD-8). */
export function startAtFor(day: string, time: string | null, timeZone: string): Date | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return localDateTimeToInstant(new Date(`${day}T00:00:00.000Z`), h!, m!, timeZone);
}

export async function userTimezone(userId: string): Promise<string> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  return u.timezone;
}

/** True when the Category exists and belongs to the user. */
export async function ownsCategory(userId: string, categoryId: string): Promise<boolean> {
  const c = await prisma.taskCategory.findFirst({
    where: { id: categoryId, userId },
    select: { id: true },
  });
  return c !== null;
}

export type { TaskSummary };
