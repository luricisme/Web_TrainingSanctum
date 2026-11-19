"use client";

import { useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pomodoroSettingsSchema, type PomodoroSettings } from "@training-sanctum/domain";
import { apiFetch } from "@/lib/api-client";
import { fieldErrorClass, formErrorClass, inputClass, labelClass } from "@/app/components/ui";

type Key = Exclude<keyof PomodoroSettings, "autoStartNext">;

const SETTINGS_KEY = ["planner", "settings"] as const;

const FIELDS: ReadonlyArray<{ key: Key; label: string }> = [
  { key: "focus", label: "Focus (min)" },
  { key: "shortBreak", label: "Short break (min)" },
  { key: "longBreak", label: "Long break (min)" },
  { key: "longBreakEvery", label: "Long break every (sessions)" },
];

/**
 * Pomodoro card body (spec-9-1): four number fields. A value saves on blur or
 * Enter when valid and changed; an out-of-range value shows a field error and
 * sends nothing; a failed save returns the field to the server value.
 */
export function PomodoroSettingsControl() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Partial<Record<Key, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const { data } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => apiFetch<PomodoroSettings>("/api/planner/settings"),
  });

  const save = useMutation({
    mutationKey: SETTINGS_KEY,
    // Saves run one at a time, so the last edit is the one stored.
    scope: { id: "planner-settings" },
    mutationFn: (patch: Partial<PomodoroSettings>) =>
      apiFetch<PomodoroSettings>("/api/planner/settings", { method: "PATCH", json: patch }),
    onMutate: async (patch) => {
      setStatus("idle");
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY });
      queryClient.setQueryData<PomodoroSettings>(SETTINGS_KEY, (old) =>
        old ? { ...old, ...patch } : old
      );
    },
    onError: () => {
      // Back to what the server really holds.
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      setStatus("error");
    },
    onSuccess: (saved) => {
      if (queryClient.isMutating({ mutationKey: SETTINGS_KEY }) <= 1) {
        queryClient.setQueryData(SETTINGS_KEY, saved);
      }
      setStatus("saved");
    },
  });

  const clearDraft = (key: Key) =>
    setDrafts((current) => {
      const rest = { ...current };
      delete rest[key];
      return rest;
    });

  const commit = (key: Key) => {
    const draft = drafts[key];
    if (draft === undefined || !data) return;
    const text = draft.trim();
    const value = text === "" ? Number.NaN : Number(text);
    const checked = pomodoroSettingsSchema.shape[key].safeParse(value);
    if (!checked.success) {
      setErrors((current) => ({ ...current, [key]: checked.error.issues[0].message }));
      setStatus("idle");
      return;
    }
    clearDraft(key);
    if (checked.data !== data[key]) save.mutate({ [key]: checked.data });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, key: Key) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commit(key);
  };

  return (
    <div className="flex w-full flex-col gap-2 sm:max-w-xl">
      <div
        role="group"
        aria-labelledby="pomodoro-title"
        aria-describedby="pomodoro-help"
        aria-busy={!data}
        className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4"
      >
        {FIELDS.map(({ key, label }) => {
          const id = `pomodoro-${key}`;
          const error = errors[key];
          const value = drafts[key] ?? (data ? String(data[key]) : "");
          return (
            <div key={key} className="flex flex-col gap-1">
              <label htmlFor={id} className={`${labelClass} min-h-10`}>
                {label}
              </label>
              <input
                id={id}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                disabled={!data}
                value={value}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(event) => {
                  const next = event.target.value;
                  setDrafts((current) => ({ ...current, [key]: next }));
                  setErrors((current) => {
                    const rest = { ...current };
                    delete rest[key];
                    return rest;
                  });
                }}
                onBlur={() => commit(key)}
                onKeyDown={(event) => onKeyDown(event, key)}
                className={`${inputClass} tabular-nums disabled:cursor-wait`}
              />
              {error ? (
                <p id={`${id}-error`} className={fieldErrorClass}>
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <span id="pomodoro-auto-start-label" className={labelClass}>
          Start the next session automatically?
        </span>
        <div
          role="radiogroup"
          aria-labelledby="pomodoro-auto-start-label"
          aria-busy={!data}
          className="inline-flex gap-1 rounded-full bg-elevated p-1"
        >
          {([true, false] as const).map((value) => {
            const active = (data?.autoStartNext ?? false) === value;
            return (
              <button
                key={String(value)}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!data}
                onClick={() => {
                  if (!active) save.mutate({ autoStartNext: value });
                }}
                className={`rounded-full px-4 py-1.5 text-body-sm font-semibold transition-state focus-ring disabled:cursor-wait ${
                  active
                    ? "bg-card text-foreground shadow-low"
                    : "text-foreground-secondary hover:text-foreground"
                }`}
              >
                {value ? "Yes" : "No"}
              </button>
            );
          })}
        </div>
      </div>
      <p aria-live="polite" className="min-h-5 text-body-sm text-foreground-tertiary">
        {status === "saved" ? "Saved" : ""}
      </p>
      {status === "error" ? (
        <p role="alert" className={formErrorClass}>
          Could not save your Pomodoro settings.
        </p>
      ) : null}
    </div>
  );
}
