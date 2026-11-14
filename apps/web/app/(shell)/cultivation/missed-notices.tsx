"use client";

import { useRef, useState } from "react";
import { formatMissedNotice, type MissedNotice } from "@training-sanctum/domain";

const STORAGE_KEY = "cultivation.missedDismissedThrough";

function readWatermark(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeWatermark(value: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage unavailable: the dismissal lasts this session only.
  }
}

/**
 * spec-5-7: one quiet strip per settlement run that charged XP (EXPERIENCE.md
 * "Quests missed"). Same strip as the Breakthrough notice: `elevated`,
 * `rounded.md`, no modal, no warning colour. Dismissal is a watermark kept in
 * this browser only: dismissing a notice hides it and every older one.
 * `realmLabel` is the current realm, so a demotion is named by the notice.
 */
export function MissedNotices({
  notices,
  realmLabel,
}: {
  notices: MissedNotice[];
  realmLabel: string;
}) {
  const [watermark, setWatermark] = useState<string | null>(readWatermark);
  // ISO timestamps of one format sort as text.
  const listRef = useRef<HTMLDivElement>(null);
  const visible = notices.filter((n) => watermark === null || n.id > watermark);

  return (
    <div ref={listRef} role="status" className={visible.length > 0 ? "mt-6 space-y-2" : "sr-only"}>
      {visible.map((notice, index) => {
        const text = formatMissedNotice(notice, realmLabel);
        const when = text.slice(0, text.indexOf(":"));
        return (
          <div
            key={notice.id}
            className="flex items-start justify-between gap-3 rounded-md bg-elevated px-3 py-2"
          >
            <p className="text-body-sm text-foreground-secondary">{text}</p>
            <button
              type="button"
              onClick={() => {
                writeWatermark(notice.id);
                setWatermark(notice.id);
                // The pressed button unmounts: keep focus on the next newer
                // strip's Dismiss, or on the quests heading when none remain.
                const next = listRef.current?.querySelectorAll("button")[index - 1];
                (next ?? document.getElementById("daily-quests"))?.focus();
              }}
              className="-my-1 shrink-0 rounded-full px-3 py-1 text-body-sm font-medium text-foreground-secondary transition-state hover:bg-row-hover hover:text-foreground focus-ring"
            >
              Dismiss<span className="sr-only"> notice, {when}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
