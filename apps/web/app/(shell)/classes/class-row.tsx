"use client";

import { useEffect, useRef, useState } from "react";
import type { ClassSummary } from "@training-sanctum/domain";
import { pluralize } from "./ui";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * One Class row: icon chip, name, counts and a trailing overflow menu with
 * Rename and Delete. Rows do not link anywhere yet (Story 2.2 adds the detail
 * page). Hover lightens to `row-hover`; no scale transforms.
 */
export function ClassRow({
  item,
  onRename,
  onDelete,
}: {
  item: ClassSummary;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const first = wrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  function choose(action: () => void) {
    setOpen(false);
    triggerRef.current?.focus();
    action();
  }

  const itemClass = `block w-full rounded-sm px-3 py-2 text-left text-sm leading-[1.45] transition-colors duration-150 ease-in-out hover:bg-row-hover ${focusRing}`;

  return (
    <li className="flex items-center gap-3 rounded-sm border-b border-divider p-3 transition-colors duration-150 ease-in-out last:border-b-0 hover:bg-row-hover">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-card text-foreground-secondary"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold leading-[1.5] text-foreground">
          {item.name}
        </p>
        <p className="text-xs font-medium leading-[1.4] tracking-[0.01em] text-foreground-tertiary">
          {pluralize(item.folderCount, "folder")} · {pluralize(item.cardCount, "card")}
        </p>
      </div>

      <div ref={wrapRef} className="relative" onKeyDown={onMenuKeyDown}>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`Options for ${item.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`flex rounded-sm p-2 text-foreground-tertiary transition-colors duration-150 ease-in-out hover:bg-card hover:text-foreground ${focusRing}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
        {open ? (
          <div
            role="menu"
            aria-label={`${item.name} options`}
            className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border border-border bg-card p-1"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => choose(onRename)}
              className={`${itemClass} text-foreground`}
            >
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => choose(onDelete)}
              className={`${itemClass} text-error`}
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
