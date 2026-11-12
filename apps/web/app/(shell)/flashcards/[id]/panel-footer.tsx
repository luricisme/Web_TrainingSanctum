"use client";

import type { ReactNode } from "react";
import { buttonDanger, buttonSecondary } from "../../classes/ui";

/** Sticky Add cards panel footer: divider rule on the card surface. */
export function PanelFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col gap-3 border-t border-divider bg-card px-6 py-4 sm:-mx-8 sm:-mb-8 sm:px-8">
      {children}
    </div>
  );
}

/** What a pending discard confirmation is about. */
export interface PendingConfirm {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/** Inline confirmation that replaces the footer actions until answered. */
export function ConfirmBar({
  confirm,
  onKeep,
}: {
  confirm: PendingConfirm;
  onKeep: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label={confirm.message}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-body text-foreground">{confirm.message}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" autoFocus onClick={onKeep} className={buttonSecondary}>
          Keep editing
        </button>
        <button type="button" onClick={confirm.onConfirm} className={buttonDanger}>
          {confirm.confirmLabel}
        </button>
      </div>
    </div>
  );
}
