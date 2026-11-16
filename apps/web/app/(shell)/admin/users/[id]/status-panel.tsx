"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUserStatus } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { buttonDanger, buttonSecondary, formErrorClass } from "../../../../components/ui";
import { Modal } from "../../../classes/modal";

const pill =
  "inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-body-sm font-semibold text-foreground shadow-low transition-state hover:border-foreground focus-ring disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Story 7.4: Disable / Enable on the admin user page. Disable asks first
 * (Confirm / Cancel); Enable acts at once. The admin's own page offers
 * neither and says why. Errors from the API show inline.
 */
export function StatusPanel({
  userId,
  email,
  disabled,
  isSelf,
}: {
  userId: string;
  email: string;
  disabled: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function change(next: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await apiFetch<AdminUserStatus>(`/api/admin/users/${userId}`, {
        method: "PATCH",
        json: { disabled: next },
      });
      setOpen(false);
      setDone(next ? null : "Enabled. They can log in again.");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "The change failed. Nothing was changed."
      );
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  if (isSelf) {
    return (
      <p className="basis-full text-body-sm text-foreground-secondary">
        This is your own account. You cannot disable it.
      </p>
    );
  }

  return (
    <>
      {disabled ? (
        <button type="button" className={pill} disabled={busy} onClick={() => void change(false)}>
          {busy ? "Enabling…" : "Enable"}
        </button>
      ) : (
        <button
          type="button"
          className={pill}
          onClick={() => {
            setError(null);
            setDone(null);
            setOpen(true);
          }}
        >
          Disable
        </button>
      )}
      {!open && error ? (
        <p role="alert" className={`${formErrorClass} basis-full`}>
          {error}
        </p>
      ) : null}
      {done && !error ? (
        <p role="status" className="basis-full text-body-sm text-foreground-secondary">
          {done}
        </p>
      ) : null}

      {open ? (
        <Modal title={`Disable ${email}?`} onClose={close}>
          <p className="text-body text-foreground">
            This signs {email} out and blocks login until you enable the account again. Their data
            is not changed.
          </p>
          {error ? (
            <p role="alert" className={`${formErrorClass} mt-4`}>
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button type="button" className={buttonSecondary} onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={buttonDanger} onClick={() => void change(true)} disabled={busy}>
              {busy ? "Disabling…" : "Confirm"}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
