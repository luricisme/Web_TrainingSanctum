"use client";

import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

const getSnapshot = (): Theme =>
  document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
const getServerSnapshot = (): Theme => "dark";

function apply(theme: Theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // Storage unavailable: the switch still holds for this page's lifetime.
  }
}

/** Dark/Light mode switcher (DESIGN.md components.mode-switcher). */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex gap-1 rounded-full bg-elevated p-1"
    >
      {(["dark", "light"] as const).map((value) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => apply(value)}
            className={`rounded-full px-4 py-1 text-body-sm font-semibold transition-state focus-ring ${
              active
                ? "bg-accent text-on-accent"
                : "text-foreground-secondary hover:text-foreground"
            }`}
          >
            {value === "dark" ? "Dark" : "Light"}
          </button>
        );
      })}
    </div>
  );
}
