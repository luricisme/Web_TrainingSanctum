"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formErrorClass } from "@/app/components/ui";
import { Modal } from "../../classes/modal";
import { buttonDanger, buttonSecondary } from "../../classes/ui";

/**
 * Reset a deck's progress for the current learner. Cancel has default focus;
 * the danger button names the action. Nothing resets without this confirmation.
 */
export function ResetDeckModal({
  flashcardId,
  flashcardName,
  onClose,
  onReset,
}: {
  flashcardId: string;
  flashcardName: string;
  onClose: () => void;
  onReset: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>(`/api/flashcards/${flashcardId}/reset`, { method: "POST" }),
  });

  function handleReset() {
    setError(null);
    reset.mutate(undefined, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ["flashcard", flashcardId] });
        void queryClient.invalidateQueries({ queryKey: ["folder"] });
        void queryClient.invalidateQueries({ queryKey: ["classes"] });
        onReset();
      },
      onError: (err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Your progress was not reset. Try again."
        ),
    });
  }

  return (
    <Modal
      title="Reset deck"
      onClose={() => {
        if (!reset.isPending) onClose();
      }}
    >
      <p className="text-body text-foreground-secondary">
        Reset <span className="break-words font-semibold text-foreground">{flashcardName}</span>?
        Every card goes back to new and Learn starts again from the first card. Only your progress
        changes, and XP you have earned stays. This cannot be undone.
      </p>
      {error ? (
        <p role="alert" className={`mt-4 ${formErrorClass}`}>
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          autoFocus
          disabled={reset.isPending}
          onClick={onClose}
          className={buttonSecondary}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={reset.isPending}
          onClick={handleReset}
          className={buttonDanger}
        >
          {reset.isPending ? "Resetting" : "Reset deck"}
        </button>
      </div>
    </Modal>
  );
}
