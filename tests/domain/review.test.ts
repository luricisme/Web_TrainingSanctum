import { describe, expect, it } from "vitest";
import {
  REVIEW_GRADES,
  gradeRequestSchema,
  reviewQueueQuerySchema,
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

describe("reviewQueueQuerySchema (spec-4-3)", () => {
  it("accepts no scope or exactly one scope", () => {
    expect(reviewQueueQuerySchema.safeParse({}).success).toBe(true);
    for (const key of ["classId", "folderId", "flashcardId"]) {
      const parsed = reviewQueueQuerySchema.safeParse({ [key]: "abc" });
      expect(parsed.success, key).toBe(true);
      expect(parsed.data, key).toEqual({ [key]: "abc" });
    }
  });

  it("rejects two or three scopes with one message", () => {
    for (const query of [
      { classId: "a", folderId: "b" },
      { folderId: "b", flashcardId: "c" },
      { classId: "a", folderId: "b", flashcardId: "c" },
    ]) {
      const parsed = reviewQueueQuerySchema.safeParse(query);
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.message).toBe("Choose one scope to review.");
    }
  });

  it("rejects an empty scope id", () => {
    for (const key of ["classId", "folderId", "flashcardId"]) {
      expect(reviewQueueQuerySchema.safeParse({ [key]: "" }).success, key).toBe(false);
    }
  });
});
