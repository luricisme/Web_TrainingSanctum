"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";

/** Minimum travel along the dominant axis that counts as a swipe. */
export const SWIPE_MIN_PX = 48;

const faceClass =
  "col-start-1 row-start-1 flex min-h-80 flex-col items-center justify-center gap-4 rounded-lg border border-divider bg-card px-6 py-12 text-center shadow-medium backface-hidden sm:px-8";

/**
 * The flip surface of DESIGN.md `components.review-card`, shared by Review
 * and the Card viewer: one fixed-bounds button that turns on Y between two
 * faces. Both faces share one grid cell, so the card keeps the taller face's
 * height in both states. Key it by the item it shows so the next one mounts
 * front side up, with no reverse animation.
 *
 * `onSwipe` receives a touch or pen gesture whose dominant axis travelled at
 * least SWIPE_MIN_PX (mouse drags never count) and returns whether it acted;
 * an acted-on swipe does not also flip the card.
 */
export function FlipCard({
  flipped,
  front,
  back,
  onFlip,
  onSwipe,
  ariaLabel,
  className,
}: {
  flipped: boolean;
  front: ReactNode;
  back: ReactNode;
  onFlip: () => void;
  /** Omit to turn swipe detection off. */
  onSwipe?: (dx: number, dy: number) => boolean;
  ariaLabel?: string;
  /** Extra button classes, e.g. the `touch-action` the swipe needs. */
  className?: string;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  function onPointerDown(event: PointerEvent) {
    swiped.current = false;
    // Swipe is a touch layer on top of the visible controls, not a mouse drag.
    start.current =
      onSwipe && event.pointerType !== "mouse" ? { x: event.clientX, y: event.clientY } : null;
  }

  function onPointerUp(event: PointerEvent) {
    const from = start.current;
    start.current = null;
    if (!from || !onSwipe) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;
    if (onSwipe(dx, dy)) swiped.current = true;
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
      aria-label={ariaLabel}
      className={`block w-full max-w-review-card rounded-lg perspective-review focus-ring cursor-pointer${
        className ? ` ${className}` : ""
      }`}
    >
      <span className={`review-flip grid ${flipped ? "rotate-y-180" : ""}`}>
        <span aria-hidden={flipped} className={faceClass}>
          {front}
        </span>
        <span aria-hidden={!flipped} className={`${faceClass} rotate-y-180`}>
          {back}
        </span>
      </span>
    </button>
  );
}
