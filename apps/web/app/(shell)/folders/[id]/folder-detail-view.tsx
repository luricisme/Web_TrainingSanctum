"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CardSummary, FolderCardsResponse } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { SectionMarker } from "@/app/components/section-marker";
import { PageHeader } from "../../page-header";
import { buttonPrimary, buttonSecondary, pluralize } from "../../classes/ui";
import { AddCardsPanel } from "./add-cards-panel";
import { DeleteCardModal } from "./delete-card-modal";
import { EditCardModal } from "./edit-card-modal";

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
    <nav aria-label="Breadcrumb" className="mb-3 text-body-sm text-foreground-secondary">
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

export function FolderDetailView({ folderId }: { folderId: string }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CardSummary | null>(null);
  const [deleting, setDeleting] = useState<CardSummary | null>(null);
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["folder", folderId],
    queryFn: () => apiFetch<FolderCardsResponse>(`/api/folders/${folderId}`),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  if (isPending) {
    return (
      <>
        <Breadcrumb />
        <ul aria-label="Loading cards" className="flex flex-col gap-1">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-16 animate-pulse rounded-sm bg-elevated motion-reduce:animate-none"
            />
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

  const { folder, cards } = data;
  const empty = cards.length === 0;

  return (
    <>
      <Breadcrumb cls={data.class} folder={folder.name} />
      <PageHeader title={folder.name}>{pluralize(cards.length, "card")}</PageHeader>

      <section aria-labelledby="folder-cards" className="mt-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <SectionMarker as="h2" id="folder-cards">
            Cards
          </SectionMarker>
          {empty ? null : (
            <button
              ref={addRef}
              type="button"
              onClick={() => setAdding(true)}
              className={buttonPrimary}
            >
              Add cards
            </button>
          )}
        </div>
        {empty ? (
          <div className="flex flex-col items-start gap-4 pt-3">
            <p className="max-w-sm text-body text-foreground-secondary">
              This folder has no cards yet.
            </p>
            <button
              ref={addRef}
              type="button"
              onClick={() => setAdding(true)}
              className={buttonPrimary}
            >
              Add cards
            </button>
          </div>
        ) : (
          <ul ref={listRef} className="flex flex-col gap-3">
            {cards.map((card, index) => (
              <CardRow
                key={card.id}
                card={card}
                index={index + 1}
                total={cards.length}
                onEdit={() => setEditing(card)}
                onDelete={() => setDeleting(card)}
              />
            ))}
          </ul>
        )}
      </section>

      {editing ? (
        <EditCardModal
          key={editing.id}
          card={editing}
          folderId={folder.id}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {deleting ? (
        <DeleteCardModal
          key={deleting.id}
          card={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(id) => {
            const index = Math.max(0, cards.findIndex((c) => c.id === id));
            setDeleting(null);
            queryClient.setQueryData<FolderCardsResponse>(["folder", folderId], (old) =>
              old ? { ...old, cards: old.cards.filter((c) => c.id !== id) } : old
            );
            void queryClient.invalidateQueries({ queryKey: ["folder", folderId] });
            // The modal refocuses the removed button, so move focus on the next frame:
            // the next row's Delete control, else the last row's, else Add cards.
            requestAnimationFrame(() => {
              const deletes = listRef.current?.querySelectorAll<HTMLButtonElement>(
                "button[data-card-delete]"
              );
              const count = deletes?.length ?? 0;
              if (count > 0) deletes?.[Math.min(index, count - 1)]?.focus();
              else addRef.current?.focus();
            });
          }}
        />
      ) : null}

      {adding ? (
        <AddCardsPanel
          folder={{ id: folder.id, name: folder.name, classId: data.class.id }}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </>
  );
}

/** Card row: Term and Definition plus quiet Edit and Delete controls (move is 2.6). */
function CardRow({
  card,
  index,
  total,
  onEdit,
  onDelete,
}: {
  card: CardSummary;
  index: number;
  total: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="overflow-hidden rounded-md border border-border bg-card shadow-low transition-state hover:bg-row-hover">
      <div className="flex items-center justify-between border-b border-divider px-5 py-2 text-caption text-foreground-tertiary">
        <span>
          {index} / {total}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit card ${index}: ${card.term}`}
            className="-my-1 rounded-full px-3 py-1 text-body-sm text-foreground-secondary underline-offset-2 transition-state hover:text-foreground hover:underline focus-ring"
          >
            Edit
          </button>
          <button
            type="button"
            data-card-delete
            onClick={onDelete}
            aria-label={`Delete card ${index}: ${card.term}`}
            className="-my-1 rounded-full px-3 py-1 text-body-sm text-foreground-secondary underline-offset-2 transition-state hover:text-foreground hover:underline focus-ring"
          >
            Delete
          </button>
        </div>
      </div>
      <div className="grid sm:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]">
        <div className="flex flex-col gap-1 px-5 py-4">
          <span className="text-overline uppercase text-foreground-tertiary">Term</span>
          <p className="whitespace-pre-wrap break-words text-body font-semibold text-foreground">
            {card.term}
          </p>
        </div>
        <div aria-hidden="true" className="hidden bg-divider sm:block" />
        <div className="flex flex-col gap-1 border-t border-divider px-5 py-4 sm:border-t-0">
          <span className="text-overline uppercase text-foreground-tertiary">Definition</span>
          <p className="whitespace-pre-wrap break-words text-body text-foreground-secondary">
            {card.definition}
          </p>
        </div>
      </div>
    </li>
  );
}
