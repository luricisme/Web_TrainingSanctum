"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_IMPORT_DELIMITER,
  MAX_CARDS_PER_BATCH,
  cardInputSchema,
  type CreateCardsBatchResponse,
  type ImportCommitResult,
  type ImportDelimiter,
  type ImportParseResponse,
  type ImportPreviewRow,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formErrorClass } from "@/app/components/ui";
import { Modal } from "../../classes/modal";
import { buttonPrimary, buttonSecondary } from "../../classes/ui";
import {
  FIELD_LABELS,
  type Field,
  ManualRow,
  type Row,
  type RowErrors,
  emptyRow,
  isBlank,
} from "./manual-row";
import { ConfirmBar, PanelFooter, type PendingConfirm } from "./panel-footer";
import { ImportPaste } from "./import-paste";
import { ImportReview, type ImportCommitRow } from "./import-review";
import { ImportResults } from "./import-results";

export { underlineInput } from "./manual-row";

/** The Flashcard an Add cards panel writes into. */
export interface TargetFlashcard {
  id: string;
  name: string;
}

const INITIAL_ROWS = 3;

type Mode = "manual" | "import";
type ImportStep = "paste" | "review" | "results";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 404) return "This flashcard no longer exists.";
  if (err instanceof ApiError) return err.message;
  return fallback;
}

/**
 * Add cards panel (spec-2-3, spec-3-1): Manual mode or Import → Paste, always
 * into the one Flashcard it was opened from. Manual rows survive a mode
 * switch; reviewed import rows are discarded only after a confirm.
 */
