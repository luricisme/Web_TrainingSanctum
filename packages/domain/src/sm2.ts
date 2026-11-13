/**
 * Classical SM-2 scheduling engine (FR-8, AD-1, AD-4).
 *
 * `applyGrade` is the only place that computes a Scheduling Record's
 * `interval`, `repetitions`, `easeFactor` and `nextReviewDate`. It is pure:
 * it never mutates its input and has no clock, DB or HTTP dependency (the
 * caller passes `now` and the user's IANA `timeZone`).
 *
 * This is classical SM-2, not an Anki variant:
 * - Pass (quality 3/4/5): repetitions += 1; EF' = EF + (0.1 − (5−q)(0.08 + (5−q)0.02)),
 *   floored at 1.3; interval = 1, then 6, then round(prevInterval × prevEF).
 * - Again (quality 1): repetitions = 0, interval = 1, EF unchanged.
 */

import { toLocalCalendarDay } from "./time";

export const REVIEW_GRADES = ["again", "hard", "good", "easy"] as const;
export type ReviewGrade = (typeof REVIEW_GRADES)[number];

/** Fixed grade → SM-2 quality mapping (Again=1, Hard=3, Good=4, Easy=5). */
export const GRADE_QUALITY = Object.freeze({
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
} as const satisfies Record<ReviewGrade, number>);

export const DEFAULT_EASE_FACTOR = 2.5;
export const MIN_EASE_FACTOR = 1.3;
export const FIRST_INTERVAL = 1;
export const SECOND_INTERVAL = 6;

/** Lowest quality that counts as a successful recall in SM-2. */
const PASSING_QUALITY = 3;
const DAY_MS = 86_400_000;

export interface SchedulingState {
  /** Days until the next review. 0 for a never-graded record. */
  interval: number;
  /** Consecutive successful recalls. */
  repetitions: number;
  easeFactor: number;
}

export interface ScheduledState extends SchedulingState {
  /** UTC instant of the start of the local day the record is next due. */
  nextReviewDate: Date;
}

export interface GradeClock {
  now: Date;
  /** The user's IANA time zone (`User.timezone`, AD-8). */
  timeZone: string;
}

/**
 * Every SM-2 EF delta (+0.10, 0, −0.14, …) is a multiple of 0.01, so
 * rounding to 2 decimals is lossless and stops float drift
 * (2.5 − 0.14 === 2.3600000000000003).
 */
function roundEase(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * round(interval × EF) computed in integer hundredths: EF always has two
 * decimals, and the float product misses exact .5 cases
 * (25 × 2.3 === 57.49999999999999 → 57 instead of 58).
 */
function matureInterval(interval: number, easeFactor: number): number {
  return Math.round((interval * Math.round(easeFactor * 100)) / 100);
}

function nextEaseFactor(easeFactor: number, quality: number): number {
  const miss = 5 - quality;
  const updated = easeFactor + (0.1 - miss * (0.08 + miss * 0.02));
  return Math.max(MIN_EASE_FACTOR, roundEase(updated));
}

/**
 * Start of the local day `days` calendar days after the local day containing
 * `now`. Adds a half-day margin before snapping back to local midnight so a
 * DST shift (±1h) inside the span can never land on the wrong day.
 */
function addLocalDays(now: Date, days: number, timeZone: string): Date {
  const startOfToday = toLocalCalendarDay(now, timeZone).getTime();
  return toLocalCalendarDay(new Date(startOfToday + days * DAY_MS + DAY_MS / 2), timeZone);
}

/** Apply one grade to a Scheduling Record's state and return the new state. */
export function applyGrade(
  state: SchedulingState,
  grade: ReviewGrade,
  clock: GradeClock
): ScheduledState {
  // Own-key check: a plain lookup would accept inherited keys like "toString".
  if (!Object.hasOwn(GRADE_QUALITY, grade)) {
    throw new RangeError(`Unknown review grade: ${String(grade)}`);
  }
  const quality: number = GRADE_QUALITY[grade];

  let interval: number;
  let repetitions: number;
  let easeFactor: number;

  if (quality < PASSING_QUALITY) {
    interval = FIRST_INTERVAL;
    repetitions = 0;
    easeFactor = state.easeFactor;
  } else {
    if (state.repetitions === 0) interval = FIRST_INTERVAL;
    else if (state.repetitions === 1) interval = SECOND_INTERVAL;
    else interval = matureInterval(state.interval, state.easeFactor);
    repetitions = state.repetitions + 1;
    easeFactor = nextEaseFactor(state.easeFactor, quality);
  }

  return {
    interval,
    repetitions,
    easeFactor,
    nextReviewDate: addLocalDays(clock.now, interval, clock.timeZone),
  };
}
