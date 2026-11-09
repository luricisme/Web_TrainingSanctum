"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  cardInputSchema,
  type CardSummary,
  type FolderCardsResponse,
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
import { underlineInput } from "./add-cards-panel";

type Field = "term" | "definition" | "example" | "context" | "partOfSpeech";
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

const FIELDS: Field[] = ["term", "definition", "example", "context", "partOfSpeech"];

const FIELD_LABELS: Record<Field, string> = {
  term: "Term",
  definition: "Definition",
  example: "Example sentence",
  context: "Context / collocation",
  partOfSpeech: "Part of speech",
};

function toValues(card: CardSummary): Values {
  return {
    term: card.term,
    definition: card.definition,
    example: card.example ?? "",
    context: card.context ?? "",
    partOfSpeech: card.partOfSpeech ?? "",
  };
}

/** Edit a Card (spec-2-4): modal form over the shared `cardInputSchema`. */
export function EditCardModal({
  card,
  folderId,
  onClose,
}: {
  card: CardSummary;
  folderId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [initial] = useState(() => toValues(card));
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [more, setMore] = useState(
    Boolean(card.example || card.context || card.partOfSpeech)
  );
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const inputs = useRef(new Map<Field, HTMLInputElement>());

  const save = useMutation({
    mutationFn: (input: unknown) =>
      apiFetch<CardSummary>(`/api/cards/${card.id}`, { method: "PATCH", json: input }),
  });

  // The native dialog only accepts focus once Modal has opened it.
  useEffect(() => {
    inputs.current.get("term")?.focus();
  }, []);

  const dirty = FIELDS.some((f) => values[f] !== initial[f]);

  function requestClose() {
    if (save.isPending) return;
    if (dirty) setConfirmingDiscard(true);
    else onClose();
  }

  function change(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function showErrors(next: Errors) {
    setErrors(next);
    if (next.example || next.context || next.partOfSpeech) setMore(true);
    const first = FIELDS.find((f) => next[f]);
    if (first) {
      // Wait a frame so a freshly expanded field exists before focusing it.
      requestAnimationFrame(() => inputs.current.get(first)?.focus());
    }
  }

  function handleSave() {
    setFormError(null);
    const parsed = cardInputSchema.safeParse(values);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
        next[field] ??= issue.message;
      }
      showErrors(next);
      return;
    }
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: (updated) => {
        // Patch the cached row first so it shows the new text at once, then refetch.
        queryClient.setQueryData<FolderCardsResponse>(["folder", folderId], (old) =>
          old
            ? { ...old, cards: old.cards.map((c) => (c.id === updated.id ? updated : c)) }
            : old
        );
        void queryClient.invalidateQueries({ queryKey: ["folder", folderId] });
        onClose();
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 404) {
          // The Card is gone: refresh the list so it stops showing.
          void queryClient.invalidateQueries({ queryKey: ["folder", folderId] });
        }
        if (err instanceof ApiError && err.fields) {
          const next: Errors = {};
          for (const f of FIELDS) if (err.fields[f]) next[f] = err.fields[f];
          if (Object.keys(next).length > 0) {
            showErrors(next);
            return;
          }
        }
        setFormError(
          err instanceof ApiError && err.status === 404
            ? "This card no longer exists."
            : err instanceof ApiError
              ? err.message
              : "Something went wrong. Nothing was saved. Try again."
        );
      },
    });
  }

  function field(name: Field) {
    const id = `edit-card-${name}`;
    const error = errors[name];
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={id} className={overlineClass}>
          {FIELD_LABELS[name]}
        </label>
        <input
          id={id}
          ref={(el) => {
            if (el) inputs.current.set(name, el);
            else inputs.current.delete(name);
          }}
          type="text"
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          value={values[name]}
          onChange={(event) => change(name, event.target.value)}
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

  return (
    <Modal title="Edit card" size="wide" onClose={requestClose}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
        className="flex flex-col gap-6"
      >
        <div className="flex flex-col gap-4 rounded-md bg-elevated p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            {field("term")}
            {field("definition")}
          </div>
          {more ? (
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
              <div className="sm:col-span-2">{field("example")}</div>
              {field("context")}
              {field("partOfSpeech")}
            </div>
          ) : null}
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore((current) => !current)}
            className="self-start rounded-sm text-body-sm text-foreground-secondary underline-offset-2 transition-state hover:text-foreground hover:underline focus-ring"
          >
            {more ? "Fewer fields" : "More fields"}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {formError ? (
            <p role="alert" className={formErrorClass}>
              {formError}
            </p>
          ) : null}
          {confirmingDiscard ? (
            <div
              role="alertdialog"
              aria-label="Discard changes"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-body text-foreground">Discard your changes?</p>
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
