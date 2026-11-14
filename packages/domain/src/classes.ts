/**
 * Class CRUD rules (spec-2-1).
 *
 * Pure validation schemas and the folder-name suffixing used when a deleted
 * Class's Folders are merged into another Class (AD-1: no next, react or
 * prisma imports; AD-6: Route Handlers validate with these schemas, and the UI
 * may reuse them for client-side checks).
 */
import { z } from "zod";

export const CLASS_NAME_MAX_LENGTH = 80;

export const classNameSchema = z
  .string({ error: "Enter a class name." })
  .trim()
  .min(1, "Enter a class name.")
  .max(CLASS_NAME_MAX_LENGTH, `Use ${CLASS_NAME_MAX_LENGTH} characters or fewer.`);

/** Story 6.4: the five tile colours, in default-assignment order. */
export const CLASS_COLORS = ["LAVENDER", "SKY", "MINT", "BUTTER", "ROSE"] as const;
export type ClassColor = (typeof CLASS_COLORS)[number];

export const classColorSchema = z.enum(CLASS_COLORS, {
  error: "Choose one of the five colours.",
});

/** The default colour for a new Class: the next in order by existing count. */
export function nextClassColor(existingCount: number): ClassColor {
  return CLASS_COLORS[existingCount % CLASS_COLORS.length];
}

export const createClassSchema = z.object({
  name: classNameSchema,
  color: classColorSchema.optional(),
});

/** Rename and/or recolour: at least one of `name` and `color`. */
export const renameClassSchema = z
  .object({
    name: classNameSchema.optional(),
    color: classColorSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.color !== undefined, {
    message: "Provide a name or a colour.",
  });
export const updateClassSchema = renameClassSchema;

export const deleteClassSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("move"),
    targetClassId: z.string().min(1, "Choose a class to move folders to."),
  }),
  z.object({
    mode: z.literal("delete"),
    confirmName: z.string(),
  }),
]);

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type RenameClassInput = z.infer<typeof renameClassSchema>;
export type DeleteClassInput = z.infer<typeof deleteClassSchema>;

/** Name of the built-in Folder every Class gets on creation. */
export const UNSORTED_FOLDER_NAME = "Unsorted";

/**
 * Returns `name` if no taken name equals it, otherwise `name (2)`, `name (3)`
 * and so on, using the first suffix that is free. Comparison is exact.
 */
export function uniqueFolderName(
  name: string,
  taken: Iterable<string>
): string {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  for (let n = 2; ; n += 1) {
    const candidate = `${name} (${n})`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Shape returned by the `/api/classes` list, create and rename endpoints. */
export interface ClassSummary {
  id: string;
  name: string;
  color: ClassColor;
  folderCount: number;
  flashcardCount: number;
  cardCount: number;
}
