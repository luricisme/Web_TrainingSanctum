"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { backupRestoreSchema, findBackupIssues, type BackupRestore } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { buttonPrimary, buttonSecondary, formErrorClass } from "../../../../components/ui";
import { Modal } from "../../../classes/modal";

const NOT_A_BACKUP = "This is not a Training Sanctum backup.";

const pill =
  "inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-body-sm font-semibold text-foreground shadow-low transition-state hover:border-foreground focus-ring disabled:cursor-not-allowed disabled:opacity-60";

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(iso)) + " UTC";

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Story 5.3: the Restore control on the admin user page. Picks a backup file,
 * checks it against the shared schema in the browser, and only after an
 * explicit Confirm sends it (EXPERIENCE.md: Confirm/Cancel, no type-to-confirm).
 */
export function RestorePanel({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<BackupRestore | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onPick(file: File | undefined) {
    setFileError(null);
    setDone(false);
    if (!file) return;
    try {
      const parsed = backupRestoreSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error("schema");
      const issues = findBackupIssues(parsed.data);
      if (issues.length > 0) {
        setFileError(`This backup is inconsistent: ${issues[0]}`);
        return;
      }
      setModalError(null);
      setBackup(parsed.data);
    } catch {
      setFileError(NOT_A_BACKUP);
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  function close() {
    if (busy) return;
    setBackup(null);
    setModalError(null);
  }

  async function confirm() {
    if (!backup || busy) return;
    setBusy(true);
    setModalError(null);
    try {
      await apiFetch(`/api/admin/users/${userId}/restore`, {
        method: "POST",
        json: { confirm: true, backup },
      });
      setBackup(null);
      setDone(true);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        const reasons = (error.details ?? []).slice(0, 3).map((d) => d.reason);
        setModalError([error.message, ...reasons].join(" "));
      } else {
        setModalError("The restore failed. Nothing was changed.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-label="Backup file"
        onChange={(event) => void onPick(event.target.files?.[0])}
      />
      <button type="button" className={pill} onClick={() => input.current?.click()}>
        Restore
      </button>
      {fileError ? (
        <p role="alert" className={`${formErrorClass} basis-full`}>
          {fileError}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="basis-full text-body-sm text-foreground-secondary">
          Restored. The data now matches the file.
        </p>
      ) : null}

      {backup ? (
        <Modal title={`Restore ${email}?`} onClose={close}>
          <p className="text-body text-foreground">
            This will replace all of {email}&apos;s current data with the contents of this file. This
            cannot be undone.
          </p>
          {backup.user.email !== email ? (
            <p className="mt-3 text-body-sm text-foreground-secondary">
              This file was exported from a different account.
            </p>
          ) : null}
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-elevated px-4 py-3 text-body-sm">
            <dt className="text-foreground-secondary">File from</dt>
            <dd className="min-w-0 break-words font-semibold text-foreground">{backup.user.email}</dd>
            <dt className="text-foreground-secondary">Exported</dt>
            <dd className="text-foreground">{dateTime(backup.exportedAt)}</dd>
            <dt className="text-foreground-secondary">Contents</dt>
            <dd className="text-foreground">
              {plural(backup.classes.length, "Class", "Classes")},{" "}
              {plural(backup.folders.length, "Folder")}, {plural(backup.flashcards.length, "Flashcard")},{" "}
              {plural(backup.cards.length, "Card")}
              {backup.classes.some((c) => c.members.length > 0)
                ? `, ${plural(backup.classes.reduce((n, c) => n + c.members.length, 0), "Member")}`
                : ""}
            </dd>
          </dl>
          {modalError ? (
            <p role="alert" className={`${formErrorClass} mt-4`}>
              {modalError}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button type="button" className={buttonSecondary} onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={buttonPrimary} onClick={() => void confirm()} disabled={busy}>
              {busy ? "Restoring…" : "Confirm"}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
