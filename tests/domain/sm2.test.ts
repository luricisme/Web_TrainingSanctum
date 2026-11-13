import { describe, expect, it } from "vitest";
import {
  DEFAULT_EASE_FACTOR,
  GRADE_QUALITY,
  MIN_EASE_FACTOR,
  REVIEW_GRADES,
  applyGrade,
  type ReviewGrade,
  toLocalCalendarDay,
  type SchedulingState,
} from "@training-sanctum/domain";

const clock = { now: new Date("2026-11-13T09:30:00Z"), timeZone: "UTC" };
const fresh: SchedulingState = { interval: 0, repetitions: 0, easeFactor: DEFAULT_EASE_FACTOR };

/** Apply grades in order, returning [interval, repetitions, easeFactor] after each. */
function run(grades: ReviewGrade[], start: SchedulingState = fresh) {
  const steps: Array<[number, number, number]> = [];
  let state = start;
  for (const grade of grades) {
    const next = applyGrade(state, grade, clock);
    steps.push([next.interval, next.repetitions, next.easeFactor]);
    state = next;
  }
  return steps;
}

describe("grade → quality mapping (FR-8)", () => {
  it("maps Again/Hard/Good/Easy to 1/3/4/5", () => {
    expect(REVIEW_GRADES).toEqual(["again", "hard", "good", "easy"]);
    expect(GRADE_QUALITY).toEqual({ again: 1, hard: 3, good: 4, easy: 5 });
  });

  it("rejects an unknown grade loudly", () => {
    for (const bad of ["perfect", "toString", "constructor", "__proto__"]) {
      expect(() => applyGrade(fresh, bad as ReviewGrade, clock)).toThrow(RangeError);
    }
  });
});

describe("PRD addendum worked examples (exact match)", () => {
  it("Sequence A — Good, Good, Hard, Again", () => {
    expect(run(["good", "good", "hard", "again"])).toEqual([
      [1, 1, 2.5],
      [6, 2, 2.5],
      [15, 3, 2.36],
      [1, 0, 2.36],
    ]);
  });

  it("Sequence B — Good, Easy, Easy", () => {
    expect(run(["good", "easy", "easy"])).toEqual([
      [1, 1, 2.5],
      [6, 2, 2.6],
      [16, 3, 2.7],
    ]);
  });
});

describe("SM-2 rules", () => {
  it("Again resets repetitions to 0 and interval to 1 from any state", () => {
    const mature: SchedulingState = { interval: 42, repetitions: 7, easeFactor: 2.1 };
    const next = applyGrade(mature, "again", clock);
    expect(next.repetitions).toBe(0);
    expect(next.interval).toBe(1);
  });

  it("Again leaves ease factor completely unchanged", () => {
    for (const easeFactor of [1.3, 1.94, 2.5, 3.1]) {
      const next = applyGrade({ interval: 10, repetitions: 4, easeFactor }, "again", clock);
      expect(next.easeFactor).toBe(easeFactor);
    }
  });

  it("ease factor never drops below 1.3 under repeated low grades", () => {
    const steps = run(Array<ReviewGrade>(15).fill("hard"));
    const efs = steps.map(([, , ef]) => ef);
    expect(efs.slice(0, 9)).toEqual([2.36, 2.22, 2.08, 1.94, 1.8, 1.66, 1.52, 1.38, MIN_EASE_FACTOR]);
    expect(efs.every((ef) => ef >= MIN_EASE_FACTOR)).toBe(true);
    expect(efs.at(-1)).toBe(MIN_EASE_FACTOR);
    // Alternating Hard/Again also bottoms out at the floor.
    const mixed = run(Array.from({ length: 30 }, (_, i) => (i % 2 ? "again" : "hard") as ReviewGrade));
    expect(Math.min(...mixed.map(([, , ef]) => ef))).toBe(MIN_EASE_FACTOR);
  });

  it("Hard, Good and Easy give identical intervals at equal repetitions; only EF differs", () => {
    const states: SchedulingState[] = [
      fresh,
      { interval: 1, repetitions: 1, easeFactor: 2.5 },
      { interval: 6, repetitions: 2, easeFactor: 2.5 },
      { interval: 15, repetitions: 3, easeFactor: 2.36 },
    ];
    for (const state of states) {
      const [hard, good, easy] = (["hard", "good", "easy"] as const).map((g) =>
        applyGrade(state, g, clock)
      );
      expect(good.interval).toBe(hard.interval);
      expect(easy.interval).toBe(hard.interval);
      expect(new Set([hard.repetitions, good.repetitions, easy.repetitions]).size).toBe(1);
      expect(hard.easeFactor).toBeLessThan(good.easeFactor);
      expect(good.easeFactor).toBeLessThan(easy.easeFactor);
    }
  });

  it("uses the previous ease factor (not the updated one) for the 3rd+ interval", () => {
    // 6 × 2.5 = 15, even though Hard lowers EF to 2.36 in the same step.
    expect(applyGrade({ interval: 6, repetitions: 2, easeFactor: 2.5 }, "hard", clock).interval).toBe(15);
  });

  it("rounds round(interval × EF) exactly at .5 products (no float drift)", () => {
    // 25 × 2.3 is 57.49999999999999 in floating point; SM-2 says 57.5 → 58.
    expect(applyGrade({ interval: 25, repetitions: 3, easeFactor: 2.3 }, "good", clock).interval).toBe(58);
    expect(applyGrade({ interval: 30, repetitions: 3, easeFactor: 2.05 }, "good", clock).interval).toBe(62);
  });

  it("Easy from the EF floor rises by 0.1", () => {
    expect(applyGrade({ interval: 6, repetitions: 2, easeFactor: MIN_EASE_FACTOR }, "easy", clock).easeFactor).toBe(1.4);
  });

  it("is pure: it never mutates its input", () => {
    const state: SchedulingState = { interval: 6, repetitions: 2, easeFactor: 2.5 };
    const graded = applyGrade(state, "again", clock);
    expect(state).toEqual({ interval: 6, repetitions: 2, easeFactor: 2.5 });
    expect(graded).not.toBe(state);
  });

  it("dual-direction independence: a Card's two records evolve separately, in any order", () => {
    // One Card, two Scheduling Records (Term→Definition, Definition→Term), both at rep 2.
    const card = () => ({
      termToDef: { interval: 6, repetitions: 2, easeFactor: 2.5 } as SchedulingState,
      defToTerm: { interval: 6, repetitions: 2, easeFactor: 2.5 } as SchedulingState,
    });

    const a = card(); // grade T→D first
    const aT = applyGrade(a.termToDef, "again", clock);
    const aD = applyGrade(a.defToTerm, "easy", clock);

    const b = card(); // grade D→T first
    const bD = applyGrade(b.defToTerm, "easy", clock);
    const bT = applyGrade(b.termToDef, "again", clock);

    // Order does not matter, and each result depends only on its own record.
    expect(aT).toEqual(bT);
    expect(aD).toEqual(bD);
    expect([aT.interval, aT.repetitions, aT.easeFactor]).toEqual([1, 0, 2.5]);
    expect([aD.interval, aD.repetitions, aD.easeFactor]).toEqual([15, 3, 2.6]);
    // Grading one direction leaves the sibling record untouched.
    expect(a.defToTerm).toEqual(card().defToTerm);
    expect(b.termToDef).toEqual(card().termToDef);
  });
});

