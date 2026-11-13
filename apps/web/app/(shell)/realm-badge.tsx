"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { CultivationResponse, RealmSummary } from "@training-sanctum/domain";
import { apiFetch } from "@/lib/api-client";

/** spec-5-1: the realm summary, shared by the sidebar badge and the Empty due-queue state. */
export function useCultivation() {
  return useQuery({
    queryKey: ["cultivation"],
    queryFn: () => apiFetch<CultivationResponse>("/api/cultivation"),
  });
}

const xpFormat = new Intl.NumberFormat("en-US");

/** Mono XP figure: "40 / 100 XP", or the running total at the final level. */
export function xpText(realm: RealmSummary): string {
  return realm.xpForStage === null
    ? `${xpFormat.format(realm.xp)} XP`
    : `${xpFormat.format(realm.xpIntoStage)} / ${xpFormat.format(realm.xpForStage)} XP`;
}

/**
 * DESIGN.md Realm badge XP bar: 4px, `rounded.full`, track `elevated`, fill
 * `accent`. Full at the final level. No animation, glow or gradient. On the
 * page background, where `elevated` barely separates from `bg` in the light
 * theme, pass `track="bg-border"`.
 */
export function XpBar({
  realm,
  track = "bg-elevated",
  className = "",
}: {
  realm: RealmSummary;
  track?: "bg-elevated" | "bg-border";
  className?: string;
}) {
  const max = realm.xpForStage ?? 1;
  const now = realm.xpForStage === null ? 1 : realm.xpIntoStage;
  return (
    <div
      role="progressbar"
      aria-label={realm.label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={now}
      aria-valuetext={xpText(realm)}
      className={`h-1 w-full overflow-hidden rounded-full ${track} ${className}`}
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${(now / max) * 100}%` }} />
    </div>
  );
}

/**
 * spec-5-1: the Realm badge at the sidebar bottom (DESIGN.md `Realm badge`).
 * Renders nothing while loading or on error, so the nav never waits on it.
 * The sidebar itself hides it in focus mode and below 640px.
 */
export function RealmBadge() {
  const { data } = useCultivation();
  if (!data) return null;

  return (
    <Link
      href="/cultivation"
      aria-label={`${data.label}, ${xpText(data)}`}
      className="group flex flex-col gap-2 rounded-sm px-3 py-3 transition-state hover:bg-row-hover focus-ring"
    >
      <span className="text-body-sm font-semibold text-foreground">{data.label}</span>
      {/* The track steps up to `border` on hover, where the row turns `elevated`. */}
      <XpBar realm={data} className="transition-state group-hover:bg-border" />
      <span className="font-mono text-caption text-foreground-tertiary tabular-nums">
        {xpText(data)}
      </span>
    </Link>
  );
}
