"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  MAX_CARDS_PER_BATCH,
  type ImportPreviewRow,
  detectDuplicates,
  validateImportCard,
} from "@training-sanctum/domain";
import { formErrorClass } from "@/app/components/ui";
import { buttonPrimary, buttonSecondary } from "../../classes/ui";
import {
  type Field,
  ManualRow,
  type Row,
  type RowProblem,
  emptyRow,
  isBlank,
} from "./manual-row";
import { PanelFooter } from "./panel-footer";

/**
 * Rows are labelled by source line ("L14"), by card number ("Card 3") or, for
 * a file import, by spreadsheet row ("Row 14").
 */
export type RowLabelMode = "line" | "card" | "row";

interface ReviewRow extends Row {
  /**
   * The row's label number: its source line in "line" mode, its card number
   * in "card" mode, its spreadsheet row in "row" mode; null for a row added in the editor. Sent as the commit
   * row's `line` and echoed back in the results.
   */
  line: number | null;
  /** Problem reported by Preview; cleared once Term or Definition is edited. */
  parseProblem: { field: Field; message: string } | null;
  /**
   * Preview found the Term already in the Flashcard; cleared once the Term is
   * edited. Repeats within the paste are derived from the current rows.
   */
  existing: boolean;
}

/** One row sent to the import commit. */
export interface ImportCommitRow {
  line: number | null;
  term: string;
  definition: string;
  example: string;
  context: string;
  partOfSpeech: string;
}

function toReviewRows(rows: ImportPreviewRow[], labelMode: RowLabelMode): ReviewRow[] {
  return rows.map((row, i) => {
    const example = row.example ?? "";
    const context = row.context ?? "";
    const partOfSpeech = row.partOfSpeech ?? "";
    return {
      ...emptyRow(i),
      term: row.term,
      definition: row.definition,
      example,
      context,
      partOfSpeech,
      // A file row with optional fields opens with them shown.
      more: example !== "" || context !== "" || partOfSpeech !== "",
      line: labelMode === "card" ? row.card : row.line,
      parseProblem: row.error
        ? { field: row.errorField ?? "definition", message: row.error }
        : null,
      existing: row.duplicate && row.duplicateOfLine === null,
    };
  });
}

/** Visible label and spoken name of a review row. */
function rowLabelFor(
  line: number | null,
  labelMode: RowLabelMode,
  newOrdinal: number
): { text: string; name: string; numeric?: boolean; wide?: boolean } {
  const wide = labelMode !== "line";
  if (line === null) return { text: "new", name: `new row ${newOrdinal}`, numeric: false, wide };
  if (labelMode === "card") return { text: `Card ${line}`, name: `card ${line}`, numeric: false, wide };
  if (labelMode === "row") return { text: `Row ${line}`, name: `row ${line}`, numeric: false, wide };
  return { text: `L${line}`, name: `line ${line}` };
}

/** Rows that take part in Save: every pasted row, plus non-blank added rows. */
function counts(row: ReviewRow): boolean {
  return row.line !== null || !isBlank(row);
}

function problemOf(row: ReviewRow): { field: Field; message: string } | null {
  if (!counts(row)) return null;
  if (row.parseProblem) return row.parseProblem;
  const checked = validateImportCard(row);
  return checked.ok ? null : checked.problem;
}

/**
 * Duplicate note per row key: the stored "Already in" flag, else a repeat of
 * an earlier counted row, recomputed from the current rows on every render.
 */
