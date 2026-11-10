"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MAX_CARDS_PER_BATCH,
  cardInputSchema,
  type CreateCardsBatchResponse,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formErrorClass } from "@/app/components/ui";
import { Modal } from "../../classes/modal";
import {
  buttonPrimary,
  buttonSecondary,
  fieldErrorClass,
  overlineClass,
} from "../../classes/ui";

/** The Flashcard an Add cards panel writes into. */
export interface TargetFlashcard {
  id: string;
  name: string;
}

const INITIAL_ROWS = 3;

type Field = "term" | "definition" | "example" | "context" | "partOfSpeech";

interface Row {
  key: number;
  term: string;
  definition: string;
  example: string;
  context: string;
  partOfSpeech: string;
  more: boolean;
}

type RowErrors = Partial<Record<Field, string>>;

const FIELD_LABELS: Record<Field, string> = {
  term: "Term",
  definition: "Definition",
  example: "Example sentence",
  context: "Context / collocation",
  partOfSpeech: "Part of speech",
};

/** DESIGN.md `manual-row`: underlined field, underline turns accent on focus. */
export const underlineInput =
  "w-full rounded-none border-0 border-b-2 border-b-border bg-transparent px-0 py-2 text-body text-foreground transition-state placeholder:text-foreground-tertiary focus:border-b-accent focus:outline-none aria-[invalid=true]:border-b-error";

function emptyRow(key: number): Row {
  return {
    key,
    term: "",
    definition: "",
    example: "",
    context: "",
    partOfSpeech: "",
    more: false,
  };
}

function isBlank(row: Row): boolean {
  return (
    !row.term.trim() &&
    !row.definition.trim() &&
    !row.example.trim() &&
    !row.context.trim() &&
    !row.partOfSpeech.trim()
  );
}

/** Add cards panel, Manual mode (spec-2-3). The target is always one Flashcard. */
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
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const focusRequest = useRef<{ key: number; field: Field } | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());


  const save = useMutation({
    mutationFn: (cards: unknown[]) =>
      apiFetch<CreateCardsBatchResponse>("/api/cards/batch", {
        method: "POST",
        json: { flashcardId: flashcard.id, cards },
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

  const dirty = rows.some((row) => !isBlank(row));

  function requestClose() {
    if (save.isPending) return;
    if (dirty) setConfirmingDiscard(true);
    else onClose();
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
          void queryClient.invalidateQueries({ queryKey: ["flashcard", flashcard.id] });
          void queryClient.invalidateQueries({ queryKey: ["folder"] });
          void queryClient.invalidateQueries({ queryKey: ["class-folders"] });
          void queryClient.invalidateQueries({ queryKey: ["classes"] });

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
            err instanceof ApiError && err.status === 404
              ? "This flashcard no longer exists."
              : err instanceof ApiError
                ? err.message
                : "Something went wrong. Nothing was saved. Try again."
          );
        },
      }
    );
  }

  return (
    <Modal
      title={`Add cards to ${flashcard.name}`}
      size="wide"
      onClose={requestClose}
      headerAction={<ModeSwitcher />}
    >
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

        <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col gap-3 border-t border-divider bg-card px-6 py-4 sm:-mx-8 sm:-mb-8 sm:px-8">
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
          {confirmingDiscard ? (
            <div
              role="alertdialog"
              aria-label="Discard unsaved cards"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-body text-foreground">
                Discard the cards you have typed?
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setConfirmingDiscard(false)}
                  className={buttonSecondary}
                >
                  Keep editing
                </button>
                <button type="button" onClick={onClose} className={buttonSecondary}>
                  Discard
                </button>
              </div>
            </div>
          ) : (
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
        </div>
      </form>
    </Modal>
  );
}

/** DESIGN.md `components.mode-switcher`. Import is shown but not available yet. */
function ModeSwitcher() {
  return (
    <div
      role="tablist"
      aria-label="Add cards mode"
      className="flex gap-1 rounded-full bg-elevated p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected="true"
        className="rounded-full bg-accent px-4 py-1.5 text-body-sm font-medium text-on-accent focus-ring"
      >
        Manual
      </button>
      <button
        type="button"
        role="tab"
        aria-selected="false"
        disabled
        className="cursor-not-allowed rounded-full px-4 py-1.5 text-body-sm text-foreground-tertiary opacity-60"
      >
        Import
      </button>
    </div>
  );
}

function ManualRow({
  row,
  index,
  errors,
  registerInput,
  onChange,
  onKeyDown,
}: {
  row: Row;
  index: number;
  errors?: RowErrors;
  registerInput: (field: Field, el: HTMLInputElement | null) => void;
  onChange: (patch: Partial<Row>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>, field: Field) => void;
}) {
  const n = index + 1;

  function field(name: Field) {
    const id = `row-${row.key}-${name}`;
    const error = errors?.[name];
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={id} className={overlineClass}>
          {FIELD_LABELS[name]}
        </label>
        <input
          id={id}
          ref={(el) => registerInput(name, el)}
          type="text"
          autoComplete="off"
          aria-label={`${FIELD_LABELS[name]}, row ${n}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          value={row[name]}
          onChange={(event) => onChange({ [name]: event.target.value })}
          onKeyDown={(event) => onKeyDown(event, name)}
          className={underlineInput}
        />
        {error ? (
          <p id={`${id}-error`} className={fieldErrorClass}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  // A row with an error in a collapsed field always shows those fields.
  const hiddenError = Boolean(
    errors?.example || errors?.context || errors?.partOfSpeech
  );

  return (
    <div className="flex gap-4 rounded-md bg-elevated p-4">
      <span
        aria-hidden="true"
        className="w-6 shrink-0 pt-6 font-mono text-body-sm text-foreground-tertiary"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
          {field("term")}
          {field("definition")}
        </div>
        {row.more || hiddenError ? (
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            <div className="sm:col-span-2">{field("example")}</div>
            {field("context")}
            {field("partOfSpeech")}
          </div>
        ) : null}
        <button
          type="button"
          aria-expanded={row.more || hiddenError}
          aria-label={`${row.more || hiddenError ? "Fewer" : "More"} fields, row ${n}`}
          onClick={() => onChange({ more: !row.more })}
          className="self-start rounded-sm text-body-sm text-foreground-secondary underline-offset-2 transition-state hover:text-foreground hover:underline focus-ring"
        >
          {row.more || hiddenError ? "Fewer fields" : "More fields"}
        </button>
      </div>
    </div>
  );
}
