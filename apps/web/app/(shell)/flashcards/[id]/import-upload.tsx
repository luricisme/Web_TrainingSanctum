"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  IMPORT_FIELDS,
  IMPORT_ROW_LIMIT_MESSAGE,
  MAP_COLUMN_TWICE_MESSAGE,
  MAX_IMPORT_CARDS,
  type ImportColumnMapping,
  type ImportField,
  columnLetter,
  columnNames,
  importMappingProblems,
  parseImportTable,
} from "@training-sanctum/domain";
import { type Spreadsheet, readSpreadsheet } from "@/lib/read-spreadsheet";
import { fieldErrorClass, formErrorClass } from "@/app/components/ui";
import { buttonPrimary, buttonSecondary, labelClass, overlineClass } from "../../classes/ui";
import { FIELD_LABELS } from "./manual-row";
import { PanelFooter } from "./panel-footer";
import { selectClass } from "./import-paste";

const NOT_MAPPED = "";
const PREVIEW_ROWS = 3;
const ACCEPT =
  ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const selectId = (field: ImportField) => `import-map-${field}`;

/** Term and Definition share the first line, as in the Manual row editor. */
const FIELD_SPAN: Record<ImportField, string> = {
  term: "sm:col-span-3",
  definition: "sm:col-span-3",
  example: "sm:col-span-2",
  context: "sm:col-span-2",
  partOfSpeech: "sm:col-span-2",
};

const quietLinkClass =
  "rounded-sm text-body-sm text-foreground-secondary underline-offset-2 transition-state hover:text-foreground hover:underline focus-ring disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Import → Upload file (spec-3-2): a dashed drop zone, then the column-mapping
 * step (file name, sheet name for .xlsx, header checkbox, one select per Card
 * field and a live preview of the first rows). The file is read in the
 * browser; nothing is sent or saved until Preview.
 */
