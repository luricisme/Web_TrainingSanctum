import type { ReactNode } from "react";

export const iconProps = {
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

/** The Main destinations, shared by the app bar (>= 640px) and the dock (< 640px). */
export const navItems: { href: string; label: string; icon: ReactNode }[] = [
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

/** True on the destination's own page and anything beneath it. */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
