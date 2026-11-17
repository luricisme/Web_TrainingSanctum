import { describe, expect, it } from "vitest";
import {
  compareTasks,
  createTaskSchema,
  DEFAULT_POMODORO_SETTINGS,
  localDateTimeToInstant,
  overrunSessionsUsed,
  parsePomodoroSettings,
  planLengthMinutes,
  planPomodoro,
  plannerXp,
  pomodoroSettingsSchema,
  remainingMinutes,
  updatePomodoroSettingsSchema,
  updateTaskSchema,
} from "@training-sanctum/domain";

type Bo = 1 | 2 | 3 | 4;
const BOS: Bo[] = [1, 2, 3, 4];

describe("planPomodoro (spec-9-1)", () => {
  const D = DEFAULT_POMODORO_SETTINGS;
  const shape = (remaining: number, settings = D) =>
    planPomodoro(remaining, settings).map((i) => i.plannedMinutes);

  it("plans 90 minutes as 25-5-25-5-25-5-15", () => {
    expect(planPomodoro(90, D)).toEqual([
      { kind: "FOCUS", plannedMinutes: 25 },
      { kind: "BREAK", plannedMinutes: 5 },
      { kind: "FOCUS", plannedMinutes: 25 },
      { kind: "BREAK", plannedMinutes: 5 },
      { kind: "FOCUS", plannedMinutes: 25 },
      { kind: "BREAK", plannedMinutes: 5 },
      { kind: "FOCUS", plannedMinutes: 15 },
    ]);
    expect(planLengthMinutes(planPomodoro(90, D))).toBe(105);
  });
  it("handles the edges", () => {
    expect(shape(0)).toEqual([]);
    expect(shape(-5)).toEqual([]);
    expect(shape(10)).toEqual([10]);
    expect(shape(25)).toEqual([25]);
    expect(shape(50)).toEqual([25, 5, 25]);
    expect(shape(100)).toEqual([25, 5, 25, 5, 25, 5, 25]);
  });
  it("puts the long break after every longBreakEvery-th focus session", () => {
    // Rule: a long break after every 2nd focus (the spec matrix row lists a short break after the 4th; see report).
    expect(shape(125, { ...D, longBreakEvery: 2 })).toEqual([25, 5, 25, 15, 25, 5, 25, 15, 25]);
    expect(shape(125, { ...D, longBreakEvery: 4 })).toEqual([25, 5, 25, 5, 25, 5, 25, 15, 25]);
  });
});

describe("remainingMinutes / overrunSessionsUsed (spec-9-1)", () => {
  const f = (actualMinutes: number | null, overrun = false) => ({ kind: "FOCUS" as const, actualMinutes, overrun });
  it("subtracts focus minutes only", () => {
    const sessions = [f(25), f(20), { kind: "BREAK" as const, actualMinutes: 5, overrun: false }];
    expect(remainingMinutes({ estimateMinutes: 90 }, sessions)).toBe(45);
  });
  it("never goes below zero", () => {
    expect(remainingMinutes({ estimateMinutes: 30 }, [f(25), f(25)])).toBe(0);
  });
  it("counts overrun focus sessions", () => {
    expect(overrunSessionsUsed([f(25, true), f(10), f(5, true)])).toBe(2);
  });
});

describe("pomodoro settings schema (spec-9-1)", () => {
  it("accepts the bounds", () => {
    expect(pomodoroSettingsSchema.safeParse({ focus: 5, shortBreak: 90, longBreak: 5, longBreakEvery: 8 }).success).toBe(true);
    expect(pomodoroSettingsSchema.safeParse({ focus: 25, shortBreak: 5, longBreak: 15, longBreakEvery: 2 }).success).toBe(true);
  });
  it("rejects out-of-range, fractional and unknown", () => {
    for (const bad of [{ focus: 4 }, { focus: 91 }, { longBreakEvery: 1 }, { longBreakEvery: 9 }, { focus: 25.5 }, { nope: 1 }, {}]) {
      expect(updatePomodoroSettingsSchema.safeParse(bad).success).toBe(false);
    }
    expect(updatePomodoroSettingsSchema.safeParse({ focus: 30 }).success).toBe(true);
  });
  it("reads invalid stored JSON as the defaults", () => {
    expect(parsePomodoroSettings({})).toEqual(DEFAULT_POMODORO_SETTINGS);
    expect(parsePomodoroSettings(null)).toEqual(DEFAULT_POMODORO_SETTINGS);
    expect(parsePomodoroSettings({ focus: 1, shortBreak: 5, longBreak: 15, longBreakEvery: 4 })).toEqual(DEFAULT_POMODORO_SETTINGS);
    expect(parsePomodoroSettings({ focus: 30, shortBreak: 5, longBreak: 15, longBreakEvery: 4 }).focus).toBe(30);
  });
});

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
