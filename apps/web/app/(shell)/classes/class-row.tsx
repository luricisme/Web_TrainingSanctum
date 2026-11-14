"use client";

import Link from "next/link";
import type { ClassSummary } from "@training-sanctum/domain";
import { RowMenu } from "./row-menu";
import { pluralize, tileClass, tileIconClass, tintAt } from "./ui";

/**
 * One Class tile: icon chip, name (a link to the Class detail page), counts
 * and a trailing overflow menu with Rename and Delete. A pastel tint card;
 * hover draws an ink border, no scale transforms.
 */
export function ClassRow({
  item,
  index,
  onRename,
  onDelete,
}: {
  item: ClassSummary;
  /** Position in the list; picks the tile's tint. */
  index: number;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <li className={`${tileClass} ${tintAt(index)}`}>
      <span aria-hidden="true" className={tileIconClass}>
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
          className="block truncate rounded-sm text-body font-bold text-foreground focus-ring"
        >
          {item.name}
        </Link>
        <p className="mt-1 text-caption text-foreground-secondary">
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
