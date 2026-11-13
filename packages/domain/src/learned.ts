/**
 * AD-14 learned predicate (spec-4-6).
 *
 * A Card is learned once both of its Scheduling Records have been graded at
 * least once (`firstGradedAt` set). A Card always has exactly two records
 * (AD-9, unique `(cardId, direction)`), so "no record with `firstGradedAt`
 * null" is the same as "both graded". These are plain Card-`where` objects,
 * composed by the routes into Prisma queries; AD-1: no prisma import here.
 * Never derive "learned" from `interval`, `repetitions` or any grade's
 * existence.
 */

export interface LearnedCardWhere {
  schedulingRecords: { none: { firstGradedAt: null } };
}

export interface UnlearnedCardWhere {
  schedulingRecords: { some: { firstGradedAt: null } };
}

/** Cards whose two records have both been graded at least once. */
export function learnedCardWhere(): LearnedCardWhere {
  return { schedulingRecords: { none: { firstGradedAt: null } } };
}

/** Cards with at least one record never graded. */
export function unlearnedCardWhere(): UnlearnedCardWhere {
  return { schedulingRecords: { some: { firstGradedAt: null } } };
}
