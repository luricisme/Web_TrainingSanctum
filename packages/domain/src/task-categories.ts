/**
 * Task Category rules (spec-8-2): pure validation schemas for the Planner's
 * Categories (AD-1: no next, react or prisma imports; AD-6: Route Handlers
 * validate with these, and the UI reuses them for client-side checks).
 * Colour reuses the Class colours.
 */
import { z } from "zod";
import { classColorSchema, type ClassColor } from "./classes";

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
});

/** Rename and/or recolour: at least one of `name` and `color`. */
export const updateTaskCategorySchema = z
  .object({
    name: taskCategoryNameSchema.optional(),
    color: classColorSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.color !== undefined, {
    message: "Provide a name or a colour.",
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
}
