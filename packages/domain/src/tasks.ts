/**
 * Planner Task rules (spec-8-3): pure validation schemas and the shared
 * summary shape (AD-1: no next, react or prisma imports; AD-6: Route Handlers
 * validate with these, the UI reuses them for client-side checks).
 */
import { z } from "zod";
import type { ClassColor } from "./classes";
import { musicTrackSchema, type MusicTrackRef } from "./music";

export const TASK_TITLE_MAX_LENGTH = 120;
export const TASK_MIN_ESTIMATE_MINUTES = 5;
export const TASK_MAX_ESTIMATE_MINUTES = 1440;

export const taskTitleSchema = z
  .string({ error: "Enter a title." })
  .trim()
  .min(1, "Enter a title.")
  .max(TASK_TITLE_MAX_LENGTH, `Use ${TASK_TITLE_MAX_LENGTH} characters or fewer.`);

/** `YYYY-MM-DD`, a real calendar date. */
export const localDaySchema = z
  .string({ error: "Choose a day." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a day.")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Choose a day.");

/** `HH:MM`, 24-hour. */
export const startTimeSchema = z
  .string({ error: "Enter a time as HH:MM." })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time as HH:MM.");

const ESTIMATE_MESSAGE = `Enter whole minutes, ${TASK_MIN_ESTIMATE_MINUTES} or more.`;

export const estimateMinutesSchema = z
  .number({ error: ESTIMATE_MESSAGE })
  .int(ESTIMATE_MESSAGE)
  .min(TASK_MIN_ESTIMATE_MINUTES, ESTIMATE_MESSAGE)
  .max(TASK_MAX_ESTIMATE_MINUTES, `Use ${TASK_MAX_ESTIMATE_MINUTES} minutes or fewer.`);

export const categoryIdSchema = z
  .string({ error: "Choose a category." })
  .min(1, "Choose a category.");

export const createTaskSchema = z.object({
  title: taskTitleSchema,
  categoryId: categoryIdSchema,
  localDay: localDaySchema,
  startTime: startTimeSchema.nullish(),
  estimateMinutes: estimateMinutesSchema,
  musicTrack: musicTrackSchema.nullish(),
});

/**
 * Edit: any of the fields; `startTime: null` clears the time. `done: false`
 * reopens (done itself goes through `POST .../done`).
 */
export const updateTaskSchema = z
  .object({
    title: taskTitleSchema.optional(),
    categoryId: categoryIdSchema.optional(),
    localDay: localDaySchema.optional(),
    startTime: startTimeSchema.nullable().optional(),
    estimateMinutes: estimateMinutesSchema.optional(),
    done: z.literal(false).optional(),
    musicTrack: musicTrackSchema.nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to change.",
  });

export const taskDayQuerySchema = z.object({ day: localDaySchema });

/** Drag to reorder: a day's open Tasks, top first. */
export const reorderTasksSchema = z.object({
  day: localDaySchema,
  ids: z
    .array(z.string().min(1).max(64))
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, "Each Task can appear once."),
});

export type ReorderTasksInput = z.infer<typeof reorderTasksSchema>;

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** Shape returned by the `/api/planner/tasks` endpoints. */
export interface TaskSummary {
  id: string;
  title: string;
  category: { id: string; name: string; color: ClassColor };
  /** `YYYY-MM-DD`. */
  localDay: string;
  /** `HH:MM` in the user's timezone, or null for an untimed Task. */
  startTime: string | null;
  estimateMinutes: number;
  loggedMinutes: number;
  done: boolean;
  /** Overrides the Category's track; null inherits it. */
  musicTrack: MusicTrackRef | null;
}

/** Shape returned by `GET /api/planner/tasks/overdue`. */
export interface OverdueSummary {
  count: number;
}

/** `HH:MM` that `instant` shows in `timeZone`. */
export function formatLocalTime(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

interface Sortable {
  done: boolean;
  startAt: Date | null;
  createdAt: Date;
  /** Priority set by dragging; absent or null when never ordered. */
  sortOrder?: number | null;
}

/**
 * Done last. Among the rest, Tasks the user has put in order come first, by
 * that order; the others follow by start time (untimed after timed), then
 * creation, so a newly added Task joins at the bottom of an ordered day.
 */
export function compareTasks(a: Sortable, b: Sortable): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  const ao = a.sortOrder ?? null;
  const bo = b.sortOrder ?? null;
  if (ao !== null && bo !== null && ao !== bo) return ao - bo;
  if (ao !== null && bo === null) return -1;
  if (ao === null && bo !== null) return 1;
  if (a.startAt && b.startAt && a.startAt.getTime() !== b.startAt.getTime()) {
    return a.startAt.getTime() - b.startAt.getTime();
  }
  if (a.startAt && !b.startAt) return -1;
  if (!a.startAt && b.startAt) return 1;
  return a.createdAt.getTime() - b.createdAt.getTime();
}
