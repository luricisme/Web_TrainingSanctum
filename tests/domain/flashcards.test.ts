import { describe, expect, it } from "vitest";
import {
  FLASHCARD_NAME_MAX_LENGTH,
  createFlashcardSchema,
  flashcardNameSchema,
  isFlashcardNameTaken,
  renameFlashcardSchema,
  uniqueFlashcardName,
} from "@training-sanctum/domain";

describe("flashcardNameSchema (spec-2-7)", () => {
  it("trims and accepts a normal name", () => {
    expect(flashcardNameSchema.parse("  Weather idioms  ")).toBe("Weather idioms");
  });

  it("accepts 80 characters and rejects 81, blank and non-strings", () => {
    expect(flashcardNameSchema.safeParse("a".repeat(80)).success).toBe(true);
    expect(flashcardNameSchema.safeParse("a".repeat(81)).success).toBe(false);
    expect(flashcardNameSchema.safeParse("   ").success).toBe(false);
    expect(flashcardNameSchema.safeParse(undefined).success).toBe(false);
  });

  it("is used by the create and rename schemas", () => {
    expect(createFlashcardSchema.parse({ name: " A " })).toEqual({ name: "A" });
    expect(renameFlashcardSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("isFlashcardNameTaken", () => {
  it("compares case-insensitively and ignores surrounding space", () => {
    expect(isFlashcardNameTaken("weather", ["Weather"])).toBe(true);
    expect(isFlashcardNameTaken("  WEATHER ", ["Weather"])).toBe(true);
    expect(isFlashcardNameTaken("Weather 2", ["Weather"])).toBe(false);
    expect(isFlashcardNameTaken("a", [])).toBe(false);
  });
});

describe("uniqueFlashcardName", () => {
  it("returns the name when free", () => {
    expect(uniqueFlashcardName("Idioms", ["Other"])).toBe("Idioms");
  });

  it("adds (2), (3) for clashes, ignoring case", () => {
    expect(uniqueFlashcardName("Idioms", ["idioms"])).toBe("Idioms (2)");
    expect(uniqueFlashcardName("Idioms", ["Idioms", "Idioms (2)"])).toBe("Idioms (3)");
  });

  it("keeps a suffixed name within the length limit", () => {
    const long = "x".repeat(FLASHCARD_NAME_MAX_LENGTH);
    const result = uniqueFlashcardName(long, [long]);
    expect(result.length).toBe(FLASHCARD_NAME_MAX_LENGTH);
    expect(result.endsWith(" (2)")).toBe(true);
  });
});
