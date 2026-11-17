/**
 * Planner XP (spec-8-3, AD-1: pure). XP is passive: a Task marked done earns
 * once, and (Epic 9) a finished focus session earns a little. Sized by Bộ so
 * it scales with the quest table.
 */
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
