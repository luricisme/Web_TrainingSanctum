"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InvitationSummary } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { buttonPrimary, buttonQuiet } from "@/app/components/ui";
import { useIsFocused } from "./focus-mode";

export function useInvitations() {
  return useQuery({
    queryKey: ["invitations"],
    queryFn: () => apiFetch<InvitationSummary[]>("/api/invitations"),
    refetchInterval: 60_000,
  });
}

const cardsText = (n: number) => `${n} card${n === 1 ? "" : "s"}`;

/**
 * The bell (UX-DR32, DESIGN.md `components.bell`): a 36px round icon button
 * with a mono count chip when invitations are pending, opening an anchored
 * popover (no scrim, elevation.medium). Pending invitations only; nothing
 * else ever appears here.
 *
 * Keyboard: Enter/Space opens, arrows move between invitations, Enter on an
 * invitation accepts, Delete declines, Esc closes and returns to the bell.
 *
 * `on="frame"` sits on the dark app bar; `on="panel"` sits top-right of the
 * content panel below 640px.
 */
export function InvitationsBell({ on }: { on: "frame" | "panel" }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data } = useInvitations();
  const invitations = data ?? [];
  const count = invitations.length;

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  // Move focus into the list when it opens.
  useEffect(() => {
    if (!open) return;
    wrapRef.current?.querySelector<HTMLElement>("[data-invitation]")?.focus();
  }, [open]);

  const respond = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "accept" | "decline" }) =>
      apiFetch<{ id: string; classId?: string }>(`/api/invitations/${id}/${action}`, {
        method: "POST",
      }),
    onSuccess: (result, { action }) => {
      queryClient.setQueryData<InvitationSummary[]>(["invitations"], (current = []) =>
        current.filter((i) => i.id !== result.id)
      );
      void queryClient.invalidateQueries({ queryKey: ["invitations"] });
      if (action === "accept") {
        void queryClient.invalidateQueries({ queryKey: ["classes"] });
        setOpen(false);
        if (result.classId) router.push(`/classes/${result.classId}`);
        else router.refresh();
      } else {
        // Keep keyboard focus inside the popover once the row is gone.
        requestAnimationFrame(() =>
          wrapRef.current?.querySelector<HTMLElement>("[data-invitation]")?.focus()
        );
      }
    },
    onError: (err) => {
      setError(
        err instanceof ApiError && (err.status === 404 || err.status === 409)
          ? "That invitation is no longer available."
          : "Something went wrong. Try again."
      );
      void queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
  });

  function answer(id: string, action: "accept" | "decline") {
    if (respond.isPending) return;
    setError(null);
    respond.mutate({ id, action });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    const rows = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[data-invitation]")
    );
    const index = rows.findIndex((row) => row.contains(document.activeElement));
    if (event.key === "ArrowDown" && rows.length > 0) {
      event.preventDefault();
      rows[(index + 1) % rows.length].focus();
    } else if (event.key === "ArrowUp" && rows.length > 0) {
      event.preventDefault();
      rows[(index - 1 + rows.length) % rows.length].focus();
    }
  }

  const onFrame = on === "frame";
  const triggerClass = onFrame
    ? "text-on-frame hover:bg-frame-raised focus-ring-frame"
    : "text-foreground hover:bg-elevated focus-ring";
  const chipClass = onFrame ? "bg-frame-raised text-on-frame" : "bg-accent text-on-accent";

  return (
    <div ref={wrapRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={count > 0 ? `Invitations, ${count} pending` : "Invitations"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => {
          setError(null);
          setOpen((v) => !v);
        }}
        className={`relative flex size-9 items-center justify-center rounded-full transition-state ${triggerClass}`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {count > 0 ? (
          <span
            aria-hidden="true"
            className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-overline ${chipClass}`}
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Invitations"
          className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-divider bg-card p-2 text-foreground shadow-medium"
        >
          {invitations.length === 0 ? (
            <p className="px-3 py-4 text-body-sm text-foreground-secondary">No invitations.</p>
          ) : (
            <ul className="flex flex-col">
              {invitations.map((item, i) => (
                <li
                  key={item.id}
                  data-invitation=""
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter") {
                      event.preventDefault();
                      answer(item.id, "accept");
                    } else if (event.key === "Delete") {
                      event.preventDefault();
                      answer(item.id, "decline");
                    }
                  }}
                  className={`rounded-md px-3 py-3 transition-state focus-visible:bg-row-hover focus-ring ${
                    i > 0 ? "border-t border-divider" : ""
                  }`}
                >
                  <p className="text-body-sm text-foreground">
                    <span className="font-semibold">{item.ownerName}</span> invited you to{" "}
                    <span className="font-semibold">{item.className}</span> (
                    {cardsText(item.cardCount)})
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={respond.isPending}
                      onClick={() => answer(item.id, "accept")}
                      className={`${buttonPrimary} !px-4 !py-2 !text-body-sm`}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={respond.isPending}
                      onClick={() => answer(item.id, "decline")}
                      className={buttonQuiet}
                    >
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {error ? (
            <p role="alert" className="px-3 pb-2 pt-1 text-body-sm text-error">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Below 640px the app bar is gone: the bell sits top-right of the content panel. */
export function PanelBell() {
  const focused = useIsFocused();
  if (focused) return null;
  return (
    <div data-panel-bell="" className="absolute right-4 top-3 z-20 sm:hidden">
      <InvitationsBell on="panel" />
    </div>
  );
}
