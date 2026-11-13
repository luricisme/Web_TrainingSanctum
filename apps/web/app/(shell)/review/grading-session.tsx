"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  REVIEW_GRADES,
  type GradeResult,
  type ReviewGrade,
  type ReviewQueueEntry,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { isTextField } from "@/lib/keyboard";
import { formErrorClass } from "@/app/components/ui";
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
  "flex items-center justify-center gap-3 rounded-full border px-6 py-3 text-body font-medium transition-state hover:bg-row-hover focus-ring";
/** DESIGN.md `grade-button-again`: error border and text, never the accent. */
const gradeAgain = `${gradeBase} border-error text-error`;
/** DESIGN.md `grade-button-neutral`: Hard, Good and Easy are identical in weight. */
const gradeNeutral = `${gradeBase} border-border text-foreground-secondary hover:text-foreground`;

export const stageClass = "flex w-full flex-col items-center gap-8";

/**
 * One position in the session. `key` is unique per slot (the record id, plus
 * `#n` for a repeat) so a repeated card mounts unflipped. A `practice` slot is
 * a repeat after Again (spec-4-8): it is graded locally and never POSTed.
 */
interface Slot {
  entry: ReviewQueueEntry;
  key: string;
  practice: boolean;
}

interface SessionState {
  slots: Slot[];
  /** Position of the current slot; everything before it has been graded. */
  index: number;
  /** Which face shows; Space or a click flips it either way. */
  revealed: boolean;
  /** The answer has been shown at least once, so the entry can be graded. */
  seen: boolean;
  failed: boolean;
}

/** Moves past the current slot; with `repeat`, queues a practice copy of it at the end. */
function advance(s: SessionState, slot: Slot, repeat: boolean): SessionState {
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
  return { slots, index: s.index + 1, revealed: false, seen: false, failed: false };
}

/**
 * The graded session shared by Review (spec-4-3) and Learn (spec-4-8). The
 * entries are one snapshot; grading advances locally at once and POSTs in
 * the background (AD-7). With `repeatAgain`, an entry graded Again comes back
 * at the end until it is graded Hard, Good or Easy; only its first grade is
 * saved.
 */
export function GradingSession({
  entries,
  header,
  finished,
  repeatAgain,
  onGradeSettled,
}: {
  entries: ReviewQueueEntry[];
  header: ReactNode;
  /** Shown once every slot has been graded. */
  finished: ReactNode;
  repeatAgain: boolean;
  /** Runs after each saved grade settles, even if the session has unmounted. */
  onGradeSettled?: () => void;
}) {
  const [state, setState] = useState<SessionState>(() => ({
    slots: entries.map((entry) => ({
      entry,
      key: entry.schedulingRecordId,
      practice: false,
    })),
    index: 0,
    revealed: false,
    seen: false,
    failed: false,
  }));
  // Mirrors `state` synchronously so rapid key presses read the latest
  // session before React re-renders (no stale reveal/grade between keys).
  const live = useRef(state);
  const current = state.slots[state.index];

  const update = useCallback((next: (s: SessionState) => SessionState) => {
    const value = next(live.current);
    if (value === live.current) return;
    live.current = value;
    setState(value);
  }, []);

  const { mutate } = useMutation({
    mutationFn: ({ slot, grade }: { slot: Slot; grade: ReviewGrade }) =>
      apiFetch<GradeResult>("/api/review/grade", {
        method: "POST",
        json: { schedulingRecordId: slot.entry.schedulingRecordId, grade },
        // The session has already moved on; let the save finish even if the
        // user leaves the page right after the last grade.
        keepalive: true,
      }),
    onMutate: ({ slot, grade }) => {
      // Advance at once; the in-flight slot rides in the context for onError.
      update((s) =>
        s.slots[s.index]?.key === slot.key
          ? advance(s, slot, repeatAgain && grade === "again")
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
        if (from === -1 || from >= s.index) return { ...s, failed: true };
        // Put the slot back as the current card, unflipped, and drop the
        // practice copies its Again queued: that grade was never saved.
        const keep = (x: Slot, i: number) =>
          i !== from && !(x.practice && x.entry.schedulingRecordId === id);
        const graded = s.slots.slice(0, s.index).filter((x, i) => keep(x, i));
        const rest = s.slots.slice(s.index).filter((x, i) => keep(x, i + s.index));
        return {
          slots: [...graded, slot, ...rest],
          index: graded.length,
          revealed: false,
          seen: false,
          failed: true,
        };
      });
    },
    onSettled: () => onGradeSettled?.(),
  });

  const flip = useCallback(() => {
    update((s) => (s.slots[s.index] ? { ...s, revealed: !s.revealed, seen: true } : s));
  }, [update]);

  const grade = useCallback(
    (value: ReviewGrade) => {
      const s = live.current;
      const slot = s.slots[s.index];
      if (!slot || !s.seen) return;
      if (slot.practice) {
        // Practice never calls the grade route: Again queues another copy,
        // Hard, Good or Easy completes the entry.
        update((x) => advance(x, slot, value === "again"));
        return;
      }
      mutate({ slot, grade: value });
    },
    [mutate, update]
  );

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
      const value = GRADE_KEYS[event.code];
      if (!value) return;
      event.preventDefault();
      if (!event.repeat) grade(value);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flip, grade]);

  const total = state.slots.length;

  return (
    <div className={stageClass}>
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
                    className={value === "again" ? gradeAgain : gradeNeutral}
                  >
                    {GRADE_LABELS[value]}
                    <kbd aria-hidden="true" className="font-mono text-caption text-foreground-tertiary">
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

          {state.failed ? (
            <p role="alert" className={`w-full max-w-review-card ${formErrorClass}`}>
              Your grade wasn&apos;t saved. Grade this card again.
            </p>
          ) : null}

          <p aria-live="polite" className="font-mono text-heading-3 text-foreground tabular-nums">
            {state.index + 1} / {total}
          </p>
        </>
      ) : (
        finished
      )}
    </div>
  );
}
