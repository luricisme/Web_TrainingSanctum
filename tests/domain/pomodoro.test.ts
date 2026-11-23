import { describe, expect, it } from "vitest";
import {
  blockMinutes,
  compareTasks,
  createTaskSchema,
  DEFAULT_POMODORO_SETTINGS,
  localDateTimeToInstant,
  overrunSessionsUsed,
  parsePomodoroSettings,
  planLengthMinutes,
  planNextSession,
  planPomodoro,
  pomodoroScreenPlan,
  type SessionSummary,
  startSessionSchema,
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
  it("puts ordered tasks first by their order, then the rest; done still last", () => {
    const t = (title: string, sortOrder: number | null, done = false, start: string | null = null) => ({
      title,
      done,
      sortOrder,
      startAt: start ? new Date(start) : null,
      createdAt: new Date(0),
    });
    const list = [
      t("new timed", null, false, "2026-11-17T01:00:00Z"),
      t("done", 0, true),
      t("second", 1),
      t("first", 0),
    ];
    list.sort(compareTasks);
    expect(list.map((x) => x.title)).toEqual(["first", "second", "new timed", "done"]);
  });
});

describe("planNextSession (spec-9-2)", () => {
  const S = DEFAULT_POMODORO_SETTINGS;
  const f = (kind: "FOCUS" | "BREAK", actualMinutes: number | null, overrun = false) => ({
    kind,
    actualMinutes,
    overrun,
  });
  const task = (estimateMinutes: number, done = false) => ({ estimateMinutes, done });

  it("plans a full focus, then the remainder", () => {
    expect(planNextSession({ task: task(90), kind: "FOCUS", overrun: false, sessions: [] }, S)).toEqual({ plannedMinutes: 25 });
    expect(
      planNextSession({ task: task(35), kind: "FOCUS", overrun: false, sessions: [f("FOCUS", 25)] }, S)
    ).toEqual({ plannedMinutes: 10 });
  });
  it("picks short or long breaks at the boundary", () => {
    const focus = (n: number) => Array.from({ length: n }, () => f("FOCUS", 25));
    expect(planNextSession({ task: task(200), kind: "BREAK", overrun: false, sessions: focus(3) }, S)).toEqual({ plannedMinutes: 5 });
    expect(planNextSession({ task: task(200), kind: "BREAK", overrun: false, sessions: focus(4) }, S)).toEqual({ plannedMinutes: 15 });
  });
  it("refuses a break with no ended focus, no remaining time, or as overrun", () => {
    expect(planNextSession({ task: task(50), kind: "BREAK", overrun: false, sessions: [] }, S).refusal).toBeTruthy();
    expect(planNextSession({ task: task(25), kind: "BREAK", overrun: false, sessions: [f("FOCUS", 25)] }, S).refusal).toBeTruthy();
    expect(planNextSession({ task: task(50), kind: "BREAK", overrun: true, sessions: [f("FOCUS", 25)] }, S).refusal).toBeTruthy();
  });
  it("allows at most two overrun sessions, only when nothing remains", () => {
    const base = [f("FOCUS", 25)];
    const run = (sessions: ReturnType<typeof f>[], overrun: boolean) =>
      planNextSession({ task: task(25), kind: "FOCUS", overrun, sessions }, S);
    expect(run(base, true)).toEqual({ plannedMinutes: 25 });
    expect(run([...base, f("FOCUS", 25, true)], true)).toEqual({ plannedMinutes: 25 });
    expect(run([...base, f("FOCUS", 25, true), f("FOCUS", 25, true)], true).refusal).toBeTruthy();
    expect(run(base, false).refusal).toBeTruthy();
    expect(planNextSession({ task: task(50), kind: "FOCUS", overrun: true, sessions: base }, S).refusal).toBeTruthy();
  });
  it("starts nothing on a done Task", () => {
    expect(planNextSession({ task: task(50, true), kind: "FOCUS", overrun: false, sessions: [] }, S).refusal).toBeTruthy();
  });
  it("validates the start body and defaults overrun", () => {
    expect(startSessionSchema.parse({ taskId: "a", kind: "FOCUS" }).overrun).toBe(false);
    expect(startSessionSchema.safeParse({ taskId: "a", kind: "NAP" }).success).toBe(false);
  });
});

