import { describe, expect, it } from "vitest";
import { REVIEW_GRADES, gradeRequestSchema } from "@training-sanctum/domain";

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
