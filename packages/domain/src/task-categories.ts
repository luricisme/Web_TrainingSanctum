/**
 * Task Category rules (spec-8-2): pure validation schemas for the Planner's
 * Categories (AD-1: no next, react or prisma imports; AD-6: Route Handlers
 * validate with these, and the UI reuses them for client-side checks).
 * Colour reuses the Class colours.
 */
import { z } from "zod";
import { classColorSchema, type ClassColor } from "./classes";
import { musicTrackSchema, type MusicTrackRef } from "./music";

export const TASK_CATEGORY_NAME_MAX_LENGTH = 40;

/** Field message when another Category already has the name (case-insensitive). */
export const TASK_CATEGORY_NAME_TAKEN = "You already have a category with this name.";

export const taskCategoryNameSchema = z
  .string({ error: "Enter a category name." })
  .trim()
  .min(1, "Enter a category name.")
  .max(
    TASK_CATEGORY_NAME_MAX_LENGTH,
    `Use ${TASK_CATEGORY_NAME_MAX_LENGTH} characters or fewer.`
  );

export const createTaskCategorySchema = z.object({
  name: taskCategoryNameSchema,
  color: classColorSchema.optional(),
  musicTrack: musicTrackSchema.nullish(),
});

/** Rename, recolour and/or change the track: at least one field. */
export const updateTaskCategorySchema = z
  .object({
    name: taskCategoryNameSchema.optional(),
    color: classColorSchema.optional(),
    musicTrack: musicTrackSchema.nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.color !== undefined || v.musicTrack !== undefined, {
    message: "Provide a name, a colour or a track.",
  });

export const deleteTaskCategorySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("move"),
    targetId: z.string().min(1, "Choose a category to move tasks to."),
  }),
  z.object({ mode: z.literal("delete") }),
]);

export type CreateTaskCategoryInput = z.infer<typeof createTaskCategorySchema>;
export type UpdateTaskCategoryInput = z.infer<typeof updateTaskCategorySchema>;
export type DeleteTaskCategoryInput = z.infer<typeof deleteTaskCategorySchema>;

/** Shape returned by the `/api/planner/categories` endpoints. */
export interface TaskCategorySummary {
  id: string;
  name: string;
  color: ClassColor;
  taskCount: number;
  musicTrack: MusicTrackRef | null;
}
