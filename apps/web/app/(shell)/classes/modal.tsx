"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Centered modal on the native `<dialog>`: showModal() gives the scrim, focus
 * trap, Escape to close and focus restoration to the opener.
 * Visuals: DESIGN.md `components.modal` (card surface, rounded.lg, 50% scrim).
 */
export function Modal({
  title,
  onClose,
  children,
  size = "default",
  headerAction,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /**
   * `wide` is the Add cards panel (DESIGN.md `components.add-cards-panel`):
   * max 880px, elevation.high, divider border, full-screen sheet below 640px.
   */
  size?: "default" | "wide";
  /** Shown beside the title (e.g. the mode switcher). */
  headerAction?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    // The dialog is removed from the DOM on close, so the browser cannot
    // restore focus itself: remember the opener and refocus it explicitly.
    const opener = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={
        size === "wide"
          ? "m-auto max-h-dvh w-full max-w-none overflow-y-auto rounded-none border border-divider bg-card p-0 text-foreground shadow-high backdrop:bg-black/50 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-panel sm:rounded-lg"
          : "m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-divider bg-card p-0 text-foreground backdrop:bg-black/50"
      }
    >
      <div className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h2
            id={titleId}
            className="min-w-0 break-words text-heading-3 text-foreground"
          >
            {title}
          </h2>
          {headerAction}
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </dialog>
  );
}