describe("pomodoroScreenPlan (spec-9-3)", () => {
  const S = DEFAULT_POMODORO_SETTINGS;
  const sum = (
    id: number,
    kind: "FOCUS" | "BREAK",
    actual: number | null,
    overrun = false
  ): SessionSummary => ({
    id: String(id),
    taskId: "t",
    kind,
    plannedMinutes: actual ?? 25,
    actualMinutes: actual,
    startedAt: "2026-11-17T09:00:00.000Z",
    endedAt: actual === null ? null : "2026-11-17T09:30:00.000Z",
    overrun,
  });
  const run = (est: number, sessions: SessionSummary[], notYet = false, done = false) =>
    pomodoroScreenPlan({ task: { estimateMinutes: est, done }, sessions, notYet }, S);
  const shape = (p: ReturnType<typeof run>) =>
    p.pills.filter((x) => x.state !== "done").map((x) => `${x.kind[0]}${x.minutes}`);

  it("plans 40 left of a 90 estimate as 25 5 15", () => {
    const fresh = run(40, []);
    expect(shape(fresh)).toEqual(["F25", "B5", "F15"]);
    expect(fresh.next).toEqual({ kind: "FOCUS", plannedMinutes: 25, overrun: false });
    expect(fresh.pills[0]!.state).toBe("current");
    const after = run(90, [sum(1, "FOCUS", 25), sum(2, "FOCUS", 25)]);
    expect(after.remaining).toBe(40);
    expect(shape(after)).toEqual(["B5", "F25", "B5", "F15"]);
  });
  it("offers the break after a focus and a focus after the break", () => {
    expect(run(90, [sum(1, "FOCUS", 25)]).next).toEqual({ kind: "BREAK", plannedMinutes: 5 });
    expect(run(90, [sum(1, "FOCUS", 25), sum(2, "BREAK", 5)]).next).toEqual({
      kind: "FOCUS",
      plannedMinutes: 25,
      overrun: false,
    });
  });
  it("after a stopped focus the strip shows what is left and offers a break", () => {
    const p = run(50, [sum(1, "FOCUS", 10)]);
    expect(p.remaining).toBe(40);
    expect(p.next.kind).toBe("BREAK");
    expect(shape(p)).toEqual(["B5", "F25", "B5", "F15"]);
  });
  it("shows the running session as current and the rest upcoming", () => {
    const p = run(60, [sum(1, "FOCUS", null)]);
    expect(p.next).toEqual({ kind: "FOCUS", plannedMinutes: 25, overrun: false });
    expect(p.pills.map((x) => `${x.state}:${x.kind[0]}${x.minutes}`)).toEqual([
      "current:F25",
      "upcoming:B5",
      "upcoming:F25",
      "upcoming:B5",
      "upcoming:F10",
    ]);
  });
  it("asks Done? when nothing remains, then offers overrun until the cap", () => {
    const base = [sum(1, "FOCUS", 25)];
    expect(run(25, base).next).toEqual({ kind: "DONE_CARD", overrunLeft: 2 });
    expect(run(25, base, true).next).toEqual({ kind: "FOCUS", plannedMinutes: 25, overrun: true });
    const one = [...base, sum(2, "FOCUS", 25, true)];
    expect(run(25, one).overrunLeft).toBe(1);
    expect(run(25, one).over).toBe(true);
    const two = [...one, sum(3, "FOCUS", 25, true)];
    expect(run(25, two, true).next).toEqual({ kind: "EXHAUSTED" });
  });
  it("is exhausted with no focus ever logged and done when the Task is done", () => {
    expect(run(0, []).next).toEqual({ kind: "EXHAUSTED" });
    expect(run(25, [], false, true).next).toEqual({ kind: "TASK_DONE" });
  });
});

