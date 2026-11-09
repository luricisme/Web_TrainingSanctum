import { describe, expect, it } from "vitest";
import {
  cardInputSchema,
  createCardWithSchedulingRecords,
  createCardsBatchSchema,
  toLocalCalendarDay,
  validateCardRows,
} from "@training-sanctum/domain";

describe("toLocalCalendarDay (AD-8, spec-2-3)", () => {
  it("returns UTC midnight for UTC", () => {
    expect(toLocalCalendarDay(new Date("2026-11-09T15:30:00Z"), "UTC").toISOString()).toBe(
      "2026-11-09T00:00:00.000Z"
    );
  });

  it("uses the local day east of UTC (Asia/Ho_Chi_Minh, +07:00)", () => {
    // 20:00Z on the 8th is already 03:00 on the 9th in Ho Chi Minh City.
    expect(
      toLocalCalendarDay(new Date("2026-11-08T20:00:00Z"), "Asia/Ho_Chi_Minh").toISOString()
    ).toBe("2026-11-08T17:00:00.000Z");
    // 16:59Z is still the 8th locally.
    expect(
      toLocalCalendarDay(new Date("2026-11-08T16:59:00Z"), "Asia/Ho_Chi_Minh").toISOString()
    ).toBe("2026-11-07T17:00:00.000Z");
  });

  it("uses the local day west of UTC (America/Los_Angeles)", () => {
    // 2026-11-09T05:00Z is 21:00 on the 8th in LA (PST, -08:00).
    expect(
      toLocalCalendarDay(new Date("2026-11-09T05:00:00Z"), "America/Los_Angeles").toISOString()
    ).toBe("2026-11-08T08:00:00.000Z");
  });

  it("handles a DST change inside the day (America/New_York, 2026-11-01)", () => {
    // Local midnight is still EDT (-04:00); the clocks fall back at 02:00.
    expect(
      toLocalCalendarDay(new Date("2026-11-01T20:00:00Z"), "America/New_York").toISOString()
    ).toBe("2026-11-01T04:00:00.000Z");
  });

  it("is stable at the exact boundary", () => {
    expect(
      toLocalCalendarDay(new Date("2026-11-08T17:00:00Z"), "Asia/Ho_Chi_Minh").toISOString()
    ).toBe("2026-11-08T17:00:00.000Z");
  });
});

describe("cardInputSchema", () => {
  it("trims, and stores blank optional fields as null", () => {
    expect(
      cardInputSchema.parse({ term: "  run ", definition: " move fast ", example: "   " })
    ).toEqual({
      term: "run",
      definition: "move fast",
      example: null,
      context: null,
      partOfSpeech: null,
    });
  });

  it("requires a non-empty Term and Definition", () => {
    expect(cardInputSchema.safeParse({ term: "", definition: "d" }).success).toBe(false);
    expect(cardInputSchema.safeParse({ term: "t", definition: "   " }).success).toBe(false);
    expect(cardInputSchema.safeParse({ definition: "d" }).success).toBe(false);
  });

  it("rejects over-length fields", () => {
    expect(cardInputSchema.safeParse({ term: "a".repeat(201), definition: "d" }).success).toBe(
      false
    );
    expect(
      cardInputSchema.safeParse({ term: "t", definition: "d", partOfSpeech: "x".repeat(51) })
        .success
    ).toBe(false);
  });

  it("leaves Unicode untouched", () => {
    const parsed = cardInputSchema.parse({
      term: "/ˈkɒl.ə.keɪt/",
      definition: "café 日本語 é",
    });
    expect(parsed.term).toBe("/ˈkɒl.ə.keɪt/");
    expect(parsed.definition).toBe("café 日本語 é");
  });
});

describe("createCardsBatchSchema and validateCardRows", () => {
  it("bounds the row count to 1..200", () => {
    expect(createCardsBatchSchema.safeParse({ folderId: "f", cards: [] }).success).toBe(false);
    expect(
      createCardsBatchSchema.safeParse({ folderId: "f", cards: Array(201).fill({}) }).success
    ).toBe(false);
    expect(
      createCardsBatchSchema.safeParse({ folderId: "f", cards: Array(200).fill({}) }).success
    ).toBe(true);
  });

  it("reports every bad row by 1-based line", () => {
    const result = validateCardRows([
      { term: "a", definition: "b" },
      { term: "", definition: "b" },
      { term: "a", definition: "" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.line)).toEqual([2, 3]);
  });
});

describe("createCardWithSchedulingRecords (AD-9)", () => {
  it("returns the Card and exactly two Scheduling Records at SM-2 defaults", () => {
    const { card, schedulingRecords } = createCardWithSchedulingRecords(
      { term: "t", definition: "d", example: null, context: null, partOfSpeech: null },
      { now: new Date("2026-11-08T20:00:00Z"), timezone: "Asia/Ho_Chi_Minh" }
    );
    expect(card.term).toBe("t");
    expect(schedulingRecords.map((r) => r.direction)).toEqual([
      "TERM_TO_DEFINITION",
      "DEFINITION_TO_TERM",
    ]);
    for (const record of schedulingRecords) {
      expect(record).toMatchObject({ easeFactor: 2.5, repetitions: 0, interval: 0 });
      expect(record.nextReviewDate.toISOString()).toBe("2026-11-08T17:00:00.000Z");
    }
  });
});
