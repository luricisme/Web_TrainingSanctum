import { describe, expect, it } from "vitest";
import {
  classNameSchema,
  createClassSchema,
  deleteClassSchema,
  renameClassSchema,
  uniqueFolderName,
} from "@training-sanctum/domain";

describe("classNameSchema (spec-2-1)", () => {
  it("trims and accepts a normal name", () => {
    expect(classNameSchema.parse("  IELTS  ")).toBe("IELTS");
  });

  it("accepts exactly 80 characters and rejects 81", () => {
    expect(classNameSchema.safeParse("a".repeat(80)).success).toBe(true);
    expect(classNameSchema.safeParse("a".repeat(81)).success).toBe(false);
  });

  it("measures length after trimming", () => {
    expect(classNameSchema.safeParse(`  ${"a".repeat(80)}  `).success).toBe(true);
  });

  it("rejects blank and whitespace-only names", () => {
    expect(classNameSchema.safeParse("").success).toBe(false);
    expect(classNameSchema.safeParse("   ").success).toBe(false);
  });

  it("keeps non-Latin text untouched", () => {
    expect(classNameSchema.parse("Từ vựng 日本語")).toBe("Từ vựng 日本語");
  });
});

describe("create and rename schemas", () => {
  it("require a valid name", () => {
    expect(createClassSchema.safeParse({ name: "IELTS" }).success).toBe(true);
    expect(createClassSchema.safeParse({}).success).toBe(false);
    expect(renameClassSchema.safeParse({ name: " " }).success).toBe(false);
  });
});

describe("deleteClassSchema", () => {
  it("accepts move with a target and delete with a confirm name", () => {
    expect(
      deleteClassSchema.safeParse({ mode: "move", targetClassId: "c1" }).success
    ).toBe(true);
    expect(
      deleteClassSchema.safeParse({ mode: "delete", confirmName: "IELTS" }).success
    ).toBe(true);
  });

  it("rejects move without a target and delete without a confirm name", () => {
    expect(deleteClassSchema.safeParse({ mode: "move" }).success).toBe(false);
    expect(
      deleteClassSchema.safeParse({ mode: "move", targetClassId: "" }).success
    ).toBe(false);
    expect(deleteClassSchema.safeParse({ mode: "delete" }).success).toBe(false);
  });

  it("rejects unknown modes", () => {
    expect(deleteClassSchema.safeParse({ mode: "archive" }).success).toBe(false);
  });
});

describe("uniqueFolderName", () => {
  it("returns the name unchanged when free", () => {
    expect(uniqueFolderName("Weather", ["Travel"])).toBe("Weather");
  });

  it("adds (2) on the first clash", () => {
    expect(uniqueFolderName("Weather", ["Weather"])).toBe("Weather (2)");
  });

  it("adds (3) when (2) is taken too", () => {
    expect(uniqueFolderName("Weather", ["Weather", "Weather (2)"])).toBe(
      "Weather (3)"
    );
  });

  it("fills the first free number", () => {
    expect(uniqueFolderName("Weather", ["Weather", "Weather (3)"])).toBe(
      "Weather (2)"
    );
  });

  it("accepts any iterable", () => {
    expect(uniqueFolderName("A", new Set(["A"]))).toBe("A (2)");
  });
});
