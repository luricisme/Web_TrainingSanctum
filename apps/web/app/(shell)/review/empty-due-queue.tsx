"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type {
  ReviewScope,
  UnlearnedFlashcard,
  UnlearnedFlashcardsResponse,
} from "@training-sanctum/domain";
import { apiFetch } from "@/lib/api-client";
import { SectionMarker } from "@/app/components/section-marker";
import { buttonPrimary, buttonQuiet } from "@/app/components/ui";
import { XpBar, useCultivation, xpText } from "../realm-badge";

/**
 * spec-4-5: the Empty due-queue state (DESIGN.md `Empty due-queue state`).
 * A calm line, then the next step: up to 3 Flashcards with Unlearned Cards
 * as list rows, or, with none, a "+ Add card" button, the screen's one accent
 * action (the section bullet is the sanctioned non-actionable accent motif).
 * Fetched fresh each time it shows, so a cleared queue reads the latest
 * counts. spec-5-1: the realm and its XP bar sit above the calm line; today's
 * quest count joins them in Story 5.6.
 */
export function EmptyDueQueue({
  scope,
  queryString,
}: {
  scope: ReviewScope | null;
  queryString: string;
}) {
  const { data, isPending, refetch, isRefetching } = useQuery({
    queryKey: ["review-empty", queryString],
    queryFn: () =>
      apiFetch<UnlearnedFlashcardsResponse>(
        `/api/review/unlearned${queryString ? `?${queryString}` : ""}`
      ),
    staleTime: 0,
    gcTime: 0,
  });

  return (
    <div className="flex min-h-80 w-full max-w-review-card flex-col items-center justify-center gap-8 text-center">
      <RealmSummaryBlock />
      <p className="text-balance text-body text-foreground-secondary">
        {scope
          ? `You're all caught up — nothing in ${scope.name} is due for review right now.`
          : "You're all caught up — nothing is due for review right now."}
      </p>

      {isPending ? (
        <div role="status" className="min-h-16 w-full">
          <span className="sr-only">Loading what to study next</span>
        </div>
      ) : !data ? (
        <div role="alert" className="flex flex-col items-center gap-2">
          <p className="text-body-sm text-foreground-tertiary">
            Could not load what to study next.
          </p>
          <button
            type="button"
            disabled={isRefetching}
            onClick={() => void refetch()}
            className={buttonQuiet}
          >
            Try again
          </button>
        </div>
      ) : data.flashcards.length > 0 ? (
        <UnlearnedList flashcards={data.flashcards} />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Link
            href={data.addCardTarget ? `/flashcards/${data.addCardTarget.id}?add=1` : "/classes"}
            className={buttonPrimary}
          >
            + Add card
          </Link>
          {data.addCardTarget ? (
            <p className="text-caption text-foreground-tertiary">
              Adds to {data.addCardTarget.name}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Realm · stage in `heading-1`, its XP bar and the mono XP figure, from the
 * same query as the sidebar badge. Holds its height while loading and renders
 * nothing on error: the calm line and the next step still show.
 */
function RealmSummaryBlock() {
  const { data, isPending } = useCultivation();
  // While loading, hold the block's height so the calm line does not jump.
  if (isPending) {
    return (
      <div aria-hidden="true" className="invisible flex w-full flex-col items-center gap-3">
        <p className="text-heading-1">&nbsp;</p>
        <div className="h-1" />
        <p className="font-mono text-caption">&nbsp;</p>
      </div>
    );
  }
  if (!data) return null;
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-balance text-heading-1 text-foreground">{data.label}</p>
      <XpBar realm={data} track="bg-border" className="max-w-xs" />
      <p className="font-mono text-caption text-foreground-tertiary tabular-nums">
        {xpText(data)}
      </p>
    </div>
  );
}

/** Flashcard list rows, as on a Folder page, each leading to its Learn button. */
function UnlearnedList({ flashcards }: { flashcards: UnlearnedFlashcard[] }) {
  return (
    <section aria-labelledby="ready-to-learn" className="w-full text-left">
      <div className="mb-3 px-3">
        <SectionMarker as="h2" id="ready-to-learn">
          Ready to learn
        </SectionMarker>
      </div>
      <ul className="border-t border-divider">
        {flashcards.map((flashcard) => (
          <li key={flashcard.id}>
            <Link
              href={`/flashcards/${flashcard.id}`}
              className="flex min-h-16 items-center gap-3 rounded-sm border-b border-divider p-3 transition-state hover:bg-row-hover focus-ring"
            >
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-card text-foreground-secondary"
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
                >
                  <rect x="3" y="6" width="14" height="14" rx="2" />
                  <path d="M7 3h12a2 2 0 0 1 2 2v12" />
                </svg>
              </span>
              <span className="flex min-w-0 flex-1 items-baseline gap-1 text-body">
                <span className="truncate font-semibold text-foreground">{flashcard.name}</span>{" "}
                <span className="shrink-0 text-foreground-tertiary">
                  · {flashcard.newCards} new
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
