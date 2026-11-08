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
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
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
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-divider bg-card p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="p-6 sm:p-8">
        <h2
          id={titleId}
          className="break-words text-heading-3 text-foreground"
        >
          {title}
        </h2>
        <div className="mt-6">{children}</div>
      </div>
    </dialog>
  );
}
