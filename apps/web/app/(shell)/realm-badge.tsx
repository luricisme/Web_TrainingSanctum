"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { CultivationResponse, RealmSummary } from "@training-sanctum/domain";
import { apiFetch } from "@/lib/api-client";
import { RealmAvatar } from "./realm-avatar";

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
 * The XP bar of the Empty due-queue state: 4px, `rounded.full`, track `elevated`, fill
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

const RING_SIZE = 44;
const RING_RADIUS = 20;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const AVATAR_SIZE = 34;

/**
 * spec-5-1: the Realm badge at the right end of the app bar: the user's realm
 * avatar inside an XP ring, the realm label and the mono XP figure, on the
 * dark frame. The avatar changes with every realm (see `RealmAvatar`).
 * Renders nothing while loading or on error, so the nav never waits on it.
 * The app bar itself hides it in focus mode and below 640px.
 */
export function RealmBadge() {
  const { data } = useCultivation();
  if (!data) return null;

  const max = data.xpForStage ?? 1;
  const now = data.xpForStage === null ? 1 : data.xpIntoStage;

  return (
    <Link
      href="/cultivation"
      aria-label={`${data.label}, ${xpText(data)}`}
      className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-state hover:bg-frame-raised focus-ring-frame"
    >
      <span
        role="progressbar"
        aria-label={data.label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={now}
        aria-valuetext={xpText(data)}
        className="relative flex shrink-0 items-center justify-center"
      >
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            strokeWidth="2.5"
            className="stroke-on-frame-muted/40"
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * (1 - now / max)}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            className="stroke-on-frame"
          />
        </svg>
        <RealmAvatar levelIndex={data.levelIndex} size={AVATAR_SIZE} className="absolute" />
      </span>
      <span className="flex flex-col text-left leading-tight">
        <span className="text-body-sm font-bold text-on-frame">{data.label}</span>
        <span className="font-mono text-caption text-on-frame-muted tabular-nums">
          {xpText(data)}
        </span>
      </span>
    </Link>
  );
}
