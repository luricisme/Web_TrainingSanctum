"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { buttonQuiet } from "./ui";

/** Logout control, rendered from Settings. */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

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
        className={buttonQuiet}
      >
        {busy ? "Logging out..." : "Log out"}
      </button>
      {failed ? (
        <p role="alert" className="text-body-sm text-error">
          Could not log out. Try again.
        </p>
      ) : null}
    </>
  );
}
