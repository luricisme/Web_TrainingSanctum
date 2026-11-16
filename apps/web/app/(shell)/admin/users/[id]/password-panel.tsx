"use client";

import { useState, type FormEvent } from "react";
import {
  ADMIN_PASSWORD_MAX,
  ADMIN_PASSWORD_MIN,
  adminPasswordResetSchema,
  type AdminPasswordReset,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  buttonPrimary,
  buttonSecondary,
  fieldErrorClass,
  formErrorClass,
  inputClass,
  labelClass,
} from "../../../../components/ui";
import { Modal } from "../../../classes/modal";

const pill =
  "inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-body-sm font-semibold text-foreground shadow-low transition-state hover:border-foreground focus-ring disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Story 7.5: Reset password on the admin user page. A modal with one
 * new-password field; the value is never shown back, stored or logged. The
 * admin's own page shows nothing (the status panel already explains).
 */
export function PasswordPanel({
  userId,
  email,
  isSelf,
}: {
  userId: string;
  email: string;
  isSelf: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (isSelf) return null;

  function close() {
    if (busy) return;
    setOpen(false);
    setPassword("");
    setFieldError(null);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const parsed = adminPasswordResetSchema.safeParse({ password });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Enter a valid password.");
      return;
    }
    setFieldError(null);
    setBusy(true);
    try {
      await apiFetch<AdminPasswordReset>(`/api/admin/users/${userId}/password`, {
        method: "PUT",
        json: { password: parsed.data.password },
      });
      setPassword("");
      setOpen(false);
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === "VALIDATION_ERROR") {
        setFieldError(e.message);
      } else {
        setError(e instanceof ApiError ? e.message : "The reset failed. Nothing was changed.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={pill}
        onClick={() => {
          setDone(false);
          setOpen(true);
        }}
      >
        Reset password
      </button>
      {done ? (
        <p role="status" className="basis-full text-body-sm text-foreground-secondary">
          Password reset. They were signed out.
        </p>
      ) : null}

      {open ? (
        <Modal title={`Reset password for ${email}`} onClose={close}>
          <form onSubmit={submit} noValidate>
            <p className="text-body text-foreground">
              This sets a new password and signs {email} out everywhere. Their data is not changed.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <label htmlFor="reset-password" className={labelClass}>
                New password
              </label>
              <input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFieldError(null);
                }}
                className={inputClass}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? "reset-password-error" : "reset-password-hint"}
              />
              {fieldError ? (
                <p id="reset-password-error" className={fieldErrorClass}>
                  {fieldError}
                </p>
              ) : (
                <p id="reset-password-hint" className="text-caption text-foreground-tertiary">
                  {ADMIN_PASSWORD_MIN} to {ADMIN_PASSWORD_MAX} characters.
                </p>
              )}
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
              <button type="submit" className={buttonPrimary} disabled={busy}>
                {busy ? "Resetting…" : "Confirm"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
