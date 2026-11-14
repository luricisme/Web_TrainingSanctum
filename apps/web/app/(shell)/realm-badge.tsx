"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CultivationResponse, RealmSummary } from "@training-sanctum/domain";
import { apiFetch } from "@/lib/api-client";
import { signOut } from "@/lib/auth-client";
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
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300 ease-in-out motion-reduce:transition-none"
        style={{ width: `${(now / max) * 100}%` }}
      />
    </div>
  );
}

const RING_SIZE = 44;
const RING_RADIUS = 20;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const AVATAR_SIZE = 34;

const menuItemClass =
  "flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-left text-body-sm text-foreground transition-state hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none";

/**
 * The account control at the right end of the app bar: the user's realm avatar
 * inside an XP ring, the user's name, and the realm label under the name, on
 * the dark frame. It opens a menu with Settings (a link to the Settings page)
 * and Log out. The avatar changes with every realm (see `RealmAvatar`).
 * The name shows at once; the ring and the realm label wait for the
 * cultivation query and are left out if it fails, so Log out is always there.
 * The app bar itself hides it in focus mode and below 640px.
 */
export function RealmBadge({ userName }: { userName: string }) {
  const { data } = useCultivation();
  const router = useRouter();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = userName.trim() || "Account";

  const items = () =>
    Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  function close(returnFocus: boolean) {
    setOpen(false);
    setFailed(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const list = items();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      list[(at + step + list.length) % list.length]?.focus();
    }
  }

  function onBlur(event: React.FocusEvent) {
    // Tabbing out of the menu closes it.
    if (open && !rootRef.current?.contains(event.relatedTarget as Node | null)) close(false);
  }

  async function handleLogout() {
    setBusy(true);
    setFailed(false);
    try {
      // signOut resolves with `{error}` rather than throwing; only redirect
      // once the session is actually gone.
      const { error } = await signOut();
      if (error) {
        setFailed(true);
        return;
      }
      router.push("/login");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const max = data?.xpForStage ?? 1;
  const now = !data ? 0 : data.xpForStage === null ? 1 : data.xpIntoStage;

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={data ? `${name}, ${data.label}, ${xpText(data)}` : name}
        title={data ? xpText(data) : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        className="flex cursor-pointer items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-state hover:bg-frame-raised focus-ring-frame"
      >
        <span className="relative flex shrink-0 items-center justify-center" aria-hidden="true">
          <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} fill="none">
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              strokeWidth="2.5"
              className="stroke-on-frame-muted/40"
            />
            {data ? (
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
            ) : null}
          </svg>
          {data ? (
            <RealmAvatar levelIndex={data.levelIndex} size={AVATAR_SIZE} className="absolute" />
          ) : (
            <span className="absolute flex size-[34px] items-center justify-center rounded-full bg-frame-raised text-body-sm font-bold text-on-frame">
              {name.charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        <span className="flex max-w-40 flex-col text-left leading-tight">
          <span className="truncate text-body-sm font-bold text-on-frame">{name}</span>
          {data ? (
            <span className="truncate text-caption text-on-frame-muted">{data.label}</span>
          ) : null}
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-40 mt-2 w-48 rounded-lg border border-divider bg-card p-1 shadow-medium"
        >
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => close(false)}
            className={menuItemClass}
          >
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            disabled={busy}
            aria-busy={busy}
            className={`${menuItemClass} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {busy ? "Logging out..." : "Log out"}
          </button>
          {failed ? (
            <p role="alert" className="px-3 py-2 text-caption text-error">
              Could not log out. Try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
