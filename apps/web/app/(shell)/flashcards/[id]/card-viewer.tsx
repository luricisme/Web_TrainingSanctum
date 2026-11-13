"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CardSummary } from "@training-sanctum/domain";
import { FlipCard } from "@/app/components/flip-card";
import { overlineClass } from "@/app/components/ui";
import { isTextField } from "@/lib/keyboard";

/** DESIGN.md `components.card-viewer` nav button: outline circle, neutral, 0.4 when disabled. */
const navButton =
  "flex size-11 items-center justify-center rounded-full border border-border text-foreground-secondary transition-state hover:bg-row-hover hover:text-foreground focus-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-foreground-secondary";

const arrowProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/**
 * spec-4-7: the non-graded card viewer at the top of Flashcard detail
 * (FR-16). One Card at a time in list order, Term side first, or Definition
 * side first when only Definition → Term is studied (spec-4-9); Space or a
 * click flips, ← / → (keys, buttons or a horizontal swipe) move with no
 * wrap. It only reads the loaded Cards and never touches scheduling.
 */
export function CardViewer({
  cards,
  definitionFirst = false,
  inactive,
}: {
  cards: CardSummary[];
  /** Only Definition → Term is studied: the Definition is the front. */
  definitionFirst?: boolean;
  /** A panel or modal is open: page keys belong to it. */
  inactive: boolean;
}) {
  // The viewer follows the Card it shows by id, so adding a Card above it
  // does not swap the Card under the reader. If that Card leaves the list,
  // the last index is clamped into range.
  const [position, setPosition] = useState<{ id: string | null; index: number }>(() => ({
    id: cards[0]?.id ?? null,
    index: 0,
  }));
  /** The id of the Card showing its Definition side, if any. */
  const [flippedId, setFlippedId] = useState<string | null>(null);

  const total = cards.length;
  const found = cards.findIndex((card) => card.id === position.id);
  const index = found >= 0 ? found : Math.max(0, Math.min(position.index, total - 1));
  const card = cards[index];
  const flipped = card !== undefined && flippedId === card.id;

  // Mirrors the derived state for the window key listener; move and flip
  // also update it at once so rapid key presses never read a stale Card.
  const live = useRef({ cards, index, flipped, inactive });
  useLayoutEffect(() => {
    live.current = { cards, index, flipped, inactive };
  });
  const sectionRef = useRef<HTMLElement>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  /** Moves one Card; returns false at either end (no wrap). */
  const move = useCallback((step: -1 | 1): boolean => {
    const { cards: list, index: from } = live.current;
    const to = from + step;
    const next = list[to];
    if (!next) return false;
    // Reaching an end disables that arrow; if it has focus, keep focus in the row.
    const active = document.activeElement;
    if (to === 0 && active === prevRef.current) nextRef.current?.focus();
    if (to === list.length - 1 && active === nextRef.current) prevRef.current?.focus();
    live.current = { ...live.current, index: to, flipped: false };
    setPosition({ id: next.id, index: to });
    setFlippedId(null);
    return true;
  }, []);

  const flip = useCallback(() => {
    const { cards: list, index: at, flipped: was } = live.current;
    const current = list[at];
    if (!current) return;
    live.current = { ...live.current, flipped: !was };
    setFlippedId(was ? null : current.id);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (live.current.inactive || isTextField(event.target)) return;
      if (event.code === "Space" || event.key === " ") {
        // Space on another control (Add cards, Edit, the arrows, links) presses
        // that control; only the flip card itself or no control flips.
        const control =
          event.target instanceof Element
            ? event.target.closest("button, a, [role=button], summary")
            : null;
        const onFlipCard =
          control !== null &&
          sectionRef.current?.contains(control) === true &&
          control !== prevRef.current &&
          control !== nextRef.current;
        if (control && !onFlipCard) return;
        // Space flips the card either way; it must not scroll the page.
        event.preventDefault();
        if (!event.repeat) flip();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flip, move]);

  if (!card) return null;

  const details = [card.partOfSpeech, card.example, card.context].filter(
    (value): value is string => Boolean(value)
  );

  const detailLines =
    details.length > 0 ? (
      <span className="flex max-w-prose flex-col gap-1 text-body-sm break-words text-foreground-tertiary">
        {details.map((line, i) => (
          <span key={i}>{line}</span>
        ))}
      </span>
    ) : null;
  // The front is the prompt in display type; the back is the answer and the details.
  const face = (label: string, text: string, size: string) => (
    <>
      <span className={overlineClass}>{label}</span>
      <span className={`max-w-full ${size} text-balance break-words text-foreground`}>
        {text}
      </span>
    </>
  );
  const [frontLabel, frontText, backLabel, backText] = definitionFirst
    ? ["Definition", card.definition, "Term", card.term]
    : ["Term", card.term, "Definition", card.definition];

  return (
    <section ref={sectionRef} aria-label="Card viewer" className="mt-8 flex flex-col items-center gap-6">
      <FlipCard
        key={card.id}
        flipped={flipped}
        onFlip={flip}
        onSwipe={(dx, dy) => {
          // Horizontal only: left shows the next Card, right the previous one.
          if (Math.abs(dx) < Math.abs(dy)) return false;
          return move(dx < 0 ? 1 : -1);
        }}
        ariaLabel={
          flipped
            ? undefined
            : definitionFirst
              ? `Show the term for: ${card.definition}`
              : `Show the definition of: ${card.term}`
        }
        // Horizontal swipes belong to the viewer; vertical ones still scroll.
        className="touch-pan-y"
        front={face(frontLabel, frontText, "text-display")}
        back={
          <>
            {face(backLabel, backText, "text-heading-1")}
            {detailLines}
          </>
        }
      />

      <div className="flex items-center justify-center gap-6">
        <button
          type="button"
          ref={prevRef}
          onClick={() => move(-1)}
          disabled={index === 0}
          aria-label="Previous card"
          aria-keyshortcuts="ArrowLeft"
          className={navButton}
        >
          <svg {...arrowProps}>
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </button>
        <p
          aria-live="polite"
          className="min-w-20 text-center font-mono text-heading-3 text-foreground tabular-nums"
        >
          {index + 1} / {total}
        </p>
        <button
          type="button"
          ref={nextRef}
          onClick={() => move(1)}
          disabled={index === total - 1}
          aria-label="Next card"
          aria-keyshortcuts="ArrowRight"
          className={navButton}
        >
          <svg {...arrowProps}>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </section>
  );
}
