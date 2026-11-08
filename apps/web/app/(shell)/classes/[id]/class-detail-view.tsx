"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ClassFoldersResponse, FolderSummary } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { SectionMarker } from "@/app/components/section-marker";
import { PageHeader } from "../../page-header";
import { RowMenu } from "../row-menu";
import { buttonPrimary, buttonSecondary, pluralize } from "../ui";
import { DeleteFolderModal } from "./delete-folder-modal";
import { FolderFormModal } from "./folder-form-modal";

type Dialog =
  | { kind: "create" }
  | { kind: "rename"; id: string }
  | { kind: "delete"; id: string }
  | null;

function Breadcrumb({ name }: { name?: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-body-sm text-foreground-secondary">
      <Link
        href="/classes"
        className="rounded-sm underline-offset-2 hover:text-foreground hover:underline focus-ring"
      >
        Classes
      </Link>
      {name ? (
        <>
          <span aria-hidden="true"> / </span>
          <span aria-current="page" className="text-foreground">
            {name}
          </span>
        </>
      ) : null}
    </nav>
  );
}

export function ClassDetailView({ classId }: { classId: string }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["class-folders", classId],
    queryFn: () => apiFetch<ClassFoldersResponse>(`/api/classes/${classId}/folders`),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  const folders = data?.folders ?? [];
  const selected =
    dialog && dialog.kind !== "create"
      ? folders.find((f) => f.id === dialog.id)
      : undefined;
  const close = () => setDialog(null);

  if (isPending) {
    return (
      <>
        <Breadcrumb />
        <ul aria-label="Loading folders" className="flex flex-col gap-1">
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
            {notFound ? "This class does not exist." : "Could not load this class."}
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

  const customCount = folders.filter((f) => !f.isUnsorted).length;
  const totalCards = folders.reduce((sum, f) => sum + f.cardCount, 0);

  return (
    <>
      <Breadcrumb name={data.class.name} />
      <PageHeader title={data.class.name}>
        {pluralize(folders.length, "folder")} · {pluralize(totalCards, "card")}
      </PageHeader>

      <section aria-labelledby="all-folders" className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-4">
          <SectionMarker as="h2" id="all-folders">
            All folders
          </SectionMarker>
          <button
            type="button"
            onClick={() => setDialog({ kind: "create" })}
            className={buttonPrimary}
          >
            Create folder
          </button>
        </div>
        <ul>
          {folders.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              onRename={() => setDialog({ kind: "rename", id: folder.id })}
              onDelete={() => setDialog({ kind: "delete", id: folder.id })}
            />
          ))}
        </ul>
        {customCount === 0 ? (
          <p className="mt-6 max-w-sm text-body text-foreground-secondary">
            Create a folder to group cards by topic.
          </p>
        ) : null}
      </section>

      {dialog?.kind === "create" ? (
        <FolderFormModal classId={classId} siblings={folders} onClose={close} />
      ) : null}
      {dialog?.kind === "rename" && selected ? (
        <FolderFormModal
          key={selected.id}
          classId={classId}
          siblings={folders}
          existing={selected}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === "delete" && selected ? (
        <DeleteFolderModal
          key={selected.id}
          classId={classId}
          target={selected}
          onClose={close}
        />
      ) : null}
    </>
  );
}

/** One Folder row. Not a link yet (Story 2.6); Unsorted has no overflow menu. */
function FolderRow({
  folder,
  onRename,
  onDelete,
}: {
  folder: FolderSummary;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex min-h-16 items-center gap-3 rounded-sm border-b border-divider p-3 transition-state last:border-b-0 hover:bg-row-hover">
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
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold text-foreground">{folder.name}</p>
        <p className="text-caption text-foreground-tertiary">
          {pluralize(folder.cardCount, "card")}
        </p>
      </div>
      {folder.isUnsorted ? null : (
        <RowMenu
          name={folder.name}
          items={[
            { label: "Rename", onSelect: onRename },
            { label: "Delete", onSelect: onDelete, danger: true },
          ]}
        />
      )}
    </li>
  );
}
