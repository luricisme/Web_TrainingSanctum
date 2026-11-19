import { describe, expect, it } from "vitest";
import {
  REVIEW_GRADES,
  gradeRequestSchema,
  learnQueueQuerySchema,
  reviewQueueQuerySchema,
  undoRequestSchema,
} from "@training-sanctum/domain";

describe("gradeRequestSchema (spec-4-2)", () => {
  it("accepts every review grade", () => {
    for (const grade of REVIEW_GRADES) {
      expect(gradeRequestSchema.safeParse({ schedulingRecordId: "r1", grade }).success).toBe(true);
    }
  });

  it("rejects an unknown or differently-cased grade", () => {
    for (const grade of ["Good", "perfect", "", 4, null, "toString"]) {
      const parsed = gradeRequestSchema.safeParse({ schedulingRecordId: "r1", grade });
      expect(parsed.success).toBe(false);
    }
  });

  it("rejects a missing or empty schedulingRecordId", () => {
    expect(gradeRequestSchema.safeParse({ grade: "good" }).success).toBe(false);
    expect(gradeRequestSchema.safeParse({ schedulingRecordId: "", grade: "good" }).success).toBe(
      false
    );
    expect(gradeRequestSchema.safeParse({ schedulingRecordId: 7, grade: "good" }).success).toBe(
      false
    );
  });
});

describe("undoRequestSchema", () => {
  const previous = {
    interval: 6,
    repetitions: 2,
    easeFactor: 2.5,
    nextReviewDate: "2026-11-19T00:00:00.000Z",
    firstGradedAt: "2026-11-10T08:00:00.000Z",
    updatedAt: "2026-11-13T08:00:00.000Z",
  };
  const base = {
    schedulingRecordId: "r1",
    previous,
    expectedNextReviewDate: "2026-11-25T00:00:00.000Z",
  };

  it("accepts a full previous state, with firstGradedAt null too", () => {
    expect(undoRequestSchema.safeParse(base).success).toBe(true);
    expect(
      undoRequestSchema.safeParse({ ...base, previous: { ...previous, firstGradedAt: null } })
        .success
    ).toBe(true);
  });

  it("rejects a missing previous, a missing field or a missing expected date", () => {
    expect(undoRequestSchema.safeParse({ ...base, previous: undefined }).success).toBe(false);
    const { updatedAt: _u, ...partial } = previous;
    expect(undoRequestSchema.safeParse({ ...base, previous: partial }).success).toBe(false);
    expect(
      undoRequestSchema.safeParse({ ...base, expectedNextReviewDate: undefined }).success
    ).toBe(false);
    expect(undoRequestSchema.safeParse({ ...base, schedulingRecordId: "" }).success).toBe(false);
  });

  it("rejects out-of-range or malformed values", () => {
    for (const bad of [
      { easeFactor: 1.2 },
      { easeFactor: 11 },
      { interval: -1 },
      { interval: 1.5 },
      { repetitions: -3 },
      { nextReviewDate: "soon" },
      { nextReviewDate: "1" },
      { updatedAt: "2026-11-13" },
      { updatedAt: 5 },
      { firstGradedAt: "never" },
    ]) {
      expect(
        undoRequestSchema.safeParse({ ...base, previous: { ...previous, ...bad } }).success,
        JSON.stringify(bad)
      ).toBe(false);
    }
  });
});

describe("reviewQueueQuerySchema (spec-4-3, spec-4-6)", () => {
  it("accepts no scope or exactly one Class or Folder scope", () => {
    expect(reviewQueueQuerySchema.safeParse({}).success).toBe(true);
    for (const key of ["classId", "folderId"]) {
      const parsed = reviewQueueQuerySchema.safeParse({ [key]: "abc" });
      expect(parsed.success, key).toBe(true);
      expect(parsed.data, key).toEqual({ [key]: "abc" });
    }
  });

  it("rejects two scopes with one message", () => {
    const parsed = reviewQueueQuerySchema.safeParse({ classId: "a", folderId: "b" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.message)).toEqual(["Choose one scope to review."]);
  });

  it("rejects an empty scope id", () => {
    for (const key of ["classId", "folderId"]) {
      expect(reviewQueueQuerySchema.safeParse({ [key]: "" }).success, key).toBe(false);
    }
  });
});

describe("learnQueueQuerySchema (spec-4-8)", () => {
  it("requires a flashcardId", () => {
    expect(learnQueueQuerySchema.safeParse({}).success).toBe(false);
  });

  it("rejects a blank flashcardId", () => {
    for (const flashcardId of ["", "   "]) {
      expect(learnQueueQuerySchema.safeParse({ flashcardId }).success, flashcardId).toBe(false);
    }
  });

  it("accepts a flashcardId", () => {
    const parsed = learnQueueQuerySchema.safeParse({ flashcardId: "abc" });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ flashcardId: "abc" });
  });
});
