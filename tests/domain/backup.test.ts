import { describe, expect, it } from "vitest";
import { backupExportSchema } from "@training-sanctum/domain";

const ts = "2026-11-14T10:00:00.000Z";
const empty = () => ({
  version: 1,
  exportedAt: ts,
  user: { id: "u1", email: "a@example.test", studyDirections: "BOTH", timezone: "UTC" },
  classes: [],
  folders: [],
  flashcards: [],
  cards: [],
  cultivation: { xp: 0, settledThrough: null, days: [], xpEvents: [] },
});

const record = (direction: string, firstGradedAt: string | null) => ({
  id: `r-${direction}`,
  direction,
  interval: 1,
  repetitions: 1,
  easeFactor: 2.5,
  nextReviewDate: ts,
  firstGradedAt,
  createdAt: ts,
  updatedAt: ts,
});

const full = () => ({
  ...empty(),
  classes: [{ id: "c1", name: "C", color: "SKY", createdAt: ts, updatedAt: ts }],
  folders: [{ id: "f1", classId: "c1", name: "Unsorted", isUnsorted: true, createdAt: ts, updatedAt: ts }],
  flashcards: [{ id: "fc1", folderId: "f1", name: "Set", createdAt: ts, updatedAt: ts }],
  cards: [
    {
      id: "k1",
      flashcardId: "fc1",
      term: "t",
      definition: "d",
      example: null,
      context: null,
      partOfSpeech: null,
      createdAt: ts,
      updatedAt: ts,
      schedulingRecords: [record("TERM_TO_DEFINITION", ts), record("DEFINITION_TO_TERM", null)],
    },
  ],
  cultivation: {
    xp: 40,
    settledThrough: "2026-11-13",
    days: [{ id: "d1", localDay: "2026-11-13", quests: [{ kind: "CLEAR_REVIEW", target: 5 }], createdAt: ts, updatedAt: ts }],
    xpEvents: [
      { id: "e1", localDay: "2026-11-13", questKind: "CLEAR_REVIEW", delta: 40, reason: "CLAIM", createdAt: ts },
    ],
  },
});

describe("backupExportSchema", () => {
  it("accepts a full payload", () => {
    expect(backupExportSchema.safeParse(full()).success).toBe(true);
  });

  it("accepts an empty account", () => {
    expect(backupExportSchema.safeParse(empty()).success).toBe(true);
  });

  it("rejects a missing section", () => {
    const { cultivation: _c, ...rest } = full();
    expect(backupExportSchema.safeParse(rest).success).toBe(false);
    const { cards: _k, ...rest2 } = full();
    expect(backupExportSchema.safeParse(rest2).success).toBe(false);
  });

  it("rejects bad enums and version", () => {
    expect(backupExportSchema.safeParse({ ...full(), version: 2 }).success).toBe(false);
    const bad = full();
    bad.classes[0].color = "PINK";
    expect(backupExportSchema.safeParse(bad).success).toBe(false);
    const bad2 = full();
    bad2.cards[0].schedulingRecords[0].direction = "SIDEWAYS";
    expect(backupExportSchema.safeParse(bad2).success).toBe(false);
  });
});
