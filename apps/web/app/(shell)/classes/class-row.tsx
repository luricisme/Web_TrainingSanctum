"use client";

import Link from "next/link";
import type { ClassSummary } from "@training-sanctum/domain";
import { RowMenu } from "./row-menu";
import { pluralize } from "./ui";

/**
 * One Class row: icon chip, name (a link to the Class detail page), counts and
 * a trailing overflow menu with Rename and Delete. Hover lightens to
 * `row-hover`; no scale transforms.
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
  return (
    <li className="flex items-center gap-3 rounded-sm border-b border-divider p-3 transition-state last:border-b-0 hover:bg-row-hover">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-card text-foreground-secondary"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <Link
          href={`/classes/${item.id}`}
          className="block truncate rounded-sm text-body font-semibold text-foreground focus-ring"
        >
          {item.name}
        </Link>
        <p className="text-caption text-foreground-tertiary">
          {pluralize(item.folderCount, "folder")} ·{" "}
          {pluralize(item.flashcardCount, "flashcard")} ·{" "}
          {pluralize(item.cardCount, "card")}
        </p>
      </div>

      <RowMenu
        name={item.name}
        items={[
          { label: "Rename", onSelect: onRename },
          { label: "Delete", onSelect: onDelete, danger: true },
        ]}
      />
    </li>
  );
}
