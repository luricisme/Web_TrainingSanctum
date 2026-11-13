"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CARD_SEPARATORS,
  IMPORT_CARD_LIMIT_MESSAGE,
  MAX_CUSTOM_SEPARATOR_LENGTH,
  MAX_IMPORT_CARDS,
  SEPARATOR_REQUIRED_MESSAGE,
  TERM_SEPARATORS,
  type ImportSeparators,
  type SeparatorChoice,
  type SeparatorField,
  countImportCards,
  resolveSeparators,
} from "@training-sanctum/domain";
import { fieldErrorClass, formErrorClass, inputClass } from "@/app/components/ui";
import { buttonPrimary, buttonSecondary, labelClass } from "../../classes/ui";
import { PanelFooter } from "./panel-footer";

/** Native select on the token layer; shared with the Upload mapping step. */
export const selectClass =
  "rounded-sm border border-border bg-background px-3 py-2 text-body-sm text-foreground transition-state focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent aria-[invalid=true]:border-error aria-[invalid=true]:focus:border-error";

const SEPARATOR_IDS: Record<SeparatorField, string> = {
  termSeparator: "import-term-separator",
  cardSeparator: "import-card-separator",
};

const customInputClass =
  "w-20 rounded-sm border border-border bg-background px-3 py-2 font-mono text-body-sm text-foreground transition-state focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent aria-[invalid=true]:border-error aria-[invalid=true]:focus:border-error";

/**
 * Import → Paste (spec-3-1, separators spec-3-1b): Quizlet-style term and card
 * separators, monospace paste box with a live card count, Preview. Nothing is
 * saved here; Preview opens the review editor.
 */
export function ImportPaste({
  text,
  separators,
  onTextChange,
  onSeparatorsChange,
  onPreview,
  onCancel,
  pending,
  error,
  confirm,
  switcher,
}: {
  text: string;
  separators: ImportSeparators;
  onTextChange: (text: string) => void;
  onSeparatorsChange: (separators: ImportSeparators) => void;
  onPreview: () => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
  /** A discard confirmation shown in place of the footer actions. */
  confirm?: ReactNode;
  /** The Paste / Upload file sub-tabs. */
  switcher: ReactNode;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // An empty Custom value is reported once Preview is pressed; clashing
  // separators are reported as soon as they clash.
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const { termSeparator, cardSeparator } = separators;
  const resolved = useMemo(
    () => resolveSeparators({ termSeparator, cardSeparator }),
    // Keyed on the choice values, not the object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [termSeparator.kind, termSeparator.custom, cardSeparator.kind, cardSeparator.custom]
  );
  const separatorError =
    !resolved.ok && (attempted || resolved.message !== SEPARATOR_REQUIRED_MESSAGE)
      ? resolved
      : null;
  const errorFor = (field: SeparatorField) =>
    separatorError?.field === field ? separatorError.message : null;

  const count = useMemo(
    () => countImportCards(text, cardSeparator),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, cardSeparator.kind, cardSeparator.custom]
  );
  const showCount = text.trim() !== "" && count !== null;
  const overLimit = showCount && count > MAX_IMPORT_CARDS;

  function changeSeparators(next: ImportSeparators) {
    // A new choice starts fresh: "Enter a separator." waits for the next Preview.
    setAttempted(false);
    onSeparatorsChange(next);
  }

  function handleSubmit() {
    if (!resolved.ok) {
      setAttempted(true);
      const id = SEPARATOR_IDS[resolved.field];
      const custom = separators[resolved.field].kind === "custom";
      document.getElementById(custom ? `${id}-custom` : id)?.focus();
      return;
    }
    onPreview();
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
      className="flex flex-col gap-6"
    >
      {switcher}

      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
          <SeparatorPicker
            id={SEPARATOR_IDS.termSeparator}
            label="Between term and definition"
            options={TERM_SEPARATORS}
            choice={separators.termSeparator}
            onChange={(next) => changeSeparators({ ...separators, termSeparator: next })}
            error={errorFor("termSeparator")}
          />
          <SeparatorPicker
            id={SEPARATOR_IDS.cardSeparator}
            label="Between cards"
            options={CARD_SEPARATORS}
            choice={separators.cardSeparator}
            onChange={(next) => changeSeparators({ ...separators, cardSeparator: next })}
            error={errorFor("cardSeparator")}
          />
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
            aria-describedby="import-paste-hint import-paste-count"
            aria-invalid={Boolean(error)}
            onChange={(event) => onTextChange(event.target.value)}
            className={`${inputClass} min-h-48 resize-y font-mono`}
          />
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p id="import-paste-hint" className="text-body-sm text-foreground-tertiary">
              Line breaks always start a new card. Up to {MAX_IMPORT_CARDS} cards.
            </p>
            <p
              id="import-paste-count"
              aria-live="polite"
              className={`text-body-sm tabular-nums ${
                overLimit ? "text-error" : "text-foreground-secondary"
              }`}
            >
              {showCount
                ? `${count} ${count === 1 ? "card" : "cards"} found${
                    overLimit ? `. ${IMPORT_CARD_LIMIT_MESSAGE}` : ""
                  }`
                : ""}
            </p>
          </div>
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
 * One labelled separator choice: a native select whose Custom option reveals
 * a short monospace input. The typed value is used literally.
 */
function SeparatorPicker<K extends string>({
  id,
  label,
  options,
  choice,
  onChange,
  error,
}: {
  id: string;
  label: string;
  options: readonly { id: K; label: string }[];
  choice: SeparatorChoice<K>;
  onChange: (choice: SeparatorChoice<K>) => void;
  error: string | null;
}) {
  const customRef = useRef<HTMLInputElement | null>(null);
  const focusCustom = useRef(false);
  const isCustom = choice.kind === "custom";
  const errorId = `${id}-error`;

  // Choosing Custom moves focus into its input.
  useEffect(() => {
    if (isCustom && focusCustom.current) customRef.current?.focus();
    focusCustom.current = false;
  }, [isCustom]);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={id}
          value={choice.kind}
          aria-invalid={Boolean(error) && !isCustom}
          aria-describedby={error && !isCustom ? errorId : undefined}
          onChange={(event) => {
            const kind = event.target.value as K;
            focusCustom.current = kind === "custom";
            onChange({ kind, custom: choice.custom ?? "" });
          }}
          className={selectClass}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {isCustom ? (
          <input
            id={`${id}-custom`}
            ref={customRef}
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={MAX_CUSTOM_SEPARATOR_LENGTH}
            aria-label={`Custom separator, ${label.toLowerCase()}`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            value={choice.custom ?? ""}
            onChange={(event) => onChange({ kind: choice.kind, custom: event.target.value })}
            className={customInputClass}
          />
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className={fieldErrorClass}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
