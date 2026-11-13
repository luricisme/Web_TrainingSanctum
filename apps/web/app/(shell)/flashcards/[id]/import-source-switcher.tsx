"use client";

export type ImportSource = "paste" | "file";

/**
 * Paste / Upload file sub-tabs (DESIGN.md Import mode): a smaller neutral
 * pill, the active option a card-surface chip, so the mode switcher keeps the
 * only accent pill on screen.
 */
export function SourceSwitcher({
  source,
  onChange,
  disabled = false,
}: {
  source: ImportSource;
  onChange: (source: ImportSource) => void;
  disabled?: boolean;
}) {
  const option = (value: ImportSource, label: string) => {
    const selected = source === value;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        disabled={disabled && !selected}
        onClick={() => {
          if (!selected) onChange(value);
        }}
        className={
          selected
            ? "rounded-full bg-card px-4 py-1.5 text-body-sm font-medium text-foreground shadow-low focus-ring"
            : "rounded-full px-4 py-1.5 text-body-sm text-foreground-secondary transition-state hover:text-foreground focus-ring disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {label}
      </button>
    );
  };
  return (
    <div
      role="tablist"
      aria-label="Import source"
      className="flex gap-1 self-start rounded-full bg-elevated p-1"
    >
      {option("paste", "Paste")}
      {option("file", "Upload file")}
    </div>
  );
}
