"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AdminUserDeleted } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  buttonDanger,
  buttonSecondary,
  formErrorClass,
  inputClass,
  labelClass,
} from "../../../../components/ui";
import { Modal } from "../../../classes/modal";

const pill =
  "inline-flex h-10 items-center rounded-full border border-error bg-card px-4 text-body-sm font-semibold text-error shadow-low transition-state hover:bg-row-hover focus-ring disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Story 7.6: Delete on the admin user page. A danger modal: the admin retypes
 * the user's email and Delete stays disabled until it matches exactly (the
 * server checks again). Success returns to the user list. The admin's own page
 * shows nothing (the status panel already explains).
 */
export function DeletePanel({
  userId,
  email,
  isSelf,
}: {
  userId: string;
  email: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isSelf) return null;

  const matches = typed === email;

  function close() {
    if (busy) return;
    setOpen(false);
    setTyped("");
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !matches) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch<AdminUserDeleted>(`/api/admin/users/${userId}`, {
        method: "DELETE",
        json: { email: typed },
      });
      router.push("/admin");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The delete failed. Nothing was deleted.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={pill}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Delete
      </button>

      {open ? (
        <Modal title={`Delete ${email}?`} onClose={close}>
          <form onSubmit={submit} noValidate>
            <p className="text-body text-foreground">
              This permanently deletes the account, its classes, cards and progress. It cannot be
              undone.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <label htmlFor="delete-confirm-email" className={labelClass}>
                Type {email} to confirm
              </label>
              <input
                id="delete-confirm-email"
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                value={typed}
                onChange={(event) => {
                  setTyped(event.target.value);
                  setError(null);
                }}
                className={inputClass}
              />
            </div>
            {error ? (
              <p role="alert" className={`${formErrorClass} mt-4`}>
                {error}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" className={buttonSecondary} onClick={close} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className={buttonDanger} disabled={busy || !matches}>
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
