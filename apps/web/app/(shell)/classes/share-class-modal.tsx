"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClassSummary, ShareInvitation, ShareMember, ShareState } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { buttonDanger, buttonPrimary, buttonQuiet } from "@/app/components/ui";
import { Modal } from "./modal";
import { buttonSecondary, fieldErrorClass, inputClass, labelClass, overlineClass } from "./ui";

const GENERIC_ERROR = "Something went wrong. Nothing was changed.";

/**
 * Share modal (UX-DR31), opened from an owned Class's "..." menu: an email
 * field, then three lists: Members (Remove, with a confirm), Pending (Cancel)
 * and Declined (muted, Invite again). Consent-based: the invitee accepts from
 * their bell; no email is sent.
 */
export function ShareClassModal({
  target,
  onClose,
}: {
  target: ClassSummary;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const shareKey = ["share", target.id] as const;
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ShareMember | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: shareKey,
    queryFn: () => apiFetch<ShareState>(`/api/classes/${target.id}/invitations`),
    // The invitee answers elsewhere: always show the current state on open.
    staleTime: 0,
    refetchOnMount: "always",
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: shareKey });
    void queryClient.invalidateQueries({ queryKey: ["classes"] });
  }

  const invite = useMutation({
    mutationFn: (address: string) =>
      apiFetch<ShareInvitation>(`/api/classes/${target.id}/invitations`, {
        method: "POST",
        json: { email: address },
      }),
    onSuccess: (row) => {
      queryClient.setQueryData<ShareState>(shareKey, (current) =>
        current
          ? { ...current, invitations: [row, ...current.invitations.filter((i) => i.id !== row.id)] }
          : current
      );
      setEmail("");
      setFieldError(null);
      setError(null);
      refresh();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.fields?.email) {
        setFieldError(err.fields.email);
      } else {
        setError(err instanceof ApiError ? err.message : GENERIC_ERROR);
      }
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) =>
      apiFetch<unknown>(`/api/classes/${target.id}/invitations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR);
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (userId: string) =>
      apiFetch<unknown>(`/api/classes/${target.id}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      setError(null);
      setRemoving(null);
      refresh();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR);
      setRemoving(null);
      refresh();
    },
  });

  const busy = invite.isPending || cancel.isPending || remove.isPending;
  const members = data?.members ?? [];
  const pending = data?.invitations.filter((i) => i.status === "PENDING") ?? [];
  const declined = data?.invitations.filter((i) => i.status === "DECLINED") ?? [];

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invite.isPending) return;
    const address = email.trim();
    if (!address) {
      setFieldError("Enter an email address.");
      return;
    }
    setFieldError(null);
    setError(null);
    invite.mutate(address);
  }

  if (removing) {
    return (
      <Modal title={`Remove ${removing.email}`} onClose={() => !remove.isPending && setRemoving(null)}>
        <p className="text-body text-foreground-secondary">
          Remove {removing.email}? Their progress in {target.name} will be deleted.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate(removing.userId)}
            className={buttonDanger}
          >
            Remove
          </button>
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => setRemoving(null)}
            className={buttonSecondary}
          >
            Cancel
          </button>
        </div>
      </Modal>
    );
  }

  const rowClass = "flex items-center justify-between gap-3 border-t border-divider py-3 first:border-t-0";

  return (
    <Modal title={`Share ${target.name}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label htmlFor="share-email" className={labelClass}>
          Invite by email
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <input
              id="share-email"
              type="email"
              autoComplete="off"
              autoFocus
              value={email}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? "share-email-error" : undefined}
              onChange={(event) => {
                setEmail(event.target.value);
                setFieldError(null);
              }}
              className={inputClass}
            />
            {fieldError ? (
              <p id="share-email-error" role="alert" className={`mt-2 ${fieldErrorClass}`}>
                {fieldError}
              </p>
            ) : null}
          </div>
          <button type="submit" disabled={invite.isPending} className={buttonPrimary}>
            Invite
          </button>
        </div>
        <p className="mt-2 text-body-sm text-foreground-tertiary">
          They need an account. They accept from the bell; no email is sent.
        </p>
      </form>

      {isPending ? (
        <div aria-label="Loading" className="mt-6 h-16 animate-pulse rounded-md bg-elevated motion-reduce:animate-none" />
      ) : isError ? (
        <div role="alert" className="mt-6 flex flex-col items-start gap-3">
          <p className="text-body-sm text-foreground-secondary">Could not load who has access.</p>
          <button type="button" onClick={() => void refetch()} className={buttonSecondary}>
            Try again
          </button>
        </div>
      ) : members.length + pending.length + declined.length === 0 ? (
        <p className="mt-6 text-body-sm text-foreground-secondary">Only you can see this class.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {members.length > 0 ? (
            <section aria-labelledby="share-members">
              <h3 id="share-members" className={overlineClass}>
                Members
              </h3>
              <ul className="mt-1">
                {members.map((m) => (
                  <li key={m.userId} className={rowClass}>
                    <div className="min-w-0">
                      <p className="truncate text-body-sm font-semibold text-foreground">{m.name}</p>
                      <p className="truncate text-caption text-foreground-secondary">{m.email}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Remove ${m.email}`}
                      onClick={() => setRemoving(m)}
                      className={`${buttonQuiet} !text-error shrink-0 whitespace-nowrap`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {pending.length > 0 ? (
            <section aria-labelledby="share-pending">
              <h3 id="share-pending" className={overlineClass}>
                Pending
              </h3>
              <ul className="mt-1">
                {pending.map((i) => (
                  <li key={i.id} className={rowClass}>
                    <p className="min-w-0 truncate text-body-sm text-foreground">{i.email}</p>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Cancel invitation to ${i.email}`}
                      onClick={() => cancel.mutate(i.id)}
                      className={`${buttonQuiet} shrink-0 whitespace-nowrap`}
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {declined.length > 0 ? (
            <section aria-labelledby="share-declined">
              <h3 id="share-declined" className={overlineClass}>
                Declined
              </h3>
              <ul className="mt-1">
                {declined.map((i) => (
                  <li key={i.id} className={rowClass}>
                    <p className="min-w-0 truncate text-body-sm text-foreground-tertiary">{i.email}</p>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Invite ${i.email} again`}
                      onClick={() => {
                        setError(null);
                        invite.mutate(i.email);
                      }}
                      className={`${buttonQuiet} shrink-0 whitespace-nowrap`}
                    >
                      Invite again
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      {error ? (
        <p role="alert" className={`mt-6 ${fieldErrorClass}`}>
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onClose} className={buttonSecondary}>
          Done
        </button>
      </div>
    </Modal>
  );
}
