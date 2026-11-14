"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CardSummary,
  type FlashcardCardsResponse,
  type LearnCounts,
  isDefinitionFirst,
  studiedDirections,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { SectionMarker } from "@/app/components/section-marker";
import { PageHeader } from "../../page-header";
import { buttonPrimary, buttonSecondary, pluralize } from "../../classes/ui";
import { AddCardsPanel } from "./add-cards-panel";
import { CardViewer } from "./card-viewer";
import { DeleteCardModal } from "./delete-card-modal";
import { EditCardModal } from "./edit-card-modal";

const crumbLink =
  "rounded-sm underline-offset-2 hover:text-foreground hover:underline focus-ring";

function Breadcrumb({
  cls,
  folder,
  flashcard,
}: {
  cls?: { id: string; name: string };
  folder?: { id: string; name: string };
  flashcard?: string;
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
          <Link href={`/folders/${folder.id}`} className={crumbLink}>
            {folder.name}
          </Link>
        </>
      ) : null}
      {flashcard ? (
        <>
          <span aria-hidden="true"> / </span>
          <span aria-current="page" className="text-foreground">
            {flashcard}
          </span>
        </>
      ) : null}
    </nav>
  );
}

/** "Learn · 12 new · 3 due"; zero parts are left out, so an idle Flashcard reads "Learn". */
function learnLabel({ newCards, due }: LearnCounts): string {
  const parts = ["Learn"];
  if (newCards > 0) parts.push(`${newCards} new`);
  if (due > 0) parts.push(`${due} due`);
  return parts.join(" · ");
}

export function FlashcardDetailView({ flashcardId }: { flashcardId: string }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CardSummary | null>(null);
  const [deleting, setDeleting] = useState<CardSummary | null>(null);
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<{ selector: string; index: number } | null>(null);
  const [focusTick, setFocusTick] = useState(0);

  // After a Card leaves the list (delete), focus the next row's control, else Add cards.
  // Runs after React commits, so it cannot race the modal's own focus restore.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const controls = listRef.current?.querySelectorAll<HTMLButtonElement>(target.selector);
    const count = controls?.length ?? 0;
    if (count > 0) controls?.[Math.min(target.index, count - 1)]?.focus();
    else addRef.current?.focus();
  }, [focusTick]);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["flashcard", flashcardId],
    queryFn: () => apiFetch<FlashcardCardsResponse>(`/api/flashcards/${flashcardId}`),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  // spec-4-5: "+ Add card" on the Empty due-queue state links here with
  // `?add=1`. Once the Flashcard has loaded, open the Add cards panel (Manual
  // mode) and drop the parameter so a reload or Back does not reopen it.
  const router = useRouter();
  const pathname = usePathname();
  const addRequested = useSearchParams().get("add") === "1";
  const [addHandled, setAddHandled] = useState(false);
  if (addRequested !== addHandled && (data || !addRequested)) {
    // Adjusting state during render (not in an effect): one pass, no flash.
    setAddHandled(addRequested);
    if (addRequested) setAdding(true);
  }
  useEffect(() => {
    if (addHandled && addRequested) router.replace(pathname, { scroll: false });
  }, [addHandled, addRequested, pathname, router]);

  if (isPending) {
    return (
      <>
        <Breadcrumb />
        <ul aria-label="Loading cards" className="mt-6 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-20 animate-pulse rounded-lg bg-elevated motion-reduce:animate-none"
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
            {notFound ? "This flashcard does not exist." : "Could not load this flashcard."}
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

  const { flashcard, cards } = data;
  const empty = cards.length === 0;

  return (
    <>
      <Breadcrumb cls={data.class} folder={data.folder} flashcard={flashcard.name} />
      <PageHeader title={flashcard.name}>{pluralize(cards.length, "card")}</PageHeader>

      {empty ? null : (
        <>
          <CardViewer
            cards={cards}
            definitionFirst={isDefinitionFirst(studiedDirections(data.studyDirections))}
            inactive={adding || !!editing || !!deleting}
          />
          {/* EXPERIENCE.md Learn button: directly under the viewer, the page's one accent action. */}
          <div className="mt-6 flex justify-center">
            <Link href={`/flashcards/${flashcard.id}/learn`} className={buttonPrimary}>
              {learnLabel(data.learn)}
            </Link>
          </div>
        </>
      )}

      <section aria-labelledby="flashcard-cards" className={empty ? "mt-8" : "mt-12"}>
        <div className="mb-6 flex items-center justify-between gap-4">
          <SectionMarker as="h2" id="flashcard-cards">
            Cards
          </SectionMarker>
          {empty ? null : (
            <button
              ref={addRef}
              type="button"
              onClick={() => setAdding(true)}
              className={buttonSecondary}
            >
              Add cards
            </button>
          )}
        </div>
        {empty ? (
          <div className="flex flex-col items-start gap-4 pt-3">
            <p className="max-w-sm text-body text-foreground-secondary">
              Add cards to start studying this flashcard.
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
          flashcardId={flashcard.id}
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
            queryClient.setQueryData<FlashcardCardsResponse>(["flashcard", flashcardId], (old) =>
              old ? { ...old, cards: old.cards.filter((c) => c.id !== id) } : old
            );
            void queryClient.invalidateQueries({ queryKey: ["flashcard", flashcardId] });
            // The modal refocuses the removed button; focus the next row's control after commit.
            pendingFocus.current = { selector: "button[data-card-delete]", index };
            setFocusTick((t) => t + 1);
          }}
        />
      ) : null}

      {adding ? (
        <AddCardsPanel
          flashcard={{ id: flashcard.id, name: flashcard.name }}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </>
  );
}

/** Card row: Term and Definition plus quiet Edit and Delete controls (no Move). */
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
    <li className="overflow-hidden rounded-lg border border-divider bg-card shadow-low transition-state hover:border-foreground-tertiary">
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
