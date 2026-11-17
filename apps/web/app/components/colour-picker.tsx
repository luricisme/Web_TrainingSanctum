"use client";

import { CLASS_COLORS, type ClassColor } from "@training-sanctum/domain";
import { CLASS_COLOR_LABELS, labelClass, tintFor } from "./ui";

/**
 * The five-tint swatch picker (DESIGN.md tint-tile decision, Story 6.4): a
 * radio group of tint-filled pills, each with its colour name, the selected
 * one `text`-bordered and ticked. Shared by Classes and Planner Categories.
 */
export function ColourPicker({
  name,
  value,
  onChange,
  autoFocusSelected = false,
}: {
  /** Radio group name; unique per picker on the page. */
  name: string;
  value: ClassColor;
  onChange: (color: ClassColor) => void;
  autoFocusSelected?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={labelClass}>Colour</legend>
      <div className="flex flex-wrap gap-2">
        {CLASS_COLORS.map((option) => (
          <label key={option} className="relative">
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              autoFocus={autoFocusSelected && value === option}
              className="peer sr-only"
            />
            <span
              className={`flex cursor-pointer items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 text-body-sm text-foreground transition-state hover:border-foreground peer-checked:border-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${tintFor(option)}`}
            >
              <span
                aria-hidden="true"
                className="flex size-6 items-center justify-center rounded-full bg-card/70"
              >
                {value === option ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : null}
              </span>
              {CLASS_COLOR_LABELS[option]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
