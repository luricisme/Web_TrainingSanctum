"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClassSummary } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Modal } from "./modal";
import { buttonDanger, buttonSecondary, fieldErrorClass } from "./ui";

/** Member: leave a Shared Class (EXPERIENCE.md "Leave confirm"). One step, danger-styled. */
export function LeaveClassModal({
  target,
  onClose,
}: {
  target: ClassSummary;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const leave = useMutation({
    mutationFn: () =>
      apiFetch<unknown>(`/api/classes/${target.id}/members/leave`, { method: "POST" }),
    onSuccess: () => {
      queryClient.setQueryData<ClassSummary[]>(["classes"], (current = []) =>
        current.filter((c) => c.id !== target.id)
      );
      void queryClient.invalidateQueries();
      onClose();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Nothing was changed."
      );
    },
  });

  return (
    <Modal
      title={`Leave ${target.name}`}
      onClose={() => {
        if (!leave.isPending) onClose();
      }}
    >
      <p className="text-body text-foreground-secondary">
        Leave {target.name}? Your progress in it will be deleted.
      </p>

      {error ? (
        <p role="alert" className={`mt-4 ${fieldErrorClass}`}>
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={leave.isPending}
          onClick={() => {
            setError(null);
            leave.mutate();
          }}
          className={buttonDanger}
        >
          Leave
        </button>
        <button
          type="button"
          disabled={leave.isPending}
          onClick={onClose}
          className={buttonSecondary}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
