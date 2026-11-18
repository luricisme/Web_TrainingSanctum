"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OverdueSummary, TaskSummary } from "@training-sanctum/domain";
import { apiFetch } from "@/lib/api-client";
import { SectionMarker } from "@/app/components/section-marker";
import {
  buttonPrimary,
  buttonQuiet,
  buttonSecondary,
  inputClass,
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
  "flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-low transition-state hover:bg-row-hover focus-ring";

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

  return (
    <section aria-labelledby="planner-tasks">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SectionMarker as="h2" id="planner-tasks">
          Tasks
        </SectionMarker>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setCategoriesOpen(true)} className={buttonSecondary}>
            Categories
          </button>
          {tasks.length > 0 ? (
            <button type="button" onClick={() => setDialog({ kind: "add" })} className={buttonPrimary}>
              + Add task
            </button>
          ) : null}
        </div>
      </div>

      {overdueCount > 0 ? <OverdueStrip count={overdueCount} /> : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-label="Previous day"
          disabled={!day}
          onClick={() => day && setDay(shiftDay(day, -1))}
          className={arrowClass}
        >
          <Arrow direction="left" />
        </button>
        <div className="flex min-w-0 flex-col">
          <p className="text-heading-3 text-foreground" aria-live="polite">
            {day ? (isToday ? "Today" : formatDay(day)) : " "}
          </p>
          {day && isToday ? (
            <p className="text-caption text-foreground-secondary">{formatDay(day)}</p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Next day"
          disabled={!day}
          onClick={() => day && setDay(shiftDay(day, 1))}
          className={arrowClass}
        >
          <Arrow direction="right" />
        </button>
        <input
          type="date"
          aria-label="Day"
          value={day ?? ""}
          onChange={(event) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setDay(event.target.value);
          }}
          className={`${inputClass.replace("w-full", "w-44")}`}
        />
        {day && !isToday ? (
          <button type="button" onClick={() => today && setDay(today)} className={buttonQuiet}>
            Today
          </button>
        ) : null}
      </div>

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
          <div className="flex flex-col items-start gap-4 py-6">
            <p className="text-body text-foreground-secondary">Nothing planned for {dayLabel}.</p>
            <button type="button" onClick={() => setDialog({ kind: "add" })} className={buttonPrimary}>
              + Add task
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-divider rounded-lg border border-divider bg-card">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onEdit={() => setDialog({ kind: "edit", task })}
                onDelete={() => setDeleting(task)}
              />
            ))}
          </ul>
        )}
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
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-elevated px-4 py-3">
        <p className="text-body font-medium text-foreground">{count} overdue</p>
        <button
          type="button"
          disabled={move.isPending}
          onClick={() => move.mutate()}
          className={buttonSecondary}
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

function TaskRow({
  task,
  onEdit,
  onDelete,
}: {
  task: TaskSummary;
  onEdit: () => void;
  onDelete: () => void;
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
    <li className={`flex items-center gap-3 py-3 pl-4 pr-2`}>
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
        {task.startTime ? (
          <span className="font-mono text-caption text-foreground-secondary">{task.startTime}</span>
        ) : null}
        <span
          className={`font-mono text-caption ${over ? "text-warning" : "text-foreground-secondary"}`}
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

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}
