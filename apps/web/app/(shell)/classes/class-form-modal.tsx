"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CLASS_COLORS,
  type ClassColor,
  classNameSchema,
  type ClassSummary,
  nextClassColor,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Modal } from "./modal";
import {
  buttonPrimary,
  buttonSecondary,
  fieldErrorClass,
  CLASS_COLOR_LABELS,
  inputClass,
  labelClass,
  tintFor,
} from "./ui";

/**
 * Create (no `existing`) or edit (`existing`) a Class: name and colour.
 * `focusColour` opens it from the "Colour" menu item with the swatches focused.
 */
export function ClassFormModal({
  existing,
  focusColour = false,
  onClose,
}: {
  existing?: ClassSummary;
  focusColour?: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(existing?.name ?? "");
  const [color, setColor] = useState<ClassColor>(
    () =>
      existing?.color ??
      nextClassColor(queryClient.getQueryData<ClassSummary[]>(["classes"])?.length ?? 0)
  );
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: ({ value, color: picked }: { value: string; color: ClassColor }) =>
      existing
        ? apiFetch<ClassSummary>(`/api/classes/${existing.id}`, {
            method: "PATCH",
            json: { name: value, color: picked },
          })
        : apiFetch<ClassSummary>("/api/classes", {
            method: "POST",
            json: { name: value, color: picked },
          }),
    onSuccess: (saved) => {
      queryClient.setQueryData<ClassSummary[]>(["classes"], (current = []) =>
        existing
          ? current.map((c) => (c.id === saved.id ? saved : c))
          : [...current, saved].sort((a, b) => a.name.localeCompare(b.name))
      );
      void queryClient.invalidateQueries({ queryKey: ["classes"] });
      void queryClient.invalidateQueries({ queryKey: ["class-folders"] });
      void queryClient.invalidateQueries({ queryKey: ["folder"] });
      onClose();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? (err.fields?.name ?? err.message)
          : "Something went wrong. Try again."
      );
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = classNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a class name.");
      return;
    }
    save.mutate({ value: parsed.data, color });
  }

  return (
    <Modal title={existing ? (focusColour ? "Class colour" : "Rename class") : "Create class"} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="class-name" className={labelClass}>
            Class name
          </label>
          <input
            id="class-name"
            name="name"
            type="text"
            autoComplete="off"
            autoFocus={!focusColour}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "class-name-error" : undefined}
            className={inputClass}
          />
          {error ? (
            <p id="class-name-error" role="alert" className={fieldErrorClass}>
              {error}
            </p>
          ) : null}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className={labelClass}>Colour</legend>
          <div className="flex flex-wrap gap-2">
            {CLASS_COLORS.map((value) => (
              <label key={value} className="relative">
                <input
                  type="radio"
                  name="class-color"
                  value={value}
                  checked={color === value}
                  onChange={() => setColor(value)}
                  autoFocus={focusColour && color === value}
                  className="peer sr-only"
                />
                <span
                  className={`flex cursor-pointer items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 text-body-sm text-foreground transition-state hover:border-foreground peer-checked:border-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${tintFor(value)}`}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-6 items-center justify-center rounded-full bg-card/70"
                  >
                    {color === value ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    ) : null}
                  </span>
                  {CLASS_COLOR_LABELS[value]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className={buttonSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={save.isPending} className={buttonPrimary}>
            {existing ? "Save" : "Create class"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
