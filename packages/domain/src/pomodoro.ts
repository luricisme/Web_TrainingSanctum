/**
 * Planner XP (spec-8-3, AD-1: pure). XP is passive: a Task marked done earns
 * once, and (Epic 9) a finished focus session earns a little. Sized by Bộ so
 * it scales with the quest table.
 */
import { z } from "zod";
import type { BoNumber } from "./cultivation";

export type PlannerXpKind = "TASK_DONE" | "FOCUS_SESSION";

const PLANNER_XP: Readonly<Record<PlannerXpKind, Readonly<Record<BoNumber, number>>>> = {
  TASK_DONE: { 1: 5, 2: 10, 3: 20, 4: 20 },
  FOCUS_SESSION: { 1: 1, 2: 2, 3: 4, 4: 4 },
};

/** XP awarded for `kind` at Bộ `bo`. */
export function plannerXp(bo: BoNumber, kind: PlannerXpKind): number {
  return PLANNER_XP[kind][bo];
}

/** Pomodoro settings (spec-9-1): minutes, whole numbers. */
const minutesSetting = (label: string) =>
  z
    .number({ error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(5, `${label} must be between 5 and 90 minutes.`)
    .max(90, `${label} must be between 5 and 90 minutes.`);

const settingsShape = {
  focus: minutesSetting("Focus"),
  shortBreak: minutesSetting("Short break"),
  longBreak: minutesSetting("Long break"),
  longBreakEvery: z
    .number({ error: "Long break every must be a number." })
    .int("Long break every must be a whole number.")
    .min(2, "Long break every must be between 2 and 8 sessions.")
    .max(8, "Long break every must be between 2 and 8 sessions."),
  /** Start the next session by itself when one runs out. */
  autoStartNext: z.boolean({ error: "Auto-start must be on or off." }),
};

/** Stored settings and old backups may lack `autoStartNext`; it reads as off. */
export const pomodoroSettingsSchema = z.object({
  ...settingsShape,
  autoStartNext: settingsShape.autoStartNext.default(false),
});

export type PomodoroSettings = z.infer<typeof pomodoroSettingsSchema>;

export const DEFAULT_POMODORO_SETTINGS: Readonly<PomodoroSettings> = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
  longBreakEvery: 4,
  autoStartNext: false,
};

/** A partial update: at least one known key, unknown keys rejected. */
export const updatePomodoroSettingsSchema = z
  .object(settingsShape)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Send at least one setting.",
  });

export type UpdatePomodoroSettingsInput = z.infer<typeof updatePomodoroSettingsSchema>;

/** A stored value that fails the schema reads as the defaults. */
export function parsePomodoroSettings(stored: unknown): PomodoroSettings {
  const parsed = pomodoroSettingsSchema.safeParse(stored);
  return parsed.success ? parsed.data : { ...DEFAULT_POMODORO_SETTINGS };
}

export type PomodoroPlanItem = { kind: "FOCUS" | "BREAK"; plannedMinutes: number };

/**
 * The binding plan for `remaining` minutes: full focus sessions, a break after
 * each (long after every `longBreakEvery`-th focus), one final remainder
 * focus session (never rounded up), and no break after the last focus.
 */
export function planPomodoro(remaining: number, settings: PomodoroSettings): PomodoroPlanItem[] {
  const plan: PomodoroPlanItem[] = [];
  let left = remaining;
  let focusCount = 0;
  while (left > 0) {
    const minutes = Math.min(settings.focus, left);
    plan.push({ kind: "FOCUS", plannedMinutes: minutes });
    left -= minutes;
    focusCount += 1;
    if (left > 0) {
      const long = focusCount % settings.longBreakEvery === 0;
      plan.push({ kind: "BREAK", plannedMinutes: long ? settings.longBreak : settings.shortBreak });
    }
  }
  return plan;
}

export interface PomodoroSessionFacts {
  kind: "FOCUS" | "BREAK";
  actualMinutes: number | null;
  overrun: boolean;
}

/** max(estimate - sum of actual FOCUS minutes, 0). */
export function remainingMinutes(
  task: { estimateMinutes: number },
  sessions: readonly PomodoroSessionFacts[]
): number {
  const done = sessions.reduce(
    (sum, s) => (s.kind === "FOCUS" ? sum + (s.actualMinutes ?? 0) : sum),
    0
  );
  return Math.max(task.estimateMinutes - done, 0);
}

/** FOCUS sessions marked overrun. */
export function overrunSessionsUsed(sessions: readonly PomodoroSessionFacts[]): number {
  return sessions.filter((s) => s.kind === "FOCUS" && s.overrun).length;
}

