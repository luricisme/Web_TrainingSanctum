"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FLASHCARD_NAME_TAKEN,
  flashcardNameSchema,
  isFlashcardNameTaken,
  type FlashcardSummary,
  type FolderFlashcardsResponse,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Modal } from "../../classes/modal";
import {
  buttonPrimary,
  buttonSecondary,
  fieldErrorClass,
  inputClass,
  labelClass,
} from "../../classes/ui";

/** Create (no `existing`) or rename (`existing`) a Flashcard in `folderId`. */
export function FlashcardFormModal({
  folderId,
  siblings,
  existing,
  onClose,
}: {
  folderId: string;
  /** Flashcards of the Folder, used for the instant clash check. */
  siblings: FlashcardSummary[];
  existing?: FlashcardSummary;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(existing?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (value: string) =>
      existing
        ? apiFetch<FlashcardSummary>(`/api/flashcards/${existing.id}`, {
            method: "PATCH",
            json: { name: value },
          })
        : apiFetch<FlashcardSummary>(`/api/folders/${folderId}/flashcards`, {
            method: "POST",
            json: { name: value },
          }),
    onSuccess: (saved) => {
      queryClient.setQueryData<FolderFlashcardsResponse>(
        ["folder", folderId],
        (current) => {
          if (!current) return current;
          const flashcards = existing
            ? current.flashcards.map((f) => (f.id === saved.id ? saved : f))
            : [...current.flashcards, saved];
          return {
            ...current,
            flashcards: flashcards.sort((a, b) => a.name.localeCompare(b.name)),
          };
        }
      );
      void queryClient.invalidateQueries({ queryKey: ["folder", folderId] });
      void queryClient.invalidateQueries({ queryKey: ["flashcard", saved.id] });
      void queryClient.invalidateQueries({ queryKey: ["class-folders"] });
      void queryClient.invalidateQueries({ queryKey: ["classes"] });
      onClose();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? (err.fields?.name ?? err.message)
          : "Something went wrong. Try again."
      );
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = flashcardNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a flashcard name.");
      return;
    }
    const others = siblings.filter((f) => f.id !== existing?.id).map((f) => f.name);
    if (isFlashcardNameTaken(parsed.data, others)) {
      setError(FLASHCARD_NAME_TAKEN);
      return;
    }
    save.mutate(parsed.data);
  }

  return (
    <Modal
      title={existing ? "Rename flashcard" : "Create flashcard"}
      onClose={() => {
        if (!save.isPending) onClose();
      }}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="flashcard-name" className={labelClass}>
            Flashcard name
          </label>
          <input
            id="flashcard-name"
            name="name"
            type="text"
            autoComplete="off"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "flashcard-name-error" : undefined}
            className={inputClass}
          />
          {error ? (
            <p id="flashcard-name-error" role="alert" className={fieldErrorClass}>
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            disabled={save.isPending}
            onClick={onClose}
            className={buttonSecondary}
          >
            Cancel
          </button>
          <button type="submit" disabled={save.isPending} className={buttonPrimary}>
            {existing ? "Save" : "Create flashcard"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
