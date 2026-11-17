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

export const pomodoroSettingsSchema = z.object({
  focus: minutesSetting("Focus"),
  shortBreak: minutesSetting("Short break"),
  longBreak: minutesSetting("Long break"),
  longBreakEvery: z
    .number({ error: "Long break every must be a number." })
    .int("Long break every must be a whole number.")
    .min(2, "Long break every must be between 2 and 8 sessions.")
    .max(8, "Long break every must be between 2 and 8 sessions."),
});

export type PomodoroSettings = z.infer<typeof pomodoroSettingsSchema>;

export const DEFAULT_POMODORO_SETTINGS: Readonly<PomodoroSettings> = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
  longBreakEvery: 4,
};

/** A partial update: at least one known key, unknown keys rejected. */
export const updatePomodoroSettingsSchema = pomodoroSettingsSchema
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
