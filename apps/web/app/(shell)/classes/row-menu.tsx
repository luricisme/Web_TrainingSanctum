"use client";

import { useEffect, useRef, useState } from "react";

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/**
 * Trailing "..." overflow menu for list rows. Keyboard: Enter/Space opens and
 * focuses the first item, arrows move, Escape closes and restores focus to the
 * trigger, Tab closes.
 */
export function RowMenu({
  name,
  items,
}: {
  name: string;
  items: RowMenuItem[];
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
    const nodes = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')
    );
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nodes[(index + 1) % nodes.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nodes[(index - 1 + nodes.length) % nodes.length]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  function choose(action: () => void) {
    setOpen(false);
    triggerRef.current?.focus();
    action();
  }

  const itemClass =
    "block w-full rounded-sm px-3 py-2 text-left text-body-sm transition-state hover:bg-row-hover focus-ring";

  return (
    <div ref={wrapRef} className="relative" onKeyDown={onMenuKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Options for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex rounded-full p-2 text-foreground-secondary transition-state hover:bg-card/70 hover:text-foreground focus-ring"
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
          aria-label={`${name} options`}
          className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border border-divider bg-card p-1 shadow-medium"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => choose(item.onSelect)}
              className={`${itemClass} ${item.danger ? "text-error" : "text-foreground"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
