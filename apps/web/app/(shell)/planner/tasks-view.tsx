"use client";

import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
} from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OverdueSummary, TaskSummary } from "@training-sanctum/domain";
import { apiFetch } from "@/lib/api-client";
import {
  buttonPrimary,
  buttonQuiet,
  buttonSecondary,
  tintFor,
} from "@/app/components/ui";
import { RowMenu } from "../classes/row-menu";
import { CategoriesModal } from "./categories-modal";
import { DeleteTaskModal } from "./delete-task-modal";
import { TaskModal } from "./task-modal";
import { PLANNER_CATEGORIES_KEY } from "./categories-key";
import {
  PLANNER_OVERDUE_KEY,
  PLANNER_TASKS_KEY,
  formatDay,
  localToday,
  plannerTasksKey,
  shiftDay,
} from "./tasks-key";

const subscribeNever = () => () => {};

type TaskDialog = { kind: "add" } | { kind: "edit"; task: TaskSummary } | null;

const arrowClass =
  "flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-low transition-state hover:bg-row-hover focus-ring disabled:cursor-not-allowed disabled:opacity-60";

// Toolbar-sized pills: the page-level size dwarfs the Task rows.
const compact = (cls: string) => cls.replace("px-6 py-3 text-body", "px-4 py-2 text-body-sm");
const toolbarPrimary = compact(buttonPrimary);
const toolbarSecondary = compact(buttonSecondary);

/**
 * Planner -> Tasks body (Story 8.3): the day header, the day's Tasks, the
 * Add/Edit modal and the delete confirmation. Story 8.2's Categories button
 * stays in the header.
 */