function duplicateNotes(
  rows: ReviewRow[],
  flashcardName: string,
  labelMode: RowLabelMode
): Map<number, string> {
  const considered = rows.filter(counts);
  const flags = detectDuplicates(
    considered.map((r) => ({ term: r.term, error: problemOf(r)?.message })),
    []
  );
  const notes = new Map<number, string>();
  considered.forEach((row, i) => {
    const of = flags[i]!.duplicateOf;
    if (row.existing) {
      notes.set(row.key, `Already in ${flashcardName} — will be skipped`);
    } else if (of !== null) {
      const earlier = considered[of]!;
      notes.set(
        row.key,
        earlier.line !== null
          ? `Duplicate of ${labelMode} ${earlier.line} — will be skipped`
          : "Duplicate of a new row — will be skipped"
      );
    }
  });
  return notes;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Import review editor (spec-3-1, file rows spec-3-2): the Manual row editor
 * prefilled with the parsed rows, labelled by source line, card or row, with × and inline problems. Problems
 * never block Save; the commit reports whatever is still wrong.
 */
export function ImportReview({
  initialRows,
  labelMode,
  flashcardName,
  backLabel,
  onBack,
  onCancel,
  onSave,
  saving,
  error,
  confirm,
}: {
  initialRows: ImportPreviewRow[];
  labelMode: RowLabelMode;
  flashcardName: string;
  /** The back link text, e.g. "← Back to paste" or "← Back to mapping". */
  backLabel: string;
  onBack: () => void;
  onCancel: () => void;
  onSave: (rows: ImportCommitRow[]) => void;
  saving: boolean;
  error: string | null;
  /** A discard confirmation shown in place of the footer actions. */
  confirm?: ReactNode;
}) {
  const [rows, setRows] = useState<ReviewRow[]>(() =>
    toReviewRows(initialRows, labelMode)
  );
  const [notice, setNotice] = useState<string | null>(null);
  const nextKey = useRef(initialRows.length);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const addRowRef = useRef<HTMLButtonElement>(null);
  const focusRequest = useRef<{ key: number; field: Field } | "add-row" | null>(null);
  const [focusTick, setFocusTick] = useState(0);

  const notes = duplicateNotes(rows, flashcardName, labelMode);

  // Land on the first problem row, else the first row.
  useEffect(() => {
    const first = rows.find((r) => problemOf(r) || notes.has(r.key)) ?? rows[0];
    if (first) {
      const field = problemOf(first)?.field ?? "term";
      inputs.current.get(`${first.key}:${field}`)?.focus();
    }
    // Only on entering the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const request = focusRequest.current;
    if (!request) return;
    focusRequest.current = null;
    if (request === "add-row") addRowRef.current?.focus();
    else inputs.current.get(`${request.key}:${request.field}`)?.focus();
  }, [rows, focusTick]);

  const considered = rows.filter(counts);
  const needFixing = considered.filter((r) => problemOf(r)).length;
  const duplicates = considered.filter((r) => notes.has(r.key)).length;
  const toSave = considered.filter((r) => !problemOf(r) && !notes.has(r.key)).length;

  function updateRow(key: number, patch: Partial<Row>) {
    setNotice(null);
    setRows((current) =>
      current.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if ("term" in patch || "definition" in patch) next.parseProblem = null;
        if ("term" in patch) next.existing = false;
        return next;
      })
    );
  }

  function addRow() {
    const key = nextKey.current++;
    setRows((current) => [
      ...current,
      { ...emptyRow(key), line: null, parseProblem: null, existing: false },
    ]);
    focusRequest.current = { key, field: "term" };
  }

  function removeRow(key: number) {
    const index = rows.findIndex((r) => r.key === key);
    const remaining = rows.filter((r) => r.key !== key);
    const neighbour = remaining[Math.min(index, remaining.length - 1)];
    focusRequest.current = neighbour ? { key: neighbour.key, field: "term" } : "add-row";
    setRows(remaining);
  }

  function jumpToFirstProblem() {
    const first = rows.find((r) => problemOf(r) || notes.has(r.key));
    if (!first) return;
    focusRequest.current = { key: first.key, field: problemOf(first)?.field ?? "term" };
    setFocusTick((t) => t + 1);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    row: Row,
    index: number,
    field: Field
  ) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    // Enter never submits: Save is the only way to save.
    event.preventDefault();
    const lastField: Field = row.more ? "partOfSpeech" : "definition";
    if (index === rows.length - 1 && field === lastField && rows.length < MAX_CARDS_PER_BATCH) {
      addRow();
    }
  }

  function handleSave() {
    if (saving) return;
    const payload = considered.map((r) => ({
      line: r.line,
      term: r.term,
      definition: r.definition,
      example: r.example,
      context: r.context,
      partOfSpeech: r.partOfSpeech,
    }));
    if (payload.length === 0) {
      setNotice(
        `Nothing to save. Add a row or go back to the ${
          labelMode === "row" ? "mapping" : "paste box"
        }.`
      );
      return;
    }
    onSave(payload);
  }

  let newOrdinal = 0;
  const needFixingText = needFixing === 1 ? "1 needs fixing" : `${needFixing} need fixing`;
  const hasProblems = needFixing + duplicates > 0;
  const summary = (
    <>
      <span className="font-semibold text-foreground">
        {plural(considered.length, "row", "rows")}
      </span>
      {needFixing > 0 ? (
        <span className="font-semibold text-error">
          {needFixingText}
        </span>
      ) : null}
      {duplicates > 0 ? (
        <span className="font-semibold text-warning">
          {plural(duplicates, "duplicate", "duplicates")}
        </span>
      ) : null}
    </>
  );

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        handleSave();
      }}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-wrap items-center gap-3 rounded-md bg-elevated px-4 py-3 text-body-sm text-foreground-secondary">
        {hasProblems ? (
          <button
            type="button"
            onClick={jumpToFirstProblem}
            aria-label={`${[
              plural(considered.length, "row", "rows"),
              needFixing > 0 ? needFixingText : null,
              duplicates > 0 ? plural(duplicates, "duplicate", "duplicates") : null,
            ]
              .filter(Boolean)
              .join(", ")}. Go to the first problem row.`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm underline-offset-2 transition-state hover:underline focus-ring"
          >
            {summary}
          </button>
        ) : (
          <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {summary}
          </p>
        )}
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className="ml-auto rounded-sm text-body-sm text-foreground-secondary underline-offset-2 transition-state hover:text-foreground hover:underline focus-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          {backLabel}
        </button>
      </div>

      <ol aria-label="Imported rows" className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const problem = problemOf(row);
          const label = rowLabelFor(
            row.line,
            labelMode,
            row.line === null ? ++newOrdinal : newOrdinal
          );
          const dupNote = notes.get(row.key);
          const note: RowProblem | undefined = dupNote
            ? { field: "term", message: dupNote, tone: "warning" }
            : undefined;
          return (
            <li key={row.key}>
              <ManualRow
                row={row}
                index={index}
                label={label}
                errors={problem ? { [problem.field]: problem.message } : undefined}
                problem={note}
                onRemove={() => removeRow(row.key)}
                registerInput={(field, el) => {
                  const id = `${row.key}:${field}`;
                  if (el) inputs.current.set(id, el);
                  else inputs.current.delete(id);
                }}
                onChange={(patch) => updateRow(row.key, patch)}
                onKeyDown={(event, field) => handleKeyDown(event, row, index, field)}
              />
            </li>
          );
        })}
      </ol>

      <button
        ref={addRowRef}
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
        {error ? (
          <p role="alert" className={formErrorClass}>
            {error}
          </p>
        ) : null}
        {confirm ?? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 basis-64 text-body-sm text-foreground-tertiary">
              Rows with problems are skipped unless you fix them. Duplicates are checked
              again on save.
            </p>
            <div className="ml-auto flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={onCancel}
                className={buttonSecondary}
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className={buttonPrimary}>
                {saving ? "Saving" : `Save ${plural(toSave, "card", "cards")}`}
              </button>
            </div>
          </div>
        )}
      </PanelFooter>
    </form>
  );
}
