import { describe, expect, it } from "vitest";
import {
  layoutCalendarDay,
  layoutWeek,
  weekDays,
  weekQuerySchema,
  type CalendarTask,
} from "@training-sanctum/domain";

const task = (
  id: string,
  startTime: string | null,
  planMinutes: number,
  localDay = "2026-11-17"
): CalendarTask => ({ id, localDay, startTime, planMinutes });

describe("weekDays", () => {
  it("is Monday to Sunday around any day of the week", () => {
    const expected = [
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ];
    expect(weekDays("2026-11-16")).toEqual(expected);
    expect(weekDays("2026-11-19")).toEqual(expected);
    expect(weekDays("2026-11-22")).toEqual(expected);
  });

  it("crosses month and year ends", () => {
    expect(weekDays("2026-12-31")[0]).toBe("2026-12-28");
    expect(weekDays("2026-12-31")[6]).toBe("2027-01-03");
  });
});

describe("weekQuerySchema", () => {
  it("needs a real date", () => {
    expect(weekQuerySchema.safeParse({}).success).toBe(false);
    expect(weekQuerySchema.safeParse({ start: "nope" }).success).toBe(false);
    expect(weekQuerySchema.safeParse({ start: "2026-02-30" }).success).toBe(false);
    expect(weekQuerySchema.safeParse({ start: "2026-11-17" }).success).toBe(true);
  });
});

describe("layoutCalendarDay", () => {
  it("lays a plain block at its start with its plan length", () => {
    expect(layoutCalendarDay([task("a", "19:00", 105)])).toEqual([
      { taskId: "a", startMin: 1140, lengthMin: 105, lane: 0, lanes: 1, conflict: false, continued: false },
    ]);
  });

  it("puts overlapping blocks side by side and flags both", () => {
    const blocks = layoutCalendarDay([task("a", "19:00", 105), task("b", "20:00", 60)]);
    expect(blocks.map((b) => [b.taskId, b.lane, b.lanes, b.conflict])).toEqual([
      ["a", 0, 2, true],
      ["b", 1, 2, true],
    ]);
  });

  it("does not treat touching blocks as a conflict", () => {
    const blocks = layoutCalendarDay([task("a", "19:00", 60), task("b", "20:00", 30)]);
    expect(blocks.map((b) => [b.lane, b.lanes, b.conflict])).toEqual([
      [0, 1, false],
      [0, 1, false],
    ]);
  });

  it("reuses a freed lane and keeps one lane count per cluster", () => {
    // a 09:00-11:00 overlaps b 09:30-10:00 and c 10:00-10:30 (b and c do not overlap each other).
    const blocks = layoutCalendarDay([
      task("a", "09:00", 120),
      task("b", "09:30", 30),
      task("c", "10:00", 30),
      task("d", "13:00", 30),
    ]);
    const by = Object.fromEntries(blocks.map((b) => [b.taskId, b]));
    expect([by.a!.lane, by.b!.lane, by.c!.lane]).toEqual([0, 1, 1]);
    expect([by.a!.lanes, by.b!.lanes, by.c!.lanes]).toEqual([2, 2, 2]);
    expect([by.d!.lane, by.d!.lanes, by.d!.conflict]).toEqual([0, 1, false]);
  });

  it("ignores untimed Tasks and an empty day", () => {
    expect(layoutCalendarDay([task("a", null, 60)])).toEqual([]);
    expect(layoutCalendarDay([])).toEqual([]);
  });

  it("clips a block at midnight", () => {
    const [block] = layoutCalendarDay([task("a", "23:00", 90)]);
    expect(block).toMatchObject({ startMin: 1380, lengthMin: 60, continued: false });
  });

  it("draws carried continuations from 00:00 and flags overlaps with them", () => {
    const blocks = layoutCalendarDay([task("b", "00:10", 30)], [{ taskId: "a", lengthMin: 30 }]);
    expect(blocks.find((b) => b.taskId === "a")).toMatchObject({
      startMin: 0,
      lengthMin: 30,
      continued: true,
      conflict: true,
    });
  });
});

describe("layoutWeek", () => {
  const days = weekDays("2026-11-17");

  it("continues a past-midnight block into the next shown day", () => {
    const layout = layoutWeek(days, [task("a", "23:00", 90, "2026-11-17")]);
    expect(layout["2026-11-17"]![0]).toMatchObject({ startMin: 1380, lengthMin: 60, continued: false });
    expect(layout["2026-11-18"]![0]).toMatchObject({
      taskId: "a",
      startMin: 0,
      lengthMin: 30,
      continued: true,
    });
  });

  it("clips the continuation at the week edge", () => {
    const layout = layoutWeek(days, [task("a", "23:00", 90, "2026-11-22")]);
    expect(layout["2026-11-22"]).toHaveLength(1);
    expect(Object.values(layout).flat()).toHaveLength(1);
  });

  it("leaves a no-start Task out of the grid", () => {
    const layout = layoutWeek(days, [task("a", null, 60)]);
    expect(Object.values(layout).flat()).toEqual([]);
  });
});
