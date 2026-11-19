/**
 * Review grading contract (spec-4-2).
 *
 * The request schema and response shape of `POST /api/review/grade`, the
 * single write path for a Scheduling Record's SM-2 fields (AD-4). The values
 * themselves are only ever computed by `applyGrade` (./sm2). AD-1: no next,
 * react or prisma imports.
 */
import { z } from "zod";
import { MIN_EASE_FACTOR, REVIEW_GRADES } from "./sm2";

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

/** SM-2 state of a Scheduling Record before a grade, so the grade can be undone. */
export interface GradePrevious {
  interval: number;
  repetitions: number;
  easeFactor: number;
  /** ISO 8601 UTC instant. */
  nextReviewDate: string;
  /** ISO 8601 UTC instant, or null while the Card is still Unlearned. */
  firstGradedAt: string | null;
  /** ISO 8601 UTC instant; restored so "reviewed today" facts are not inflated. */
  updatedAt: string;
}

/**
 * `POST /api/review/undo` (spec-session-back-to-previous-card): restores the
 * state a grade replaced. The write only happens while the record's current
 * `nextReviewDate` still equals `expectedNextReviewDate`.
 */
const isoInstant = (message: string) =>
  z.iso.datetime({ error: message });

export const undoRequestSchema = z.object({
  schedulingRecordId: z
    .string({ error: "Choose a card to undo." })
    .min(1, "Choose a card to undo."),
  previous: z.object({
    interval: z.number().int().min(0).max(100_000),
    repetitions: z.number().int().min(0).max(100_000),
    easeFactor: z.number().min(MIN_EASE_FACTOR).max(10),
    nextReviewDate: isoInstant("Previous review date must be a date."),
    firstGradedAt: isoInstant("Previous first grade must be a date.").nullable(),
    updatedAt: isoInstant("Previous update time must be a date."),
  }),
  expectedNextReviewDate: isoInstant("Expected review date must be a date."),
});

export type UndoRequest = z.infer<typeof undoRequestSchema>;

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
  /** The state this grade replaced, for `POST /api/review/undo`. */
  previous: GradePrevious;
}

/**
 * Review queue contract (spec-4-3, spec-4-6): `GET /api/review/queue` takes at
 * most one optional Class or Folder scope. With none, the queue spans every
 * Class. Flashcard scope moved to Learn (4.8): `flashcardId` is rejected.
 */
const scopeId = z
  .string()
  .min(1, "Choose a class or folder to review.")
  .optional();

export const FLASHCARD_REVIEW_MOVED_MESSAGE = "Flashcard review moved to Learn.";

export const reviewQueueQuerySchema = z
  .object({
    classId: scopeId,
    folderId: scopeId,
    flashcardId: z.unknown().optional(),
  })
  .superRefine((q, ctx) => {
    if (q.flashcardId !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: FLASHCARD_REVIEW_MOVED_MESSAGE,
        path: ["flashcardId"],
      });
    }
    if (q.classId !== undefined && q.folderId !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Choose one scope to review.",
        path: ["scope"],
      });
    }
  })
  .transform(({ classId, folderId }) => ({ classId, folderId }));

export type ReviewQueueQuery = z.infer<typeof reviewQueueQuerySchema>;

export type ReviewScopeKind = "class" | "folder";

/** The Class or Folder a scoped session is limited to. */
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

/**
 * Empty due-queue contract (spec-4-5): `GET /api/review/unlearned` takes the
 * same optional scope as the queue (`reviewQueueQuerySchema`).
 */
export interface UnlearnedFlashcard {
  id: string;
  name: string;
  /** Unlearned Cards in the studied directions, as Learn counts them. */
  newCards: number;
}

export interface UnlearnedFlashcardsResponse {
  /** At most 3, newest unlearned Card first. */
  flashcards: UnlearnedFlashcard[];
  /**
   * Where "+ Add card" goes: the Flashcard of the newest Card, else the newest
   * Flashcard, within the scope; null when there is none.
   */
  addCardTarget: { id: string; name: string } | null;
}

/**
 * Learn queue contract (spec-4-8): `GET /api/review/learn?flashcardId=` runs a
 * graded session for one Flashcard. `flashcardId` is required.
 */
export const learnQueueQuerySchema = z.object({
  flashcardId: z
    .string({ error: "Choose a flashcard to learn." })
    .trim()
    .min(1, "Choose a flashcard to learn."),
});

export type LearnQueueQuery = z.infer<typeof learnQueueQuerySchema>;

/** What is waiting in a Flashcard's Learn session. */
export interface LearnCounts {
  /** Unlearned Cards (not records). */
  newCards: number;
  /** Due records of learned Cards. */
  due: number;
}

export interface LearnQueueResponse {
  flashcard: { id: string; name: string };
  counts: LearnCounts;
  /**
   * The unlearned Cards' ungraded records first (Cards oldest-created first,
   * Term → Definition before Definition → Term), then the due records of
   * learned Cards, oldest-due-first.
   */
  entries: ReviewQueueEntry[];
}
