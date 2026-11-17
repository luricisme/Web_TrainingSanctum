"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MAX_OVERRUN_SESSIONS,
  pomodoroScreenPlan,
  type PomodoroPill,
  type PomodoroSettings,
  type SessionSummary,
  type TaskSummary,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { isTextField } from "@/lib/keyboard";
import { SectionMarker } from "@/app/components/section-marker";
import {
  buttonPrimary,
  buttonQuiet,
  buttonSecondary,
  formErrorClass,
  linkClass,
  tintFor,
} from "@/app/components/ui";
import { PLANNER_CATEGORIES_KEY } from "../categories-key";
import { TaskModal } from "../task-modal";
import { PLANNER_OVERDUE_KEY, PLANNER_TASKS_KEY, localToday, plannerTasksKey } from "../tasks-key";

const RUNNING_KEY = ["planner-running"] as const;
const SETTINGS_KEY = ["planner", "settings"] as const;
const taskKey = (id: string) => ["planner-task", id] as const;
const subscribeNever = () => () => {};

interface TaskWithSessions {
  task: TaskSummary;
  sessions: SessionSummary[];
}

/** m:ss for a number of milliseconds, rounded up so 0:00 means it is over. */
function formatClock(ms: number): string {
  const total = Math.max(Math.ceil(ms / 1000), 0);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const remainingMs = (s: SessionSummary, now: number) =>
  new Date(s.startedAt).getTime() + s.plannedMinutes * 60000 - now;

/**
 * Planner -> Pomodoro (Story 9.3). The client keeps no elapsed time: the
 * countdown is `startedAt + plannedMinutes - now`, re-read from the server on
 * focus and visibility change, and a session that runs out is closed by the
 * server's sweep, never by this page.
 */
export function PomodoroScreen({ taskId }: { taskId: string | null }) {
  return taskId ? <TaskPomodoro key={taskId} taskId={taskId} /> : <TaskPicker />;
}

function TaskPicker({ notice }: { notice?: string }) {
  const today = useSyncExternalStore(subscribeNever, () => localToday(), () => null);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: plannerTasksKey(today ?? ""),
    queryFn: () => apiFetch<TaskSummary[]>(`/api/planner/tasks?day=${today}`),
    enabled: today !== null,
  });
  const open = (data ?? []).filter((t) => !t.done);

  return (
    <section aria-labelledby="planner-pomodoro">
      <SectionMarker as="h2" id="planner-pomodoro">
        Pomodoro
      </SectionMarker>
      <p className="mt-4 text-body text-foreground-secondary">
        {notice ?? "Choose a Task to run its plan."}
      </p>
      <div className="mt-6">
        {today === null || isPending ? (
          <div
            aria-label="Loading tasks"
            className="h-24 animate-pulse rounded-lg bg-elevated motion-reduce:animate-none"
          />
        ) : isError ? (
          <div role="alert" className="flex flex-col items-start gap-4">
            <p className="text-body text-foreground-secondary">Could not load your tasks.</p>
            <button type="button" onClick={() => void refetch()} className={buttonSecondary}>
              Try again
            </button>
          </div>
        ) : open.length === 0 ? (
          <div className="flex flex-col items-start gap-4 py-2">
            <p className="text-body text-foreground-secondary">No open Tasks today.</p>
            <Link href="/planner" className={buttonSecondary}>
              Go to Tasks
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-divider rounded-lg border border-divider bg-card">
            {open.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/planner/pomodoro?task=${task.id}`}
                  className="flex items-center gap-3 py-3 pl-4 pr-4 transition-state hover:bg-row-hover focus-ring"
                >
                  <span
                    className={`inline-flex w-fit max-w-40 shrink-0 items-center truncate rounded-full border px-3 py-0.5 text-caption text-foreground ${tintFor(task.category.color)}`}
                  >
                    {task.category.name}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-body font-medium text-foreground">
                    {task.title}
                  </span>
                  <span className="shrink-0 font-mono text-caption text-foreground-secondary">
                    {task.loggedMinutes} / {task.estimateMinutes}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function TaskPomodoro({ taskId }: { taskId: string }) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [notYet, setNotYet] = useState(false);
  const [cardHidden, setCardHidden] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taskQuery = useQuery({
    queryKey: taskKey(taskId),
    queryFn: () => apiFetch<TaskWithSessions>(`/api/planner/tasks/${taskId}`),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
  const runningQuery = useQuery({
    queryKey: RUNNING_KEY,
    queryFn: () => apiFetch<SessionSummary | null>("/api/planner/sessions/running"),
  });
  const settingsQuery = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => apiFetch<PomodoroSettings>("/api/planner/settings"),
  });
  const running = runningQuery.data ?? null;
  const elsewhere = running !== null && running.taskId !== taskId;
  const elsewhereTask = useQuery({
    queryKey: taskKey(running?.taskId ?? ""),
    queryFn: () => apiFetch<TaskWithSessions>(`/api/planner/tasks/${running?.taskId}`),
    enabled: elsewhere,
  });

  const refetchRunning = runningQuery.refetch;
  const afterSessionChange = () => {
    void queryClient.invalidateQueries({ queryKey: ["planner-task"] });
    void queryClient.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
    void queryClient.invalidateQueries({ queryKey: ["cultivation"] });
  };

  // Render clock only: it re-reads "now", it never accumulates elapsed time.
  const runningId = running?.id ?? null;
  useEffect(() => {
    if (runningId === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [runningId]);

  // Natural expiry: ask the server; its sweep closes the session at its planned end.
  const expired = running !== null && remainingMs(running, now) <= 0;
  useEffect(() => {
    if (expired) void refetchRunning();
  }, [expired, now, refetchRunning]);

  // A session that disappears from `running` has ended (here or elsewhere).
  const previousRunning = useRef<string | null>(null);
  useEffect(() => {
    if (previousRunning.current !== null && runningId === null) {
      void queryClient.invalidateQueries({ queryKey: ["planner-task"] });
      void queryClient.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["cultivation"] });
    }
    previousRunning.current = runningId;
  }, [runningId, queryClient]);

  // Re-sync on focus and visibility change.
  useEffect(() => {
    function resync() {
      if (document.visibilityState === "hidden") return;
      setNow(Date.now());
      void queryClient.invalidateQueries({ queryKey: RUNNING_KEY });
      void queryClient.invalidateQueries({ queryKey: ["planner-task"] });
      void queryClient.invalidateQueries({ queryKey: ["cultivation"] });
    }
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
    };
  }, [queryClient]);

  const start = useMutation({
    mutationFn: (input: { kind: "FOCUS" | "BREAK"; overrun: boolean }) =>
      apiFetch<SessionSummary>("/api/planner/sessions", {
        method: "POST",
        json: { taskId, ...input },
      }),
    onMutate: () => setError(null),
    onSuccess: (session) => {
      setNotYet(false);
      setCardHidden(false);
      setNow(Date.now());
      queryClient.setQueryData(RUNNING_KEY, session);
      void queryClient.invalidateQueries({ queryKey: ["planner-task"] });
      void queryClient.invalidateQueries({ queryKey: ["cultivation"] });
    },
    onError: (err) => {
      setError(err.message);
      void queryClient.invalidateQueries({ queryKey: RUNNING_KEY });
      void queryClient.invalidateQueries({ queryKey: ["planner-task"] });
    },
  });
  const stop = useMutation({
    mutationFn: (id: string) =>
      apiFetch<SessionSummary>(`/api/planner/sessions/${id}/end`, { method: "POST" }),
    onMutate: () => setError(null),
    onSuccess: async () => {
      // Wait for the history so the plan never ignores the session just stopped.
      await queryClient.invalidateQueries({ queryKey: ["planner-task"] });
      queryClient.setQueryData(RUNNING_KEY, null);
      afterSessionChange();
    },
    onError: (err) => {
      setError(err.message);
      void queryClient.invalidateQueries({ queryKey: RUNNING_KEY });
    },
  });
  const done = useMutation({
    mutationFn: () => apiFetch<TaskSummary>(`/api/planner/tasks/${taskId}/done`, { method: "POST" }),
    onMutate: () => setError(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["planner-task"] });
      void queryClient.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
      void queryClient.invalidateQueries({ queryKey: PLANNER_OVERDUE_KEY });
      void queryClient.invalidateQueries({ queryKey: ["cultivation"] });
      void queryClient.invalidateQueries({ queryKey: PLANNER_CATEGORIES_KEY });
    },
    onError: (err) => setError(err.message),
  });

  const task = taskQuery.data?.task;
  const settings = settingsQuery.data;
  const history = taskQuery.data?.sessions ?? [];
  const sessions: SessionSummary[] = [
    ...history.filter((s) => s.endedAt !== null && s.id !== running?.id),
    ...(running && running.taskId === taskId ? [running] : []),
  ];
  const plan = task && settings ? pomodoroScreenPlan({ task, sessions, notYet }, settings) : null;
  const mine = running !== null && running.taskId === taskId ? running : null;
  const next = plan?.next;
  const cardOpen =
    !cardHidden &&
    !mine &&
    !!task &&
    !task.done &&
    next !== undefined &&
    (next.kind === "DONE_CARD" ||
      (notYet && (next.kind === "EXHAUSTED" || (next.kind === "FOCUS" && next.overrun))));
  const startable =
    runningQuery.isSuccess && !mine && !running && !!task && !task.done && !cardOpen && (next?.kind === "FOCUS" || next?.kind === "BREAK");
  const busy = start.isPending || stop.isPending || done.isPending;

  function startNext() {
    if (!next || (next.kind !== "FOCUS" && next.kind !== "BREAK")) return;
    start.mutate({ kind: next.kind, overrun: next.kind === "FOCUS" && next.overrun });
  }

  // Space starts or stops when nothing else has focus; Esc closes the Done card.
  const spaceRef = useRef<() => void>(() => {});
  useEffect(() => {
    spaceRef.current = () => {
      if (busy) return;
      if (mine) stop.mutate(mine.id);
      else if (startable) startNext();
    };
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (editing || isTextField(event.target)) return;
      if (event.key === "Escape") {
        if (!cardOpen) return;
        event.preventDefault();
        setNotYet(false);
        setCardHidden(true);
        return;
      }
      if (event.key !== " ") return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("button, a, summary, [role='menuitem'], [role='dialog']")) return;
      event.preventDefault();
      spaceRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cardOpen, editing]);

  if (taskQuery.isError && taskQuery.error instanceof ApiError && taskQuery.error.status === 404) {
    return <TaskPicker notice="That Task could not be found. Choose another." />;
  }
  if (taskQuery.isError) {
    return (
      <section aria-labelledby="planner-pomodoro">
        <SectionMarker as="h2" id="planner-pomodoro">
          Pomodoro
        </SectionMarker>
        <div role="alert" className="mt-6 flex flex-col items-start gap-4">
          <p className="text-body text-foreground-secondary">Could not load this Task.</p>
          <button type="button" onClick={() => void taskQuery.refetch()} className={buttonSecondary}>
            Try again
          </button>
        </div>
      </section>
    );
  }
  if (settingsQuery.isError) {
    return (
      <section aria-labelledby="planner-pomodoro">
        <SectionMarker as="h2" id="planner-pomodoro">
          Pomodoro
        </SectionMarker>
        <div role="alert" className="mt-6 flex flex-col items-start gap-4">
          <p className="text-body text-foreground-secondary">Could not load settings.</p>
          <button type="button" onClick={() => void settingsQuery.refetch()} className={buttonSecondary}>
            Try again
          </button>
        </div>
      </section>
    );
  }
  if (!task || !plan || !next) {
    return (
      <section aria-labelledby="planner-pomodoro">
        <SectionMarker as="h2" id="planner-pomodoro">
          Pomodoro
        </SectionMarker>
        <div
          aria-label="Loading task"
          className="mt-6 h-40 animate-pulse rounded-lg bg-elevated motion-reduce:animate-none"
        />
      </section>
    );
  }

  const label =
    next.kind === "BREAK" ? "Break" : next.kind === "FOCUS" && next.overrun ? "Overrun focus" : "Focus";
  const clockMs = mine
    ? remainingMs(mine, now)
    : next.kind === "FOCUS" || next.kind === "BREAK"
      ? next.plannedMinutes * 60000
      : 0;
  const caption = mine
    ? label
    : next.kind === "FOCUS" || next.kind === "BREAK"
      ? `${label} · ${formatClock(clockMs)}`
      : "";
  const warn = plan.over || mine?.overrun === true;

  return (
    <section aria-labelledby="planner-pomodoro">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SectionMarker as="h2" id="planner-pomodoro">
          Pomodoro
        </SectionMarker>
        <Link href="/planner/pomodoro" className={buttonQuiet}>
          Change task
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex w-fit max-w-40 shrink-0 items-center truncate rounded-full border px-3 py-0.5 text-caption text-foreground ${tintFor(task.category.color)}`}
        >
          {task.category.name}
        </span>
        <h3 className="min-w-0 break-words text-heading-3 text-foreground">{task.title}</h3>
        <span
          className={`font-mono text-caption ${plan.over ? "text-warning" : "text-foreground-secondary"}`}
          aria-label={`${task.loggedMinutes} of ${task.estimateMinutes} minutes${plan.over ? ", over estimate" : ""}`}
        >
          {task.loggedMinutes} / {task.estimateMinutes}
        </span>
      </div>

      {elsewhere && running ? (
        <p className="mt-6 rounded-md bg-elevated px-4 py-3 text-body text-foreground">
          A session is running on {elsewhereTask.data?.task.title ?? "another Task"} —{" "}
          <span className="font-mono">{formatClock(remainingMs(running, now))}</span> left.{" "}
          <Link href={`/planner/pomodoro?task=${running.taskId}`} className={linkClass}>
            Go to it
          </Link>
        </p>
      ) : null}

      <PlanStrip pills={plan.pills} tint={tintFor(task.category.color)} />

      <div className="mx-auto mt-12 flex max-w-review-card flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <p className="min-h-5 text-overline uppercase text-foreground-tertiary">{caption}</p>
          <p
            role="timer"
            aria-label={`${label}, ${formatClock(clockMs)} left`}
            className={`font-mono text-display font-semibold tabular-nums ${warn ? "text-warning" : "text-foreground"}`}
          >
            {formatClock(clockMs)}
          </p>
        </div>

        {mine ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => stop.mutate(mine.id)}
            aria-keyshortcuts="Space"
            className={buttonSecondary}
          >
            Stop
          </button>
        ) : cardOpen ? null : (
          <button
            type="button"
            disabled={!startable || busy}
            onClick={startNext}
            aria-keyshortcuts="Space"
            className={startable ? buttonPrimary : buttonSecondary}
          >
            Start
          </button>
        )}

        {task.done ? (
          <p className="text-body text-foreground-secondary">This Task is done.</p>
        ) : next.kind === "EXHAUSTED" && !cardOpen ? (
          <p className="text-body text-foreground-secondary">
            Edit the estimate to continue.{" "}
            <button type="button" onClick={() => setEditing(true)} className={linkClass}>
              Edit
            </button>
          </p>
        ) : null}

        {error ? (
          <p role="alert" className={`${formErrorClass} text-left`}>
            {error}
          </p>
        ) : null}
      </div>

      {cardOpen ? (
        <div className="mx-auto mt-12 max-w-review-card rounded-lg border border-divider bg-card p-6 shadow-low">
          <h3 className="text-heading-3 text-foreground">Done?</h3>
          {notYet ? (
            <div className="mt-4 flex flex-wrap items-center gap-4">
              {next.kind === "FOCUS" && next.overrun ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={startNext}
                  className={buttonPrimary}
                >
                  +1 session ({plan.overrunLeft} of {MAX_OVERRUN_SESSIONS} left)
                </button>
              ) : (
                <p className="text-body text-foreground-secondary">
                  Edit the estimate to continue.{" "}
                  <button type="button" onClick={() => setEditing(true)} className={linkClass}>
                    Edit
                  </button>
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => done.mutate()}
                className={buttonPrimary}
              >
                Done
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setNotYet(true)}
                className={buttonSecondary}
              >
                Not yet
              </button>
            </div>
          )}
        </div>
      ) : null}

      {cardHidden && !mine && !task.done && next.kind === "DONE_CARD" ? (
        <div className="mx-auto mt-12 max-w-review-card text-center">
          <button type="button" onClick={() => setCardHidden(false)} className={buttonQuiet}>
            Is this Task done?
          </button>
        </div>
      ) : null}

      {editing ? (
        <TaskModal
          existing={task}
          day={task.localDay}
          onClose={() => {
            setEditing(false);
            void queryClient.invalidateQueries({ queryKey: ["planner-task"] });
            void queryClient.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
          }}
          onSaved={() => {}}
        />
      ) : null}
    </section>
  );
}

