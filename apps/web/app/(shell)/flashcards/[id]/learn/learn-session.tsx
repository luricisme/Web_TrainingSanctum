"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LearnQueueResponse } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { buttonSecondary, linkClass } from "@/app/components/ui";
import { GradingSession, stageClass } from "../../../review/grading-session";

/**
 * spec-4-8: the Learn session. One snapshot of the Flashcard's Learn queue
 * runs on Review's shared grading session, with Again repeated at the end.
 * Saved grades refresh the Flashcard's Learn counts for the way back.
 */
export function LearnSession({ flashcardId }: { flashcardId: string }) {
  const queryClient = useQueryClient();
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

  if (isPending) {
    return (
      <div className={stageClass}>
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

  return (
    <GradingSession
      entries={data.entries}
      repeatAgain
      onGradeSettled={() =>
        void queryClient.invalidateQueries({ queryKey: ["flashcard", flashcard.id] })
      }
      header={
        <h1 className="w-full max-w-review-card text-body-sm text-foreground-secondary">
          Learning{" "}
          <Link href={href} className={`rounded-sm ${linkClass}`}>
            {flashcard.name}
          </Link>
        </h1>
      }
      finished={
        <div className="flex min-h-80 w-full max-w-review-card flex-col items-center justify-center gap-6 text-center">
          <p className="text-body text-foreground-secondary">
            Nothing left to learn in {flashcard.name} right now.
          </p>
          <Link href={href} className={buttonSecondary}>
            Back to {flashcard.name}
          </Link>
        </div>
      }
    />
  );
}
