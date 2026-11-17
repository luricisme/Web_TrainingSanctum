"use client";

import { useRef, type KeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

const SEGMENTS = [
  { href: "/planner", label: "Tasks" },
  { href: "/planner/calendar", label: "Calendar" },
  { href: "/planner/pomodoro", label: "Pomodoro" },
] as const;

/**
 * Planner segment switcher (DESIGN.md components.mode-switcher): a radio group
 * pill, the selected option the one accent fill on screen. The selection comes
 * from the URL, so reload and back/forward stay correct.
 */
export function PlannerSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const found = SEGMENTS.findIndex(
    (s) => s.href !== "/planner" && (pathname === s.href || pathname.startsWith(`${s.href}/`))
  );
  const selected = found === -1 ? 0 : found;

  const choose = (index: number) => {
    if (index !== selected) router.push(SEGMENTS[index].href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = SEGMENTS.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = index === last ? 0 : index + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = index === 0 ? last : index - 1;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = last;
    }
    if (next === null) return;
    event.preventDefault();
    buttons.current[next]?.focus();
    choose(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Planner section"
      className="inline-flex rounded-full bg-elevated p-1"
    >
      {SEGMENTS.map((segment, index) => {
        const active = index === selected;
        return (
          <button
            key={segment.href}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => choose(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`rounded-full px-4 py-2 text-body-sm font-semibold transition-state focus-ring sm:py-1.5 ${
              active
                ? "bg-accent text-on-accent"
                : "text-foreground-secondary hover:text-foreground"
            }`}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