export function planLengthMinutes(plan: readonly PomodoroPlanItem[]): number {
  return plan.reduce((sum, item) => sum + item.plannedMinutes, 0);
}

/** A session as the calendar block length needs it (spec-10-3). `actualMinutes` null means running. */
export interface BlockSessionFacts {
  kind: "FOCUS" | "BREAK";
  actualMinutes: number | null;
  plannedMinutes: number;
}

/**
 * Calendar block length (spec-10-3): logged minutes of ended sessions, plus the
 * running session's planned minutes, plus the plan length of the focus minutes
 * still unlogged. No sessions: the plan length. A done Task with logged time is
 * as long as what was logged. Nothing is stored.
 */
export function blockMinutes(
  task: { estimateMinutes: number; done: boolean },
  sessions: readonly BlockSessionFacts[],
  settings: PomodoroSettings
): number {
  let logged = 0;
  let loggedFocus = 0;
  let runningMinutes = 0;
  let runningFocus = 0;
  for (const s of sessions) {
    if (s.actualMinutes === null) {
      runningMinutes += s.plannedMinutes;
      if (s.kind === "FOCUS") runningFocus += s.plannedMinutes;
    } else {
      logged += s.actualMinutes;
      if (s.kind === "FOCUS") loggedFocus += s.actualMinutes;
    }
  }
  if (task.done && logged + runningMinutes > 0) return logged + runningMinutes;
  const unlogged = Math.max(task.estimateMinutes - loggedFocus - runningFocus, 0);
  return logged + runningMinutes + planLengthMinutes(planPomodoro(unlogged, settings));
}

