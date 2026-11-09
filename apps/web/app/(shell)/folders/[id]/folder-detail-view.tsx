"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { CardSummary, FolderCardsResponse } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { SectionMarker } from "@/app/components/section-marker";
import { PageHeader } from "../../page-header";
import { buttonPrimary, buttonSecondary, pluralize } from "../../classes/ui";
import { AddCardsPanel } from "./add-cards-panel";

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
            <button type="button" onClick={() => setAdding(true)} className={buttonPrimary}>
              Add cards
            </button>
          )}
        </div>
        {empty ? (
          <div className="flex flex-col items-start gap-4 pt-3">
            <p className="max-w-sm text-body text-foreground-secondary">
              This folder has no cards yet.
            </p>
            <button type="button" onClick={() => setAdding(true)} className={buttonPrimary}>
              Add cards
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {cards.map((card, index) => (
              <CardRow key={card.id} card={card} index={index + 1} total={cards.length} />
            ))}
          </ul>
        )}
      </section>

      {adding ? (
        <AddCardsPanel
          folder={{ id: folder.id, name: folder.name, classId: data.class.id }}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </>
  );
}

/** Plain Card row: Term and Definition only (edit, delete and move are 2.4 to 2.6). */
function CardRow({
  card,
  index,
  total,
}: {
  card: CardSummary;
  index: number;
  total: number;
}) {
  return (
    <li className="overflow-hidden rounded-md border border-border bg-card shadow-low transition-state hover:border-accent">
      <div className="flex items-center justify-between border-b border-divider px-5 py-2 text-caption text-foreground-tertiary">
        <span>
          {index} / {total}
        </span>
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
