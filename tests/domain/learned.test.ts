import { describe, expect, it } from "vitest";
import {
  FLASHCARD_REVIEW_MOVED_MESSAGE,
  type StudyDirections,
  isDefinitionFirst,
  learnedCardWhere,
  learnedRecordWhere,
  reviewQueueQuerySchema,
  studiedDirections,
  unlearnedCardWhere,
  unlearnedRecordWhere,
} from "@training-sanctum/domain";

// spec-4-9: the per-direction AD-14 predicate, for all three settings.
const SETTINGS: Array<[StudyDirections, string[]]> = [
  ["BOTH", ["TERM_TO_DEFINITION", "DEFINITION_TO_TERM"]],
  ["TERM_TO_DEFINITION", ["TERM_TO_DEFINITION"]],
  ["DEFINITION_TO_TERM", ["DEFINITION_TO_TERM"]],
];

describe("studiedDirections (FR-18)", () => {
  it.each(SETTINGS)("%s studies %j, Term → Definition first", (setting, dirs) => {
    expect(studiedDirections(setting)).toStrictEqual(dirs);
  });

  it("returns a fresh array each call", () => {
    expect(studiedDirections("BOTH")).not.toBe(studiedDirections("BOTH"));
  });

  it("shows the Definition first only when just Definition → Term is studied", () => {
    expect(isDefinitionFirst(studiedDirections("DEFINITION_TO_TERM"))).toBe(true);
    expect(isDefinitionFirst(studiedDirections("TERM_TO_DEFINITION"))).toBe(false);
    expect(isDefinitionFirst(studiedDirections("BOTH"))).toBe(false);
  });
});

describe.each(SETTINGS)("AD-14 builders, %s", (setting) => {
  const dirs = studiedDirections(setting);

  it("learned record: graded, in a studied direction", () => {
    expect(learnedRecordWhere(dirs)).toStrictEqual({
      firstGradedAt: { not: null },
      direction: { in: dirs },
    });
  });

  it("unlearned record: never graded, in a studied direction", () => {
    expect(unlearnedRecordWhere(dirs)).toStrictEqual({
      firstGradedAt: null,
      direction: { in: dirs },
    });
  });

  it("learned Card: a learned studied record and no unlearned one", () => {
    expect(learnedCardWhere(dirs)).toStrictEqual({
      schedulingRecords: {
        some: learnedRecordWhere(dirs),
        none: unlearnedRecordWhere(dirs),
      },
    });
  });

  it("unlearned Card: some unlearned record in a studied direction", () => {
    expect(unlearnedCardWhere(dirs)).toStrictEqual({
      schedulingRecords: { some: unlearnedRecordWhere(dirs) },
    });
  });

  it("returns fresh objects, so callers can compose them safely", () => {
    const built = learnedRecordWhere(dirs);
    expect(built).not.toBe(learnedRecordWhere(dirs));
    expect(built.direction.in).not.toBe(dirs);
    expect(unlearnedCardWhere(dirs)).not.toBe(unlearnedCardWhere(dirs));
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
