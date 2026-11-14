"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsFocused } from "./focus-mode";
import { isActive, navItems } from "./nav-items";

/**
 * The mobile dock (UX-DR20): a floating pill on the frame colour, below 640px
 * only. Replaces the app bar so Settings and Cultivation are reachable on a
 * phone. The current destination is raised. No Search button until Story 6.5.
 */
export function Dock() {
  const pathname = usePathname();
  // Focus mode hides all chrome (FR-11), as it does the app bar.
  const focused = useIsFocused();
  if (focused) return null;

  return (
    <nav
      aria-label="Main"
      data-dock=""
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:hidden"
    >
      <ul className="flex items-center gap-1 rounded-full bg-frame p-1.5 text-on-frame shadow-medium">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={`flex size-11 items-center justify-center rounded-full transition-state focus-ring-frame ${
                  active
                    ? "bg-frame-raised text-on-frame"
                    : "text-on-frame-muted hover:bg-frame-raised hover:text-on-frame"
                }`}
              >
                {item.icon}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
