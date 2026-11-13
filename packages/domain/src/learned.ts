/**
 * AD-14 per-direction learned predicate (spec-4-6, amended by spec-4-9).
 *
 * A Scheduling Record is learned once it has been graded at least once
 * (`firstGradedAt` set), and unlearned until then. Every queue and count is
 * filtered to the studied directions, from `studiedDirections(setting)`
 * (FR-18). These are plain Prisma-`where`-shaped objects, composed by the
 * routes into queries; AD-1: no prisma import here.
 *
 * - Record builders feed the queues: Review = learned, due records; Learn =
 *   unlearned records, then learned, due records.
 * - Card builders are for counts and Stats only. A Card is unlearned when it
 *   has at least one unlearned record in a studied direction, and learned
 *   when it has a learned record and no unlearned one in studied directions.
 *
 * Nothing else may test `firstGradedAt` for queue or count purposes. Never
 * derive "learned" from `interval`, `repetitions` or any grade's existence.
 */
import { RECALL_DIRECTIONS, type RecallDirection } from "./review";
import type { StudyDirections } from "./settings";

/**
 * The Recall Directions a setting studies, in queue order: BOTH returns
 * Term → Definition, then Definition → Term.
 */
export function studiedDirections(setting: StudyDirections): RecallDirection[] {
  return setting === "BOTH" ? [...RECALL_DIRECTIONS] : [setting];
}

/**
 * True when only Definition → Term is studied, so the card viewer and the
 * practice run show the Definition first.
 */
export function isDefinitionFirst(dirs: readonly RecallDirection[]): boolean {
  return dirs.length === 1 && dirs[0] === "DEFINITION_TO_TERM";
}

export interface LearnedRecordWhere {
  firstGradedAt: { not: null };
  direction: { in: RecallDirection[] };
}

export interface UnlearnedRecordWhere {
  firstGradedAt: null;
  direction: { in: RecallDirection[] };
}

export interface LearnedCardWhere {
  schedulingRecords: { some: LearnedRecordWhere; none: UnlearnedRecordWhere };
}

export interface UnlearnedCardWhere {
  schedulingRecords: { some: UnlearnedRecordWhere };
}

/** Records graded at least once, in the studied directions. */
export function learnedRecordWhere(dirs: readonly RecallDirection[]): LearnedRecordWhere {
  return { firstGradedAt: { not: null }, direction: { in: [...dirs] } };
}

/** Records never graded, in the studied directions. */
export function unlearnedRecordWhere(dirs: readonly RecallDirection[]): UnlearnedRecordWhere {
  return { firstGradedAt: null, direction: { in: [...dirs] } };
}

/** Counts only: Cards whose every studied record has been graded. */
export function learnedCardWhere(dirs: readonly RecallDirection[]): LearnedCardWhere {
  return {
    schedulingRecords: { some: learnedRecordWhere(dirs), none: unlearnedRecordWhere(dirs) },
  };
}

/** Counts only: Cards with at least one unlearned record in a studied direction. */
export function unlearnedCardWhere(dirs: readonly RecallDirection[]): UnlearnedCardWhere {
  return { schedulingRecords: { some: unlearnedRecordWhere(dirs) } };
}
