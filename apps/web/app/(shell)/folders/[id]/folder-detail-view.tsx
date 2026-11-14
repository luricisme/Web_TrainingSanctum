"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type {
  FlashcardSummary,
  FolderFlashcardsResponse,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { SectionMarker } from "@/app/components/section-marker";
import { PageHeader } from "../../page-header";
import { RowMenu } from "../../classes/row-menu";
import {
  buttonPrimary,
  buttonSecondary,
  pluralize,
  tileClass,
  tileGridClass,
  tileIconClass,
  tileSkeletonClass,
  tintAt,
} from "../../classes/ui";
import { DeleteFlashcardModal } from "./delete-flashcard-modal";
import { FlashcardFormModal } from "./flashcard-form-modal";
import { MoveFlashcardModal } from "./move-flashcard-modal";

type Dialog =
  | { kind: "create" }
  | { kind: "rename"; id: string }
  | { kind: "move"; id: string }
  | { kind: "delete"; id: string }
  | null;

const crumbLink =
  "rounded-sm underline-offset-2 hover:text-foreground hover:underline focus-ring";

function Breadcrumb({
  cls,
  folder,
}: {
  cls?: { id: string; name: string };
  folder?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-body-sm font-medium text-foreground-secondary">
      <Link href="/classes" className={crumbLink}>
        Classes
      </Link>
      {cls ? (
        <>
          <span aria-hidden="true"> / </span>
          <Link href={`/classes/${cls.id}`} className={crumbLink}>
            {cls.name}
          </Link>
        </>
      ) : null}
      {folder ? (
        <>
          <span aria-hidden="true"> / </span>
          <span aria-current="page" className="text-foreground">
            {folder}
          </span>
        </>
      ) : null}
    </nav>
  );
}

/** Folder page: the Folder's Flashcards as rows (spec-2-7). */
export function FolderDetailView({ folderId }: { folderId: string }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["folder", folderId],
    queryFn: () => apiFetch<FolderFlashcardsResponse>(`/api/folders/${folderId}`),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  const flashcards = data?.flashcards ?? [];
  const selected =
    dialog && dialog.kind !== "create"
      ? flashcards.find((f) => f.id === dialog.id)
      : undefined;
  const close = () => setDialog(null);

  if (isPending) {
    return (
      <>
        <Breadcrumb />
        <ul aria-label="Loading flashcards" className={`mt-6 ${tileGridClass}`}>
          {[0, 1, 2].map((i) => (
            <li key={i} className={tileSkeletonClass} />
          ))}
        </ul>
      </>
    );
  }

  if (!data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <>
        <Breadcrumb />
        <div role="alert" className="flex flex-col items-start gap-4">
          <p className="text-body text-foreground-secondary">
            {notFound ? "This folder does not exist." : "Could not load this folder."}
          </p>
          {notFound ? (
            <Link href="/classes" className={buttonSecondary}>
              Back to Classes
            </Link>
          ) : (
            <button type="button" onClick={() => void refetch()} className={buttonSecondary}>
              Try again
            </button>
          )}
        </div>
      </>
    );
  }

  const totalCards = flashcards.reduce((sum, f) => sum + f.cardCount, 0);
  const empty = flashcards.length === 0;

  return (
    <>
      <Breadcrumb cls={data.class} folder={data.folder.name} />
      <PageHeader title={data.folder.name}>
        {pluralize(flashcards.length, "flashcard")} · {pluralize(totalCards, "card")}
      </PageHeader>

      <section aria-labelledby="all-flashcards" className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <SectionMarker as="h2" id="all-flashcards">
            All flashcards
          </SectionMarker>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link href={`/review?folderId=${data.folder.id}`} className={buttonSecondary}>
              Review this folder
            </Link>
            {empty ? null : (
              <button
                type="button"
                onClick={() => setDialog({ kind: "create" })}
                className={buttonPrimary}
              >
                Create flashcard
              </button>
            )}
          </div>
        </div>
        {empty ? (
          <div className="flex flex-col items-start gap-4 pt-3">
            <p className="max-w-sm text-body text-foreground-secondary">
              Create a flashcard to start adding cards.
            </p>
            <button
              type="button"
              onClick={() => setDialog({ kind: "create" })}
              className={buttonPrimary}
            >
              Create flashcard
            </button>
          </div>
        ) : (
          <ul className={tileGridClass}>
            {flashcards.map((flashcard, index) => (
              <FlashcardRow
                key={flashcard.id}
                flashcard={flashcard}
                index={index}
                onRename={() => setDialog({ kind: "rename", id: flashcard.id })}
                onMove={() => setDialog({ kind: "move", id: flashcard.id })}
                onDelete={() => setDialog({ kind: "delete", id: flashcard.id })}
              />
            ))}
          </ul>
        )}
      </section>

      {dialog?.kind === "create" ? (
        <FlashcardFormModal folderId={folderId} siblings={flashcards} onClose={close} />
      ) : null}
      {dialog?.kind === "rename" && selected ? (
        <FlashcardFormModal
          key={selected.id}
          folderId={folderId}
          siblings={flashcards}
          existing={selected}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === "move" && selected ? (
        <MoveFlashcardModal
          key={selected.id}
          folderId={folderId}
          classId={data.class.id}
          target={selected}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === "delete" && selected ? (
        <DeleteFlashcardModal
          key={selected.id}
          folderId={folderId}
          target={selected}
          onClose={close}
        />
      ) : null}
    </>
  );
}

/** One Flashcard tile, linking to the Flashcard page, with a Rename / Delete menu. */
function FlashcardRow({
  flashcard,
  index,
  onRename,
  onMove,
  onDelete,
}: {
  flashcard: FlashcardSummary;
  /** Position in the list; picks the tile's tint. */
  index: number;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <li className={`${tileClass} ${tintAt(index)}`}>
      <Link
        href={`/flashcards/${flashcard.id}`}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-sm focus-ring"
      >
        <span
          aria-hidden="true"
          className={tileIconClass}
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
            <rect x="3" y="6" width="14" height="14" rx="2" />
            <path d="M7 3h12a2 2 0 0 1 2 2v12" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-bold text-foreground">
            {flashcard.name}
          </p>
          <p className="mt-1 text-caption text-foreground-secondary">
            {pluralize(flashcard.cardCount, "card")}
          </p>
        </div>
      </Link>
      <RowMenu
        name={flashcard.name}
        items={[
          { label: "Rename", onSelect: onRename },
          { label: "Move to…", onSelect: onMove },
          { label: "Delete", onSelect: onDelete, danger: true },
        ]}
      />
    </li>
  );
}
