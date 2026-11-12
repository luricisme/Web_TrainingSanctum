/**
 * Folder CRUD rules (spec-2-2).
 *
 * Pure validation schemas and the name-clash check (AD-1: no next, react or
 * prisma imports; AD-6: Route Handlers validate with these schemas, and the UI
 * may reuse them for client-side checks).
 */
import { z } from "zod";

export const FOLDER_NAME_MAX_LENGTH = 80;

export const folderNameSchema = z
  .string({ error: "Enter a folder name." })
  .trim()
  .min(1, "Enter a folder name.")
  .max(FOLDER_NAME_MAX_LENGTH, `Use ${FOLDER_NAME_MAX_LENGTH} characters or fewer.`);

export const createFolderSchema = z.object({ name: folderNameSchema });
export const renameFolderSchema = z.object({ name: folderNameSchema });
export const deleteFolderSchema = z.object({
  mode: z.enum(["move", "delete"], {
    error: "Choose what happens to the flashcards.",
  }),
});

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type RenameFolderInput = z.infer<typeof renameFolderSchema>;
export type DeleteFolderInput = z.infer<typeof deleteFolderSchema>;

/**
 * True when `name` equals any taken name, ignoring case and surrounding
 * whitespace. Pass the other Folder names of the Class (Unsorted included).
 */
export function isFolderNameTaken(
  name: string,
  taken: Iterable<string>
): boolean {
  const wanted = name.trim().toLowerCase();
  for (const other of taken) {
    if (other.trim().toLowerCase() === wanted) return true;
  }
  return false;
}

/** Shape returned by the Folder list, create and rename endpoints. */
export interface FolderSummary {
  id: string;
  name: string;
  isUnsorted: boolean;
  flashcardCount: number;
  cardCount: number;
}

/** Shape returned by `GET /api/classes/:id/folders`. */
export interface ClassFoldersResponse {
  class: { id: string; name: string };
  folders: FolderSummary[];
}
