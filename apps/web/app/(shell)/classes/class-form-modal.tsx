"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type ClassColor,
  classNameSchema,
  type ClassSummary,
  nextClassColor,
} from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { ColourPicker } from "@/app/components/colour-picker";
import { Modal } from "./modal";
import {
  buttonPrimary,
  buttonSecondary,
  fieldErrorClass,
  inputClass,
  labelClass,
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
        <ColourPicker
          name="class-color"
          value={color}
          onChange={setColor}
          autoFocusSelected={focusColour}
        />
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