export function ImportUpload({
  spreadsheet,
  hasHeader,
  mapping,
  onLoad,
  onHasHeaderChange,
  onMappingChange,
  onPreview,
  onCancel,
  pending,
  error,
  confirm,
  switcher,
}: {
  spreadsheet: Spreadsheet | null;
  hasHeader: boolean;
  mapping: ImportColumnMapping;
  onLoad: (spreadsheet: Spreadsheet) => void;
  onHasHeaderChange: (hasHeader: boolean) => void;
  onMappingChange: (mapping: ImportColumnMapping) => void;
  onPreview: () => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
  /** A discard confirmation shown in place of the footer actions. */
  confirm?: ReactNode;
  /** The Paste / Upload file sub-tabs. */
  switcher: ReactNode;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const focusTermOnLoad = useRef(false);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragDepth, setDragDepth] = useState(0);
  // "Map a column to Term." waits for a Preview; a clash shows at once.
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!spreadsheet) chooseRef.current?.focus();
    // Only on entering the Upload view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (spreadsheet && focusTermOnLoad.current) {
      focusTermOnLoad.current = false;
      document.getElementById(selectId("term"))?.focus();
    }
  }, [spreadsheet]);

  const names = useMemo(
    () => (spreadsheet ? columnNames(spreadsheet.grid, hasHeader) : []),
    [spreadsheet, hasHeader]
  );
  const problems = useMemo(
    () => importMappingProblems(mapping, names.length),
    [mapping, names.length]
  );
  const rows = useMemo(
    () => (spreadsheet ? parseImportTable(spreadsheet.grid, { hasHeader, mapping }) : []),
    [spreadsheet, hasHeader, mapping]
  );
  const problemFor = (field: ImportField) => {
    const message = problems[field];
    if (!message) return null;
    return attempted || message === MAP_COLUMN_TWICE_MESSAGE ? message : null;
  };

  async function load(file: File | undefined) {
    if (!file || reading) return;
    setFileError(null);
    setReading(true);
    let result;
    try {
      result = await readSpreadsheet(file);
    } finally {
      setReading(false);
    }
    if (!result.ok) {
      setFileError(result.message);
      return;
    }
    setAttempted(false);
    focusTermOnLoad.current = true;
    onLoad(result.spreadsheet);
  }

  function openPicker() {
    fileInputRef.current?.click();
  }

  // Drops anywhere in the Upload view load the file instead of opening it in
  // the browser; the dashed zone only shows the drag-over state.
  function handleDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragDepth(0);
    void load(event.dataTransfer.files[0]);
  }

  function handleSubmit() {
    if (spreadsheet) {
      const first = IMPORT_FIELDS.find((field) => problems[field]);
      if (first) {
        setAttempted(true);
        document.getElementById(selectId(first))?.focus();
        return;
      }
    }
    onPreview();
  }

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={ACCEPT}
      aria-label="Choose a .csv or .xlsx file"
      tabIndex={-1}
      className="hidden"
      onChange={(event) => {
        void load(event.target.files?.[0]);
        // Choosing the same file again still fires a change.
        event.target.value = "";
      }}
    />
  );
  const fileErrorNote = fileError ? (
    <p id="import-file-error" role="alert" className={fieldErrorClass}>
      {fileError}
    </p>
  ) : null;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragDepth((d) => d + 1);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragDepth((d) => Math.max(0, d - 1))}
      onDrop={handleDrop}
      className="flex flex-col gap-6"
    >
      {switcher}
      {fileInput}

      {!spreadsheet ? (
        <div className="flex flex-col gap-2">
          <div
            data-drag-over={dragDepth > 0 ? "true" : undefined}
            className={`flex flex-col items-center gap-4 rounded-md border border-dashed px-6 py-12 text-center transition-state ${
              dragDepth > 0
                ? "border-foreground-tertiary bg-row-hover"
                : fileError
                  ? "border-error"
                  : "border-border"
            }`}
          >
            <p className="text-body text-foreground">Drop a .csv or .xlsx file here</p>
            <button
              ref={chooseRef}
              type="button"
              onClick={openPicker}
              disabled={reading}
              aria-describedby={`import-file-hint${fileError ? " import-file-error" : ""}`}
              className={buttonSecondary}
            >
              {reading ? "Reading file" : "Choose file"}
            </button>
            <p id="import-file-hint" className="max-w-lg text-body-sm text-foreground-tertiary">
              CSV saved as UTF-8, or Excel .xlsx (first sheet only). Up to 2 MB and{" "}
              {MAX_IMPORT_CARDS} rows.
            </p>
          </div>
          {fileErrorNote}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-elevated px-4 py-3 text-body-sm">
              <span className="min-w-0 break-all font-semibold text-foreground">
                {spreadsheet.fileName}
              </span>
              {spreadsheet.sheetName !== null ? (
                <span className="text-foreground-secondary">
                  Sheet “{spreadsheet.sheetName}”, the first sheet
                </span>
              ) : null}
              <button
                type="button"
                onClick={openPicker}
                disabled={reading || pending}
                className={`ml-auto ${quietLinkClass}`}
              >
                {reading ? "Reading file" : "Choose another file"}
              </button>
            </div>
            {fileErrorNote}
          </div>

          <label className="flex items-center gap-3 self-start text-body text-foreground">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(event) => onHasHeaderChange(event.target.checked)}
              className="size-4 accent-foreground focus-ring"
            />
            First row has column names
          </label>

          <fieldset className="flex flex-col gap-3">
            <legend className={`${overlineClass} mb-3`}>Map columns to card fields</legend>
            <div className="grid gap-4 sm:grid-cols-6 sm:gap-x-6">
              {IMPORT_FIELDS.map((field) => (
                <MappingSelect
                  key={field}
                  field={field}
                  names={names}
                  value={mapping[field]}
                  error={problemFor(field)}
                  className={FIELD_SPAN[field]}
                  onChange={(column) => onMappingChange({ ...mapping, [field]: column })}
                />
              ))}
            </div>
          </fieldset>

          <PreviewTable mapping={mapping} names={names} rows={rows} />
        </div>
      )}

      <PanelFooter>
        {error ? (
          <p role="alert" className={formErrorClass}>
            {error}
          </p>
        ) : null}
        {confirm ?? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 basis-64 text-body-sm text-foreground-tertiary">
              Nothing is saved yet. You review every row next.
            </p>
            <div className="ml-auto flex flex-wrap gap-3">
              <button type="button" disabled={pending} onClick={onCancel} className={buttonSecondary}>
                Cancel
              </button>
              <button type="submit" disabled={pending || reading} className={buttonPrimary}>
                {pending ? "Reading rows" : "Preview"}
              </button>
            </div>
          </div>
        )}
      </PanelFooter>
    </form>
  );
}

