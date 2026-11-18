import { prisma, type Prisma } from "@training-sanctum/db";
import {
  type PomodoroSettings,
  type TaskSummary,
  type WeekTaskSummary,
  blockMinutes,
  formatLocalTime,
  localDateTimeToInstant,
} from "@training-sanctum/domain";

export const taskInclude = {
  category: { select: { id: true, name: true, color: true } },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

/** The week read also needs each Task's sessions (spec-10-3). */
export const weekTaskInclude = {
  ...taskInclude,
  sessions: {
    select: { kind: true, actualMinutes: true, plannedMinutes: true, startedAt: true, endedAt: true },
  },
} satisfies Prisma.TaskInclude;

export type WeekTaskRow = Prisma.TaskGetPayload<{ include: typeof weekTaskInclude }>;

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

/** A Task for the calendar: the summary plus its block length and live state (AD-17), computed here. */
export function toCalendarTask(
  row: WeekTaskRow,
  timeZone: string,
  settings: PomodoroSettings
): WeekTaskSummary {
  const running = row.sessions.find((s) => s.endedAt === null) ?? null;
  const doneMinutes = row.sessions.reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0);
  return {
    ...toTaskSummary(row, timeZone),
    planMinutes: blockMinutes(row, row.sessions, settings),
    doneMinutes,
    running: running
      ? { startedAt: running.startedAt.toISOString(), plannedMinutes: running.plannedMinutes }
      : null,
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

/** Open Tasks of the user on a day before `today` (a `toLocalDate` value). */
export function overdueWhere(userId: string, today: Date): Prisma.TaskWhereInput {
  return { userId, done: false, localDay: { lt: today } };
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
