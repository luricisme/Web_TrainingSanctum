import { describe, expect, it } from "vitest";
import {
  compareTasks,
  createTaskSchema,
  localDateTimeToInstant,
  plannerXp,
  updateTaskSchema,
} from "@training-sanctum/domain";

type Bo = 1 | 2 | 3 | 4;
const BOS: Bo[] = [1, 2, 3, 4];

describe("plannerXp (spec-8-3)", () => {
  it("awards 5 / 10 / 20 / 20 for a done Task at Bo 1-4", () => {
    expect(BOS.map((bo) => plannerXp(bo, "TASK_DONE"))).toEqual([5, 10, 20, 20]);
  });
  it("awards 1 / 2 / 4 / 4 for a focus session at Bo 1-4", () => {
    expect(BOS.map((bo) => plannerXp(bo, "FOCUS_SESSION"))).toEqual([1, 2, 4, 4]);
  });
});

describe("task schemas (spec-8-3)", () => {
  const valid = { title: "  Read  ", categoryId: "c1", localDay: "2026-11-17", estimateMinutes: 25 };
  it("trims the title and accepts an optional time", () => {
    expect(createTaskSchema.parse(valid).title).toBe("Read");
    expect(createTaskSchema.parse({ ...valid, startTime: "23:30" }).startTime).toBe("23:30");
  });
  it("rejects blank title, estimate under 5, non-integer, bad time and bad day", () => {
    for (const bad of [
      { title: "  " },
      { title: "x".repeat(121) },
      { estimateMinutes: 4 },
      { estimateMinutes: 10.5 },
      { startTime: "25:00" },
      { startTime: "9:00" },
      { localDay: "2026-02-31" },
      { categoryId: "" },
    ]) {
      expect(createTaskSchema.safeParse({ ...valid, ...bad }).success).toBe(false);
    }
  });
  it("update needs a field, allows clearing the time, and only reopens", () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
    expect(updateTaskSchema.safeParse({ startTime: null }).success).toBe(true);
    expect(updateTaskSchema.safeParse({ done: false }).success).toBe(true);
    expect(updateTaskSchema.safeParse({ done: true }).success).toBe(false);
  });
});

describe("task day and order (spec-8-3)", () => {
  it("builds a 23:30 start on its local day in the timezone", () => {
    const day = new Date("2026-11-17T00:00:00.000Z");
    const start = localDateTimeToInstant(day, 23, 30, "Asia/Ho_Chi_Minh");
    expect(start.toISOString()).toBe("2026-11-17T16:30:00.000Z");
  });
  it("orders open timed, open untimed, then done", () => {
    const t = (done: boolean, start: string | null, created: number) => ({
      done,
      startAt: start ? new Date(start) : null,
      createdAt: new Date(created),
    });
    const list = [
      t(true, "2026-11-17T01:00:00Z", 1),
      t(false, null, 2),
      t(false, "2026-11-17T09:00:00Z", 3),
      t(false, "2026-11-17T08:00:00Z", 4),
    ];
    list.sort(compareTasks);
    expect(list.map((x) => [x.done, x.createdAt.getTime()])).toEqual([
      [false, 4],
      [false, 3],
      [false, 2],
      [true, 1],
    ]);
  });
});
