"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  REVIEW_GRADES,
  type GradeResult,
  type UndoRequest,
  type ReviewGrade,
  type ReviewQueueEntry,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { isTextField } from "@/lib/keyboard";
import { formErrorClass } from "@/app/components/ui";
import { useFocusMode } from "../focus-mode";
import { SessionExit } from "../session-exit";
import { ReviewCard } from "./review-card";

/**
 * 1–4 and J K L ; map to Again / Hard / Good / Easy (FR-9). Matched by
 * physical key (`event.code`) so the row works on non-US layouts too.
 */
const GRADE_KEYS: Record<string, ReviewGrade> = {
  Digit1: "again",
  Digit2: "hard",
  Digit3: "good",
  Digit4: "easy",
  Numpad1: "again",
  Numpad2: "hard",
  Numpad3: "good",
  Numpad4: "easy",
  KeyJ: "again",
  KeyK: "hard",
  KeyL: "good",
  Semicolon: "easy",
};

const GRADE_LABELS: Record<ReviewGrade, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

const gradeBase =
  "flex items-center justify-center gap-3 rounded-full border px-6 py-3 text-body font-semibold text-foreground transition-state hover:border-foreground focus-ring";
/** Grade pills: one pastel tint each, equal in weight, never the accent. */
const GRADE_CLASS: Record<ReviewGrade, string> = {
  again: `${gradeBase} bg-tint-rose border-tint-rose-border`,
  hard: `${gradeBase} bg-tint-butter border-tint-butter-border`,
  good: `${gradeBase} bg-tint-mint border-tint-mint-border`,
  easy: `${gradeBase} bg-tint-sky border-tint-sky-border`,
};

export const stageClass = "flex w-full flex-col items-center gap-8";

/**
 * One position in the session. `key` is unique per slot (the record id, plus
 * `#n` for a repeat) so a repeated card mounts unflipped. A `practice` slot is
 * graded locally and never POSTed: a repeat after Again (spec-4-8), or any
 * slot of a practice run (spec-4-8b). Grading one Again always repeats it.
 */
interface Slot {
  entry: ReviewQueueEntry;
  key: string;
  practice: boolean;
}

/**
 * What Back restores: the session as it was before one grade. `saved` is that
 * grade's POST (null for a practice slot), so an undo can wait for it.
 */
interface HistoryEntry {
  before: Omit<SessionState, "history">;
  slotKey: string;
  saved: Promise<GradeResult> | null;
}

interface SessionState {
  slots: Slot[];
  /** Position of the current slot; everything before it has been graded. */
  index: number;
  /** Which face shows; Space or a click flips it either way. */
  revealed: boolean;
  /** The answer has been shown at least once, so the entry can be graded. */
  seen: boolean;
  /** An error line is showing: a grade that was not saved, or an undo that failed. */
  failure: "grade" | "undo" | null;
  /** One entry per grade Back can still take back, oldest first. */
  history: HistoryEntry[];
}

/** Moves past the current slot; with `repeat`, queues a practice copy of it at the end. */
function advance(
  s: SessionState,
  slot: Slot,
  repeat: boolean,
  saved: Promise<GradeResult> | null
): SessionState {
  const id = slot.entry.schedulingRecordId;
  const slots = repeat
    ? [
        ...s.slots,
        {
          entry: slot.entry,
          key: `${id}#${s.slots.filter((x) => x.entry.schedulingRecordId === id).length}`,
          practice: true,
        },
      ]
    : s.slots;
  const { history, ...before } = s;
  return {
    slots,
    index: s.index + 1,
    revealed: false,
    seen: false,
    failure: null,
    history: [...history, { before, slotKey: slot.key, saved }],
  };
}

const navButton =
  "flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-low transition-state hover:border-foreground-tertiary hover:bg-row-hover focus-ring disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-card";

/** A promise settled from outside; a rejection nobody awaits is never unhandled. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

interface GradeVars {
  slot: Slot;
  grade: ReviewGrade;
  saved: ReturnType<typeof deferred<GradeResult>>;
}

/**
 * The graded session shared by Review (spec-4-3) and Learn (spec-4-8). The
 * entries are one snapshot; grading advances locally at once and POSTs in
 * the background (AD-7). With `repeatAgain`, an entry graded Again comes back
 * at the end until it is graded Hard, Good or Easy; only its first grade is
 * saved. With `practice` (spec-4-8b, Learn's "Study all cards again"), no
 * grade is saved at all and Again always repeats. Like `entries`, it is read
 * once on mount: key the component to start a new run.
 * spec-4-5: while a card is on screen, focus mode hides the sidebar and an
 * Exit link (or Esc) leaves for `exitHref`.
 */