export function AddCardsPanel({
  flashcard,
  onClose,
}: {
  flashcard: TargetFlashcard;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const nextKey = useRef(INITIAL_ROWS);
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: INITIAL_ROWS }, (_, i) => emptyRow(i))
  );
  const [errors, setErrors] = useState<Record<number, RowErrors>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [mode, setMode] = useState<Mode>("manual");
  const [importStep, setImportStep] = useState<ImportStep>("paste");
  const [pasteText, setPasteText] = useState("");
  const [delimiter, setDelimiter] = useState<ImportDelimiter>(DEFAULT_IMPORT_DELIMITER);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [importResult, setImportResult] = useState<ImportCommitResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const focusRequest = useRef<{ key: number; field: Field } | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const save = useMutation({
    mutationFn: (cards: unknown[]) =>
      apiFetch<CreateCardsBatchResponse>("/api/cards/batch", {
        method: "POST",
        json: { flashcardId: flashcard.id, cards },
      }),
  });

  const preview = useMutation({
    mutationFn: (input: { delimiter: ImportDelimiter; text: string }) =>
      apiFetch<ImportParseResponse>("/api/import/parse", {
        method: "POST",
        json: { flashcardId: flashcard.id, ...input },
      }),
  });

  const commit = useMutation({
    mutationFn: (cards: ImportCommitRow[]) =>
      apiFetch<ImportCommitResult>("/api/cards/batch", {
        method: "POST",
        json: { flashcardId: flashcard.id, source: "import", cards },
      }),
  });

  // Modal opens the native dialog in its own mount effect (which runs before
  // this one), and the dialog only accepts focus once open: land in row 1 Term.
  useEffect(() => {
    inputs.current.get("0:term")?.focus();
  }, []);

  // Focus a field requested by Enter, "+ Add row" or a validation error once
  // the rows have rendered.
  useEffect(() => {
    const request = focusRequest.current;
    if (!request) return;
    focusRequest.current = null;
    inputs.current.get(`${request.key}:${request.field}`)?.focus();
  }, [rows]);

  const manualDirty = rows.some((row) => !isBlank(row));
  const importDirty =
    importStep === "review" || (importStep === "paste" && pasteText.trim() !== "");
  const busy = save.isPending || preview.isPending || commit.isPending;

  function invalidateCards() {
    void queryClient.invalidateQueries({ queryKey: ["flashcard", flashcard.id] });
    void queryClient.invalidateQueries({ queryKey: ["folder"] });
    void queryClient.invalidateQueries({ queryKey: ["class-folders"] });
    void queryClient.invalidateQueries({ queryKey: ["classes"] });
  }

  function requestClose() {
    if (busy) return;
    if (!manualDirty && !importDirty) {
      onClose();
      return;
    }
    const importWork = importStep === "review" ? "the reviewed rows" : "the pasted text";
    setConfirm({
      message:
        manualDirty && importDirty
          ? `Discard the cards you have typed and ${importWork}?`
          : manualDirty
            ? "Discard the cards you have typed?"
            : `Discard ${importWork}?`,
      confirmLabel: "Discard",
      onConfirm: onClose,
    });
  }

  function leaveReview() {
    setConfirm(null);
    setImportError(null);
    setPreviewRows([]);
    setImportStep("paste");
  }

  function changeMode(next: Mode) {
    if (next === mode || busy) return;
    setConfirm(null);
    if (next === "manual" && importStep === "review") {
      setConfirm({
        message: "Switch to Manual? The reviewed rows are discarded.",
        confirmLabel: "Discard rows",
        onConfirm: () => {
          leaveReview();
          setMode("manual");
        },
      });
      return;
    }
    if (importStep === "results") {
      setImportResult(null);
      setImportStep("paste");
    }
    setMode(next);
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    const edited = (Object.keys(patch) as (keyof Row)[]).filter(
      (f): f is Field => f in FIELD_LABELS
    );
    if (edited.length === 0) return;
    setErrors((current) => {
      const existing = current[key];
      if (!existing) return current;
      const { [key]: _removed, ...rest } = current;
      void _removed;
      const next = { ...existing };
      for (const f of edited) delete next[f];
      return Object.keys(next).length > 0 ? { ...rest, [key]: next } : rest;
    });
  }

  function addRow() {
    const key = nextKey.current++;
    setRows((current) => [...current, emptyRow(key)]);
    focusRequest.current = { key, field: "term" };
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    row: Row,
    index: number,
    field: Field
  ) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    // Enter never submits the form: Save is the only way to save.
    event.preventDefault();
    const lastField: Field = row.more ? "partOfSpeech" : "definition";
    if (
      index === rows.length - 1 &&
      field === lastField &&
      rows.length < MAX_CARDS_PER_BATCH
    ) {
      addRow();
    }
  }

  function focusFirstError(map: Record<number, RowErrors>) {
    const row = rows.find((r) => map[r.key]);
    if (!row) return;
    const field = (Object.keys(map[row.key]!) as Field[])[0];
    focusRequest.current = { key: row.key, field };
    // Re-render so the focus effect runs even when the rows did not change.
    setRows((current) => [...current]);
  }

  function handleSave() {
    setFormError(null);
    setNotice(null);
    const filled = rows.filter((row) => !isBlank(row));
    if (filled.length === 0) {
      setErrors({});
      setFormError("Fill in at least one row.");
      return;
    }

    const valid: { key: number; card: unknown }[] = [];
    const nextErrors: Record<number, RowErrors> = {};
    for (const row of filled) {
      const parsed = cardInputSchema.safeParse({
        term: row.term,
        definition: row.definition,
        example: row.example,
        context: row.context,
        partOfSpeech: row.partOfSpeech,
      });
      if (parsed.success) {
        valid.push({ key: row.key, card: parsed.data });
      } else {
        const rowErrors: RowErrors = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0] as Field;
          rowErrors[field] ??= issue.message;
        }
        nextErrors[row.key] = rowErrors;
      }
    }
    setErrors(nextErrors);

    const badCount = Object.keys(nextErrors).length;
    if (valid.length === 0) {
      focusFirstError(nextErrors);
      return;
    }

    save.mutate(
      valid.map((v) => v.card),
      {
        onSuccess: ({ created }) => {
          invalidateCards();

          if (badCount === 0) {
            onClose();
            return;
          }
          // Keep only the rows that still need fixing.
          const sent = new Set(valid.map((v) => v.key));
          setRows((current) => current.filter((r) => !sent.has(r.key)));
          setNotice(
            `${created} ${created === 1 ? "card" : "cards"} added. Fix the highlighted ${
              badCount === 1 ? "row" : "rows"
            } to add ${badCount === 1 ? "it" : "them"}.`
          );
          focusFirstError(nextErrors);
        },
        onError: (err) => {
          setFormError(
            errorMessage(err, "Something went wrong. Nothing was saved. Try again.")
          );
        },
      }
    );
  }

  function handlePreview() {
    setImportError(null);
    if (!pasteText.trim()) {
      setImportError("Paste some lines to import.");
      return;
    }
    preview.mutate(
      { delimiter, text: pasteText },
      {
        onSuccess: ({ rows: parsed }) => {
          setConfirm(null);
          setPreviewRows(parsed);
          setImportStep("review");
        },
        onError: (err) => setImportError(errorMessage(err, "Something went wrong. Try again.")),
      }
    );
  }

  function handleCommit(cards: ImportCommitRow[]) {
    setImportError(null);
    commit.mutate(cards, {
      onSuccess: (result) => {
        invalidateCards();
        setConfirm(null);
        setImportResult(result);
        setImportStep("results");
      },
      onError: (err) =>
        setImportError(
          errorMessage(err, "Something went wrong. Nothing was saved. Try again.")
        ),
    });
  }

  const confirmBar = confirm ? (
    <ConfirmBar confirm={confirm} onKeep={() => setConfirm(null)} />
  ) : undefined;

  return (
    <Modal
      title={`Add cards to ${flashcard.name}`}
      size="wide"
      onClose={requestClose}
      headerAction={<ModeSwitcher mode={mode} onChange={changeMode} disabled={busy} />}
    >
      {mode === "manual" ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
          className="flex flex-col gap-6"
        >
          <ol className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <li key={row.key}>
                <ManualRow
                  row={row}
                  index={index}
                  errors={errors[row.key]}
                  registerInput={(field, el) => {
                    const id = `${row.key}:${field}`;
                    if (el) inputs.current.set(id, el);
                    else inputs.current.delete(id);
                  }}
                  onChange={(patch) => updateRow(row.key, patch)}
                  onKeyDown={(event, field) => handleKeyDown(event, row, index, field)}
                />
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={addRow}
            disabled={rows.length >= MAX_CARDS_PER_BATCH}
            className="w-full rounded-md border border-dashed border-border px-4 py-3 text-body text-foreground-secondary transition-state hover:bg-row-hover hover:text-foreground focus-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            + Add row
          </button>

          <PanelFooter>
            {notice ? (
              <p role="status" className="text-body-sm text-foreground-secondary">
                {notice}
              </p>
            ) : null}
            {formError ? (
              <p role="alert" className={formErrorClass}>
                {formError}
              </p>
            ) : null}
            {confirmBar ?? (
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  disabled={save.isPending}
                  onClick={requestClose}
                  className={buttonSecondary}
                >
                  Cancel
                </button>
                <button type="submit" disabled={save.isPending} className={buttonPrimary}>
                  {save.isPending ? "Saving" : "Save"}
                </button>
              </div>
            )}
          </PanelFooter>
        </form>
      ) : importStep === "paste" ? (
        <ImportPaste
          text={pasteText}
          delimiter={delimiter}
          onTextChange={(text) => {
            setPasteText(text);
            setImportError(null);
          }}
          onDelimiterChange={setDelimiter}
          onPreview={handlePreview}
          onCancel={requestClose}
          pending={preview.isPending}
          error={importError}
          confirm={confirmBar}
        />
      ) : importStep === "review" ? (
        <ImportReview
          initialRows={previewRows}
          flashcardName={flashcard.name}
          onBack={() =>
            setConfirm({
              message: "Go back to the paste box? Your edits to these rows are discarded.",
              confirmLabel: "Discard edits",
              onConfirm: leaveReview,
            })
          }
          onCancel={requestClose}
          onSave={handleCommit}
          saving={commit.isPending}
          error={importError}
          confirm={confirmBar}
        />
      ) : importResult ? (
        <ImportResults
          result={importResult}
          flashcardName={flashcard.name}
          onDone={onClose}
        />
      ) : null}
    </Modal>
  );
}

/** DESIGN.md `components.mode-switcher`: the active option is the accent pill. */
function ModeSwitcher({
  mode,
  onChange,
  disabled,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
  disabled: boolean;
}) {
  const option = (value: Mode, label: string) => {
    const selected = mode === value;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        disabled={disabled && !selected}
        onClick={() => onChange(value)}
        className={
          selected
            ? "rounded-full bg-accent px-4 py-1.5 text-body-sm font-medium text-on-accent focus-ring"
            : "rounded-full px-4 py-1.5 text-body-sm font-medium text-foreground-secondary transition-state hover:text-foreground focus-ring disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {label}
      </button>
    );
  };
  return (
    <div
      role="tablist"
      aria-label="Add cards mode"
      className="flex gap-1 rounded-full bg-elevated p-1"
    >
      {option("manual", "Manual")}
      {option("import", "Import")}
    </div>
  );
}
