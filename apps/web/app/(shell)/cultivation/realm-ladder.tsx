"use client";

import { useEffect, useRef } from "react";
import {
  BO_NAMES,
  CULTIVATION_LADDER,
  realmsOfLadder,
  type CultivationResponse,
} from "@training-sanctum/domain";
import { SectionMarker } from "@/app/components/section-marker";
import { RealmAvatar } from "../realm-avatar";

const REALMS = realmsOfLadder();

/** "Nhất Bộ Tung Hoành" -> "Nhất Bộ". */
function shortBo(bo: 1 | 2 | 3 | 4): string {
  const full = BO_NAMES[bo];
  return full.slice(0, full.indexOf("Bộ") + 2);
}

/**
 * How far `xp` is through realm `index`, 0 to 1: every stage of the realm
 * counts, so the fill rises across the whole realm. The final realm is full.
 */
function realmProgress(index: number, xp: number): number {
  const start = CULTIVATION_LADDER[REALMS[index]!.firstLevelIndex]!.startXp;
  const next = REALMS[index + 1];
  if (!next) return 1;
  const end = CULTIVATION_LADDER[next.firstLevelIndex]!.startXp;
  return Math.max(0, Math.min(1, (xp - start) / (end - start)));
}

/**
 * spec-5-4 (UX-DR24): all 19 realms low to high with a decorative avatar and
 * the Vietnamese name. The current realm is outlined, labelled "Current" and
 * carries the written stage; passed realms read "Reached" and later ones are
 * dimmed ("Ahead"). Below 640px the row scrolls horizontally and opens on the
 * current realm; each realm is a tab stop so the row works by keyboard.
 *
 * Each tile fills from the bottom like a glass: full for a passed realm,
 * empty for one ahead, and up to the XP earned inside the current realm,
 * which also carries a gold border and glow (user request, 2026-11-14). The
 * percentage is written out, so the fill is never the only signal.
 */
export function RealmLadder({ realm }: { realm: CultivationResponse }) {
  const listRef = useRef<HTMLOListElement>(null);
  const currentRef = useRef<HTMLLIElement>(null);
  const currentIndex = REALMS.findIndex((r) => r.name === realm.realm);

  useEffect(() => {
    const list = listRef.current;
    const current = currentRef.current;
    if (!list || !current) return;
    // Horizontal only: scrollIntoView would also move the page.
    // Measured from the list's own box: the <ol> is not an offsetParent.
    const offset = current.getBoundingClientRect().left - list.getBoundingClientRect().left;
    list.scrollLeft += offset - (list.clientWidth - current.offsetWidth) / 2;
  }, [currentIndex]);

  return (
    <section aria-labelledby="realm-ladder" className="mt-8">
      <div className="mb-3 px-3">
        <SectionMarker as="h2" id="realm-ladder">
          Realm Ladder
        </SectionMarker>
      </div>
      <ol
        ref={listRef}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 py-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:py-0 lg:grid-cols-4 xl:grid-cols-5"
      >
        {REALMS.map((r, index) => {
          const state = index < currentIndex ? "reached" : index === currentIndex ? "current" : "ahead";
          const fill = state === "reached" ? 1 : state === "current" ? realmProgress(index, realm.xp) : 0;
          const percent = Math.floor(fill * 100);
          return (
            <li
              key={r.name}
              ref={state === "current" ? currentRef : undefined}
              tabIndex={0}
              aria-current={state === "current" ? "step" : undefined}
              data-fill={percent}
              className={`relative flex w-40 shrink-0 items-center gap-3 overflow-hidden rounded-md border bg-card p-3 focus-ring sm:w-auto ${
                state === "current"
                  ? "z-10 border-2 border-gold realm-aura"
                  : state === "reached"
                    ? "border-tint-butter-border"
                    : "border-divider"
              }`}
            >
              {/* The "water": rises from the bottom to the XP earned in this realm. */}
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 bottom-0 transition-[height] duration-300 ease-in-out motion-reduce:transition-none ${
                  state === "current" ? "realm-gold-fill" : "bg-tint-butter"
                }`}
                style={{ height: `${fill * 100}%` }}
              />
              <span className={`relative ${state === "ahead" ? "opacity-40 grayscale" : ""}`}>
                <RealmAvatar levelIndex={r.firstLevelIndex} size={36} />
              </span>
              <span className="relative min-w-0">
                <span
                  className={`block text-body-sm font-bold ${
                    state === "ahead" ? "text-foreground-tertiary" : "text-foreground"
                  }`}
                >
                  {r.name}
                </span>
                <span className="block text-caption text-foreground-secondary">
                  {shortBo(r.bo)}
                  {state === "current" ? (
                    <span className="ml-1 font-mono tabular-nums text-foreground-secondary">
                      · {percent}%
                    </span>
                  ) : null}
                </span>
                <span
                  className={`block text-caption ${
                    state === "current"
                      ? "font-bold text-foreground"
                      : state === "reached"
                        ? "text-foreground-secondary"
                        : "text-foreground-tertiary"
                  }`}
                >
                  {state === "current"
                    ? `Current · ${realm.label}`
                    : state === "reached"
                      ? "Reached"
                      : "Ahead"}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
