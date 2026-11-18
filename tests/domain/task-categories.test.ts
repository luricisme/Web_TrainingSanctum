import { describe, expect, it } from "vitest";
import {
  TASK_CATEGORY_NAME_MAX_LENGTH,
  backupExportSchema,
  createTaskCategorySchema,
  deleteTaskCategorySchema,
  nextClassColor,
  taskCategoryNameSchema,
  updateTaskCategorySchema,
  updateTaskSchema,
} from "@training-sanctum/domain";

describe("task category schemas (spec-8-2)", () => {
  it("trims the name and enforces the length limit", () => {
    expect(taskCategoryNameSchema.parse("  Study  ")).toBe("Study");
    const max = "a".repeat(TASK_CATEGORY_NAME_MAX_LENGTH);
    expect(taskCategoryNameSchema.safeParse(max).success).toBe(true);
    expect(taskCategoryNameSchema.safeParse(`${max}a`).success).toBe(false);
    expect(taskCategoryNameSchema.safeParse("   ").success).toBe(false);
    expect(taskCategoryNameSchema.safeParse("").success).toBe(false);
  });

  it("create takes an optional colour from the five tints", () => {
    expect(createTaskCategorySchema.safeParse({ name: "Study" }).success).toBe(true);
    expect(createTaskCategorySchema.safeParse({ name: "Study", color: "ROSE" }).success).toBe(true);
    expect(createTaskCategorySchema.safeParse({ name: "Study", color: "RED" }).success).toBe(false);
  });

  it("the default colour is the next tint by count", () => {
    expect(nextClassColor(2)).toBe("MINT");
  });

  it("update needs a name or a colour", () => {
    expect(updateTaskCategorySchema.safeParse({}).success).toBe(false);
    expect(updateTaskCategorySchema.safeParse({ color: "SKY" }).success).toBe(true);
    expect(updateTaskCategorySchema.safeParse({ name: "Gym" }).success).toBe(true);
  });

  it("musicTrack accepts null and a jamendo ref, and rejects other shapes", () => {
    const ref = { source: "jamendo", trackId: "1204" };
    expect(createTaskCategorySchema.safeParse({ name: "A", musicTrack: ref }).success).toBe(true);
    expect(createTaskCategorySchema.safeParse({ name: "A", musicTrack: null }).success).toBe(true);
    expect(updateTaskCategorySchema.safeParse({ musicTrack: null }).success).toBe(true);
    expect(updateTaskCategorySchema.safeParse({ musicTrack: ref }).success).toBe(true);
    for (const bad of [{ source: "x" }, { source: "spotify", trackId: "1" }, { source: "jamendo", trackId: "" }, { source: "jamendo", trackId: "search" }, { source: "jamendo", trackId: "12a" }, { source: "jamendo", trackId: "1".repeat(21) }, "1204"]) {
      expect(updateTaskCategorySchema.safeParse({ musicTrack: bad }).success).toBe(false);
    }
    expect(updateTaskSchema.safeParse({ musicTrack: null }).success).toBe(true);
    expect(updateTaskSchema.safeParse({ musicTrack: { source: "x" } }).success).toBe(false);
  });

  it("delete is move with a target or delete", () => {
    expect(deleteTaskCategorySchema.safeParse({ mode: "move", targetId: "x" }).success).toBe(true);
    expect(deleteTaskCategorySchema.safeParse({ mode: "move" }).success).toBe(false);
    expect(deleteTaskCategorySchema.safeParse({ mode: "delete" }).success).toBe(true);
  });
});

describe("backup schema with Planner XP events (spec-8-2)", () => {
  const ts = "2026-11-17T10:00:00.000Z";
  const payload = (events: unknown[]) => ({
    version: 1,
    exportedAt: ts,
    user: { id: "u1", email: "a@example.test", studyDirections: "BOTH", timezone: "UTC" },
    classes: [],
    sharedClasses: [],
    folders: [],
    flashcards: [],
    cards: [],
    cultivation: { xp: 5, settledThrough: null, days: [], xpEvents: events },
    planner: { settings: { focus: 25, shortBreak: 5, longBreak: 15, longBreakEvery: 4 }, categories: [], tasks: [], sessions: [] },
  });

  it("round-trips a null questKind and the new reasons", () => {
    const events = [
      { id: "e1", localDay: "2026-11-17", questKind: null, delta: 5, reason: "TASK_DONE", createdAt: ts },
      { id: "e2", localDay: "2026-11-17", questKind: null, delta: 10, reason: "FOCUS_SESSION", createdAt: ts },
    ];
    const parsed = backupExportSchema.parse(payload(events));
    expect(parsed.cultivation.xpEvents).toEqual(events);
  });

  it("an old planner without musicTrack parses with null", () => {
    const p = payload([]);
    p.planner.categories = [{ id: "c", name: "A", color: "SKY", createdAt: ts, updatedAt: ts }] as never;
    const parsed = backupExportSchema.parse(p);
    expect(parsed.planner.categories[0]!.musicTrack).toBeNull();
  });

  it("still rejects an unknown reason", () => {
    const bad = [{ id: "e", localDay: "2026-11-17", questKind: null, delta: 1, reason: "NOPE", createdAt: ts }];
    expect(backupExportSchema.safeParse(payload(bad)).success).toBe(false);
  });
});
