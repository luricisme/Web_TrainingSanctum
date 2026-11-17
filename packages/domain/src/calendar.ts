/**
 * Planner calendar layout (spec-10-1, AD-1: pure). Turns a week of Tasks into
 * per-day blocks with side-by-side lanes and conflict flags. Read-only: no
 * rescheduling logic lives here.
 */
import { z } from "zod";
import { localDaySchema, type TaskSummary } from "./tasks";

export const MINUTES_PER_DAY = 1440;

/** `GET /api/planner/tasks/week?start=YYYY-MM-DD` — the day browsed. */
export const weekQuerySchema = z.object({ start: localDaySchema });

/** The Monday-to-Sunday days (`YYYY-MM-DD`) of the week containing `day`. */
export function weekDays(day: string): string[] {
  const base = new Date(`${day}T00:00:00.000Z`);
  const sinceMonday = (base.getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - sinceMonday + i);
    return d.toISOString().slice(0, 10);
  });
}

/** Shape returned by `GET /api/planner/tasks/week`: a Task plus its plan length. */
export interface WeekTaskSummary extends TaskSummary {
  /** Focus plus breaks for the whole estimate, from the user's Pomodoro settings. */
  planMinutes: number;
}

/** What the layout needs of a Task. `planMinutes` is the server's plan length. */
export interface CalendarTask {
  id: string;
  /** `YYYY-MM-DD`. */
  localDay: string;
  /** `HH:MM` or null (untimed: tray only). */
  startTime: string | null;
  planMinutes: number;
}

export interface CalendarBlock {
  taskId: string;
  /** Minutes after 00:00. */
  startMin: number;
  lengthMin: number;
  /** 0-based column within its cluster of overlapping blocks. */
  lane: number;
  /** Column count of its cluster; equal for every block in the cluster. */
  lanes: number;
  conflict: boolean;
  /** True for the part of a block that ran past midnight from the day before. */
  continued: boolean;
}

/** A block carried into a day from the day before: only an id and a length. */
export interface CalendarCarry {
  taskId: string;
  lengthMin: number;
}

export function startMinutes(startTime: string): number {
  const [h, m] = startTime.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

interface Raw {
  taskId: string;
  startMin: number;
  lengthMin: number;
  continued: boolean;
}

/**
 * One day's blocks. `tasks` are the day's own timed Tasks (untimed ones are
 * ignored); `carried` are continuations from the day before, drawn from 00:00.
 * Lanes: sorted by start, each block takes the first lane whose last end is at
 * or before its start. A cluster is a run of connected overlapping blocks and
 * all of its blocks share the cluster's lane count. Touching is no overlap.
 */
export function layoutCalendarDay(
  tasks: readonly CalendarTask[],
  carried: readonly CalendarCarry[] = []
): CalendarBlock[] {
  const raw: Raw[] = [];
  for (const c of carried) {
    if (c.lengthMin > 0) {
      raw.push({ taskId: c.taskId, startMin: 0, lengthMin: Math.min(c.lengthMin, MINUTES_PER_DAY), continued: true });
    }
  }
  for (const t of tasks) {
    if (t.startTime === null) continue;
    const startMin = startMinutes(t.startTime);
    raw.push({
      taskId: t.id,
      startMin,
      lengthMin: Math.min(t.planMinutes, MINUTES_PER_DAY - startMin),
      continued: false,
    });
  }
  raw.sort((a, b) => a.startMin - b.startMin || a.taskId.localeCompare(b.taskId));

  const out: CalendarBlock[] = [];
  let laneEnds: number[] = [];
  let clusterStart = 0;
  let clusterEnd = -1;
  const closeCluster = () => {
    const lanes = laneEnds.length;
    for (let i = clusterStart; i < out.length; i += 1) out[i]!.lanes = lanes;
  };
  for (const r of raw) {
    const end = r.startMin + r.lengthMin;
    if (r.startMin >= clusterEnd) {
      closeCluster();
      clusterStart = out.length;
      laneEnds = [];
      clusterEnd = end;
    } else {
      clusterEnd = Math.max(clusterEnd, end);
    }
    let lane = laneEnds.findIndex((e) => e <= r.startMin);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = end;
    out.push({ ...r, lane, lanes: 1, conflict: false });
  }
  closeCluster();

  // A block conflicts when it overlaps any other (strictly; touching is fine).
  for (const a of out) {
    a.conflict = out.some(
      (b) =>
        b !== a &&
        a.startMin < b.startMin + b.lengthMin &&
        b.startMin < a.startMin + a.lengthMin
    );
  }
  return out;
}

/**
 * Blocks for each shown day. A block belongs to its start day; what runs past
 * midnight continues into the next shown day, and is clipped at the week edge.
 */
export function layoutWeek(
  days: readonly string[],
  tasks: readonly CalendarTask[]
): Record<string, CalendarBlock[]> {
  const result: Record<string, CalendarBlock[]> = {};
  let carry: CalendarCarry[] = [];
  for (const day of days) {
    const own = tasks.filter((t) => t.localDay === day);
    result[day] = layoutCalendarDay(own, carry);
    carry = [];
    for (const t of own) {
      if (t.startTime === null) continue;
      const over = startMinutes(t.startTime) + t.planMinutes - MINUTES_PER_DAY;
      if (over > 0) carry.push({ taskId: t.id, lengthMin: over });
    }
  }
  return result;
}