export const startSessionSchema = z.object({
  taskId: z.string({ error: "Task is required." }).min(1, "Task is required."),
  kind: z.enum(["FOCUS", "BREAK"], { error: "Kind must be FOCUS or BREAK." }),
  overrun: z.boolean({ error: "Overrun must be true or false." }).default(false),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;

/** A Pomodoro session as the API returns it (spec-9-2). */
export interface SessionSummary {
  id: string;
  taskId: string;
  kind: "FOCUS" | "BREAK";
  plannedMinutes: number;
  actualMinutes: number | null;
  startedAt: string;
  endedAt: string | null;
  overrun: boolean;
}

export const MAX_OVERRUN_SESSIONS = 2;

export type PlanNextSessionResult =
  | { plannedMinutes: number; refusal?: undefined }
  | { refusal: string; plannedMinutes?: undefined };

/**
 * What a start request may run next: the planned length, or the reason it is
 * refused. Facts come from the route; `sessions` are the Task's sessions.
 */
export function planNextSession(
  input: {
    task: { estimateMinutes: number; done: boolean };
    kind: "FOCUS" | "BREAK";
    overrun: boolean;
    sessions: readonly PomodoroSessionFacts[];
  },
  settings: PomodoroSettings
): PlanNextSessionResult {
  const { task, kind, overrun, sessions } = input;
  if (task.done) return { refusal: "This Task is done." };
  const remaining = remainingMinutes(task, sessions);
  const endedFocus = sessions.filter(
    (s) => s.kind === "FOCUS" && s.actualMinutes !== null
  ).length;

  if (kind === "BREAK") {
    if (overrun) return { refusal: "A break cannot be an overrun session." };
    if (remaining <= 0) return { refusal: "No time left on this Task. Edit the estimate to continue." };
    if (endedFocus < 1) return { refusal: "Finish a focus session before a break." };
    const long = endedFocus % settings.longBreakEvery === 0;
    return { plannedMinutes: long ? settings.longBreak : settings.shortBreak };
  }

  if (overrun) {
    if (remaining > 0) return { refusal: "The Task still has time left; this is not an overrun." };
    if (overrunSessionsUsed(sessions) >= MAX_OVERRUN_SESSIONS) {
      return { refusal: "No overrun sessions left. Edit the estimate to continue." };
    }
    return { plannedMinutes: settings.focus };
  }
  if (remaining <= 0) return { refusal: "No time left on this Task. Edit the estimate to continue." };
  return { plannedMinutes: Math.min(settings.focus, remaining) };
}

export interface PomodoroPill {
  kind: "FOCUS" | "BREAK";
  minutes: number;
  state: "done" | "current" | "upcoming";
  overrun: boolean;
}

export type PomodoroNextStep =
  | { kind: "FOCUS"; plannedMinutes: number; overrun: boolean }
  | { kind: "BREAK"; plannedMinutes: number }
  | { kind: "DONE_CARD"; overrunLeft: number }
  | { kind: "EXHAUSTED" }
  | { kind: "TASK_DONE" };

export interface PomodoroScreenPlan {
  pills: PomodoroPill[];
  next: PomodoroNextStep;
  /** Minutes of the Task's estimate not yet logged. */
  remaining: number;
  overrunLeft: number;
  /** Logged focus minutes exceed the estimate. */
  over: boolean;
}

function planFrom(
  remaining: number,
  settings: PomodoroSettings,
  endedFocus: number
): PomodoroPlanItem[] {
  const plan: PomodoroPlanItem[] = [];
  let left = remaining;
  let count = endedFocus;
  while (left > 0) {
    const minutes = Math.min(settings.focus, left);
    plan.push({ kind: "FOCUS", plannedMinutes: minutes });
    left -= minutes;
    count += 1;
    if (left > 0) {
      plan.push({
        kind: "BREAK",
        plannedMinutes: count % settings.longBreakEvery === 0 ? settings.longBreak : settings.shortBreak,
      });
    }
  }
  return plan;
}

/**
 * The Pomodoro screen's single source (spec-9-3): strip pills, the next step
 * and the numbers around it. Mirrors `planNextSession` so a Start the screen
 * offers is one the server accepts. `notYet` is the user's "Not yet" answer
 * on the Done card. Sessions are the Task's, oldest first.
 */
export function pomodoroScreenPlan(
  input: {
    task: { estimateMinutes: number; done: boolean };
    sessions: readonly SessionSummary[];
    notYet?: boolean;
  },
  settings: PomodoroSettings
): PomodoroScreenPlan {
  const { task, sessions } = input;
  const ended = sessions.filter((s) => s.endedAt !== null);
  const running = sessions.find((s) => s.endedAt === null) ?? null;
  const remaining = remainingMinutes(task, sessions);
  const overrunLeft = Math.max(MAX_OVERRUN_SESSIONS - overrunSessionsUsed(sessions), 0);
  const endedFocus = ended.filter((s) => s.kind === "FOCUS" && s.actualMinutes !== null).length;
  const logged = sessions.reduce(
    (sum, s) => (s.kind === "FOCUS" ? sum + (s.actualMinutes ?? 0) : sum),
    0
  );
  const over = logged > task.estimateMinutes;

  const pills: PomodoroPill[] = ended.map((s) => ({
    kind: s.kind,
    minutes: s.actualMinutes ?? 0,
    state: "done",
    overrun: s.overrun,
  }));
  const upcoming = (items: PomodoroPlanItem[]) =>
    items.map<PomodoroPill>((item) => ({
      kind: item.kind,
      minutes: item.plannedMinutes,
      state: "upcoming",
      overrun: false,
    }));
  const finish = (next: PomodoroNextStep): PomodoroScreenPlan => ({
    pills,
    next,
    remaining,
    overrunLeft,
    over,
  });
  const breakFor = (focusCount: number): PomodoroPlanItem => ({
    kind: "BREAK",
    plannedMinutes: focusCount % settings.longBreakEvery === 0 ? settings.longBreak : settings.shortBreak,
  });

  if (running) {
    pills.push({
      kind: running.kind,
      minutes: running.plannedMinutes,
      state: "current",
      overrun: running.overrun,
    });
    if (running.kind === "FOCUS") {
      const after = running.overrun ? 0 : Math.max(remaining - running.plannedMinutes, 0);
      if (after > 0) {
        pills.push(
          ...upcoming([breakFor(endedFocus + 1), ...planFrom(after, settings, endedFocus + 1)])
        );
      }
      return finish({ kind: "FOCUS", plannedMinutes: running.plannedMinutes, overrun: running.overrun });
    }
    pills.push(...upcoming(planFrom(remaining, settings, endedFocus)));
    return finish({ kind: "BREAK", plannedMinutes: running.plannedMinutes });
  }

  if (task.done) return finish({ kind: "TASK_DONE" });

  if (remaining > 0) {
    const last = ended[ended.length - 1];
    const items = planFrom(remaining, settings, endedFocus);
    const all = last && last.kind === "FOCUS" ? [breakFor(endedFocus), ...items] : items;
    pills.push(...upcoming(all));
    pills[pills.length - all.length]!.state = "current";
    const first = all[0]!;
    return finish(
      first.kind === "BREAK"
        ? { kind: "BREAK", plannedMinutes: first.plannedMinutes }
        : { kind: "FOCUS", plannedMinutes: first.plannedMinutes, overrun: false }
    );
  }

  if (endedFocus < 1) return finish({ kind: "EXHAUSTED" });
  if (!input.notYet) return finish({ kind: "DONE_CARD", overrunLeft });
  if (overrunLeft <= 0) return finish({ kind: "EXHAUSTED" });
  pills.push({ kind: "FOCUS", minutes: settings.focus, state: "current", overrun: true });
  return finish({ kind: "FOCUS", plannedMinutes: settings.focus, overrun: true });
}
