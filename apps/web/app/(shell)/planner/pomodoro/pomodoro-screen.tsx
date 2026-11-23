"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MAX_OVERRUN_SESSIONS,
  pomodoroScreenPlan,
  type PomodoroPill,
  type PomodoroSettings,
  type SessionSummary,
  type TaskCategorySummary,
  type TaskSummary,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { isTextField } from "@/lib/keyboard";
import { SectionMarker } from "@/app/components/section-marker";
import { useFocusMode } from "../../focus-mode";
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
import { MusicPlayer } from "./music-player";
import { PLANNER_OVERDUE_KEY, PLANNER_TASKS_KEY, localToday, plannerTasksKey } from "../tasks-key";

const RUNNING_KEY = ["planner-running"] as const;
const SETTINGS_KEY = ["planner", "settings"] as const;
const taskKey = (id: string) => ["planner-task", id] as const;
const subscribeNever =() => () => {};

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
  // Focus mode: Start opens a full-screen layer with only the clock; it stays
  // between sessions until the user leaves it (Exit, Esc) or the plan needs a
  // decision (the Done card, an exhausted estimate, a done Task).
  const [focusWanted, setFocusWanted] = useState(false);
  const [loadSynced, setLoadSynced] = useState(false);
  const enteredFullscreen = useRef(false);

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
  const categoriesQuery = useQuery({
    queryKey: PLANNER_CATEGORIES_KEY,
    queryFn: () => apiFetch<TaskCategorySummary[]>("/api/planner/categories"),
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

  // Auto-start (a Pomodoro setting): only a session that ran out on its own chains.
  const autoNext = settingsQuery.data?.autoStartNext === true;
  // Bumped when a session ran out; the effect below handles each bump once.
  const [autoToken, setAutoToken] = useState(0);
  const handledAutoToken = useRef(0);
  const expiredRef = useRef(false);
  useEffect(() => {
    if (expired) expiredRef.current = true;
  }, [expired]);

  // A session that disappears from `running` has ended (here or elsewhere).
  const previousRunning = useRef<string | null>(null);
  useEffect(() => {
    if (previousRunning.current !== null && runningId === null) {
      const ranOut = expiredRef.current;
      expiredRef.current = false;
      // Wait for the refreshed history so the next step is the right one.
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["planner-task"] }),
        queryClient.invalidateQueries({ queryKey: PLANNER_TASKS_KEY }),
        queryClient.invalidateQueries({ queryKey: ["cultivation"] }),
      ]).then(() => {
        if (ranOut) setAutoToken((n) => n + 1);
      });
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

  // Opening the page on a session already running here goes straight to focus.
  if (!loadSynced && runningQuery.isSuccess && taskQuery.isSuccess) {
    setLoadSynced(true);
    if (mine) setFocusWanted(true);
  }
  const focusBlocked =
    !task || task.done || cardOpen || (!mine && next?.kind !== "FOCUS" && next?.kind !== "BREAK");
  if (focusWanted && focusBlocked && task && next) setFocusWanted(false);
  const focusOn = focusWanted && !focusBlocked;
  useFocusMode(focusOn);

  /** A user gesture (click, Space) may take the whole screen; refusal is fine. */
  function enterFocus() {
    setFocusWanted(true);
    const root = document.documentElement;
    if (document.fullscreenElement || typeof root.requestFullscreen !== "function") return;
    root
      .requestFullscreen({ navigationUI: "hide" })
      .then(() => {
        enteredFullscreen.current = true;
      })
      .catch(() => {});
  }

  function leaveFocus() {
    setFocusWanted(false);
  }

  // Leaving focus (any reason) gives the screen back; leaving fullscreen with
  // the browser's own Esc leaves focus too. The page behind does not scroll.
  useEffect(() => {
    if (!focusOn) {
      if (enteredFullscreen.current && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
      enteredFullscreen.current = false;
      return;
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onFullscreenChange() {
      if (!document.fullscreenElement && enteredFullscreen.current) {
        enteredFullscreen.current = false;
        setFocusWanted(false);
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [focusOn]);

  // Unmounting (Change task, another Planner tab) leaves fullscreen.
  useEffect(
    () => () => {
      if (enteredFullscreen.current && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
    },
    []
  );

  function startNext() {
    if (!next || (next.kind !== "FOCUS" && next.kind !== "BREAK")) return;
    start.mutate({ kind: next.kind, overrun: next.kind === "FOCUS" && next.overrun });
  }

  /** Start pressed by the user (not auto-start): it also opens focus mode. */
  function startByUser() {
    enterFocus();
    startNext();
  }

  useEffect(() => {
    if (autoToken === handledAutoToken.current || taskQuery.isFetching || runningQuery.isFetching) return;
    handledAutoToken.current = autoToken;
    if (autoNext && startable && !busy) startNext();
  });

  // Space starts or stops when nothing else has focus; Esc closes the Done card.
  const spaceRef = useRef<() => void>(() => {});
  useEffect(() => {
    spaceRef.current = () => {
      if (busy) return;
      if (mine) stop.mutate(mine.id);
      else if (startable) startByUser();
    };
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (editing || isTextField(event.target)) return;
      if (event.key === "Escape") {
        if (focusOn) {
          event.preventDefault();
          setFocusWanted(false);
          return;
        }
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
  }, [cardOpen, editing, focusOn]);

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
  const progress = mine ? 1 - clockMs / (mine.plannedMinutes * 60000) : 0;
  const ringTone = warn ? "text-warning" : mine?.kind === "BREAK" ? "text-success" : "text-foreground";
  const endsAt = mine
    ? new Date(new Date(mine.startedAt).getTime() + mine.plannedMinutes * 60000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const tint = tintFor(task.category.color);
  const logged = task.estimateMinutes > 0 ? Math.min(task.loggedMinutes / task.estimateMinutes, 1) : 0;

  const chip = (
    <span
      className={`inline-flex w-fit max-w-40 shrink-0 items-center truncate rounded-full border px-3 py-0.5 text-caption text-foreground ${tint}`}
    >
      {task.category.name}
    </span>
  );
  const minutes = (
    <span
      className={`shrink-0 font-mono text-caption ${plan.over ? "text-warning" : "text-foreground-secondary"}`}
      aria-label={`${task.loggedMinutes} of ${task.estimateMinutes} minutes${plan.over ? ", over estimate" : ""}`}
    >
      {task.loggedMinutes} / {task.estimateMinutes} min
    </span>
  );

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

      {/* One tree for both layouts, so the music player keeps playing when the
          screen switches between the card and the full-screen focus layer. */}
      <div
        role={focusOn ? "dialog" : undefined}
        aria-modal={focusOn ? true : undefined}
        aria-label={focusOn ? `Focus: ${task.title}` : undefined}
        className={
          focusOn
            ? "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background focus-enter"
            : "mx-auto mt-6 max-w-panel overflow-hidden rounded-lg border border-divider bg-card shadow-low"
        }
      >
        {focusOn ? (
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
            <div
              className={`absolute left-1/2 top-1/2 size-[min(115vmin,64rem)] rounded-full opacity-70 blur-3xl focus-glow ${tint.split(" ")[0]}`}
            />
          </div>
        ) : null}

        {/* Task header */}
        <div className={focusOn ? "relative px-4 pt-5 sm:px-8 sm:pt-6" : "px-5 pt-5 sm:px-6 sm:pt-6"}>
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
              {chip}
              <h3
                className={`min-w-0 break-words text-foreground ${focusOn ? "text-body font-semibold" : "text-heading-3"}`}
              >
                {task.title}
              </h3>
            </div>
            {focusOn ? (
              <p className="hidden shrink-0 pt-2.5 text-caption text-foreground-tertiary md:block">
                Space to {mine ? "stop" : "start"} · Esc to leave
              </p>
            ) : null}
            {focusOn ? (
              <button type="button" onClick={leaveFocus} className={`${buttonQuiet} shrink-0`}>
                <span className="inline-flex items-center gap-2">
                  <ShrinkIcon />
                  Exit focus
                </span>
              </button>
            ) : (
              <div className="shrink-0 pt-1">{minutes}</div>
            )}
          </div>
          {focusOn ? null : (
            <div
              aria-hidden="true"
              className="mt-4 h-1.5 overflow-hidden rounded-full bg-elevated"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${plan.over ? "bg-warning" : "bg-foreground"}`}
                style={{ width: `${logged * 100}%` }}
              />
            </div>
          )}

          {elsewhere && running ? (
            <p className="mt-4 rounded-md bg-elevated px-4 py-3 text-body-sm text-foreground">
              A session is running on {elsewhereTask.data?.task.title ?? "another Task"} —{" "}
              <span className="font-mono">{formatClock(remainingMs(running, now))}</span> left.{" "}
              <Link href={`/planner/pomodoro?task=${running.taskId}`} className={linkClass}>
                Go to it
              </Link>
            </p>
          ) : null}
        </div>

        {/* Clock */}
        <div
          className={`relative flex flex-col items-center text-center ${focusOn ? "flex-1 justify-center gap-6 px-4 py-6" : "gap-6 px-5 pb-8 pt-8 sm:px-6"}`}
        >
          <ClockRing
            progress={progress}
            tone={ringTone}
            className={focusOn ? "size-[min(50vmin,30rem)]" : "size-60"}
          >
            <p
              className={`min-h-5 text-overline uppercase ${focusOn ? "text-foreground-secondary" : "text-foreground-tertiary"}`}
            >
              {caption}
            </p>
            <p
              role="timer"
              aria-label={`${label}, ${formatClock(clockMs)} left`}
              className={`font-sans font-bold leading-none tracking-tight tabular-nums ${focusOn ? "text-[min(12vmin,7rem)]" : "text-[3.75rem]"} ${warn ? "text-warning" : "text-foreground"}`}
            >
              {formatClock(clockMs)}
            </p>
            <p className="min-h-5 text-body-sm text-foreground-tertiary">
              {endsAt ? `Ends ${endsAt}` : null}
            </p>
          </ClockRing>

          {cardOpen ? (
            <div className="w-full max-w-sm rounded-lg border border-divider bg-background p-5 text-left">
              <h3 className="text-heading-3 text-foreground">Done?</h3>
              {notYet ? (
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  {next.kind === "FOCUS" && next.overrun ? (
                    <button type="button" disabled={busy} onClick={startByUser} className={buttonPrimary}>
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
                  <button type="button" disabled={busy} onClick={() => done.mutate()} className={buttonPrimary}>
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
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-3">
              {mine ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => stop.mutate(mine.id)}
                  aria-keyshortcuts="Space"
                  className={`${buttonSecondary} min-w-32`}
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!startable || busy}
                  onClick={startByUser}
                  aria-keyshortcuts="Space"
                  className={`${startable ? buttonPrimary : buttonSecondary} min-w-32`}
                >
                  Start
                </button>
              )}
              {mine && !focusOn ? (
                <button type="button" onClick={enterFocus} className={buttonQuiet}>
                  <span className="inline-flex items-center gap-2">
                    <ExpandIcon />
                    Focus mode
                  </span>
                </button>
              ) : null}
            </div>
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

          {cardHidden && !mine && !task.done && next.kind === "DONE_CARD" ? (
            <button type="button" onClick={() => setCardHidden(false)} className={buttonQuiet}>
              Is this Task done?
            </button>
          ) : null}

          {error ? (
            <p role="alert" className={`${formErrorClass} text-left`}>
              {error}
            </p>
          ) : null}

          <PlanStrip pills={plan.pills} tint={tint} />

        </div>

        <MusicPlayer
          className={
            focusOn
              ? "relative mx-auto mb-6 flex w-[calc(100%-2rem)] max-w-2xl flex-col gap-3 rounded-lg border border-divider bg-card/80 p-3 shadow-medium backdrop-blur"
              : "flex flex-col gap-3 border-t border-divider bg-background/60 px-5 py-4 sm:px-6"
          }
          taskId={taskId}
          ownTrack={task.musicTrack}
          categoryTrack={
            categoriesQuery.data?.find((c) => c.id === task.category.id)?.musicTrack ?? null
          }
          categoryLoading={categoriesQuery.isPending}
          categoryError={categoriesQuery.isError}
          focus={
            mine && mine.kind === "FOCUS"
              ? { id: mine.id, endsAtMs: new Date(mine.startedAt).getTime() + mine.plannedMinutes * 60000 }
              : null
          }
          onSaved={(saved) => {
            queryClient.setQueryData<TaskWithSessions>(taskKey(taskId), (old) =>
              old ? { ...old, task: saved } : old
            );
            void queryClient.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
          }}
        />
      </div>

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

/** The countdown ring: a hairline track and an arc for the time already spent. */
function ClockRing({
  progress,
  tone,
  className,
  children,
}: {
  progress: number;
  tone: string;
  className: string;
  children: ReactNode;
}) {
  const p = Math.min(Math.max(progress, 0), 1);
  return (
    <div className={`relative grid shrink-0 place-items-center ${className}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true" className={`absolute inset-0 size-full -rotate-90 ${tone}`}>
        <circle cx="50" cy="50" r="47" fill="none" stroke="var(--color-divider)" strokeWidth="1.25" />
        {p > 0 ? (
          <circle
            cx="50"
            cy="50"
            r="47"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100 - p * 100}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        ) : null}
      </svg>
      <div className="relative flex flex-col items-center gap-3">{children}</div>
    </div>
  );
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function ShrinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
    </svg>
  );
}

function PlanStrip({ pills, tint }: { pills: PomodoroPill[]; tint: string }) {
  if (pills.length === 0) return null;
  return (
    <ol aria-label="Plan" className="flex flex-wrap items-center justify-center gap-2">
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
