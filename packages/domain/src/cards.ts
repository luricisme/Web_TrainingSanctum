/**
 * Card creation rules (spec-2-3).
 *
 * Pure schemas plus `createCardWithSchedulingRecords`, the single shared path
 * that builds a Card and its two Scheduling Records (AD-9). AD-1: no next,
 * react or prisma imports. Text is only trimmed, never normalized (Unicode,
 * IPA and accents pass through untouched).
 */
import { z } from "zod";
import { toLocalCalendarDay } from "./time";

export const MAX_CARDS_PER_BATCH = 200;
export const CARD_TERM_MAX_LENGTH = 200;
export const CARD_DEFINITION_MAX_LENGTH = 1000;
export const CARD_EXAMPLE_MAX_LENGTH = 1000;
export const CARD_CONTEXT_MAX_LENGTH = 500;
export const CARD_PART_OF_SPEECH_MAX_LENGTH = 50;

const tooLong = (max: number) => `Use ${max} characters or fewer.`;

const required = (label: string, max: number) =>
  z
    .string({ error: `Enter a ${label}.` })
    .trim()
    .min(1, `Enter a ${label}.`)
    .max(max, tooLong(max));

/** Optional text: trimmed; missing, null or blank becomes `null`. */
const optional = (max: number) =>
  z
    .union([z.string().trim().max(max, tooLong(max)), z.null()])
    .optional()
    .transform((value) => (value ? value : null));

export const cardInputSchema = z.object({
  term: required("term", CARD_TERM_MAX_LENGTH),
  definition: required("definition", CARD_DEFINITION_MAX_LENGTH),
  example: optional(CARD_EXAMPLE_MAX_LENGTH),
  context: optional(CARD_CONTEXT_MAX_LENGTH),
  partOfSpeech: optional(CARD_PART_OF_SPEECH_MAX_LENGTH),
});

export type CardInput = z.infer<typeof cardInputSchema>;

/**
 * Request body of `POST /api/cards/batch`. Rows stay `unknown` here so the
 * handler can report every bad row by line (`validateCardRows`).
 */
export const createCardsBatchSchema = z.object({
  flashcardId: z
    .string({ error: "Choose a flashcard." })
    .min(1, "Choose a flashcard."),
  cards: z
    .array(z.unknown(), { error: "Send the cards as a list." })
    .min(1, "Add at least one card.")
    .max(
      MAX_CARDS_PER_BATCH,
      `Add at most ${MAX_CARDS_PER_BATCH} cards at a time.`
    ),
  /**
   * `manual` (default) is all-or-nothing. `import` (spec-3-1) saves the valid
   * rows, skips duplicates and reports the rest; its rows carry `line`.
   */
  source: z.enum(["manual", "import"]).optional(),
});

export type CreateCardsBatchInput = z.infer<typeof createCardsBatchSchema>;

export interface CardRowError {
  /** 1-based row number. */
  line: number;
  reason: string;
}

export type CardRowsResult =
  | { ok: true; cards: CardInput[] }
  | { ok: false; errors: CardRowError[] };

/** Validates every row; on any failure returns one error per bad row. */
export function validateCardRows(rows: readonly unknown[]): CardRowsResult {
  const cards: CardInput[] = [];
  const errors: CardRowError[] = [];
  rows.forEach((row, index) => {
    const parsed = cardInputSchema.safeParse(row);
    if (parsed.success) {
      cards.push(parsed.data);
    } else {
      errors.push({
        line: index + 1,
        reason: parsed.error.issues[0]?.message ?? "Invalid card.",
      });
    }
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, cards };
}

export type RecallDirectionName = "TERM_TO_DEFINITION" | "DEFINITION_TO_TERM";

export interface NewSchedulingRecord {
  direction: RecallDirectionName;
  easeFactor: number;
  repetitions: number;
  interval: number;
  nextReviewDate: Date;
  /** AD-14: null until the grade route first grades this record. */
  firstGradedAt: Date | null;
}

export interface NewCardWithSchedulingRecords {
  card: CardInput;
  schedulingRecords: [NewSchedulingRecord, NewSchedulingRecord];
}

/**
 * AD-9: the only place a new Card's Scheduling Records are decided. Both start
 * at SM-2 defaults and are due at the start of today in the user's timezone.
 * Both start unlearned (`firstGradedAt: null`, AD-14), so a new Card stays out
 * of Review until it has been learned.
 */
export function createCardWithSchedulingRecords(
  input: CardInput,
  context: { now: Date; timezone: string }
): NewCardWithSchedulingRecords {
  const card = cardInputSchema.parse(input);
  const nextReviewDate = toLocalCalendarDay(context.now, context.timezone);
  const record = (direction: RecallDirectionName): NewSchedulingRecord => ({
    direction,
    easeFactor: 2.5,
    repetitions: 0,
    interval: 0,
    nextReviewDate: new Date(nextReviewDate),
    firstGradedAt: null,
  });
  return {
    card,
    schedulingRecords: [
      record("TERM_TO_DEFINITION"),
      record("DEFINITION_TO_TERM"),
    ],
  };
}

/** One Card as listed on the Flashcard page. */
export interface CardSummary {
  id: string;
  term: string;
  definition: string;
  example: string | null;
  context: string | null;
  partOfSpeech: string | null;
}

/** Shape returned by `POST /api/cards/batch`. */
export interface CreateCardsBatchResponse {
  created: number;
}

/** Source line of an import row: its paste line, or null for a row added in review. */
export const importCardLineSchema = z.object({
  line: z.number().int().positive().nullable().optional(),
});

/** One skipped or failed import row. `line` is null for rows added in review. */
export interface ImportCommitIssue {
  line: number | null;
}

/** Shape returned by `POST /api/cards/batch` with `source: "import"`. */
export interface ImportCommitResult {
  created: number;
  duplicates: (ImportCommitIssue & { term: string })[];
  errors: (ImportCommitIssue & { reason: string })[];
}