/** One Card field's column select: the file's columns plus "Not mapped". */
function MappingSelect({
  field,
  names,
  value,
  error,
  className,
  onChange,
}: {
  field: ImportField;
  names: string[];
  value: number | null;
  error: string | null;
  className: string;
  onChange: (column: number | null) => void;
}) {
  const id = selectId(field);
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <label htmlFor={id} className={labelClass}>
        {FIELD_LABELS[field]}
      </label>
      <select
        id={id}
        value={value === null ? NOT_MAPPED : String(value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) =>
          onChange(event.target.value === NOT_MAPPED ? null : Number(event.target.value))
        }
        className={`${selectClass} w-full`}
      >
        <option value={NOT_MAPPED}>Not mapped</option>
        {names.map((name, column) => (
          <option key={column} value={String(column)}>
            {/* Two columns with one name are told apart by their letter. */}
            {counts.get(name)! > 1 ? `${name} (${columnLetter(column)})` : name}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${id}-error`} className={fieldErrorClass}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The first data rows as they will import, under the mapped fields only. */
function PreviewTable({
  mapping,
  names,
  rows,
}: {
  mapping: ImportColumnMapping;
  names: string[];
  rows: ReturnType<typeof parseImportTable>;
}) {
  const fields = IMPORT_FIELDS.filter((field) => mapping[field] !== null && mapping[field]! < names.length);
  const overLimit = rows.length > MAX_IMPORT_CARDS;
  const shown = rows.slice(0, PREVIEW_ROWS);
  return (
    <section aria-labelledby="import-map-preview" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="import-map-preview" className={overlineClass}>
          Preview
        </h3>
        <p
          aria-live="polite"
          className={`text-body-sm tabular-nums ${overLimit ? "text-error" : "text-foreground-secondary"}`}
        >
          {rows.length === 0
            ? "No rows to import"
            : `First ${shown.length} of ${rows.length} ${rows.length === 1 ? "row" : "rows"}${
                overLimit ? `. ${IMPORT_ROW_LIMIT_MESSAGE}` : ""
              }`}
        </p>
      </div>
      {fields.length === 0 ? (
        <p className="text-body-sm text-foreground-tertiary">Map a column to see a preview.</p>
      ) : shown.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-divider">
          <table className="w-full border-collapse text-left text-body-sm">
            <thead className="bg-elevated">
              <tr>
                <th scope="col" className={`${overlineClass} w-20 px-3 py-2 font-semibold`}>
                  Row
                </th>
                {fields.map((field) => (
                  <th key={field} scope="col" className={`${overlineClass} px-3 py-2 font-semibold`}>
                    {FIELD_LABELS[field]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.line} className="border-t border-divider align-top">
                  <th scope="row" className="whitespace-nowrap px-3 py-2 font-normal text-foreground-tertiary">
                    Row {row.line}
                  </th>
                  {fields.map((field) => (
                    <td
                      key={field}
                      className="min-w-32 whitespace-pre-line break-words px-3 py-2 text-foreground"
                    >
                      {row[field] || <span className="text-foreground-tertiary">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
