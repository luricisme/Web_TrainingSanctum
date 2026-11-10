/**
 * Flashcard CRUD rules (spec-2-7).
 *
 * A Flashcard is a named set of Cards inside one Folder. Pure validation
 * schemas and name helpers (AD-1: no next, react or prisma imports; AD-6:
 * Route Handlers validate with these schemas, and the UI may reuse them).
 */
import { z } from "zod";
import type { CardSummary } from "./cards";

export const FLASHCARD_NAME_MAX_LENGTH = 80;

export const flashcardNameSchema = z
  .string({ error: "Enter a flashcard name." })
  .trim()
  .min(1, "Enter a flashcard name.")
  .max(
    FLASHCARD_NAME_MAX_LENGTH,
    `Use ${FLASHCARD_NAME_MAX_LENGTH} characters or fewer.`
  );

export const createFlashcardSchema = z.object({ name: flashcardNameSchema });
export const renameFlashcardSchema = z.object({ name: flashcardNameSchema });

export type CreateFlashcardInput = z.infer<typeof createFlashcardSchema>;
export type RenameFlashcardInput = z.infer<typeof renameFlashcardSchema>;

export const FLASHCARD_NAME_TAKEN =
  "A flashcard with this name already exists in this folder.";

/**
 * True when `name` equals any taken name, ignoring case and surrounding
 * whitespace. Pass the other Flashcard names of the Folder.
 */
export function isFlashcardNameTaken(
  name: string,
  taken: Iterable<string>
): boolean {
  const wanted = name.trim().toLowerCase();
  for (const other of taken) {
    if (other.trim().toLowerCase() === wanted) return true;
  }
  return false;
}

/**
 * Returns `name` if no taken name equals it (ignoring case), otherwise
 * `name (2)`, `name (3)` and so on, using the first suffix that is free.
 */
export function uniqueFlashcardName(
  name: string,
  taken: Iterable<string>
): string {
  const used = new Set<string>();
  for (const other of taken) used.add(other.trim().toLowerCase());
  if (!used.has(name.trim().toLowerCase())) return name;
  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`;
    // Keep the result within FLASHCARD_NAME_MAX_LENGTH so it can be renamed later.
    const candidate = `${name.slice(0, FLASHCARD_NAME_MAX_LENGTH - suffix.length)}${suffix}`;
    if (!used.has(candidate.trim().toLowerCase())) return candidate;
  }
}

/** Shape returned by the Flashcard create, rename and Folder list endpoints. */
export interface FlashcardSummary {
  id: string;
  name: string;
  cardCount: number;
}

/** Shape returned by `GET /api/folders/:id` and `GET /api/folders/:id/flashcards`. */
export interface FolderFlashcardsResponse {
  folder: { id: string; name: string; isUnsorted: boolean };
  class: { id: string; name: string };
  flashcards: FlashcardSummary[];
}

/** Shape returned by `GET /api/flashcards/:id`. */
export interface FlashcardCardsResponse {
  flashcard: { id: string; name: string };
  folder: { id: string; name: string; isUnsorted: boolean };
  class: { id: string; name: string };
  cards: CardSummary[];
}
