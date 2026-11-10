"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CardSummary } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formErrorClass } from "@/app/components/ui";
import { Modal } from "../../classes/modal";
import { buttonDanger, buttonSecondary } from "../../classes/ui";

/**
 * Delete a Card (spec-2-5): small confirmation naming the Term. Cancel has
 * default focus; "Delete card" is the secondary-danger button, not accent.
 * A 404 means the Card is already gone, so it counts as success.
 */
export function DeleteCardModal({
  card,
  onClose,
  onDeleted,
}: {
  card: CardSummary;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: () => apiFetch<{ id: string }>(`/api/cards/${card.id}`, { method: "DELETE" }),
  });

  function finish() {
    void queryClient.invalidateQueries({ queryKey: ["class-folders"] });
    void queryClient.invalidateQueries({ queryKey: ["classes"] });
    onDeleted(card.id);
  }

  function handleDelete() {
    setError(null);
    remove.mutate(undefined, {
      onSuccess: finish,
      onError: (err) => {
        if (err instanceof ApiError && err.status === 404) {
          finish();
          return;
        }
        setError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong. The card was not deleted. Try again."
        );
      },
    });
  }

  return (
    <Modal
      title="Delete card"
      onClose={() => {
        if (!remove.isPending) onClose();
      }}
    >
      <p className="text-body text-foreground-secondary">
        Delete <span className="break-words font-semibold text-foreground">{card.term}</span>? Its
        scheduling history is deleted too. This cannot be undone.
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
          disabled={remove.isPending}
          onClick={onClose}
          className={buttonSecondary}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={remove.isPending}
          onClick={handleDelete}
          className={buttonDanger}
        >
          {remove.isPending ? "Deleting" : "Delete card"}
        </button>
      </div>
    </Modal>
  );
}
