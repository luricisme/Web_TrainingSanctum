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
