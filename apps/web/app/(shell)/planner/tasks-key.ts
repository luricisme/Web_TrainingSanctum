/** React Query key prefix for Planner Tasks; the day (`YYYY-MM-DD`) follows. */
export const PLANNER_TASKS_KEY = ["planner-tasks"] as const;

/** React Query key for the Overdue count. */
export const PLANNER_OVERDUE_KEY = ["planner-overdue"] as const;

export const plannerTasksKey = (day: string) => [...PLANNER_TASKS_KEY, day] as const;

/** React Query key for one calendar week, by its Monday. Kept out of PLANNER_TASKS_KEY: its rows carry `planMinutes`. */
export const plannerWeekKey = (monday: string) => ["planner-week", monday] as const;

/** "16 – 22 November 2026" for the Monday-to-Sunday week starting at `monday`. */
export function formatWeek(monday: string): string {
  const fmt = (day: string, withYear: boolean, withMonth: boolean) =>
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      ...(withMonth ? { month: "long" } : {}),
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    }).format(new Date(`${day}T00:00:00.000Z`));
  const sunday = shiftDay(monday, 6);
  const sameMonth = monday.slice(0, 7) === sunday.slice(0, 7);
  const sameYear = monday.slice(0, 4) === sunday.slice(0, 4);
  return `${fmt(monday, !sameYear, !sameMonth)} – ${fmt(sunday, true, true)}`;
}

/** "Mon" for a `YYYY-MM-DD` day. */
export function weekdayShort(day: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00.000Z`)
  );
}

/** `YYYY-MM-DD` of the browser's local calendar date. */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The day `delta` calendar days from `day` (both `YYYY-MM-DD`). */
export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** "Tuesday 17 November" for a `YYYY-MM-DD` day. */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00.000Z`));
}
