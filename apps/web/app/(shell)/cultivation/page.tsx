"use client";

import { useQuery } from "@tanstack/react-query";
import type { CultivationResponse } from "@training-sanctum/domain";
import { apiFetch } from "@/lib/api-client";
import { PageHeader } from "../page-header";
import { XpBar, xpText } from "../realm-badge";
import { QuestList } from "./quest-list";

/**
 * spec-5-6: the realm with its XP bar and today's quests. Fresh on mount
 * (staleTime 0) so a visit after grading shows the latest progress. Stats,
 * the chart and the Realm Ladder join in Story 5.4.
 */
export default function CultivationPage() {
  const { data, isPending, refetch } = useQuery({
    queryKey: ["cultivation"],
    queryFn: () => apiFetch<CultivationResponse>("/api/cultivation"),
    staleTime: 0,
    refetchOnMount: "always",
  });

  return (
    <div>
      <PageHeader title="Cultivation">
        {data ? data.label : "Your quests and progress."}
      </PageHeader>
      {isPending ? (
        <div role="status" className="mt-8 h-40 animate-pulse rounded-lg bg-elevated motion-reduce:animate-none">
          <span className="sr-only">Loading your quests</span>
        </div>
      ) : !data ? (
        <div role="alert" className="mt-8 flex items-center gap-3">
          <p className="text-body-sm text-foreground-tertiary">Could not load your quests.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-full px-4 py-2 text-body-sm font-medium text-foreground-secondary transition-state hover:bg-row-hover hover:text-foreground focus-ring"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="mt-4 max-w-md">
            <XpBar realm={data} track="bg-border" />
            <p className="mt-2 font-mono text-caption text-foreground-tertiary tabular-nums">
              {xpText(data)}
            </p>
          </div>
          <QuestList quests={data.quests} />
        </>
      )}
    </div>
  );
}
