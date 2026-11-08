import type { ReactNode } from "react";
import { overlineClass } from "./ui";

/**
 * Overline label preceded by the small square accent bullet
 * (DESIGN.md `components.section-bullet`: accent, 7x7px, 1px radius). The
 * sanctioned, non-actionable accent motif; use it only as a section marker.
 */
export function SectionMarker({
  as: Tag = "p",
  id,
  children,
}: {
  as?: "p" | "h2";
  id?: string;
  children: ReactNode;
}) {
  return (
    <Tag id={id} className={`flex items-center gap-2 ${overlineClass}`}>
      <span
        aria-hidden="true"
        className="size-bullet shrink-0 rounded-bullet bg-accent"
      />
      {children}
    </Tag>
  );
}
