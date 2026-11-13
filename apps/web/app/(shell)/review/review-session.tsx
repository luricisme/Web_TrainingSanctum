"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  REVIEW_GRADES,
  type GradeResult,
  type ReviewGrade,
  type ReviewQueueEntry,
  type ReviewQueueResponse,
  type ReviewScope,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { buttonSecondary, formErrorClass, linkClass } from "@/app/components/ui";
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

const SCOPE_HREF: Record<ReviewScope["kind"], string> = {
  class: "/classes",
  folder: "/folders",
  flashcard: "/flashcards",
};

const gradeBase =
  "flex items-center justify-center gap-3 rounded-full border px-6 py-3 text-body font-medium transition-state hover:bg-row-hover focus-ring";
/** DESIGN.md `grade-button-again`: error border and text, never the accent. */
const gradeAgain = `${gradeBase} border-error text-error`;
/** DESIGN.md `grade-button-neutral`: Hard, Good and Easy are identical in weight. */
const gradeNeutral = `${gradeBase} border-border text-foreground-secondary hover:text-foreground`;

const stageClass = "flex w-full flex-col items-center gap-8";

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function ScopeHeader({ scope }: { scope: ReviewScope | null }) {
  if (!scope) return <h1 className="sr-only">Review</h1>;
  return (
    <h1 className="w-full max-w-review-card text-body-sm text-foreground-secondary">
      Reviewing {scope.kind}{" "}
      <Link
        href={`${SCOPE_HREF[scope.kind]}/${scope.id}`}
        className={`rounded-sm ${linkClass}`}
      >
        {scope.name}
      </Link>
    </h1>
  );
}

/**
 * spec-4-3: the client review session. The queue is one snapshot fetched when
 * the session starts; grading advances locally at once and POSTs in the
 * background (AD-7). Keyed by its scope query upstream.
 */
export function ReviewSession({ queryString }: { queryString: string }) {
  const { data, isPending, error, refetch, isRefetching } = useQuery({
    queryKey: ["review-queue", queryString],
    queryFn: () =>
      apiFetch<ReviewQueueResponse>(`/api/review/queue${queryString ? `?${queryString}` : ""}`),
    // One snapshot per session: refetching mid-session would re-add entries
    // graded optimistically but not yet saved. The next visit refetches.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (isPending) {
    return (
      <div className={stageClass}>
        <h1 className="sr-only">Review</h1>
        <div
          role="status"
          className="min-h-80 w-full max-w-review-card rounded-lg border border-divider bg-card shadow-medium"
        >
          <span className="sr-only">Loading your review queue</span>
        </div>
      </div>
    );
  }

  if (!data) {
    const notFound = error instanceof ApiError && error.status === 404;
    // A 400 (e.g. two scopes in a hand-edited URL) can never succeed on retry.
    const invalid = error instanceof ApiError && error.status === 400;
    return (
      <div className={stageClass}>
        <h1 className="sr-only">Review</h1>
        <div role="alert" className="flex w-full max-w-review-card flex-col items-start gap-4">
          <p className="text-body text-foreground-secondary">
            {notFound
              ? "This class, folder or flashcard does not exist."
              : invalid
                ? "This review link isn't valid."
                : "Could not load your review queue."}
          </p>
          {notFound || invalid ? (
            <Link href="/review" className={buttonSecondary}>
              Review all cards
            </Link>
          ) : (
            <button
              type="button"
              disabled={isRefetching}
              onClick={() => void refetch()}
              className={buttonSecondary}
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  return <Session snapshot={data} />;
}

interface SessionState {
  entries: ReviewQueueEntry[];
  /** Position of the current entry; everything before it has been graded. */
  index: number;
  revealed: boolean;
  failed: boolean;
}

function Session({ snapshot }: { snapshot: ReviewQueueResponse }) {
  const { scope } = snapshot;
  const [state, setState] = useState<SessionState>(() => ({
    entries: snapshot.entries,
    index: 0,
    revealed: false,
    failed: false,
  }));
  // Mirrors `state` synchronously so rapid key presses read the latest
  // session before React re-renders (no stale reveal/grade between keys).
  const live = useRef(state);
  const current = state.entries[state.index];

  const update = useCallback((next: (s: SessionState) => SessionState) => {
    const value = next(live.current);
    if (value === live.current) return;
    live.current = value;
    setState(value);
  }, []);

  const { mutate } = useMutation({
    mutationFn: ({ entry, grade }: { entry: ReviewQueueEntry; grade: ReviewGrade }) =>
      apiFetch<GradeResult>("/api/review/grade", {
        method: "POST",
        json: { schedulingRecordId: entry.schedulingRecordId, grade },
        // The session has already moved on; let the save finish even if the
        // user leaves the page right after the last grade.
        keepalive: true,
      }),
    onMutate: ({ entry }) => {
      // Advance at once; the in-flight entry rides in the context for onError.
      update((s) =>
        s.entries[s.index]?.schedulingRecordId === entry.schedulingRecordId
          ? { ...s, index: s.index + 1, revealed: false, failed: false }
          : s
      );
      return { entry };
    },
    onError: (err, _vars, context) => {
      // 409 NOT_DUE: the first grade of the day already applied. Drop it.
      if (!context || (err instanceof ApiError && err.code === "NOT_DUE")) return;
      const { entry } = context;
      update((s) => {
        const from = s.entries.findIndex(
          (e) => e.schedulingRecordId === entry.schedulingRecordId
        );
        if (from === -1 || from >= s.index) return { ...s, failed: true };
        // Put the entry back as the current card, unflipped.
        const entries = [...s.entries];
        entries.splice(from, 1);
        const index = s.index - 1;
        entries.splice(index, 0, entry);
        return { entries, index, revealed: false, failed: true };
      });
    },
  });

  const reveal = useCallback(() => {
    update((s) => (s.revealed || !s.entries[s.index] ? s : { ...s, revealed: true }));
  }, [update]);

  const grade = useCallback(
    (value: ReviewGrade) => {
      const s = live.current;
      const entry = s.entries[s.index];
      if (!entry || !s.revealed) return;
      mutate({ entry, grade: value });
    },
    [mutate]
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const s = live.current;
      if (isTextField(event.target) || !s.entries[s.index]) return;
      if (event.code === "Space" || event.key === " ") {
        // Space only ever reveals; it must not scroll or press a button.
        event.preventDefault();
        if (!event.repeat) reveal();
        return;
      }
      const value = GRADE_KEYS[event.code];
      if (!value) return;
      event.preventDefault();
      if (!event.repeat) grade(value);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reveal, grade]);

  const total = state.entries.length;

  return (
    <div className={stageClass}>
      <ScopeHeader scope={scope} />

      {current ? (
        <>
          <ReviewCard
            key={current.schedulingRecordId}
            entry={current}
            revealed={state.revealed}
            onReveal={reveal}
            onGrade={grade}
          />

          <div className="flex min-h-14 w-full max-w-review-card flex-col items-center justify-center gap-4">
            {state.revealed ? (
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
        <p className="flex min-h-80 w-full max-w-review-card items-center justify-center text-center text-body text-foreground-secondary">
          {scope
            ? `You're all caught up — nothing in ${scope.name} is due for review right now.`
            : "You're all caught up — nothing is due for review right now."}
        </p>
      )}
    </div>
  );
}
