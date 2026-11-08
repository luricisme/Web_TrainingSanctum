"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  folderNameSchema,
  isFolderNameTaken,
  type ClassFoldersResponse,
  type FolderSummary,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Modal } from "../modal";
import {
  buttonPrimary,
  buttonSecondary,
  fieldErrorClass,
  inputClass,
  labelClass,
} from "../ui";

/** Create (no `existing`) or rename (`existing`) a Folder in `classId`. */
export function FolderFormModal({
  classId,
  siblings,
  existing,
  onClose,
}: {
  classId: string;
  /** Folders of the Class, used for the instant clash check. */
  siblings: FolderSummary[];
  existing?: FolderSummary;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(existing?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (value: string) =>
      existing
        ? apiFetch<FolderSummary>(`/api/folders/${existing.id}`, {
            method: "PATCH",
            json: { name: value },
          })
        : apiFetch<FolderSummary>(`/api/classes/${classId}/folders`, {
            method: "POST",
            json: { name: value },
          }),
    onSuccess: (saved) => {
      queryClient.setQueryData<ClassFoldersResponse>(
        ["class-folders", classId],
        (current) => {
          if (!current) return current;
          const folders = existing
            ? current.folders.map((f) => (f.id === saved.id ? saved : f))
            : [...current.folders, saved];
          return {
            ...current,
            folders: folders.sort((a, b) =>
              a.isUnsorted !== b.isUnsorted
                ? a.isUnsorted
                  ? -1
                  : 1
                : a.name.localeCompare(b.name)
            ),
          };
        }
      );
      void queryClient.invalidateQueries({ queryKey: ["class-folders", classId] });
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
    const parsed = folderNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a folder name.");
      return;
    }
    const others = siblings.filter((f) => f.id !== existing?.id).map((f) => f.name);
    if (isFolderNameTaken(parsed.data, others)) {
      setError("A folder with this name already exists in this class.");
      return;
    }
    save.mutate(parsed.data);
  }

  return (
    <Modal
      title={existing ? "Rename folder" : "Create folder"}
      onClose={() => {
        if (!save.isPending) onClose();
      }}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="folder-name" className={labelClass}>
            Folder name
          </label>
          <input
            id="folder-name"
            name="name"
            type="text"
            autoComplete="off"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "folder-name-error" : undefined}
            className={inputClass}
          />
          {error ? (
            <p id="folder-name-error" role="alert" className={fieldErrorClass}>
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
            {existing ? "Save" : "Create folder"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
