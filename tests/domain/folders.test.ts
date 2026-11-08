import { describe, expect, it } from "vitest";
import {
  createFolderSchema,
  deleteFolderSchema,
  folderNameSchema,
  isFolderNameTaken,
  renameFolderSchema,
} from "@training-sanctum/domain";

describe("folderNameSchema (spec-2-2)", () => {
  it("trims and accepts a normal name", () => {
    expect(folderNameSchema.parse("  Weather  ")).toBe("Weather");
  });

  it("accepts 80 characters and rejects 81, blank and non-strings", () => {
    expect(folderNameSchema.safeParse("a".repeat(80)).success).toBe(true);
    expect(folderNameSchema.safeParse("a".repeat(81)).success).toBe(false);
    expect(folderNameSchema.safeParse("   ").success).toBe(false);
    expect(folderNameSchema.safeParse(undefined).success).toBe(false);
  });

  it("is reused by the create and rename schemas", () => {
    expect(createFolderSchema.safeParse({ name: "" }).success).toBe(false);
    expect(renameFolderSchema.parse({ name: " x " })).toEqual({ name: "x" });
  });
});

describe("deleteFolderSchema", () => {
  it("accepts move and delete only", () => {
    expect(deleteFolderSchema.safeParse({ mode: "move" }).success).toBe(true);
    expect(deleteFolderSchema.safeParse({ mode: "delete" }).success).toBe(true);
    expect(deleteFolderSchema.safeParse({ mode: "other" }).success).toBe(false);
    expect(deleteFolderSchema.safeParse({}).success).toBe(false);
  });
});

describe("isFolderNameTaken", () => {
  it("compares case-insensitively and ignores surrounding space", () => {
    expect(isFolderNameTaken("weather", ["Weather"])).toBe(true);
    expect(isFolderNameTaken("  WEATHER ", ["Weather"])).toBe(true);
    expect(isFolderNameTaken("Weather 2", ["Weather"])).toBe(false);
  });

  it("covers Unsorted", () => {
    expect(isFolderNameTaken("unsorted", ["Unsorted"])).toBe(true);
  });

  it("is false for an empty list", () => {
    expect(isFolderNameTaken("a", [])).toBe(false);
  });
});
