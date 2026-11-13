"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CardSummary,
  type FlashcardCardsResponse,
  type LearnQueueResponse,
  type RecallDirection,
  type ReviewQueueEntry,
  studiedDirections,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { buttonSecondary, linkClass } from "@/app/components/ui";
import { useFocusMode } from "../../../focus-mode";
import { GradingSession, stageClass } from "../../../review/grading-session";
import { SessionExit } from "../../../session-exit";

const headerClass = "w-full max-w-review-card text-body-sm text-foreground-secondary";
const finishedClass =
  "flex min-h-80 w-full max-w-review-card flex-col items-center justify-center gap-6 text-center";

/** The skeleton card, already in focus mode (spec-4-5) so the chrome never flashes in. */
function Loading({ exitHref }: { exitHref: string }) {
  useFocusMode(true);
  return (
    <div className={stageClass} data-focus-session="">
      <SessionExit href={exitHref} />
      <h1 className="sr-only">Learn</h1>
      <div
        role="status"
        className="min-h-80 w-full max-w-review-card rounded-lg border border-divider bg-card shadow-medium"
      >
        <span className="sr-only">Loading your Learn session</span>
      </div>
    </div>
  );
}

/**
 * spec-4-8b: every Card of the Flashcard as practice entries, oldest-created
 * first (the Cards list is newest first), each Card's studied directions
 * together, Term → Definition first (spec-4-9: only studied directions). The
 * ids only key the slots: practice never reaches the grade route.
 */
function practiceEntries(
  cards: CardSummary[],
  flashcardName: string,
  dirs: RecallDirection[]
): ReviewQueueEntry[] {
  return [...cards].reverse().flatMap((card) =>
    dirs.map((direction) => ({
      schedulingRecordId: `practice:${card.id}:${direction}`,
      cardId: card.id,
      direction,
      nextReviewDate: "",
      flashcardName,
      term: card.term,
      definition: card.definition,
      example: card.example,
      context: card.context,
      partOfSpeech: card.partOfSpeech,
    }))
  );
}

/**
 * spec-4-8: the Learn session. One snapshot of the Flashcard's Learn queue
 * runs on Review's shared grading session, with Again repeated at the end.
 * Saved grades refresh the Flashcard's Learn counts for the way back.
 * spec-4-8b: once it is done, "Study all cards again" starts an unsaved
 * practice run over every Card.
 */
export function LearnSession({ flashcardId }: { flashcardId: string }) {
  const queryClient = useQueryClient();
  /** 0 while learning; each "Study all cards again" starts practice run n. */
  const [round, setRound] = useState(0);
  const { data, isPending, error, refetch, isRefetching } = useQuery({
    queryKey: ["learn", flashcardId],
    queryFn: () =>
      apiFetch<LearnQueueResponse>(
        `/api/review/learn?flashcardId=${encodeURIComponent(flashcardId)}`
      ),
    // One snapshot per session, as in Review: a refetch mid-session would
    // re-add entries graded optimistically but not yet saved.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  // The Cards for a practice run, read only once one is asked for.
  const cardsQuery = useQuery({
    queryKey: ["flashcard", flashcardId],
    queryFn: () => apiFetch<FlashcardCardsResponse>(`/api/flashcards/${flashcardId}`),
    enabled: round > 0,
  });

  if (isPending) return <Loading exitHref={`/flashcards/${encodeURIComponent(flashcardId)}`} />;

  if (!data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className={stageClass}>
        <h1 className="sr-only">Learn</h1>
        <div role="alert" className="flex w-full max-w-review-card flex-col items-start gap-4">
          <p className="text-body text-foreground-secondary">
            {notFound ? "This flashcard does not exist." : "Could not load this Learn session."}
          </p>
          {notFound ? (
            <Link href="/classes" className={buttonSecondary}>
              Back to Classes
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

  const { flashcard } = data;
  const href = `/flashcards/${flashcard.id}`;
  const nameLink = (
    <Link href={href} className={`rounded-sm ${linkClass}`}>
      {flashcard.name}
    </Link>
  );

  const actions = (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <button type="button" onClick={() => setRound((r) => r + 1)} className={buttonSecondary}>
        Study all cards again
      </button>
      <Link href={href} className={buttonSecondary}>
        Back to {flashcard.name}
      </Link>
    </div>
  );

  if (round > 0) {
    if (cardsQuery.isPending) return <Loading exitHref={href} />;
    if (!cardsQuery.data) {
      return (
        <div className={stageClass}>
          <h1 className="sr-only">Learn</h1>
          <div role="alert" className="flex w-full max-w-review-card flex-col items-start gap-4">
            <p className="text-body text-foreground-secondary">Could not load the cards.</p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={cardsQuery.isRefetching}
                onClick={() => void cardsQuery.refetch()}
                className={buttonSecondary}
              >
                Try again
              </button>
              <Link href={href} className={buttonSecondary}>
                Back to {flashcard.name}
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return (
      <GradingSession
        // A fresh run each time, starting from the first Card.
        key={`practice-${round}`}
        entries={practiceEntries(
          cardsQuery.data.cards,
          flashcard.name,
          studiedDirections(cardsQuery.data.studyDirections)
        )}
        repeatAgain
        practice
        exitHref={href}
        header={
          <h1 className={headerClass}>
            Practicing {nameLink} · grades aren&apos;t saved
          </h1>
        }
        finished={
          <div className={finishedClass}>
            <p className="text-body text-foreground-secondary">
              You&apos;ve gone through every card in {flashcard.name}.
            </p>
            {actions}
          </div>
        }
      />
    );
  }

  return (
    <GradingSession
      entries={data.entries}
      repeatAgain
      exitHref={href}
      onGradeSettled={() =>
        void queryClient.invalidateQueries({ queryKey: ["flashcard", flashcard.id] })
      }
      header={<h1 className={headerClass}>Learning {nameLink}</h1>}
      finished={
        <div className={finishedClass}>
          <p className="text-body text-foreground-secondary">
            Nothing left to learn in {flashcard.name} right now.
          </p>
          {actions}
        </div>
      }
    />
  );
}
