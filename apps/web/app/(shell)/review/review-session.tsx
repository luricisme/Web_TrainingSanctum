"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ReviewQueueResponse, ReviewScope } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { buttonSecondary, linkClass } from "@/app/components/ui";
import { useFocusMode } from "../focus-mode";
import { SessionExit } from "../session-exit";
import { EmptyDueQueue } from "./empty-due-queue";
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
 * spec-4-5: where Exit and Esc lead, read from the scope query itself so the
 * loading screen has it too: the scope's page, else Classes.
 */
function exitHrefFor(queryString: string): string {
  const params = new URLSearchParams(queryString);
  const classId = params.get("classId");
  if (classId) return `${SCOPE_HREF.class}/${encodeURIComponent(classId)}`;
  const folderId = params.get("folderId");
  if (folderId) return `${SCOPE_HREF.folder}/${encodeURIComponent(folderId)}`;
  return "/classes";
}

/** The skeleton card, already in focus mode so the chrome never flashes in. */
function Loading({ exitHref }: { exitHref: string }) {
  useFocusMode(true);
  return (
    <div className={stageClass} data-focus-session="">
      <SessionExit href={exitHref} />
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

  if (isPending) return <Loading exitHref={exitHrefFor(queryString)} />;

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

  const { scope } = data;
  const empty = <EmptyDueQueue scope={scope} queryString={queryString} />;
  // spec-4-5: nothing due at the start skips the session (and focus mode).
  if (data.entries.length === 0) {
    return (
      <div className={stageClass}>
        <ScopeHeader scope={scope} />
        {empty}
      </div>
    );
  }
  return (
    <GradingSession
      entries={data.entries}
      header={<ScopeHeader scope={scope} />}
      exitHref={exitHrefFor(queryString)}
      repeatAgain={false}
      finished={empty}
    />
  );
}
