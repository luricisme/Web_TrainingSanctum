"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ClassSummary } from "@training-sanctum/domain";
import { apiFetch } from "@/lib/api-client";
import { SectionMarker } from "@/app/components/section-marker";
import { PageHeader } from "../page-header";
import { ClassFormModal } from "./class-form-modal";
import { ClassRow } from "./class-row";
import { DeleteClassModal } from "./delete-class-modal";
import { buttonPrimary, buttonSecondary, pluralize } from "./ui";

type Dialog =
  | { kind: "create" }
  | { kind: "rename"; id: string }
  | { kind: "delete"; id: string }
  | null;

export function ClassesView() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["classes"],
    queryFn: () => apiFetch<ClassSummary[]>("/api/classes"),
  });

  const classes = data ?? [];
  const selected =
    dialog && dialog.kind !== "create"
      ? classes.find((c) => c.id === dialog.id)
      : undefined;
  const close = () => setDialog(null);

  const subtitle =
    classes.length > 0
      ? `${classes.length === 1 ? "1 class" : `${classes.length} classes`} · ${pluralize(
          classes.reduce((sum, c) => sum + c.cardCount, 0),
          "card"
        )}`
      : undefined;

  return (
    <>
      <PageHeader title="Classes">{subtitle}</PageHeader>

      <div className="mt-8">
        {isPending ? (
          <ul aria-label="Loading classes" className="flex flex-col gap-1">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="h-16 animate-pulse rounded-sm bg-elevated motion-reduce:animate-none"
              />
            ))}
          </ul>
        ) : isError && !data ? (
          <div role="alert" className="flex flex-col items-start gap-4">
            <p className="text-body text-foreground-secondary">
              Could not load your classes.
            </p>
            <button type="button" onClick={() => void refetch()} className={buttonSecondary}>
              Try again
            </button>
          </div>
        ) : classes.length === 0 ? (
          <div className="flex flex-col items-start gap-6 py-6">
            <p className="max-w-sm text-body text-foreground-secondary">
              Create a class to start adding cards.
            </p>
            <button
              type="button"
              onClick={() => setDialog({ kind: "create" })}
              className={buttonPrimary}
            >
              Create class
            </button>
          </div>
        ) : (
          <section aria-labelledby="all-classes">
            <div className="mb-3 flex items-center justify-between gap-4">
              <SectionMarker as="h2" id="all-classes">
                All classes
              </SectionMarker>
              <button
                type="button"
                onClick={() => setDialog({ kind: "create" })}
                className={buttonPrimary}
              >
                Create class
              </button>
            </div>
            <ul>
              {classes.map((item) => (
                <ClassRow
                  key={item.id}
                  item={item}
                  onRename={() => setDialog({ kind: "rename", id: item.id })}
                  onDelete={() => setDialog({ kind: "delete", id: item.id })}
                />
              ))}
            </ul>
          </section>
        )}
      </div>

      {dialog?.kind === "create" ? <ClassFormModal onClose={close} /> : null}
      {dialog?.kind === "rename" && selected ? (
        <ClassFormModal key={selected.id} existing={selected} onClose={close} />
      ) : null}
      {dialog?.kind === "delete" && selected ? (
        <DeleteClassModal
          key={selected.id}
          target={selected}
          others={classes.filter((c) => c.id !== selected.id)}
          onClose={close}
        />
      ) : null}
    </>
  );
}
