"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsFocused } from "./focus-mode";
import { iconProps, isActive, navItems } from "./nav-items";
import { RealmBadge } from "./realm-badge";

/**
 * The app bar: the top of the dark app frame. Brand on the left, the Main nav
 * centred (the current page is a raised pill; the others show their label
 * from 1024px), and the account menu (RealmBadge) on the right, outside the nav.
 */
export function AppBar({ userName }: { userName: string }) {
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
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
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

      {/* The account menu (name, realm, Settings, Log out), at the right end of the app bar. */}
      <div className="justify-self-end">
        <RealmBadge userName={userName} />
      </div>
    </header>
  );
}
