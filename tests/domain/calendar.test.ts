import { describe, expect, it } from "vitest";
import {
  layoutCalendarDay,
  layoutWeek,
  snapStartMinutes,
  stepSlot,
  formatStartTime,
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

describe("snapStartMinutes", () => {
  it("rounds to 15 minutes", () => {
    expect(snapStartMinutes(20 * 60 + 7)).toBe(20 * 60);
    expect(snapStartMinutes(9 * 60 + 20)).toBe(9 * 60 + 15);
    expect(snapStartMinutes(9 * 60 + 23)).toBe(9 * 60 + 30);
  });
  it("returns 0 for non-finite input", () => {
    expect(snapStartMinutes(Number.NaN)).toBe(0);
    expect(snapStartMinutes(Infinity)).toBe(0);
  });
  it("clamps to 00:00 and 23:45", () => {
    expect(snapStartMinutes(23 * 60 + 58)).toBe(1425);
    expect(snapStartMinutes(-30)).toBe(0);
  });
});

describe("formatStartTime", () => {
  it("pads HH:MM", () => {
    expect(formatStartTime(0)).toBe("00:00");
    expect(formatStartTime(9 * 60 + 15)).toBe("09:15");
    expect(formatStartTime(1425)).toBe("23:45");
  });
});

describe("stepSlot", () => {
  const days = weekDays("2026-11-17");
  it("moves 15 minutes and one day", () => {
    let s = { day: "2026-11-17", startMin: 1140 as number | null };
    s = stepSlot(s, "ArrowDown", days);
    s = stepSlot(s, "ArrowDown", days);
    s = stepSlot(s, "ArrowRight", days);
    expect(s).toEqual({ day: "2026-11-18", startMin: 1170 });
  });
  it("snaps an off-grid start to the 15-minute grid before stepping", () => {
    expect(stepSlot({ day: "2026-11-17", startMin: 1145 }, "ArrowDown", days).startMin).toBe(1155);
    expect(stepSlot({ day: "2026-11-17", startMin: 1145 }, "ArrowUp", days).startMin).toBe(1125);
  });
  it("stays at the week edges and day bounds", () => {
    expect(stepSlot({ day: "2026-11-22", startMin: 60 }, "ArrowRight", days).day).toBe("2026-11-22");
    expect(stepSlot({ day: "2026-11-16", startMin: 60 }, "ArrowLeft", days).day).toBe("2026-11-16");
    expect(stepSlot({ day: "2026-11-16", startMin: 0 }, "ArrowUp", days).startMin).toBeNull();
    expect(stepSlot({ day: "2026-11-16", startMin: 1425 }, "ArrowDown", days).startMin).toBe(1425);
  });
  it("moves a tray slot between days and into the grid at 09:00", () => {
    expect(stepSlot({ day: "2026-11-16", startMin: null }, "ArrowDown", days).startMin).toBe(540);
    expect(stepSlot({ day: "2026-11-16", startMin: null }, "ArrowUp", days).startMin).toBeNull();
    expect(stepSlot({ day: "2026-11-16", startMin: null }, "ArrowRight", days)).toEqual({ day: "2026-11-17", startMin: null });
  });
});
