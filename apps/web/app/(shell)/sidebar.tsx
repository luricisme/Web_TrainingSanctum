"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SectionMarker } from "@/app/components/section-marker";
import { useIsFocused } from "./focus-mode";
import { RealmBadge } from "./realm-badge";

const iconProps = {
  width: 20,
  height: 20,
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

export function Sidebar() {
  const pathname = usePathname();
  // spec-4-5 focus mode: a running session hides all chrome (FR-11).
  const focused = useIsFocused();
  if (focused) return null;

  return (
    <aside data-sidebar="" className="sticky top-0 hidden h-screen w-sidebar shrink-0 flex-col border-r border-divider bg-card px-3 py-8 sm:flex">
      <div className="px-3">
        <SectionMarker>Training Sanctum</SectionMarker>
      </div>
      <nav aria-label="Main" className="mt-8">
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-sm px-3 py-2 text-body transition-state focus-ring ${
                    active
                      ? "bg-elevated font-semibold text-accent"
                      : "text-foreground-secondary hover:bg-row-hover hover:text-foreground"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {/* spec-5-1: the Realm badge, pinned to the sidebar bottom. */}
      <div className="mt-auto pt-6">
        <RealmBadge />
      </div>
    </aside>
  );
}
