"use client";

import type { KeyboardEvent } from "react";
import { fieldErrorClass, overlineClass } from "../../classes/ui";

export type Field = "term" | "definition" | "example" | "context" | "partOfSpeech";

export interface Row {
  key: number;
  term: string;
  definition: string;
  example: string;
  context: string;
  partOfSpeech: string;
  more: boolean;
}

export type RowErrors = Partial<Record<Field, string>>;

/** A non-blocking row note shown under a field, e.g. an import duplicate. */
export interface RowProblem {
  field: Field;
  message: string;
  tone: "error" | "warning";
}

export const FIELD_LABELS: Record<Field, string> = {
  term: "Term",
  definition: "Definition",
  example: "Example sentence",
  context: "Context / collocation",
  partOfSpeech: "Part of speech",
};

/** DESIGN.md `manual-row`: underlined field, underline turns accent on focus. */
export const underlineInput =
  "w-full rounded-none border-0 border-b-2 border-b-border bg-transparent px-0 py-2 text-body text-foreground transition-state placeholder:text-foreground-tertiary focus:border-b-accent focus:outline-none aria-[invalid=true]:border-b-error";

export function emptyRow(key: number): Row {
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

export function isBlank(row: Row): boolean {
  return (
    !row.term.trim() &&
    !row.definition.trim() &&
    !row.example.trim() &&
    !row.context.trim() &&
    !row.partOfSpeech.trim()
  );
}

/**
 * DESIGN.md `components.manual-row`, shared by Manual mode and the import
 * review editor. The review editor passes `label` (source line instead of the
 * index), `onRemove` (× button) and `problem` (inline note, e.g. a duplicate);
 * problem rows then carry a 2px left rule in the problem's colour.
 */
export function ManualRow({
  row,
  index,
  errors,
  registerInput,
  onChange,
  onKeyDown,
  label,
  onRemove,
  problem,
}: {
  row: Row;
  index: number;
  errors?: RowErrors;
  registerInput: (field: Field, el: HTMLInputElement | null) => void;
  onChange: (patch: Partial<Row>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>, field: Field) => void;
  /**
   * Visible label and its spoken name, e.g. `{ text: "L14", name: "line 14" }`.
   * Mono type only for numeric labels (DESIGN.md typography.mono); `wide`
   * fits word labels such as "Card 12".
   */
  label?: { text: string; name: string; numeric?: boolean; wide?: boolean };
  onRemove?: () => void;
  problem?: RowProblem;
}) {
  const name = label?.name ?? `row ${index + 1}`;
  const hasError = Boolean(errors && Object.values(errors).some(Boolean));

  function field(fieldName: Field) {
    const id = `row-${row.key}-${fieldName}`;
    const error = errors?.[fieldName];
    const note = problem?.field === fieldName ? problem : undefined;
    const describedBy =
      [error ? `${id}-error` : null, note ? `${id}-note` : null]
        .filter(Boolean)
        .join(" ") || undefined;
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={id} className={overlineClass}>
          {FIELD_LABELS[fieldName]}
        </label>
        <input
          id={id}
          ref={(el) => registerInput(fieldName, el)}
          type="text"
          autoComplete="off"
          aria-label={`${FIELD_LABELS[fieldName]}, ${name}`}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          value={row[fieldName]}
          onChange={(event) => onChange({ [fieldName]: event.target.value })}
          onKeyDown={(event) => onKeyDown(event, fieldName)}
          className={underlineInput}
        />
        {error ? (
          <p id={`${id}-error`} className={fieldErrorClass}>
            {error}
          </p>
        ) : null}
        {note ? (
          <p
            id={`${id}-note`}
            className={
              note.tone === "warning"
                ? "break-words text-body-sm text-warning"
                : fieldErrorClass
            }
          >
            {note.message}
          </p>
        ) : null}
      </div>
    );
  }

  // A row with an error in a collapsed field always shows those fields.
  const hiddenError = Boolean(
    errors?.example ||
      errors?.context ||
      errors?.partOfSpeech ||
      (problem && problem.field !== "term" && problem.field !== "definition")
  );
  const expanded = row.more || hiddenError;

  // Review rows mark problems with a 2px left rule (DESIGN.md Import mode).
  const rule = onRemove
    ? hasError || problem?.tone === "error"
      ? "border-l-2 border-l-error"
      : problem
        ? "border-l-2 border-l-warning"
        : "border-l-2 border-l-transparent"
    : "";

  return (
    <div
      data-row-problem={hasError || problem ? "true" : undefined}
      className={`flex gap-4 rounded-md bg-elevated p-4 ${rule}`}
    >
      <span
        aria-hidden="true"
        className={`${label?.wide ? "w-16" : label ? "w-10" : "w-6"} ${
          label?.numeric === false ? "" : "font-mono"
        } shrink-0 pt-6 text-body-sm text-foreground-tertiary`}
      >
        {label?.text ?? index + 1}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
          {field("term")}
          {field("definition")}
        </div>
        {expanded ? (
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            <div className="sm:col-span-2">{field("example")}</div>
            {field("context")}
            {field("partOfSpeech")}
          </div>
        ) : null}
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Fewer" : "More"} fields, ${name}`}
          onClick={() => onChange({ more: !row.more })}
          className="self-start rounded-sm text-body-sm text-foreground-secondary underline-offset-2 transition-state hover:text-foreground hover:underline focus-ring"
        >
          {expanded ? "Fewer fields" : "More fields"}
        </button>
      </div>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center self-start rounded-sm text-foreground-tertiary transition-state hover:text-foreground focus-ring"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
