"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClassFoldersResponse, FolderSummary } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Modal } from "../modal";
import { buttonDanger, buttonPrimary, fieldErrorClass, pluralize } from "../ui";

type Mode = "move" | "delete";

/**
 * Folder-delete modal (EXPERIENCE.md): two explicit buttons, no checkbox and
 * no typed-name gate. "Move flashcards to Unsorted" is primary; "Delete
 * flashcards too" is the danger action.
 */
export function DeleteFolderModal({
  classId,
  target,
  onClose,
}: {
  classId: string;
  target: FolderSummary;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (mode: Mode) =>
      apiFetch<unknown>(`/api/folders/${target.id}`, {
        method: "DELETE",
        json: { mode },
      }),
    onSuccess: () => {
      queryClient.setQueryData<ClassFoldersResponse>(
        ["class-folders", classId],
        (current) =>
          current
            ? { ...current, folders: current.folders.filter((f) => f.id !== target.id) }
            : current
      );
      void queryClient.invalidateQueries({ queryKey: ["class-folders", classId] });
      void queryClient.invalidateQueries({ queryKey: ["classes"] });
      onClose();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Nothing was changed."
      );
    },
  });

  function run(mode: Mode) {
    setError(null);
    remove.mutate(mode);
  }

  return (
    <Modal
      title={`Delete ${target.name}`}
      onClose={() => {
        if (!remove.isPending) onClose();
      }}
    >
      <p className="text-body text-foreground-secondary">
        {target.flashcardCount === 0
          ? "This folder has no flashcards."
          : `This folder has ${pluralize(target.flashcardCount, "flashcard")} and ${pluralize(target.cardCount, "card")}.`}{" "}
        Choose what happens to them.
      </p>

      {error ? (
        <p role="alert" className={`mt-6 ${fieldErrorClass}`}>
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          autoFocus
          disabled={remove.isPending}
          onClick={() => run("move")}
          className={`${buttonPrimary} w-full`}
        >
          Move flashcards to Unsorted
        </button>
        <button
          type="button"
          disabled={remove.isPending}
          onClick={() => run("delete")}
          className={`${buttonDanger} w-full`}
        >
          Delete flashcards too
        </button>
      </div>
    </Modal>
  );
}
