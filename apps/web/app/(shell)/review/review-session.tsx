"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ReviewQueueResponse, ReviewScope } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { buttonSecondary, linkClass } from "@/app/components/ui";
import { GradingSession, stageClass } from "./grading-session";

const SCOPE_HREF: Record<ReviewScope["kind"], string> = {
  class: "/classes",
  folder: "/folders",
};

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
              ? "This class or folder does not exist."
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

function Session({ snapshot }: { snapshot: ReviewQueueResponse }) {
  const { scope } = snapshot;
  return (
    <GradingSession
      entries={snapshot.entries}
      header={<ScopeHeader scope={scope} />}
      repeatAgain={false}
      finished={
        <p className="flex min-h-80 w-full max-w-review-card items-center justify-center text-center text-body text-foreground-secondary">
          {scope
            ? `You're all caught up — nothing in ${scope.name} is due for review right now.`
            : "You're all caught up — nothing is due for review right now."}
        </p>
      }
    />
  );
}
