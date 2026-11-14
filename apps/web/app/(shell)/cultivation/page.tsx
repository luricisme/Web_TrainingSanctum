"use client";

import { useQuery } from "@tanstack/react-query";
import type { CultivationResponse, StatsResponse } from "@training-sanctum/domain";
import { apiFetch } from "@/lib/api-client";
import { PageHeader } from "../page-header";
import { XpBar, xpText } from "../realm-badge";
import { MissedNotices } from "./missed-notices";
import { CardTotals } from "./card-totals";
import { IntervalChart } from "./interval-chart";
import { QuestList } from "./quest-list";
import { RealmLadder } from "./realm-ladder";
import { XpChart } from "./xp-chart";

/**
 * spec-5-6: the realm with its XP bar, any missed-day notices and today's quests. Fresh on mount
 * (staleTime 0) so a visit after grading shows the latest progress. spec-5-4
 * adds the Realm Ladder, the XP history, card totals and the interval
 * distribution; a failed stats load leaves the realm and quests in place.
 */
export default function CultivationPage() {
  const { data, isPending, refetch } = useQuery({
    queryKey: ["cultivation"],
    queryFn: () => apiFetch<CultivationResponse>("/api/cultivation"),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const stats = useQuery({
    queryKey: ["stats"],
    queryFn: () => apiFetch<StatsResponse>("/api/stats"),
    // After the cultivation read: it settles missed days, which writes the
    // ledger rows the XP chart replays.
    enabled: Boolean(data),
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
          <div className="mt-4">
            <XpBar realm={data} track="bg-border" />
            <p className="mt-2 font-mono text-caption text-foreground-tertiary tabular-nums">
              {xpText(data)}
            </p>
          </div>
          <MissedNotices notices={data.notices} realmLabel={data.label} />
          <QuestList quests={data.quests} />
          <RealmLadder realm={data} />
          {stats.data ? (
            <>
              <XpChart series={stats.data.xpHistory} />
              <CardTotals cards={stats.data.cards} />
              <IntervalChart distribution={stats.data.distribution} />
            </>
          ) : stats.isPending ? (
            <div role="status" className="mt-8 h-40 animate-pulse rounded-lg bg-elevated motion-reduce:animate-none">
              <span className="sr-only">Loading your stats</span>
            </div>
          ) : (
            <div role="alert" className="mt-8 flex items-center gap-3">
              <p className="text-body-sm text-foreground-tertiary">Could not load your stats.</p>
              <button
                type="button"
                onClick={() => void stats.refetch()}
                className="rounded-full px-4 py-2 text-body-sm font-medium text-foreground-secondary transition-state hover:bg-row-hover hover:text-foreground focus-ring"
              >
                Try again
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
