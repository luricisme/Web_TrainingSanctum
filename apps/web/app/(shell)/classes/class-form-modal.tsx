"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { classNameSchema, type ClassSummary } from "@training-sanctum/domain";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Modal } from "./modal";
import {
  buttonPrimary,
  buttonSecondary,
  fieldErrorClass,
  inputClass,
  labelClass,
} from "./ui";

/** Create (no `existing`) or rename (`existing`) a Class. */
export function ClassFormModal({
  existing,
  onClose,
}: {
  existing?: ClassSummary;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(existing?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (value: string) =>
      existing
        ? apiFetch<ClassSummary>(`/api/classes/${existing.id}`, {
            method: "PATCH",
            json: { name: value },
          })
        : apiFetch<ClassSummary>("/api/classes", {
            method: "POST",
            json: { name: value },
          }),
    onSuccess: (saved) => {
      queryClient.setQueryData<ClassSummary[]>(["classes"], (current = []) =>
        existing
          ? current.map((c) => (c.id === saved.id ? saved : c))
          : [...current, saved].sort((a, b) => a.name.localeCompare(b.name))
      );
      void queryClient.invalidateQueries({ queryKey: ["classes"] });
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
    save.mutate(parsed.data);
  }

  return (
    <Modal title={existing ? "Rename class" : "Create class"} onClose={onClose}>
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
            autoFocus
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
