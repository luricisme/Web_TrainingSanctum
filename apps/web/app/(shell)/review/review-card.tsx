"use client";

import type { ReviewGrade, ReviewQueueEntry } from "@training-sanctum/domain";
import { FlipCard } from "@/app/components/flip-card";
import { overlineClass } from "@/app/components/ui";

/** EXPERIENCE.md Interaction Primitives (spec-4-3 Decisions): ← ↓ → ↑. */
function swipeGrade(dx: number, dy: number): ReviewGrade {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "again" : "good";
  return dy > 0 ? "hard" : "easy";
}

/**
 * The review card (DESIGN.md `components.review-card`): the shared flip card
 * with the prompt in front and the accent answer behind. Keyed by Scheduling
 * Record upstream, so each entry mounts unflipped.
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
  const forward = entry.direction === "TERM_TO_DEFINITION";
  const prompt = forward ? entry.term : entry.definition;
  const answer = forward ? entry.definition : entry.term;
  const overline = `${entry.flashcardName} · ${forward ? "Term → Definition" : "Definition → Term"}`;
  const details = [entry.partOfSpeech, entry.example, entry.context].filter(
    (value): value is string => Boolean(value)
  );

  return (
    <FlipCard
      flipped={revealed}
      onFlip={onFlip}
      onSwipe={
        seen
          ? (dx, dy) => {
              onGrade(swipeGrade(dx, dy));
              return true;
            }
          : undefined
      }
      ariaLabel={revealed ? undefined : `Reveal the answer to: ${prompt}`}
      className={seen ? "touch-none" : undefined}
      front={
        <>
          <span className={overlineClass}>{overline}</span>
          <span className="max-w-full text-display text-balance break-words text-foreground">
            {prompt}
          </span>
        </>
      }
      back={
        <>
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
        </>
      }
    />
  );
}
