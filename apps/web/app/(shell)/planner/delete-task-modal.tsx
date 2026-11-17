"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TaskSummary } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { buttonDanger, buttonSecondary, fieldErrorClass } from "@/app/components/ui";
import { Modal } from "../classes/modal";
import { PLANNER_CATEGORIES_KEY } from "./categories-key";
import { PLANNER_OVERDUE_KEY, PLANNER_TASKS_KEY } from "./tasks-key";

/** Delete confirmation that names the Task (EXPERIENCE.md). */
export function DeleteTaskModal({ task, onClose }: { task: TaskSummary; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: () => apiFetch<unknown>(`/api/planner/tasks/${task.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
      void queryClient.invalidateQueries({ queryKey: PLANNER_OVERDUE_KEY });
      void queryClient.invalidateQueries({ queryKey: PLANNER_CATEGORIES_KEY });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Nothing was changed.");
    },
  });

  return (
    <Modal
      title="Delete task"
      onClose={() => {
        if (!remove.isPending) onClose();
      }}
    >
      <p className="break-words text-body text-foreground-secondary">
        Delete <span className="font-semibold text-foreground">{task.title}</span>? This cannot be
        undone.
      </p>
      {error ? (
        <p role="alert" className={`mt-4 ${fieldErrorClass}`}>
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={remove.isPending}
          onClick={() => {
            setError(null);
            remove.mutate();
          }}
          className={buttonDanger}
        >
          Delete task
        </button>
        <button type="button" disabled={remove.isPending} onClick={onClose} className={buttonSecondary}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
