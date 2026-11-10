"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CardSummary, MoveCardResponse } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formErrorClass } from "@/app/components/ui";
import { Modal } from "../../classes/modal";
import { buttonPrimary, buttonSecondary } from "../../classes/ui";
import { FolderPicker } from "./add-cards-panel";

/**
 * Move a Card (spec-2-6): names the Term and reuses the Class then Folder
 * picker. Cancel has default focus; "Move card" stays disabled until a Folder
 * is chosen. A 404 for the Card means it is already gone, so the list refreshes.
 */
export function MoveCardModal({
  card,
  folderId,
  classId,
  onClose,
  onMoved,
}: {
  card: CardSummary;
  folderId: string;
  classId: string;
  onClose: () => void;
  onMoved: (id: string, targetFolderId: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<{ classId: string; folderId: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // The dialog opens in Modal's mount effect and would focus the first field
  // (the Class picker); Cancel is the default focus.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const move = useMutation({
    mutationFn: (target: string) =>
      apiFetch<MoveCardResponse>(`/api/cards/${card.id}/move`, {
        method: "POST",
        json: { folderId: target },
      }),
  });

  function finish(targetFolderId: string | null) {
    if (targetFolderId) {
      void queryClient.invalidateQueries({ queryKey: ["folder", targetFolderId] });
    }
    void queryClient.invalidateQueries({ queryKey: ["class-folders"] });
    void queryClient.invalidateQueries({ queryKey: ["classes"] });
    onMoved(card.id, targetFolderId);
  }

  function handleMove() {
    if (!picked) return;
    setError(null);
    move.mutate(picked.folderId, {
      onSuccess: () => finish(picked.folderId),
      onError: (err) => {
        if (err instanceof ApiError && err.status === 404) {
          if (err.code === "FOLDER_NOT_FOUND") {
            setError("That folder no longer exists. Choose another.");
            void queryClient.invalidateQueries({ queryKey: ["class-folders"] });
            return;
          }
          finish(null);
          return;
        }
        setError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong. The card was not moved. Try again."
        );
      },
    });
  }

  return (
    <Modal
      title="Move card"
      onClose={() => {
        if (!move.isPending) onClose();
      }}
    >
      <p className="mb-6 text-body text-foreground-secondary">
        Move <span className="break-words font-semibold text-foreground">{card.term}</span> to
        another folder.
      </p>
      <FolderPicker
        value={picked}
        onChange={setPicked}
        initialClassId={classId}
        excludeFolderId={folderId}
        restoreLast={false}
      />
      {error ? (
        <p role="alert" className={`mt-4 ${formErrorClass}`}>
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          ref={cancelRef}
          type="button"
          disabled={move.isPending}
          onClick={onClose}
          className={buttonSecondary}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!picked || move.isPending}
          onClick={handleMove}
          className={buttonPrimary}
        >
          {move.isPending ? "Moving" : "Move card"}
        </button>
      </div>
    </Modal>
  );
}