function PlanStrip({ pills, tint }: { pills: PomodoroPill[]; tint: string }) {
  if (pills.length === 0) return null;
  return (
    <ol aria-label="Plan" className="mt-6 flex flex-wrap items-center gap-2">
      {pills.map((pill, index) => {
        const current = pill.state === "current";
        const surface = current
          ? `border-foreground ${pill.kind === "FOCUS" ? tint.split(" ")[0] : "bg-elevated"}`
          : pill.kind === "FOCUS"
            ? tint
            : "border-transparent bg-elevated";
        return (
          <li
            key={index}
            aria-current={current ? "step" : undefined}
            aria-label={`${pill.kind === "FOCUS" ? "Focus" : "Break"} ${pill.minutes} minutes${pill.overrun ? ", overrun" : ""}${pill.state === "done" ? ", done" : current ? ", current" : ""}`}
            className={`inline-flex items-center gap-2 rounded-full ${current ? "border-2" : "border"} px-3 py-0.5 font-mono text-caption ${pill.state === "done" ? "text-foreground-secondary" : "text-foreground"} ${surface}`}
          >
            {pill.state === "done" ? <Tick /> : null}
            {pill.overrun ? <span aria-hidden="true">+</span> : null}
            <span aria-hidden="true">{pill.minutes}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Tick() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}
