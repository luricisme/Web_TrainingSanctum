"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IMPORT_DELIMITERS, type ImportDelimiter } from "@training-sanctum/domain";
import { formErrorClass, inputClass } from "@/app/components/ui";
import { buttonPrimary, buttonSecondary, labelClass } from "../../classes/ui";
import { PanelFooter } from "./panel-footer";

/**
 * Import → Paste (spec-3-1): delimiter picker, monospace paste box, Preview.
 * Nothing is saved here; Preview opens the review editor.
 */
export function ImportPaste({
  text,
  delimiter,
  onTextChange,
  onDelimiterChange,
  onPreview,
  onCancel,
  pending,
  error,
  confirm,
}: {
  text: string;
  delimiter: ImportDelimiter;
  onTextChange: (text: string) => void;
  onDelimiterChange: (delimiter: ImportDelimiter) => void;
  onPreview: () => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
  /** A discard confirmation shown in place of the footer actions. */
  confirm?: ReactNode;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onPreview();
      }}
      className="flex flex-col gap-6"
    >
      <SourceSwitcher />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="import-delimiter" className={labelClass}>
            Delimiter
          </label>
          <select
            id="import-delimiter"
            value={delimiter}
            onChange={(event) => onDelimiterChange(event.target.value as ImportDelimiter)}
            className="rounded-sm border border-border bg-background px-3 py-2 text-body-sm text-foreground transition-state focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent"
          >
            {IMPORT_DELIMITERS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="import-paste" className={labelClass}>
            Paste cards
          </label>
          <textarea
            id="import-paste"
            ref={textareaRef}
            value={text}
            spellCheck={false}
            rows={10}
            aria-describedby="import-paste-hint"
            aria-invalid={Boolean(error)}
            onChange={(event) => onTextChange(event.target.value)}
            className={`${inputClass} min-h-48 resize-y font-mono`}
          />
          <p id="import-paste-hint" className="text-body-sm text-foreground-tertiary">
            One card per line: term, delimiter, definition. Up to 200 lines.
          </p>
        </div>
      </div>

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
              <button
                type="button"
                disabled={pending}
                onClick={onCancel}
                className={buttonSecondary}
              >
                Cancel
              </button>
              <button type="submit" disabled={pending} className={buttonPrimary}>
                {pending ? "Reading rows" : "Preview"}
              </button>
            </div>
          </div>
        )}
      </PanelFooter>
    </form>
  );
}

/**
 * Paste / Upload file sub-tabs: a smaller neutral pill so the mode switcher
 * keeps the only accent pill (DESIGN.md Import mode). Upload lands in 3.2.
 */
function SourceSwitcher() {
  return (
    <div
      role="tablist"
      aria-label="Import source"
      className="flex gap-1 self-start rounded-full bg-elevated p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected="true"
        className="rounded-full bg-card px-4 py-1.5 text-body-sm font-medium text-foreground shadow-low focus-ring"
      >
        Paste
      </button>
      <button
        type="button"
        role="tab"
        aria-selected="false"
        disabled
        className="cursor-not-allowed rounded-full px-4 py-1.5 text-body-sm text-foreground-tertiary opacity-60"
      >
        Upload file
      </button>
    </div>
  );
}