export function TasksView() {
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [dialog, setDialog] = useState<TaskDialog>(null);
  const [deleting, setDeleting] = useState<TaskSummary | null>(null);
  // The browser's date is only known on the client; the server snapshot is null.
  const today = useSyncExternalStore(subscribeNever, () => localToday(), () => null);
  const [picked, setDay] = useState<string | null>(null);
  const day = picked ?? today;

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: plannerTasksKey(day ?? ""),
    queryFn: () => apiFetch<TaskSummary[]>(`/api/planner/tasks?day=${day}`),
    enabled: day !== null,
  });
  const tasks = data ?? [];
  const overdue = useQuery({
    queryKey: PLANNER_OVERDUE_KEY,
    queryFn: () => apiFetch<OverdueSummary>("/api/planner/tasks/overdue"),
  });
  const overdueCount = overdue.data?.count ?? 0;
  const empty = day !== null && !isPending && !isError && tasks.length === 0;
  const isToday = day !== null && day === today;
  const dayLabel = day ? (isToday ? "today" : formatDay(day)) : "";

  const doneCount = tasks.filter((t) => t.done).length;
  const queryClient = useQueryClient();

  // Drag to reorder: the open Tasks are the sortable part; done ones stay below.
  // `local` shows a drop at once and holds until the server's list replaces
  // the data it was made from (so the rows never jump back for a frame).
  const [local, setLocal] = useState<{ ids: string[]; base: TaskSummary[] | undefined } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [announce, setAnnounce] = useState("");
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const handleRefs = useRef(new Map<string, HTMLButtonElement>());
  const hintId = useId();

  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<TaskSummary[]>("/api/planner/tasks/reorder", { method: "PUT", json: { day, ids } }),
    onSuccess: (list) => {
      if (day) queryClient.setQueryData(plannerTasksKey(day), list);
      void queryClient.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
    },
    onError: () => {
      setLocal(null);
      void queryClient.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
    },
  });
  if (local && data !== local.base && !reorder.isPending) setLocal(null);

  const serverOpen = tasks.filter((t) => !t.done);
  const openTasks = local
    ? [
        ...local.ids.flatMap((id) => serverOpen.filter((t) => t.id === id)),
        ...serverOpen.filter((t) => !local.ids.includes(t.id)),
      ]
    : serverOpen;
  const shown = [...openTasks, ...tasks.filter((t) => t.done)];

  function commitOrder(ids: string[], movedId: string) {
    setLocal({ ids, base: data });
    reorder.mutate(ids);
    const task = openTasks.find((t) => t.id === movedId);
    if (task) setAnnounce(`${task.title} moved to position ${ids.indexOf(movedId) + 1} of ${ids.length}.`);
  }

  function beginDrag(id: string, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || openTasks.length < 2) return;
    const from = openTasks.findIndex((t) => t.id === id);
    const rects = openTasks.map((t) => rowRefs.current.get(t.id)?.getBoundingClientRect());
    if (from < 0 || rects.some((r) => !r)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id,
      from,
      to: from,
      dy: 0,
      startY: event.clientY,
      tops: rects.map((r) => r!.top),
      heights: rects.map((r) => r!.height),
    });
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const dy = event.clientY - drag.startY;
    setDrag({ ...drag, dy, to: dropIndex(drag, dy) });
  }

  function endDrag() {
    if (!drag) return;
    if (drag.to !== drag.from) {
      commitOrder(moveItem(openTasks.map((t) => t.id), drag.from, drag.to), drag.id);
    }
    setDrag(null);
  }

  function keyMove(id: string, event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const from = openTasks.findIndex((t) => t.id === id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= openTasks.length) return;
    commitOrder(moveItem(openTasks.map((t) => t.id), from, to), id);
    // The row moves in the DOM; keep the keyboard on its handle.
    requestAnimationFrame(() => handleRefs.current.get(id)?.focus());
  }

  return (
    <section aria-labelledby="planner-tasks">
      <h2 id="planner-tasks" className="sr-only">
        Tasks
      </h2>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label="Previous day"
            disabled={!day}
            onClick={() => day && setDay(shiftDay(day, -1))}
            className={arrowClass}
          >
            <Arrow direction="left" />
          </button>
          <button
            type="button"
            aria-label="Next day"
            disabled={!day}
            onClick={() => day && setDay(shiftDay(day, 1))}
            className={arrowClass}
          >
            <Arrow direction="right" />
          </button>
          <div className="ml-2 flex min-w-0 flex-col">
            <p className="truncate text-heading-3 text-foreground" aria-live="polite">
              {day ? (isToday ? "Today" : formatDay(day)) : " "}
            </p>
            {day ? (
              <p className="truncate text-caption text-foreground-secondary">
                {isToday ? formatDay(day) : null}
                {isToday && tasks.length > 0 ? " · " : null}
                {tasks.length > 0 ? `${doneCount} of ${tasks.length} done` : null}
              </p>
            ) : null}
          </div>
          <DayPicker day={day} onPick={setDay} />
          {day && !isToday ? (
            <button type="button" onClick={() => today && setDay(today)} className={buttonQuiet}>
              Today
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setCategoriesOpen(true)} className={toolbarSecondary}>
            Categories
          </button>
          <button
            type="button"
            disabled={!day}
            onClick={() => setDialog({ kind: "add" })}
            className={toolbarPrimary}
          >
            + Add task
          </button>
        </div>
      </div>

      {overdueCount > 0 ? <OverdueStrip count={overdueCount} /> : null}

      <div className="mt-6">
        {day === null || isPending ? (
          <div
            aria-label="Loading tasks"
            className="h-24 animate-pulse rounded-lg bg-elevated motion-reduce:animate-none"
          />
        ) : isError && !data ? (
          <div role="alert" className="flex flex-col items-start gap-4">
            <p className="text-body text-foreground-secondary">Could not load your tasks.</p>
            <button type="button" onClick={() => void refetch()} className={buttonSecondary}>
              Try again
            </button>
          </div>
        ) : empty ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
            <p className="text-body text-foreground-secondary">Nothing planned for {dayLabel}.</p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-divider rounded-lg border border-divider bg-card">
              {shown.map((task, index) => {
                const sortable = !task.done && openTasks.length > 1;
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onEdit={() => setDialog({ kind: "edit", task })}
                    onDelete={() => setDeleting(task)}
                    rowRef={(el) => {
                      if (el) rowRefs.current.set(task.id, el);
                      else rowRefs.current.delete(task.id);
                    }}
                    offset={drag && !task.done ? rowOffset(drag, index) : 0}
                    dragging={drag?.id === task.id}
                    settling={drag !== null}
                    handleRef={(el) => {
                      if (el) handleRefs.current.set(task.id, el);
                      else handleRefs.current.delete(task.id);
                    }}
                    handle={
                      sortable
                        ? {
                            hintId,
                            onPointerDown: (e) => beginDrag(task.id, e),
                            onPointerMove: moveDrag,
                            onPointerUp: endDrag,
                            onPointerCancel: () => setDrag(null),
                            onKeyDown: (e) => keyMove(task.id, e),
                          }
                        : null
                    }
                  />
                );
              })}
            </ul>
            <p id={hintId} className="sr-only">
              Drag, or press Arrow Up or Arrow Down, to change the priority of the task.
            </p>
            {reorder.isError ? (
              <p role="alert" className="mt-2 text-caption text-error">
                Could not save the new order.
              </p>
            ) : null}
          </>
        )}
        <p role="status" aria-live="polite" className="sr-only">
          {announce}
        </p>
      </div>

      {categoriesOpen ? <CategoriesModal onClose={() => setCategoriesOpen(false)} /> : null}
      {dialog && day ? (
        <TaskModal
          key={dialog.kind === "edit" ? dialog.task.id : "new"}
          existing={dialog.kind === "edit" ? dialog.task : undefined}
          day={day}
          onClose={() => setDialog(null)}
          onSaved={setDay}
        />
      ) : null}
      {deleting ? <DeleteTaskModal task={deleting} onClose={() => setDeleting(null)} /> : null}
    </section>
  );
}

