"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TaskCategorySummary } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  fieldErrorClass,
  inputClass,
  labelClass,
  overlineClass,
} from "@/app/components/ui";
import { Modal } from "../classes/modal";
import { PLANNER_CATEGORIES_KEY } from "./categories-key";

type DeleteBody = { mode: "move"; targetId: string } | { mode: "delete" } | undefined;

/**
 * Category-delete modal (EXPERIENCE.md): with Tasks, "Move tasks to ..." with
 * a Category picker is the primary action and "Delete tasks too" the danger
 * one; with no other Category only the danger action is offered; with no
 * Tasks the Category deletes after a plain confirmation.
 */
export function DeleteCategoryModal({
  target,
  others,
  onClose,
}: {
  target: TaskCategorySummary;
  others: TaskCategorySummary[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [targetId, setTargetId] = useState(others[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (body: DeleteBody) =>
      apiFetch<unknown>(`/api/planner/categories/${target.id}`, {
        method: "DELETE",
        json: body ?? {},
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLANNER_CATEGORIES_KEY });
      onClose();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Nothing was changed."
      );
    },
  });

  const tasks = target.taskCount;
  const taskText = tasks === 1 ? "1 task" : `${tasks} tasks`;

  return (
    <Modal
      title={`Delete ${target.name}`}
      onClose={() => {
        if (!remove.isPending) onClose();
      }}
    >
      {tasks === 0 ? (
        <>
          <p className="text-body text-foreground-secondary">This category has no tasks.</p>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                setError(null);
                remove.mutate(undefined);
              }}
              className={buttonDanger}
            >
              Delete category
            </button>
            <button type="button" disabled={remove.isPending} onClick={onClose} className={buttonSecondary}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-body text-foreground-secondary">This category has {taskText}.</p>

          {others.length > 0 ? (
            <section className="mt-6 flex flex-col gap-3">
              <label htmlFor="move-tasks-target" className={labelClass}>
                Move tasks to
              </label>
              <select
                id="move-tasks-target"
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
                className={inputClass}
              >
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div>
                <button
                  type="button"
                  disabled={!targetId || remove.isPending}
                  onClick={() => {
                    setError(null);
                    remove.mutate({ mode: "move", targetId });
                  }}
                  className={buttonPrimary}
                >
                  Move tasks and delete category
                </button>
              </div>
            </section>
          ) : (
            <p className="mt-6 text-body-sm text-foreground-tertiary">
              No other category exists to move tasks to.
            </p>
          )}

          <section
            className={`flex flex-col gap-3 ${
              others.length > 0 ? "mt-6 border-t border-divider pt-6" : "mt-6"
            }`}
          >
            <p className={overlineClass}>Delete everything</p>
            <div>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => {
                  setError(null);
                  remove.mutate({ mode: "delete" });
                }}
                className={buttonDanger}
              >
                Delete tasks too
              </button>
            </div>
          </section>

          {error ? (
            <p role="alert" className={`mt-6 ${fieldErrorClass}`}>
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex justify-end">
            <button type="button" disabled={remove.isPending} onClick={onClose} className={buttonSecondary}>
              Cancel
            </button>
          </div>
        </>
      )}
      {tasks === 0 && error ? (
        <p role="alert" className={`mt-6 ${fieldErrorClass}`}>
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
