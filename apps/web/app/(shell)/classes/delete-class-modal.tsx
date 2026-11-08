"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClassSummary } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Modal } from "./modal";
import {
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  fieldErrorClass,
  inputClass,
  labelClass,
  overlineClass,
  pluralize,
} from "./ui";

type DeleteBody =
  | { mode: "move"; targetClassId: string }
  | { mode: "delete"; confirmName: string };

/**
 * Class-delete modal (EXPERIENCE.md): "Move folders to..." with a Class
 * picker is the primary action; "Delete class and everything in it" is the
 * danger action, enabled only after the exact Class name is typed. With no
 * other Class, only the delete option is offered.
 */
export function DeleteClassModal({
  target,
  others,
  onClose,
}: {
  target: ClassSummary;
  others: ClassSummary[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [targetClassId, setTargetClassId] = useState(others[0]?.id ?? "");
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (body: DeleteBody) =>
      apiFetch<unknown>(`/api/classes/${target.id}`, {
        method: "DELETE",
        json: body,
      }),
    onSuccess: () => {
      queryClient.setQueryData<ClassSummary[]>(["classes"], (current = []) =>
        current.filter((c) => c.id !== target.id)
      );
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

  const canMove = Boolean(targetClassId) && !remove.isPending;
  const canDelete = confirmName === target.name && !remove.isPending;

  return (
    <Modal
      title={`Delete ${target.name}`}
      onClose={() => {
        if (!remove.isPending) onClose();
      }}
    >
      <p className="text-body text-foreground-secondary">
        This class has {pluralize(target.folderCount, "folder")} and{" "}
        {pluralize(target.cardCount, "card")}.
      </p>

      {others.length > 0 ? (
        <section className="mt-6 flex flex-col gap-3">
          <label htmlFor="move-target" className={labelClass}>
            Move folders to
          </label>
          <select
            id="move-target"
            value={targetClassId}
            onChange={(event) => setTargetClassId(event.target.value)}
            className={inputClass}
          >
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({pluralize(c.folderCount, "folder")} ·{" "}
                {pluralize(c.cardCount, "card")})
              </option>
            ))}
          </select>
          <p className="text-body-sm text-foreground-tertiary">
            Unsorted cards merge into that class&apos;s Unsorted folder. A folder
            name already in use there gets a number added.
          </p>
          <div>
            <button
              type="button"
              disabled={!canMove}
              onClick={() => {
                setError(null);
                remove.mutate({ mode: "move", targetClassId });
              }}
              className={buttonPrimary}
            >
              Move folders and delete class
            </button>
          </div>
        </section>
      ) : (
        <p className="mt-6 text-body-sm text-foreground-tertiary">
          No other class exists to move folders to.
        </p>
      )}

      <section
        className={`flex flex-col gap-3 ${
          others.length > 0 ? "mt-6 border-t border-divider pt-6" : "mt-6"
        }`}
      >
        <p className={overlineClass}>Delete everything</p>
        <label htmlFor="confirm-name" className={labelClass}>
          Type <span className="font-semibold text-foreground">{target.name}</span>{" "}
          to confirm
        </label>
        <input
          id="confirm-name"
          type="text"
          autoComplete="off"
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
          className={inputClass}
        />
        <div>
          <button
            type="button"
            disabled={!canDelete}
            onClick={() => {
              setError(null);
              remove.mutate({ mode: "delete", confirmName });
            }}
            className={buttonDanger}
          >
            Delete class and everything in it
          </button>
        </div>
      </section>

      {error ? (
        <p role="alert" className={`mt-6 ${fieldErrorClass}`}>
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={remove.isPending}
          onClick={onClose}
          className={buttonSecondary}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
