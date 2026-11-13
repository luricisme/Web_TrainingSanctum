import { describe, expect, it } from "vitest";
import {
  FLASHCARD_REVIEW_MOVED_MESSAGE,
  learnedCardWhere,
  reviewQueueQuerySchema,
  unlearnedCardWhere,
} from "@training-sanctum/domain";

// spec-4-6: the AD-14 learned predicate and the Review queue's flashcard rejection.
describe("learnedCardWhere / unlearnedCardWhere (AD-14)", () => {
  it("learned: no Scheduling Record is still ungraded", () => {
    expect(learnedCardWhere()).toStrictEqual({
      schedulingRecords: { none: { firstGradedAt: null } },
    });
  });

  it("unlearned: some Scheduling Record is still ungraded", () => {
    expect(unlearnedCardWhere()).toStrictEqual({
      schedulingRecords: { some: { firstGradedAt: null } },
    });
  });

  it("returns a fresh object each call, so callers can compose it safely", () => {
    expect(learnedCardWhere()).not.toBe(learnedCardWhere());
    expect(unlearnedCardWhere()).not.toBe(unlearnedCardWhere());
  });
});

describe("reviewQueueQuerySchema rejects flashcardId (spec-4-6)", () => {
  const messages = (query: Record<string, unknown>) => {
    const parsed = reviewQueueQuerySchema.safeParse(query);
    expect(parsed.success).toBe(false);
    return parsed.error?.issues.map((i) => i.message) ?? [];
  };

  it("rejects flashcardId alone", () => {
    expect(FLASHCARD_REVIEW_MOVED_MESSAGE).toBe("Flashcard review moved to Learn.");
    expect(messages({ flashcardId: "abc" })).toEqual([FLASHCARD_REVIEW_MOVED_MESSAGE]);
    expect(messages({ flashcardId: "" })).toEqual([FLASHCARD_REVIEW_MOVED_MESSAGE]);
  });

  it("rejects flashcardId with another scope", () => {
    expect(messages({ classId: "a", flashcardId: "c" })).toContain(FLASHCARD_REVIEW_MOVED_MESSAGE);
    expect(messages({ folderId: "b", flashcardId: "c" })).toContain(
      FLASHCARD_REVIEW_MOVED_MESSAGE
    );
  });
});