describe("pomodoroScreenPlan parity and branches (spec-9-3)", () => {
  const sum = (
    id: number,
    kind: "FOCUS" | "BREAK",
    actual: number | null,
    planned = 25,
    overrun = false
  ): SessionSummary => ({
    id: String(id),
    taskId: "t",
    kind,
    plannedMinutes: planned,
    actualMinutes: actual,
    startedAt: "2026-11-17T09:00:00.000Z",
    endedAt: actual === null ? null : "2026-11-17T09:30:00.000Z",
    overrun,
  });
  const base = DEFAULT_POMODORO_SETTINGS;

  it("offers only what planNextSession accepts, with the same length", () => {
    const settingsList = [
      base,
      { focus: 20, shortBreak: 7, longBreak: 30, longBreakEvery: 2 },
      { focus: 50, shortBreak: 10, longBreak: 20, longBreakEvery: 3 },
    ];
    for (const settings of settingsList) {
      for (const estimate of [15, 40, 90, 200]) {
        for (let n = 0; n <= 6; n++) {
          for (const endWithBreak of [false, true]) {
            if (n === 0 && endWithBreak) continue;
            const sessions: SessionSummary[] = [];
            for (let i = 0; i < n; i++) {
              sessions.push(sum(sessions.length, "FOCUS", settings.focus, settings.focus));
              if (i < n - 1 || endWithBreak) sessions.push(sum(sessions.length, "BREAK", 5, 5));
            }
            const task = { estimateMinutes: estimate, done: false };
            const plan = pomodoroScreenPlan({ task, sessions }, settings);
            const { next } = plan;
            if (next.kind !== "FOCUS" && next.kind !== "BREAK") continue;
            const server = planNextSession(
              { task, kind: next.kind, overrun: next.kind === "FOCUS" && next.overrun, sessions },
              settings
            );
            expect(server.refusal, JSON.stringify({ settings, estimate, n, endWithBreak })).toBeUndefined();
            expect(server.plannedMinutes).toBe(next.plannedMinutes);
          }
        }
      }
    }
  });

  it("offers a long break on the Nth ended focus", () => {
    const settings = { focus: 20, shortBreak: 7, longBreak: 30, longBreakEvery: 2 };
    const sessions = [sum(1, "FOCUS", 20, 20), sum(2, "BREAK", 7, 7), sum(3, "FOCUS", 20, 20)];
    const plan = pomodoroScreenPlan({ task: { estimateMinutes: 100, done: false }, sessions }, settings);
    expect(plan.next).toEqual({ kind: "BREAK", plannedMinutes: 30 });
  });

  it("a running break is current, with the focus plan after it", () => {
    const sessions = [sum(1, "FOCUS", 25), sum(2, "BREAK", null, 5)];
    const p = pomodoroScreenPlan({ task: { estimateMinutes: 60, done: false }, sessions }, base);
    expect(p.next).toEqual({ kind: "BREAK", plannedMinutes: 5 });
    expect(p.pills.map((x) => `${x.state}:${x.kind[0]}${x.minutes}`)).toEqual([
      "done:F25",
      "current:B5",
      "upcoming:F25",
      "upcoming:B5",
      "upcoming:F10",
    ]);
  });

  it("a running overrun focus has nothing upcoming", () => {
    const sessions = [sum(1, "FOCUS", 25), sum(2, "FOCUS", null, 25, true)];
    const p = pomodoroScreenPlan({ task: { estimateMinutes: 25, done: false }, sessions }, base);
    expect(p.next).toEqual({ kind: "FOCUS", plannedMinutes: 25, overrun: true });
    expect(p.pills.filter((x) => x.state === "upcoming")).toHaveLength(0);
  });

  it("is not over at an exact match, and over past it", () => {
    const exact = pomodoroScreenPlan(
      { task: { estimateMinutes: 25, done: false }, sessions: [sum(1, "FOCUS", 25)] },
      base
    );
    expect(exact.over).toBe(false);
    const past = pomodoroScreenPlan(
      { task: { estimateMinutes: 20, done: false }, sessions: [sum(1, "FOCUS", 25)] },
      base
    );
    expect(past.over).toBe(true);
  });

  it("a running session wins over a done Task", () => {
    const p = pomodoroScreenPlan(
      { task: { estimateMinutes: 50, done: true }, sessions: [sum(1, "FOCUS", null)] },
      base
    );
    expect(p.next.kind).toBe("FOCUS");
    expect(p.pills[0]!.state).toBe("current");
  });
});

describe("blockMinutes (spec-10-3)", () => {
  const D = DEFAULT_POMODORO_SETTINGS;
  const ended = (kind: "FOCUS" | "BREAK", actualMinutes: number) => ({ kind, actualMinutes, plannedMinutes: actualMinutes });
  const running = (plannedMinutes: number, kind: "FOCUS" | "BREAK" = "FOCUS") => ({ kind, actualMinutes: null, plannedMinutes });

  it("keeps the plan length with no sessions", () => {
    expect(blockMinutes({ estimateMinutes: 90, done: false }, [], D)).toBe(105);
    expect(blockMinutes({ estimateMinutes: 90, done: true }, [], D)).toBe(105);
  });
  it("is the logged time for a Task done as planned", () => {
    const s = [ended("FOCUS", 25), ended("BREAK", 5), ended("FOCUS", 25)];
    expect(blockMinutes({ estimateMinutes: 50, done: true }, s, D)).toBe(55);
  });
  it("adds an overrun session", () => {
    const s = [ended("FOCUS", 25), ended("BREAK", 5), ended("FOCUS", 25), ended("FOCUS", 25)];
    expect(blockMinutes({ estimateMinutes: 50, done: false }, s, D)).toBe(80);
  });
  it("shortens when stopped early and done", () => {
    expect(blockMinutes({ estimateMinutes: 60, done: true }, [ended("FOCUS", 10)], D)).toBe(10);
  });
  it("is logged plus the remaining plan when stopped early and open", () => {
    // 10 logged, 50 focus minutes left = 25 + 5 + 25 = 55.
    expect(blockMinutes({ estimateMinutes: 60, done: false }, [ended("FOCUS", 10)], D)).toBe(65);
  });
  it("counts the running session at its planned length", () => {
    // Running 25 of a 50 plan: 25 running + 25 left (no break counted between).
    expect(blockMinutes({ estimateMinutes: 50, done: false }, [running(25)], D)).toBe(50);
  });
  it("does not treat a running break as focus", () => {
    const s = [ended("FOCUS", 25), running(5, "BREAK")];
    expect(blockMinutes({ estimateMinutes: 50, done: false }, s, D)).toBe(55);
  });
});