function OverdueStrip({ count }: { count: number }) {
  const queryClient = useQueryClient();
  const move = useMutation({
    mutationFn: () => apiFetch<{ moved: number }>("/api/planner/tasks/move-overdue", { method: "PATCH" }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
      void queryClient.invalidateQueries({ queryKey: PLANNER_OVERDUE_KEY });
    },
  });
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-warning/30 bg-warning/10 py-1.5 pl-4 pr-1.5">
        <p className="flex items-center gap-2 text-body-sm font-medium text-foreground">
          <span aria-hidden="true" className="size-2 rounded-full bg-warning" />
          {count} overdue
        </p>
        <button
          type="button"
          disabled={move.isPending}
          onClick={() => move.mutate()}
          className={buttonQuiet}
        >
          Move all to today
        </button>
      </div>
      {move.isError ? (
        <p role="alert" className="mt-2 text-caption text-error">
          Could not move your tasks.
        </p>
      ) : null}
    </div>
  );
}

interface DragState {
  id: string;
  from: number;
  to: number;
  dy: number;
  startY: number;
  /** Viewport tops and heights of the open rows when the drag began. */
  tops: number[];
  heights: number[];
}

/** Where the dragged row would land: past the midpoint of a neighbour, it takes its place. */
function dropIndex(drag: DragState, dy: number): number {
  const { from, tops, heights } = drag;
  const center = tops[from]! + heights[from]! / 2 + dy;
  let to = from;
  for (let j = from + 1; j < tops.length; j++) if (center > tops[j]! + heights[j]! / 2) to = j;
  for (let j = from - 1; j >= 0; j--) if (center < tops[j]! + heights[j]! / 2) to = j;
  return to;
}

