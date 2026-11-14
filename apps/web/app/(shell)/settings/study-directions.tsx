"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  STUDY_DIRECTIONS,
  type SettingsResponse,
  type StudyDirections,
} from "@training-sanctum/domain";
import { apiFetch } from "@/lib/api-client";
import { formErrorClass } from "@/app/components/ui";

const LABELS: Record<StudyDirections, string> = {
  BOTH: "Both directions",
  TERM_TO_DEFINITION: "Term → Definition",
  DEFINITION_TO_TERM: "Definition → Term",
};

const SETTINGS_KEY = ["settings"] as const;

/**
 * Study directions control (FR-18, DESIGN.md components.mode-switcher reused):
 * a radio group pill, the selected option the one accent fill on Settings.
 * Saves on change with an optimistic select; a failed save rolls back.
 */
export function StudyDirectionsControl() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const { data } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => apiFetch<SettingsResponse>("/api/settings"),
  });

  const save = useMutation({
    mutationKey: SETTINGS_KEY,
    // Saves run one at a time, in the order chosen, so the last choice is the one stored.
    scope: { id: "settings" },
    mutationFn: (studyDirections: StudyDirections) =>
      apiFetch<SettingsResponse>("/api/settings", {
        method: "PATCH",
        json: { studyDirections },
      }),
    onMutate: async (studyDirections) => {
      setStatus("idle");
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY });
      queryClient.setQueryData<SettingsResponse>(SETTINGS_KEY, { studyDirections });
    },
    onError: () => {
      // Roll back to what the server really holds, not an unconfirmed optimistic value.
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      setStatus("error");
    },
    onSuccess: (saved) => {
      // A later queued save keeps its optimistic choice; only the last one writes the cache.
      if (queryClient.isMutating({ mutationKey: SETTINGS_KEY }) <= 1) {
        queryClient.setQueryData(SETTINGS_KEY, saved);
      }
      setStatus("saved");
      // The next queue load reads the new setting; a running session keeps its snapshot.
      void queryClient.invalidateQueries({ queryKey: ["flashcard"] });
      void queryClient.invalidateQueries({ queryKey: ["learn"] });
      void queryClient.invalidateQueries({ queryKey: ["review-queue"] });
    },
  });

  const selected = data?.studyDirections;
  const choose = (value: StudyDirections) => {
    if (value !== selected) save.mutate(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = STUDY_DIRECTIONS.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = index === last ? 0 : index + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = index === 0 ? last : index - 1;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = last;
    }
    if (next === null) return;
    event.preventDefault();
    buttons.current[next]?.focus();
    choose(STUDY_DIRECTIONS[next]);
  };

  // Roving focus: the checked option, or the first while loading.
  const focusIndex = Math.max(0, selected ? STUDY_DIRECTIONS.indexOf(selected) : 0);

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <div
        role="radiogroup"
        aria-labelledby="study-directions-title"
        aria-describedby="study-directions-help"
        aria-busy={!data}
        className="flex flex-col gap-1 rounded-lg bg-elevated p-1 sm:flex-row sm:rounded-full"
      >
        {STUDY_DIRECTIONS.map((value, index) => {
          const active = selected === value;
          return (
            <button
              key={value}
              ref={(el) => {
                buttons.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={index === focusIndex ? 0 : -1}
              disabled={!data}
              onClick={() => choose(value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              // history/focus-indigo/mockups/key-screens.html .mode-switch: 6px 16px, weight 600; taller rows when stacked for touch.
              className={`rounded-full px-4 py-3 text-body-sm font-semibold transition-state focus-ring sm:py-1.5 ${
                active
                  ? "bg-accent text-on-accent"
                  : "text-foreground-secondary hover:text-foreground disabled:cursor-wait"
              }`}
            >
              {LABELS[value]}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="min-h-5 text-body-sm text-foreground-tertiary">
        {status === "saved" ? "Saved" : ""}
      </p>
      {status === "error" ? (
        <p role="alert" className={formErrorClass}>
          Could not save your study directions. Your previous choice is kept. Try again.
        </p>
      ) : null}
    </div>
  );
}
