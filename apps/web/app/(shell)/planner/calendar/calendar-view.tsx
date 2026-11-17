"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { layoutWeek, weekDays, type WeekTaskSummary } from "@training-sanctum/domain";
import { apiFetch } from "@/lib/api-client";
import { SectionMarker } from "@/app/components/section-marker";
import { buttonQuiet, buttonSecondary } from "@/app/components/ui";
import { CalendarBlock, TrayChip, minutePx } from "./calendar-block";
import {
  formatDay,
  formatWeek,
  localToday,
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

/**
 * Planner -> Calendar (Story 10.1): a read-only Monday-to-Sunday time grid of
 * plan-length blocks with a tray of timeless Tasks above each day. Below 640px
 * one day shows, with the same tray as a horizontal chip row.
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
  });
  const tasks = data ?? [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const layout = layoutWeek(days, tasks);
  const empty = monday !== null && !isPending && !isError && tasks.length === 0;

  // Open on 06:00: the grid shows 06:00-24:00 and scrolls up to 00:00.
  const scroller = useRef<HTMLDivElement>(null);
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
                  aria-label={`Unscheduled on ${formatDay(day)}`}
                  className="mt-2 flex min-h-6 gap-1 overflow-x-auto sm:flex-col sm:overflow-visible"
                >
                  {trayTasks.map((t) => (
                    <TrayChip key={t.id} task={t} />
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
                  />
                ) : null;
              })}
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
