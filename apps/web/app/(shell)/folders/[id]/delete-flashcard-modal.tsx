"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  FlashcardSummary,
  FolderFlashcardsResponse,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Modal } from "../../classes/modal";
import {
  buttonDanger,
  buttonSecondary,
  fieldErrorClass,
  pluralize,
} from "../../classes/ui";

/**
 * Flashcard-delete modal (EXPERIENCE.md): names the Flashcard and its Card
 * count; Cancel and a danger "Delete flashcard". Cancel is focused first so a
 * stray Enter never deletes.
 */
export function DeleteFlashcardModal({
  folderId,
  target,
  onClose,
}: {
  folderId: string;
  target: FlashcardSummary;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: () =>
      apiFetch<unknown>(`/api/flashcards/${target.id}`, { method: "DELETE" }),
    onSuccess: () => finish(),
    onError: (err) => {
      // 404: already deleted elsewhere, so the list just needs a refresh.
      if (err instanceof ApiError && err.status === 404) {
        finish();
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Nothing was changed."
      );
    },
  });

  function finish() {
    queryClient.setQueryData<FolderFlashcardsResponse>(["folder", folderId], (current) =>
      current
        ? {
            ...current,
            flashcards: current.flashcards.filter((f) => f.id !== target.id),
          }
        : current
    );
    void queryClient.invalidateQueries({ queryKey: ["folder", folderId] });
    void queryClient.invalidateQueries({ queryKey: ["class-folders"] });
    void queryClient.invalidateQueries({ queryKey: ["classes"] });
    onClose();
  }

  return (
    <Modal
      title={`Delete ${target.name}`}
      onClose={() => {
        if (!remove.isPending) onClose();
      }}
    >
      <p className="text-body text-foreground-secondary">
        Delete{" "}
        <span className="font-semibold text-foreground">{target.name}</span> and its{" "}
        {pluralize(target.cardCount, "card")}? The cards and their review history
        are removed. This cannot be undone.
      </p>

      {error ? (
        <p role="alert" className={`mt-6 ${fieldErrorClass}`}>
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          autoFocus
          disabled={remove.isPending}
          onClick={onClose}
          className={buttonSecondary}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={remove.isPending}
          onClick={() => {
            setError(null);
            remove.mutate();
          }}
          className={buttonDanger}
        >
          Delete flashcard
        </button>
      </div>
    </Modal>
  );
}
