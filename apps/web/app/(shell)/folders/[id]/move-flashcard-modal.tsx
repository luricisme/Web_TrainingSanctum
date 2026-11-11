"use client";

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ClassFoldersResponse,
  ClassSummary,
  FlashcardSummary,
  FolderFlashcardsResponse,
  MoveFlashcardResponse,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formErrorClass } from "@/app/components/ui";
import { Modal } from "../../classes/modal";
import {
  buttonPrimary,
  buttonSecondary,
  inputClass,
  labelClass,
} from "../../classes/ui";

const FOLDER_GONE = "That folder no longer exists. Choose another.";

/**
 * Move-flashcard modal (EXPERIENCE.md): a Class then Folder picker across all
 * Classes. The current Folder is not offered. Cancel is focused first; the
 * primary stays disabled until a Folder is chosen.
 */
export function MoveFlashcardModal({
  folderId,
  classId,
  target,
  onClose,
}: {
  /** The Folder the Flashcard is in now. */
  folderId: string;
  /** The Class of that Folder, preselected in the picker. */
  classId: string;
  target: FlashcardSummary;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const ids = useId();
  const [pickedClassId, setPickedClassId] = useState(classId);
  const [pickedFolderId, setPickedFolderId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const classes = useQuery({
    queryKey: ["classes"],
    queryFn: () => apiFetch<ClassSummary[]>("/api/classes"),
  });
  const folders = useQuery({
    queryKey: ["class-folders", pickedClassId],
    queryFn: () =>
      apiFetch<ClassFoldersResponse>(`/api/classes/${pickedClassId}/folders`),
  });

  const options = (folders.data?.folders ?? []).filter((f) => f.id !== folderId);
  const noOthers = folders.data !== undefined && options.length === 0;
  const stillValid = options.some((f) => f.id === pickedFolderId);

  const move = useMutation({
    mutationFn: (toFolderId: string) =>
      apiFetch<MoveFlashcardResponse>(`/api/flashcards/${target.id}/move`, {
        method: "POST",
        json: { folderId: toFolderId },
      }),
    onSuccess: (moved) => finish(moved.folderId),
    onError: (err) => {
      if (err instanceof ApiError && err.code === "NOT_FOUND") {
        // Already gone: nothing to move, the list just needs a refresh.
        finish(null);
        return;
      }
      if (err instanceof ApiError && err.code === "FOLDER_NOT_FOUND") {
        setPickedFolderId("");
        void queryClient.invalidateQueries({ queryKey: ["class-folders"] });
        setError(FOLDER_GONE);
        return;
      }
      if (err instanceof ApiError && err.code === "NAME_CONFLICT") {
        setError("Try again.");
        return;
      }
      setError("Could not move the flashcard. Nothing was changed.");
    },
  });

  function finish(toFolderId: string | null) {
    queryClient.setQueryData<FolderFlashcardsResponse>(
      ["folder", folderId],
      (current) =>
        current
          ? {
              ...current,
              flashcards: current.flashcards.filter((f) => f.id !== target.id),
            }
          : current
    );
    void queryClient.invalidateQueries({ queryKey: ["folder", folderId] });
    if (toFolderId) {
      void queryClient.invalidateQueries({ queryKey: ["folder", toFolderId] });
    }
    void queryClient.invalidateQueries({ queryKey: ["class-folders"] });
    void queryClient.invalidateQueries({ queryKey: ["classes"] });
    onClose();
  }

  const canMove = stillValid && !move.isPending;

  return (
    <Modal
      title="Move flashcard"
      onClose={() => {
        if (!move.isPending) onClose();
      }}
    >
      <p className="text-body text-foreground-secondary">
        Move <span className="font-semibold text-foreground">{target.name}</span>{" "}
        and all its cards. A name already used in the target folder gets a number
        added.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        <label htmlFor={`${ids}-class`} className={labelClass}>
          Class
        </label>
        <select
          id={`${ids}-class`}
          value={pickedClassId}
          disabled={move.isPending || !classes.data}
          onChange={(event) => {
            setPickedClassId(event.target.value);
            setPickedFolderId("");
            setError(null);
          }}
          className={inputClass}
        >
          {(classes.data ?? [{ id: classId, name: "Loading..." }]).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <label htmlFor={`${ids}-folder`} className={labelClass}>
          Folder
        </label>
        <select
          id={`${ids}-folder`}
          value={stillValid ? pickedFolderId : ""}
          disabled={move.isPending || noOthers || !folders.data}
          onChange={(event) => {
            setPickedFolderId(event.target.value);
            setError(null);
          }}
          className={inputClass}
        >
          {noOthers ? (
            <option value="">No other folders in this class</option>
          ) : (
            <>
              <option value="">
                {folders.data ? "Choose a folder" : "Loading..."}
              </option>
              {options.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </>
          )}
        </select>
        {folders.isError ? (
          <p role="alert" className="text-body-sm text-error">
            Could not load folders.{" "}
            <button
              type="button"
              onClick={() => void folders.refetch()}
              className="rounded-sm underline underline-offset-2 focus-ring"
            >
              Try again
            </button>
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className={`mt-6 ${formErrorClass}`}>
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          autoFocus
          disabled={move.isPending}
          onClick={onClose}
          className={buttonSecondary}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canMove}
          onClick={() => {
            setError(null);
            move.mutate(pickedFolderId);
          }}
          className={buttonPrimary}
        >
          Move flashcard
        </button>
      </div>
    </Modal>
  );
}
