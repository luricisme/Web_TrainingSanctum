"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  formatStartTime,
  layoutWeek,
  snapStartMinutes,
  stepSlot,
  weekDays,
  type CalendarSlot,
  type WeekTaskSummary,
} from "@training-sanctum/domain";
import { apiFetch } from "@/lib/api-client";
import { SectionMarker } from "@/app/components/section-marker";
import { buttonQuiet, buttonSecondary, fieldErrorClass } from "@/app/components/ui";
import { CalendarBlock, MOVE_HINT_ID, TrayChip, minutePx, type MoveProps } from "./calendar-block";
import {
  formatDay,
  formatWeek,
  localToday,
  PLANNER_OVERDUE_KEY,
  PLANNER_TASKS_KEY,
  plannerWeekKey,
  shiftDay,
  weekdayShort,
} from "../tasks-key";

const arrowClass =
  "flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-low transition-state hover:bg-row-hover focus-ring";

const GRID =
  "grid grid-cols-[3rem_minmax(0,1fr)] sm:min-w-[44rem] sm:grid-cols-[3rem_repeat(7,minmax(0,1fr))]";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** The browser local day and minute of day, re-read each minute so both roll over at midnight; null before mount. */
function useClock(): { today: string; minutes: number } | null {
  const [clock, setClock] = useState<{ today: string; minutes: number } | null>(null);
  useEffect(() => {
    const read = () => {
      const d = new Date();
      setClock({ today: localToday(d), minutes: d.getHours() * 60 + d.getMinutes() });
    };
    read();
    const id = window.setInterval(read, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return clock;
}

/** A pointer movement under this many pixels is a click, not a drag. */
const DRAG_THRESHOLD_PX = 4;
/** A touch must rest this long before it picks an item up; moving first scrolls the page. */
const TOUCH_HOLD_MS = 250;
/** Within this distance of the scroller's top or bottom edge a drag scrolls the grid. */
const EDGE_SCROLL_PX = 48;

interface Drag {
  id: string;
  title: string;
  planMinutes: number;
  origin: CalendarSlot;
  /** `day: ""` means the pointer is over no drop target. */
  target: CalendarSlot;
  mode: "pointer" | "key";
  /** Pointer drags only: false until the pointer passes the threshold. */
  active: boolean;
  /** Touch drags only start after a short hold; mouse and keyboard are always held. */
  held: boolean;
  /** Where the lifted item is drawn (viewport px). */
  rect: { left: number; top: number; width: number; height: number } | null;
  /** Pointer offset from the item's top at pointer down (blocks keep their grab point). */
  grabY: number;
}

const sameSlot = (a: CalendarSlot, b: CalendarSlot) => a.day === b.day && a.startMin === b.startMin;

const weekdayLong = (day: string) => formatDay(day).split(" ")[0] ?? "";

const slotText = (slot: CalendarSlot) =>
  `${weekdayLong(slot.day)} ${slot.startMin === null ? "unscheduled" : formatStartTime(slot.startMin)}`;

/**
 * Planner -> Calendar (Stories 10.1, 10.2): a Monday-to-Sunday time grid of
 * plan-length blocks with a tray of timeless Tasks above each day. Blocks and
 * chips move by pointer drag or keyboard, saved through the Task PATCH with an
 * optimistic week cache. Below 640px one day shows, with the tray as a chip row.
 */
export function CalendarView() {
  const clock = useClock();
  const today = clock?.today ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const anchor = picked ?? today;
  const days = anchor ? weekDays(anchor) : [];
  const monday = days[0] ?? null;
  const nowMinutes = clock?.minutes ?? null;

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: plannerWeekKey(monday ?? ""),
    queryFn: () => apiFetch<WeekTaskSummary[]>(`/api/planner/tasks/week?start=${monday}`),
    enabled: monday !== null,
    staleTime: 0,
    // A running session moves its block's fill: re-read the week every 30 s meanwhile.
    refetchInterval: (query) => (query.state.data?.some((t) => t.running) ? 30_000 : false),
  });
  const tasks = data ?? [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const layout = layoutWeek(days, tasks);
  const empty = monday !== null && !isPending && !isError && tasks.length === 0;

  const scroller = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const pointerStart = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const lastPointer = useRef({ x: 0, y: 0 });
  const holdTimer = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const refocusId = useRef<string | null>(null);
  const setDragState = useCallback((next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const mutation = useMutation({
    mutationFn: (v: { task: WeekTaskSummary; localDay: string; startTime: string | null }) =>
      apiFetch<unknown>(`/api/planner/tasks/${v.task.id}`, {
        method: "PATCH",
        json: { localDay: v.localDay, startTime: v.startTime },
      }),
    onMutate: async (v) => {
      const key = plannerWeekKey(monday ?? "");
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<WeekTaskSummary[]>(key, (old) =>
        old?.map((t) => (t.id === v.task.id ? { ...t, localDay: v.localDay, startTime: v.startTime } : t))
      );
      return { key };
    },
    onError: (_error, v, context) => {
      // Undo only this Task, so a newer move of another Task is kept.
      if (context) {
        queryClient.setQueryData<WeekTaskSummary[]>(context.key, (old) =>
          old?.map((t) =>
            t.id === v.task.id ? { ...t, localDay: v.task.localDay, startTime: v.task.startTime } : t
          )
        );
      }
      setMoveError(`Could not move ${v.task.title}. Try again.`);
    },
    onSettled: (_data, _error, _v, context) => {
      if (context) void queryClient.invalidateQueries({ queryKey: context.key });
      void queryClient.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
      void queryClient.invalidateQueries({ queryKey: PLANNER_OVERDUE_KEY });
    },
  });

  const commit = (d: Drag, task: WeekTaskSummary | undefined) => {
    setDragState(null);
    if (!task || d.target.day === "" || sameSlot(d.origin, d.target)) {
      setAnnouncement(`${d.title} not moved`);
      return;
    }
    setMoveError(null);
    setAnnouncement(`Moved ${d.title} to ${slotText(d.target)}`);
    if (d.mode === "key") refocusId.current = d.id;
    mutation.mutate({
      task,
      localDay: d.target.day,
      startTime: d.target.startMin === null ? null : formatStartTime(d.target.startMin),
    });
  };
  // Latest values for the window listeners below, which are not re-bound each render.
  const commitRef = useRef(commit);
  const byIdRef = useRef(byId);
  useEffect(() => {
    commitRef.current = commit;
    byIdRef.current = byId;
  });

  // Pointer drag: window-level listeners so the item can leave its own box.
  const pointerDragging = drag?.mode === "pointer";
  useEffect(() => {
    if (!pointerDragging) return;
    const hit = (x: number, y: number, d: Drag): CalendarSlot => {
      const el = document.elementFromPoint(x, y);
      const tray = el?.closest<HTMLElement>("[data-tray]");
      if (tray?.dataset.tray) return { day: tray.dataset.tray, startMin: null };
      const col = el?.closest<HTMLElement>("[data-day-column]");
      if (!col?.dataset.dayColumn) return { day: "", startMin: null };
      const box = col.getBoundingClientRect();
      return {
        day: col.dataset.dayColumn,
        startMin: snapStartMinutes(((y - d.grabY - box.top) / box.height) * 1440),
      };
    };
    const onMove = (e: globalThis.PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.mode !== "pointer" || !d.rect) return;
      const s = pointerStart.current;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y) >= DRAG_THRESHOLD_PX;
      if (!d.active && !moved) return;
      if (!d.held) {
        // A touch that moves before the hold is a scroll, not a drag.
        setDragState(null);
        return;
      }
      const target = hit(e.clientX, e.clientY, d);
      setDragState({
        ...d,
        active: true,
        target,
        rect: { ...d.rect, left: s.left + e.clientX - s.x, top: s.top + e.clientY - s.y },
      });
      if (target.day) setAnnouncement(`Moving ${d.title}: ${slotText(target)}`);
    };
    const onUp = () => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.active) setDragState(null);
      else commitRef.current(d, byIdRef.current.get(d.id));
    };
    const cancel = () => {
      const d = dragRef.current;
      setDragState(null);
      if (d?.active) setAnnouncement(`Move of ${d.title} cancelled`);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    // Near the scroller's top or bottom edge the grid scrolls so far slots can be reached.
    let raf = 0;
    const loop = () => {
      const d = dragRef.current;
      const el = scroller.current;
      if (d?.active && el) {
        const r = el.getBoundingClientRect();
        const { x, y } = lastPointer.current;
        let step = 0;
        if (y < r.top + EDGE_SCROLL_PX) step = -Math.min(16, (r.top + EDGE_SCROLL_PX - y) / 3);
        else if (y > r.bottom - EDGE_SCROLL_PX) step = Math.min(16, (y - (r.bottom - EDGE_SCROLL_PX)) / 3);
        if (step !== 0) {
          const before = el.scrollTop;
          el.scrollTop = before + step;
          if (el.scrollTop !== before) setDragState({ ...d, target: hit(x, y, d) });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // Touch: once dragging, keep the page from scrolling under the finger.
    const onTouch = (e: TouchEvent) => {
      if (dragRef.current?.held) e.preventDefault();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchmove", onTouch, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
      window.removeEventListener("touchmove", onTouch);
    };
  }, [pointerDragging, setDragState]);

  // After a keyboard move the item re-renders as a block or chip: put focus back on it.
  useEffect(() => {
    const id = refocusId.current;
    if (!id) return;
    refocusId.current = null;
    document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)?.focus();
  }, [data]);

  const onItemKey = (e: KeyboardEvent<HTMLElement>, task: WeekTaskSummary, origin: CalendarSlot) => {
    if (e.target !== e.currentTarget) return;
    const d = dragRef.current;
    const selected = d?.mode === "key" && d.id === task.id ? d : null;
    const enter = e.key === "Enter" || e.key === " ";
    if (!selected) {
      if (enter && !d) {
        e.preventDefault();
        setDragState({
          id: task.id,
          title: task.title,
          planMinutes: task.planMinutes,
          origin,
          target: origin,
          mode: "key",
          held: true,
          active: true,
          rect: null,
          grabY: 0,
        });
        setAnnouncement(`Moving ${task.title}: ${slotText(origin)}`);
      }
      return;
    }
    if (enter) {
      e.preventDefault();
      commit(selected, task);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDragState(null);
      setAnnouncement(`Move of ${task.title} cancelled`);
    } else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      // Under 640px only the one shown day is on screen, so a step must not leave it.
      const narrow = window.matchMedia("(max-width: 639px)").matches;
      const target = stepSlot(selected.target, e.key, narrow && anchor ? [anchor] : days);
      setDragState({ ...selected, target });
      setAnnouncement(`Moving ${task.title}: ${slotText(target)}`);
    }
  };

  /** Move wiring for a block or chip; none for a done Task (it never moves). */
  const moveProps = (task: WeekTaskSummary, origin: CalendarSlot): MoveProps | undefined => {
    if (task.done) return undefined;
    const mine = drag?.id === task.id ? drag : null;
    return {
      lift: mine?.mode === "pointer" && mine.active ? mine.rect : null,
      selected: mine?.mode === "key",
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0 || dragRef.current) return;
        const box = e.currentTarget.getBoundingClientRect();
        pointerStart.current = { x: e.clientX, y: e.clientY, left: box.left, top: box.top };
        lastPointer.current = { x: e.clientX, y: e.clientY };
        if (e.pointerType === "touch") {
          holdTimer.current = window.setTimeout(() => {
            const d = dragRef.current;
            if (d && d.id === task.id && d.mode === "pointer") setDragState({ ...d, held: true });
          }, TOUCH_HOLD_MS);
        }
        setDragState({
          id: task.id,
          title: task.title,
          planMinutes: task.planMinutes,
          origin,
          target: origin,
          mode: "pointer",
          held: e.pointerType !== "touch",
          active: false,
          rect: { left: box.left, top: box.top, width: box.width, height: box.height },
          grabY: origin.startMin === null ? 0 : e.clientY - box.top,
        });
      },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => onItemKey(e, task, origin),
      onBlur: () => {
        const d = dragRef.current;
        if (d?.mode === "key" && d.id === task.id) setDragState(null);
      },
    };
  };

  const showing = drag && drag.active && drag.target.day !== "" && !sameSlot(drag.origin, drag.target) ? drag : null;
  const ghost =
    showing && showing.target.startMin !== null
      ? { day: showing.target.day, startMin: showing.target.startMin, planMinutes: showing.planMinutes }
      : null;
  const trayTarget = showing && showing.target.startMin === null ? showing.target.day : null;

  // Open on 06:00: the grid shows 06:00-24:00 and scrolls up to 00:00.
  const scrolled = useRef(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el || scrolled.current || monday === null) return;
    const body = el.querySelector<HTMLElement>("[data-grid-body]");
    if (!body) return;
    // A little short of 06:00 so its hour label is not tucked under the sticky header.
    el.scrollTop = (body.offsetHeight / 24) * 6 - 12;
    scrolled.current = true;
  }, [monday]);

  const move = (delta: number) => anchor && setPicked(shiftDay(anchor, delta));

  return (
    <section aria-labelledby="planner-calendar">
      <SectionMarker as="h2" id="planner-calendar">
        Calendar
      </SectionMarker>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" aria-label="Previous week" disabled={!anchor} onClick={() => move(-7)} className={`${arrowClass} max-sm:hidden`}>
          <Arrow direction="left" />
        </button>
        <button type="button" aria-label="Previous day" disabled={!anchor} onClick={() => move(-1)} className={`${arrowClass} sm:hidden`}>
          <Arrow direction="left" />
        </button>
        <p className="min-w-0 text-heading-3 text-foreground" aria-live="polite">
          <span className="max-sm:hidden">{monday ? formatWeek(monday) : " "}</span>
          <span className="sm:hidden">{anchor ? formatDay(anchor) : " "}</span>
        </p>
        <button type="button" aria-label="Next week" disabled={!anchor} onClick={() => move(7)} className={`${arrowClass} max-sm:hidden`}>
          <Arrow direction="right" />
        </button>
        <button type="button" aria-label="Next day" disabled={!anchor} onClick={() => move(1)} className={`${arrowClass} sm:hidden`}>
          <Arrow direction="right" />
        </button>
        {anchor && anchor !== today ? (
          <button type="button" onClick={() => setPicked(null)} className={buttonQuiet}>
            Today
          </button>
        ) : null}
      </div>

      {empty ? (
        <p className="mt-6 text-body text-foreground-secondary">Nothing planned this week.</p>
      ) : null}
      {isError && !data ? (
        <div role="alert" className="mt-6 flex flex-col items-start gap-4">
          <p className="text-body text-foreground-secondary">Could not load your week.</p>
          <button type="button" onClick={() => void refetch()} className={buttonSecondary}>
            Try again
          </button>
        </div>
      ) : null}

      <p id={MOVE_HINT_ID} className="sr-only">
        Press Enter to move. Arrow keys change the time or day, Enter drops, Escape cancels.
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {moveError ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center gap-3">
          <p className={fieldErrorClass}>{moveError}</p>
          <button type="button" onClick={() => setMoveError(null)} className={buttonQuiet}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div
        ref={scroller}
        data-testid="calendar-scroller"
        className="mt-6 max-h-[calc(var(--calendar-hour)*11)] overflow-auto rounded-lg border border-divider bg-card"
      >
        <div className={`sticky top-0 z-10 border-b border-divider bg-card ${GRID}`}>
          <div />
          {days.map((day) => {
            const isToday = day === today;
            const trayTasks = tasks.filter((t) => t.localDay === day && t.startTime === null);
            return (
              <div
                key={day}
                data-day={day}
                className={`min-w-0 border-l border-divider px-2 py-2 ${day === anchor ? "" : "max-sm:hidden"}`}
              >
                <p
                  aria-current={isToday ? "date" : undefined}
                  className={`flex items-baseline gap-1 text-overline uppercase ${
                    isToday ? "font-bold text-foreground" : "text-foreground-tertiary"
                  }`}
                >
                  <span>{weekdayShort(day)}</span>
                  <span className="text-body-sm">{Number(day.slice(8))}</span>
                </p>
                <div
                  role="group"
                  data-tray={day}
                  aria-label={`Unscheduled on ${formatDay(day)}`}
                  className={`mt-2 flex min-h-8 gap-1 overflow-x-auto rounded-sm sm:flex-col sm:overflow-visible ${
                    trayTarget === day ? "bg-row-hover" : ""
                  }`}
                >
                  {trayTasks.map((t) => (
                    <TrayChip key={t.id} task={t} move={moveProps(t, { day, startMin: null })} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div data-grid-body className={`relative ${GRID}`} style={{ height: minutePx(1440) }}>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {HOURS.map((h) => (
              <div
                key={h}
                className={h === 0 ? "absolute inset-x-0" : "absolute inset-x-0 border-t border-divider"}
                style={{ top: minutePx(h * 60) }}
              >
                {h === 0 ? null : (
                  <span className="absolute left-0 w-12 -translate-y-1/2 bg-card pr-2 text-right text-caption text-foreground-tertiary">
                    {String(h).padStart(2, "0")}:00
                  </span>
                )}
              </div>
            ))}
          </div>
          <div />
          {days.map((day) => (
            <div
              key={day}
              data-day-column={day}
              className={`relative min-w-0 border-l border-divider ${day === anchor ? "" : "max-sm:hidden"}`}
            >
              {(layout[day] ?? []).map((block) => {
                const task = byId.get(block.taskId);
                return task ? (
                  <CalendarBlock
                    key={`${block.taskId}-${block.continued ? "c" : "s"}`}
                    block={block}
                    day={day}
                    task={task}
                    move={block.continued ? undefined : moveProps(task, { day, startMin: block.startMin })}
                  />
                ) : null;
              })}
              {ghost?.day === day ? <Ghost startMin={ghost.startMin} planMinutes={ghost.planMinutes} /> : null}
              {day === today && nowMinutes !== null ? (
                <div
                  aria-hidden="true"
                  data-testid="now-line"
                  className="pointer-events-none absolute inset-x-0 z-[5] h-0.5 bg-accent"
                  style={{ top: minutePx(nowMinutes) }}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

/** Where a drag would drop: a dashed outline of the plan length at the snapped start. */
function Ghost({ startMin, planMinutes }: { startMin: number; planMinutes: number }) {
  return (
    <div
      aria-hidden="true"
      data-testid="move-ghost"
      className="pointer-events-none absolute inset-x-px z-[5] rounded-sm border border-dashed border-border px-2 py-0.5"
      style={{
        top: minutePx(startMin),
        height: `max(1.5rem, ${minutePx(Math.min(planMinutes, 1440 - startMin))})`,
      }}
    >
      <p className="font-mono text-caption text-foreground-secondary">{formatStartTime(startMin)}</p>
    </div>
  );
}
