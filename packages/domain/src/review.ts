/**
 * Review grading contract (spec-4-2).
 *
 * The request schema and response shape of `POST /api/review/grade`, the
 * single write path for a Scheduling Record's SM-2 fields (AD-4). The values
 * themselves are only ever computed by `applyGrade` (./sm2). AD-1: no next,
 * react or prisma imports.
 */
import { z } from "zod";
import { REVIEW_GRADES } from "./sm2";

export const RECALL_DIRECTIONS = [
  "TERM_TO_DEFINITION",
  "DEFINITION_TO_TERM",
] as const;
export type RecallDirection = (typeof RECALL_DIRECTIONS)[number];

export const gradeRequestSchema = z.object({
  schedulingRecordId: z
    .string({ error: "Choose a card to grade." })
    .min(1, "Choose a card to grade."),
  grade: z.enum(REVIEW_GRADES, {
    error: "Grade must be again, hard, good or easy.",
  }),
});

export type GradeRequest = z.infer<typeof gradeRequestSchema>;

/** The Scheduling Record after a grade, as `POST /api/review/grade` returns it. */
export interface GradeResult {
  id: string;
  cardId: string;
  direction: RecallDirection;
  interval: number;
  repetitions: number;
  easeFactor: number;
  /** ISO 8601 UTC instant: the start of the user's local day it is next due. */
  nextReviewDate: string;
}

/**
 * Review queue contract (spec-4-3): `GET /api/review/queue` takes at most one
 * optional scope. With none, the queue spans every Class.
 */
const scopeId = z
  .string()
  .min(1, "Choose a class, folder or flashcard to review.")
  .optional();

export const reviewQueueQuerySchema = z
  .object({ classId: scopeId, folderId: scopeId, flashcardId: scopeId })
  .refine(
    (q) =>
      [q.classId, q.folderId, q.flashcardId].filter((v) => v !== undefined)
        .length <= 1,
    { message: "Choose one scope to review.", path: ["scope"] }
  );

export type ReviewQueueQuery = z.infer<typeof reviewQueueQuerySchema>;

export type ReviewScopeKind = "class" | "folder" | "flashcard";

/** The Class, Folder or Flashcard a scoped session is limited to. */
export interface ReviewScope {
  kind: ReviewScopeKind;
  id: string;
  name: string;
}

/** One due Scheduling Record, with the Card text needed to render it. */
export interface ReviewQueueEntry {
  schedulingRecordId: string;
  cardId: string;
  direction: RecallDirection;
  /** ISO 8601 UTC instant. */
  nextReviewDate: string;
  flashcardName: string;
  term: string;
  definition: string;
  example: string | null;
  context: string | null;
  partOfSpeech: string | null;
}

export interface ReviewQueueResponse {
  scope: ReviewScope | null;
  /** Due records, oldest-due-first. */
  entries: ReviewQueueEntry[];
}
