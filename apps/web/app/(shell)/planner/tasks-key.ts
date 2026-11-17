/** React Query key prefix for Planner Tasks; the day (`YYYY-MM-DD`) follows. */
export const PLANNER_TASKS_KEY = ["planner-tasks"] as const;

export const plannerTasksKey = (day: string) => [...PLANNER_TASKS_KEY, day] as const;

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