export function GradingSession({
  entries,
  header,
  exitHref,
  finished,
  repeatAgain,
  practice = false,
  onGradeSettled,
}: {
  entries: ReviewQueueEntry[];
  header: ReactNode;
  /** Where Exit and Esc lead: the scope or Flashcard page the session came from. */
  exitHref: string;
  /** Shown once every slot has been graded. */
  finished: ReactNode;
  repeatAgain: boolean;
  /**
   * spec-4-8b: every slot is practice, so no grade is ever POSTed and
   * scheduling never changes; Again still repeats at the end.
   */
  practice?: boolean;
  /** Runs after each saved grade settles, even if the session has unmounted. */
  onGradeSettled?: () => void;
}) {
  const [state, setState] = useState<SessionState>(() => ({
    slots: entries.map((entry) => ({
      entry,
      key: entry.schedulingRecordId,
      practice,
    })),
    index: 0,
    revealed: false,
    seen: false,
    failure: null,
    history: [],
  }));
  // Mirrors `state` synchronously so rapid key presses read the latest
  // session before React re-renders (no stale reveal/grade between keys).
  const live = useRef(state);
  const current = state.slots[state.index];
  // Chrome comes back with the finished screen, or when the session unmounts.
  useFocusMode(Boolean(current));

  const update = useCallback((next: (s: SessionState) => SessionState) => {
    const value = next(live.current);
    if (value === live.current) return;
    live.current = value;
    setState(value);
  }, []);

  // True while a Back is waiting on the server; grading and Back are held.
  const [undoing, setUndoing] = useState(false);
  const undoingRef = useRef(false);

  const { mutate } = useMutation({
    mutationFn: ({ slot, grade, saved }: GradeVars) => {
      const request = apiFetch<GradeResult>("/api/review/grade", {
        method: "POST",
        json: { schedulingRecordId: slot.entry.schedulingRecordId, grade },
        // The session has already moved on; let the save finish even if the
        // user leaves the page right after the last grade.
        keepalive: true,
      });
      request.then(saved.resolve, saved.reject);
      return request;
    },
    onMutate: ({ slot, grade, saved }) => {
      // Advance at once; the in-flight slot rides in the context for onError.
      update((s) =>
        s.slots[s.index]?.key === slot.key
          ? advance(s, slot, repeatAgain && grade === "again", saved.promise)
          : s
      );
      return { slot };
    },
    onError: (err, _vars, context) => {
      // 409 NOT_DUE: the first grade of the day already applied. Drop it.
      if (!context || (err instanceof ApiError && err.code === "NOT_DUE")) return;
      const { slot } = context;
      const id = slot.entry.schedulingRecordId;
      update((s) => {
        const from = s.slots.findIndex((x) => x.key === slot.key);
        if (from === -1 || from >= s.index) return { ...s, failure: "grade" };
        // Put the slot back as the current card, unflipped, and drop the
        // practice copies its Again queued: that grade was never saved.
        const keep = (x: Slot, i: number) =>
          i !== from && !(x.practice && x.entry.schedulingRecordId === id);
        const graded = s.slots.slice(0, s.index).filter((x, i) => keep(x, i));
        const rest = s.slots.slice(s.index).filter((x, i) => keep(x, i + s.index));
        // The slots after it moved, so their history is dropped with its own.
        const at = s.history.findIndex((h) => h.slotKey === slot.key);
        return {
          slots: [...graded, slot, ...rest],
          index: graded.length,
          revealed: false,
          seen: false,
          failure: "grade",
          history: at === -1 ? s.history : s.history.slice(0, at),
        };
      });
    },
    onSettled: () => onGradeSettled?.(),
  });

  /** Returns to the card an entry graded, unflipped, and drops that entry. */
  const restore = useCallback(
    (entry: HistoryEntry) => {
      update((s) => {
        // A failed grade's rollback may already have rewound the session.
        const at = s.history.indexOf(entry);
        if (at === -1) return s;
        return {
          ...entry.before,
          revealed: false,
          seen: false,
          failure: null,
          history: s.history.slice(0, at),
        };
      });
    },
    [update]
  );

  const { mutate: mutateUndo } = useMutation({
    mutationFn: async (entry: HistoryEntry) => {
      // Never race the grade it undoes: wait for that POST, send nothing if it failed.
      const result = await entry.saved?.catch(() => null);
      if (!result) return false;
      const body: UndoRequest = {
        schedulingRecordId: result.id,
        previous: result.previous,
        expectedNextReviewDate: result.nextReviewDate,
      };
      await apiFetch("/api/review/undo", { method: "POST", json: body, keepalive: true });
      return true;
    },
    onSuccess: (_sent, entry) => restore(entry),
    onError: () => update((s) => ({ ...s, failure: "undo" })),
    onSettled: (_data, _error, entry) => {
      undoingRef.current = false;
      setUndoing(false);
      if (entry.saved) onGradeSettled?.();
    },
  });

  const flip = useCallback(() => {
    if (undoingRef.current) return;
    update((s) => (s.slots[s.index] ? { ...s, revealed: !s.revealed, seen: true } : s));
  }, [update]);

  const grade = useCallback(
    (value: ReviewGrade) => {
      const s = live.current;
      const slot = s.slots[s.index];
      if (!slot || !s.seen || undoingRef.current) return;
      if (slot.practice) {
        // Practice never calls the grade route: Again queues another copy,
        // Hard, Good or Easy completes the entry.
        update((x) => advance(x, slot, value === "again", null));
        return;
      }
      mutate({ slot, grade: value, saved: deferred<GradeResult>() });
    },
    [mutate, update]
  );

  const back = useCallback(() => {
    const entry = live.current.history.at(-1);
    if (!entry || undoingRef.current) return;
    if (!entry.saved) {
      // A practice slot was never saved: undo is local only.
      restore(entry);
      return;
    }
    undoingRef.current = true;
    setUndoing(true);
    mutateUndo(entry);
  }, [mutateUndo, restore]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const s = live.current;
      if (isTextField(event.target) || !s.slots[s.index]) return;
      if (event.code === "Space" || event.key === " ") {
        // Space flips the card either way; it must not scroll or press a button.
        event.preventDefault();
        if (!event.repeat) flip();
        return;
      }
      if (event.code === "ArrowLeft") {
        event.preventDefault();
        if (!event.repeat) back();
        return;
      }
      const value = GRADE_KEYS[event.code];
      if (!value) return;
      event.preventDefault();
      if (!event.repeat) grade(value);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flip, grade, back]);

  const total = state.slots.length;

  return (
    <div className={stageClass} data-focus-session={current ? "" : undefined}>
      {current ? <SessionExit href={exitHref} /> : null}
      {header}

      {current ? (
        <>
          <ReviewCard
            key={current.key}
            entry={current.entry}
            revealed={state.revealed}
            seen={state.seen}
            onFlip={flip}
            onGrade={grade}
          />

          <div className="flex min-h-14 w-full max-w-review-card flex-col items-center justify-center gap-4">
            {state.seen ? (
              <div role="group" aria-label="Grade" className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
                {REVIEW_GRADES.map((value, i) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => grade(value)}
                    aria-keyshortcuts={`${i + 1}`}
                    className={GRADE_CLASS[value]}
                  >
                    {GRADE_LABELS[value]}
                    <kbd aria-hidden="true" className="font-mono text-caption text-foreground-secondary">
                      {i + 1}
                    </kbd>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-caption text-foreground-tertiary">
                Click the card, or press Space, to reveal
              </p>
            )}
          </div>

          {state.failure ? (
            <p role="alert" className={`w-full max-w-review-card ${formErrorClass}`}>
              {state.failure === "undo"
                ? "Couldn't go back, so this card stays. Try again."
                : "Your grade wasn't saved. Grade this card again."}
            </p>
          ) : null}

          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={back}
              disabled={state.history.length === 0 || undoing}
              aria-label="Previous card"
              aria-keyshortcuts="ArrowLeft"
              className={navButton}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 12H5M11 6l-6 6 6 6" />
              </svg>
            </button>
            <p
              aria-live="polite"
              className="min-w-20 text-center font-mono text-heading-3 text-foreground tabular-nums"
            >
              {state.index + 1} / {total}
            </p>
            {/* Keeps the counter centred under the card, as in the card viewer. */}
            <span aria-hidden="true" className="size-11" />
          </div>
        </>
      ) : (
        finished
      )}
    </div>
  );
}