describe("nextReviewDate (AD-8)", () => {
  it("is the start of the local day `interval` days after grading (UTC)", () => {
    expect(applyGrade(fresh, "good", clock).nextReviewDate.toISOString()).toBe(
      "2026-11-14T00:00:00.000Z"
    );
    expect(
      applyGrade({ interval: 1, repetitions: 1, easeFactor: 2.5 }, "good", clock).nextReviewDate.toISOString()
    ).toBe("2026-11-19T00:00:00.000Z");
  });

  it("uses the user's local day, not UTC's (Asia/Ho_Chi_Minh, +07:00)", () => {
    // 20:00Z on the 8th is already the 9th in Ho Chi Minh City → due the 10th, local midnight.
    const next = applyGrade(fresh, "good", {
      now: new Date("2026-11-08T20:00:00Z"),
      timeZone: "Asia/Ho_Chi_Minh",
    });
    expect(next.nextReviewDate.toISOString()).toBe("2026-11-09T17:00:00.000Z");
  });

  it("lands on local midnight across a DST fall-back (America/New_York)", () => {
    // Graded Sat 2026-10-31 (EDT); DST ends Sun 2026-11-01.
    const now = new Date("2026-10-31T16:00:00Z");
    const tz = "America/New_York";
    expect(applyGrade(fresh, "good", { now, timeZone: tz }).nextReviewDate.toISOString()).toBe(
      "2026-11-01T04:00:00.000Z" // midnight EDT
    );
    expect(
      applyGrade({ interval: 1, repetitions: 1, easeFactor: 2.5 }, "good", { now, timeZone: tz })
        .nextReviewDate.toISOString()
    ).toBe("2026-11-06T05:00:00.000Z"); // midnight EST, 6 days later
  });

  it("lands on local midnight across a DST spring-forward (America/New_York)", () => {
    // Graded Sat 2026-03-07 (EST); DST starts Sun 2026-03-08.
    const now = new Date("2026-03-07T15:00:00Z");
    const tz = "America/New_York";
    expect(
      applyGrade({ interval: 1, repetitions: 1, easeFactor: 2.5 }, "good", { now, timeZone: tz })
        .nextReviewDate.toISOString()
    ).toBe("2026-03-13T04:00:00.000Z"); // midnight EDT
  });

  it("chained gradings over many months always land on local midnight `interval` days later", () => {
    // Graded each afternoon the record comes due, across both 2026/2027 DST changes and a year end.
    const tz = "America/New_York";
    const localDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
    const dayGap = (from: Date, to: Date) =>
      Math.round((Date.parse(localDate(to)) - Date.parse(localDate(from))) / 86_400_000);

    let state: SchedulingState = fresh;
    let now = new Date("2026-02-20T20:00:00Z");
    const grades: ReviewGrade[] = ["good", "again", "good", "good", "good", "hard", "good", "easy", "good"];
    for (const grade of grades) {
      const next = applyGrade(state, grade, { now, timeZone: tz });
      expect(next.nextReviewDate.getTime()).toBe(toLocalCalendarDay(next.nextReviewDate, tz).getTime());
      expect(dayGap(now, next.nextReviewDate)).toBe(next.interval);
      state = next;
      now = new Date(next.nextReviewDate.getTime() + 15 * 3_600_000); // ~3pm local that day
    }
    expect(state.interval).toBeGreaterThan(200);
  });
});
