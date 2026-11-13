"use client";

import { useRef, type PointerEvent } from "react";
import type { ReviewGrade, ReviewQueueEntry } from "@training-sanctum/domain";
import { overlineClass } from "@/app/components/ui";

/** Minimum travel along the dominant axis that counts as a swipe. */
const SWIPE_MIN_PX = 48;

/** EXPERIENCE.md Interaction Primitives (spec-4-3 Decisions): ← ↓ → ↑. */
function swipeGrade(dx: number, dy: number): ReviewGrade | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "again" : "good";
  return dy > 0 ? "hard" : "easy";
}

const faceClass =
  "col-start-1 row-start-1 flex min-h-80 flex-col items-center justify-center gap-4 rounded-lg border border-divider bg-card px-6 py-12 text-center shadow-medium backface-hidden sm:px-8";

/**
 * The review card (DESIGN.md `components.review-card`): one fixed-bounds
 * surface that flips on Y to reveal the answer. Both faces share one grid
 * cell, so the card keeps the taller face's height in both states. Keyed by
 * Scheduling Record upstream, so each entry mounts unflipped.
 */
export function ReviewCard({
  entry,
  revealed,
  seen,
  onFlip,
  onGrade,
}: {
  entry: ReviewQueueEntry;
  revealed: boolean;
  /** The answer has been shown once; swipe grading is live from then on. */
  seen: boolean;
  onFlip: () => void;
  onGrade: (grade: ReviewGrade) => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const forward = entry.direction === "TERM_TO_DEFINITION";
  const prompt = forward ? entry.term : entry.definition;
  const answer = forward ? entry.definition : entry.term;
  const overline = `${entry.flashcardName} · ${forward ? "Term → Definition" : "Definition → Term"}`;
  const details = [entry.partOfSpeech, entry.example, entry.context].filter(
    (value): value is string => Boolean(value)
  );

  function onPointerDown(event: PointerEvent) {
    swiped.current = false;
    // Swipe is a touch layer on top of the grade buttons, not a mouse drag.
    start.current =
      seen && event.pointerType !== "mouse" ? { x: event.clientX, y: event.clientY } : null;
  }

  function onPointerUp(event: PointerEvent) {
    const from = start.current;
    start.current = null;
    if (!from) return;
    const grade = swipeGrade(event.clientX - from.x, event.clientY - from.y);
    if (grade) {
      swiped.current = true;
      onGrade(grade);
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (!swiped.current) onFlip();
        swiped.current = false;
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (start.current = null)}
      aria-label={revealed ? undefined : `Reveal the answer to: ${prompt}`}
      className={`block w-full max-w-review-card rounded-lg perspective-review focus-ring ${
        seen ? "cursor-pointer touch-none" : "cursor-pointer"
      }`}
    >
      <span className={`review-flip grid ${revealed ? "rotate-y-180" : ""}`}>
        <span aria-hidden={revealed} className={faceClass}>
          <span className={overlineClass}>{overline}</span>
          <span className="max-w-full text-display text-balance break-words text-foreground">
            {prompt}
          </span>
        </span>
        <span aria-hidden={!revealed} className={`${faceClass} rotate-y-180`}>
          <span className={overlineClass}>{overline}</span>
          <span className="max-w-full text-heading-1 text-balance break-words text-accent">
            {answer}
          </span>
          {details.length > 0 ? (
            <span className="flex max-w-prose flex-col gap-1 text-body-sm break-words text-foreground-tertiary">
              {details.map((line, i) => (
                <span key={i}>{line}</span>
              ))}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
