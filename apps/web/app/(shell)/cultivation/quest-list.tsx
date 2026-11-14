"use client";

import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QuestClaimResponse, QuestView } from "@training-sanctum/domain";
import { apiFetch } from "@/lib/api-client";
import { SectionMarker } from "@/app/components/section-marker";
import { fieldErrorClass } from "@/app/components/ui";

/** Row label: "Learn 1 Flashcard", "Learn 2 Flashcards", "Clear Review". */
function questLabel(quest: QuestView): string {
  if (quest.kind === "CLEAR_REVIEW") return "Clear Review";
  const n = quest.target ?? 0;
  if (quest.status === "skipped" || n === 0) return "Learn Flashcards";
  return `Learn ${n} ${n === 1 ? "Flashcard" : "Flashcards"}`;
}

/** Mono progress figure: "0 / 1 Flashcards", "12 due left". */
function progressText(quest: QuestView): string | null {
  if (quest.status === "skipped") return null;
  if (quest.kind === "LEARN_FLASHCARDS")
    return `${quest.progress} / ${quest.target} Flashcards`;
  if (quest.status === "locked" && (quest.dueLeft ?? 0) > 0)
    return `${quest.dueLeft} due left`;
  return null;
}

/** The helper line under the label, by state. */
function helperText(quest: QuestView): string {
  switch (quest.status) {
    case "skipped":
      return "Nothing to do today.";
    case "ready":
      return "Done. Tick to claim before the day ends.";
    case "claimed":
      return "Claimed.";
    case "locked":
      if (quest.kind === "LEARN_FLASHCARDS") {
        return "Finish every unlearned Card of a Flashcard in Learn.";
      }
      return (quest.dueLeft ?? 0) > 0
        ? "Review every due card to clear the queue."
        : "Review at least one due card today.";
  }
}

/**
 * spec-5-6: today's two Daily Quests (FR-19, EXPERIENCE.md Daily quest list).
 * Ticking a ready row claims it at once, with no confirm; on failure the tick
 * rolls back (the box is controlled by server state) and an inline error shows.
 * A Breakthrough is a quiet inline line, never a modal.
 */
export function QuestList({ quests }: { quests: QuestView[] }) {
  const queryClient = useQueryClient();
  const [breakthrough, setBreakthrough] = useState<string | null>(null);
  const [error, setError] = useState<{ slug: string; message: string } | null>(
    null,
  );

  const claim = useMutation({
    mutationFn: (quest: QuestView) =>
      apiFetch<QuestClaimResponse>(
        `/api/cultivation/quests/${quest.slug}/claim`,
        {
          method: "POST",
        },
      ),
    onMutate: () => setError(null),
    onSuccess: (data) => {
      setBreakthrough(data.breakthrough ? data.realm.label : null);
      void queryClient.invalidateQueries({ queryKey: ["cultivation"] });
    },
    onError: (err, quest) => {
      setError({
        slug: quest.slug,
        message: err instanceof Error ? err.message : "Try again.",
      });
      void queryClient.invalidateQueries({ queryKey: ["cultivation"] });
    },
  });

  return (
    <section aria-labelledby="daily-quests" className="mt-8">
      <div className="mb-3 px-3">
        <SectionMarker as="h2" id="daily-quests">
          Today&apos;s quests
        </SectionMarker>
      </div>
      <ul className="overflow-hidden rounded-lg border border-divider bg-card shadow-low">
        {quests.map((quest) => (
          <QuestRow
            key={quest.kind}
            quest={quest}
            pending={claim.isPending && claim.variables?.kind === quest.kind}
            busy={claim.isPending}
            error={error?.slug === quest.slug ? error.message : null}
            onClaim={() => claim.mutate(quest)}
          />
        ))}
      </ul>
      <p
        role="status"
        className={
          breakthrough
            ? "mt-3 rounded-md bg-elevated px-3 py-2 text-body-sm text-foreground-secondary"
            : "sr-only"
        }
      >
        {breakthrough ? `Breakthrough: ${breakthrough}` : null}
      </p>
    </section>
  );
}

function QuestRow({
  quest,
  pending,
  busy,
  error,
  onClaim,
}: {
  quest: QuestView;
  pending: boolean;
  busy: boolean;
  error: string | null;
  onClaim: () => void;
}) {
  const id = useId();
  const helperId = `${id}-helper`;
  const skipped = quest.status === "skipped";
  const claimed = quest.status === "claimed";
  const progress = progressText(quest);

  return (
    <li className="border-b border-divider last:border-b-0">
      <div className={`flex min-h-16 items-start gap-3 p-3 `}>
        {skipped ? (
          <span aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        ) : (
          <span className="relative mt-0.5 flex size-5 shrink-0">
            <input
              id={id}
              type="checkbox"
              checked={claimed || pending}
              disabled={quest.status !== "ready" || busy}
              aria-describedby={helperId}
              onChange={onClaim}
              className="peer size-5 cursor-pointer appearance-none rounded-full border border-border bg-card transition-state checked:border-accent checked:bg-accent focus-ring disabled:cursor-not-allowed disabled:not-checked:opacity-40"
            />
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute inset-0 hidden size-5 text-on-accent peer-checked:block"
            >
              <path d="M5.5 10.5l3 3 6-6.5" />
            </svg>
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <label
              htmlFor={skipped ? undefined : id}
              className={`text-body font-semibold ${skipped ? "text-foreground-tertiary" : "text-foreground"}`}
            >
              {questLabel(quest)}
            </label>
            {skipped ? null : (
              <span className="shrink-0 font-mono text-body-sm text-foreground-secondary tabular-nums">
                +{quest.xp} XP
              </span>
            )}
          </div>
          <p
            id={helperId}
            className="mt-0.5 text-body-sm text-foreground-tertiary"
          >
            {progress ? (
              <>
                <span className="font-mono tabular-nums text-foreground-secondary">
                  {progress}
                </span>
                {" · "}
              </>
            ) : null}
            {helperText(quest)}
          </p>
          {error ? (
            <p role="alert" className={`mt-1 ${fieldErrorClass}`}>
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
