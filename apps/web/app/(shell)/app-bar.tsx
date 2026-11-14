"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useIsFocused } from "./focus-mode";
import { RealmBadge } from "./realm-badge";

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const items: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "/review",
    label: "Review",
    icon: (
      <svg {...iconProps}>
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <path d="M8 10h8M8 14h5" />
      </svg>
    ),
  },
  {
    href: "/classes",
    label: "Classes",
    icon: (
      <svg {...iconProps}>
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  {
    href: "/cultivation",
    label: "Cultivation",
    icon: (
      <svg {...iconProps}>
        <path d="M5 20V11M12 20V5M19 20v-6" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg {...iconProps}>
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
      </svg>
    ),
  },
];

/**
 * The app bar: the top of the dark app frame. Brand on the left, the Main nav
 * centred (the current page is a raised pill; the others show their label
 * from 1024px), and the Realm badge on the right, outside the nav.
 */
export function AppBar() {
  const pathname = usePathname();
  // spec-4-5 focus mode: a running session hides all chrome (FR-11).
  const focused = useIsFocused();
  if (focused) return null;

  return (
    <header
      data-app-bar=""
      className="hidden h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 px-3 text-on-frame sm:grid"
    >
      <Link
        href="/review"
        aria-label="Training Sanctum"
        className="flex items-center gap-2.5 justify-self-start rounded-full pr-3 text-body font-bold focus-ring-frame"
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-on-frame text-frame"
        >
          <svg {...iconProps} strokeWidth={2}>
            <path d="M3 5c3 1.5 15 1.5 18 0M4 9h16M7 9v11M17 9v11M10 13h4" />
          </svg>
        </span>
        <span aria-hidden="true" className="hidden md:inline">
          Training Sanctum
        </span>
      </Link>

      <nav aria-label="Main">
        <ul className="flex items-center gap-1">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-full px-3 py-2 text-body-sm font-semibold transition-state focus-ring-frame ${
                    active
                      ? "bg-frame-raised text-on-frame"
                      : "text-on-frame-muted hover:bg-frame-raised hover:text-on-frame"
                  }`}
                >
                  {item.icon}
                  <span className={active ? "" : "sr-only lg:not-sr-only"}>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* spec-5-1: the Realm badge, at the right end of the app bar. */}
      <div className="justify-self-end">
        <RealmBadge />
      </div>
    </header>
  );
}
