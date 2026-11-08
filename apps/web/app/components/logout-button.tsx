"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";

/** Minimal logout control; moves to Settings in Story 1.5 (EXPERIENCE.md). */
export function LogoutButton() {
  const router = useRouter();
  const { data: session } = useSession();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!session) return null;

  async function handleClick() {
    setBusy(true);
    setFailed(false);
    try {
      // signOut resolves with `{error}` rather than throwing; only redirect
      // once the session is actually gone.
      const { error } = await signOut();
      if (error) {
        setFailed(true);
        return;
      }
      router.push("/login");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy}
        className="rounded-sm px-3 py-2 text-sm leading-[1.45] text-foreground-secondary transition-colors duration-150 ease-in-out hover:bg-row-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Logging out..." : "Log out"}
      </button>
      {failed ? (
        <p role="alert" className="text-sm leading-[1.45] text-error">
          Could not log out. Try again.
        </p>
      ) : null}
    </>
  );
}