/** The dragged row follows the pointer; the rows it passes step aside by its height. */
function rowOffset(drag: DragState, index: number): number {
  const { from, to, dy, heights } = drag;
  if (index === from) return dy;
  const span = heights[from]!;
  if (from < to && index > from && index <= to) return -span;
  if (to < from && index >= to && index < from) return span;
  return 0;
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

interface DragHandle {
  hintId: string;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

function TaskRow({
  task,
  onEdit,
  onDelete,
  rowRef,
  handleRef,
  handle,
  offset,
  dragging,
  settling,
}: {
  task: TaskSummary;
  onEdit: () => void;
  onDelete: () => void;
  rowRef: Ref<HTMLLIElement>;
  handleRef: Ref<HTMLButtonElement>;
  /** Null for a done Task, or when there is nothing to reorder. */
  handle: DragHandle | null;
  offset: number;
  dragging: boolean;
  /** A drag is in progress: the other rows glide aside. */
  settling: boolean;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  // Set in the change handler itself: the mutation state arrives a tick late and React would revert the box.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const toggle = useMutation({
    mutationFn: (done: boolean) =>
      done
        ? apiFetch<TaskSummary>(`/api/planner/tasks/${task.id}/done`, { method: "POST" })
        : apiFetch<TaskSummary>(`/api/planner/tasks/${task.id}`, {
            method: "PATCH",
            json: { done: false },
          }),
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
    },
    onSettled: () => setOptimistic(null),
    onSuccess: (updated) => {
      // Show the new state at once; the refetch below re-orders the list.
      queryClient.setQueriesData<TaskSummary[]>({ queryKey: PLANNER_TASKS_KEY }, (list) =>
        list?.map((t) => (t.id === updated.id ? updated : t))
      );
      void queryClient.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
      void queryClient.invalidateQueries({ queryKey: PLANNER_OVERDUE_KEY });
      void queryClient.invalidateQueries({ queryKey: ["cultivation"] });
      void queryClient.invalidateQueries({ queryKey: PLANNER_CATEGORIES_KEY });
    },
  });
  const over = task.loggedMinutes > task.estimateMinutes;

  return (
    <li
      ref={rowRef}
      style={offset !== 0 ? { transform: `translateY(${offset}px)` } : undefined}
      className={`flex items-center gap-2 py-3 pl-1.5 pr-2 sm:gap-3 ${
        dragging
          ? "relative z-10 rounded-md bg-card shadow-medium ring-1 ring-border"
          : settling
            ? "transition-transform duration-150 ease-out motion-reduce:transition-none"
            : ""
      }`}
    >
      {handle ? (
        <button
          type="button"
          ref={handleRef}
          aria-label={`Reorder ${task.title}`}
          aria-describedby={handle.hintId}
          onPointerDown={handle.onPointerDown}
          onPointerMove={handle.onPointerMove}
          onPointerUp={handle.onPointerUp}
          onPointerCancel={handle.onPointerCancel}
          onKeyDown={handle.onKeyDown}
          className={`flex h-8 w-6 shrink-0 touch-none items-center justify-center rounded-sm transition-state hover:bg-row-hover hover:text-foreground focus-ring ${
            dragging ? "cursor-grabbing text-foreground" : "cursor-grab text-foreground-tertiary"
          }`}
        >
          <GripIcon />
        </button>
      ) : (
        <span aria-hidden="true" className="w-6 shrink-0" />
      )}
      <input
        type="checkbox"
        checked={optimistic ?? task.done}
        disabled={toggle.isPending}
        onChange={(event) => {
          setOptimistic(event.target.checked);
          toggle.mutate(event.target.checked);
        }}
        aria-label={`Mark ${task.title} ${task.done ? "not done" : "done"}`}
        className="size-5 shrink-0 cursor-pointer accent-accent focus-ring disabled:cursor-not-allowed"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <span
          className={`inline-flex w-fit max-w-40 shrink-0 items-center truncate rounded-full border px-3 py-0.5 text-caption text-foreground ${tintFor(task.category.color)}`}
        >
          {task.category.name}
        </span>
        <p
          className={`min-w-0 flex-1 break-words text-body font-medium ${
            task.done ? "text-foreground-tertiary line-through" : "text-foreground"
          }`}
        >
          {task.title}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-4">
        {/* Fixed widths keep the time and minutes columns aligned across rows. */}
        <span className="font-mono text-caption text-foreground-secondary sm:w-12 sm:text-right">
          {task.startTime ?? ""}
        </span>
        <span
          className={`font-mono text-caption sm:min-w-20 sm:text-right ${over ? "text-warning" : "text-foreground-secondary"}`}
          aria-label={`${task.loggedMinutes} of ${task.estimateMinutes} minutes${over ? ", over estimate" : ""}`}
        >
          {task.loggedMinutes} / {task.estimateMinutes}
        </span>
      </div>
      {toggle.isError ? (
        <p role="alert" className="shrink-0 text-caption text-error">
          Could not update this task.
        </p>
      ) : null}
      <RowMenu
        name={task.title}
        items={[
          { label: "Edit", onSelect: onEdit },
          {
            label: "Start pomodoro",
            onSelect: () => router.push(`/planner/pomodoro?task=${task.id}`),
          },
          { label: "Delete", danger: true, onSelect: onDelete },
        ]}
      />
    </li>
  );
}

/** A calendar icon that opens the native date picker; the input itself stays out of sight. */
function DayPicker({ day, onPick }: { day: string | null; onPick: (day: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="Pick a day"
        disabled={!day}
        onClick={() => {
          const input = inputRef.current;
          if (!input) return;
          try {
            input.showPicker();
          } catch {
            input.focus();
          }
        }}
        className={`${arrowClass} border-transparent bg-transparent shadow-none`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="date"
        aria-label="Day"
        tabIndex={-1}
        value={day ?? ""}
        onChange={(event) => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) onPick(event.target.value);
        }}
        className="pointer-events-none absolute inset-0 opacity-0"
      />
    </div>
  );
}

function GripIcon() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">
      <circle cx="3.5" cy="3" r="1.4" />
      <circle cx="8.5" cy="3" r="1.4" />
      <circle cx="3.5" cy="8" r="1.4" />
      <circle cx="8.5" cy="8" r="1.4" />
      <circle cx="3.5" cy="13" r="1.4" />
      <circle cx="8.5" cy="13" r="1.4" />
    </svg>
  );
}

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}
