"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isTextField } from "@/lib/keyboard";

/**
 * spec-4-5: the way out of a Review or Learn session while focus mode hides
 * the sidebar. A quiet neutral text link at the top-left of the stage (the
 * accent stays on the card's actions); Esc does the same, ignored in text
 * fields and with modifiers, like the session's other keys.
 */
export function SessionExit({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.repeat) return;
      if (event.defaultPrevented || event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (isTextField(event.target)) return;
      event.preventDefault();
      router.push(href);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [href, router]);

  return (
    <div className="w-full max-w-review-card">
      <Link
        href={href}
        aria-keyshortcuts="Escape"
        className="-mx-2 inline-flex items-center gap-2 rounded-sm px-2 py-1 text-body-sm text-foreground-secondary underline-offset-2 transition-state hover:text-foreground hover:underline focus-ring"
      >
        Exit
        <kbd aria-hidden="true" className="text-caption text-foreground-tertiary">
          Esc
        </kbd>
      </Link>
    </div>
  );
}
