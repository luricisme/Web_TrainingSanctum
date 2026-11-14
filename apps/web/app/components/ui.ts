import type { ClassColor } from "@training-sanctum/domain";

/**
 * Shared class names for forms, buttons, tiles and text roles. Every value
 * comes from the token layer in globals.css: type roles (`text-body`,
 * `text-body-sm`, `text-overline`), `transition-state` (motion.normal,
 * ease-in-out) and `focus-ring`.
 */

/** The one actionable thing per screen: an ink pill with `on-accent` text. */
export const buttonPrimary =
  "rounded-full bg-accent px-6 py-3 text-body font-semibold text-on-accent shadow-low transition-state hover:bg-accent-hover focus-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-accent";

/** A paper pill on the panel: card surface, hairline border. */
export const buttonSecondary =
  "rounded-full border border-border bg-card px-6 py-3 text-body font-medium text-foreground shadow-low transition-state hover:border-foreground-tertiary hover:bg-row-hover focus-ring disabled:cursor-not-allowed disabled:opacity-60";

/** Danger action: error colour, never the accent. */
export const buttonDanger =
  "rounded-full border border-error bg-card px-6 py-3 text-body font-medium text-error transition-state hover:bg-row-hover focus-ring disabled:cursor-not-allowed disabled:opacity-40";

/** Quiet text-level action (e.g. Log out in Settings). */
export const buttonQuiet =
  "rounded-full px-4 py-2 text-body-sm font-medium text-foreground-secondary transition-state hover:bg-row-hover hover:text-foreground focus-ring disabled:cursor-not-allowed disabled:opacity-60";

export const labelClass = "text-body-sm font-medium text-foreground-secondary";

export const inputClass =
  "w-full rounded-md border border-border bg-background px-4 py-3 text-body text-foreground transition-state placeholder:text-foreground-tertiary focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent aria-[invalid=true]:border-error aria-[invalid=true]:focus:border-error";

export const fieldErrorClass = "break-words text-body-sm text-error";

/** Form-level error: plain, specific, with an error rule (DNA error_tone). */
export const formErrorClass =
  "break-words border-l-2 border-error py-1 pl-3 text-body-sm text-error";

export const linkClass =
  "font-medium text-foreground underline underline-offset-2 focus-ring";

/** Section eyebrows and group headers. */
export const overlineClass = "text-overline uppercase text-foreground-tertiary";

/**
 * Pastel tiles: the library lists (Classes, Folders, Flashcards) are grids of
 * tint cards. `tintAt(index)` cycles the five tints so neighbours differ; the
 * tint carries no meaning. Text on a tint is `foreground` /
 * `foreground-secondary`.
 */
const TINTS = [
  "bg-tint-sky border-tint-sky-border",
  "bg-tint-lavender border-tint-lavender-border",
  "bg-tint-butter border-tint-butter-border",
  "bg-tint-mint border-tint-mint-border",
  "bg-tint-rose border-tint-rose-border",
] as const;

export function tintAt(index: number): string {
  return TINTS[index % TINTS.length];
}

const CLASS_TINTS: Record<ClassColor, string> = {
  LAVENDER: "bg-tint-lavender border-tint-lavender-border",
  SKY: "bg-tint-sky border-tint-sky-border",
  MINT: "bg-tint-mint border-tint-mint-border",
  BUTTER: "bg-tint-butter border-tint-butter-border",
  ROSE: "bg-tint-rose border-tint-rose-border",
};

/** Story 6.4: a Class's colour drives its own tile and its Folder and Flashcard tiles. */
export function tintFor(color: ClassColor): string {
  return CLASS_TINTS[color];
}

/** Display names for the colour picker and menu (a name is never colour alone). */
export const CLASS_COLOR_LABELS: Record<ClassColor, string> = {
  LAVENDER: "Lavender",
  SKY: "Sky",
  MINT: "Mint",
  BUTTER: "Butter",
  ROSE: "Rose",
};

export const tileGridClass = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

/** Pair with `tintFor(color)`. The hover state is an ink border, no transform. */
export const tileClass =
  "flex min-h-24 items-start gap-3 rounded-lg border p-4 transition-state hover:border-foreground focus-within:border-foreground";

/** The round icon chip at the start of a tile or list row. */
export const tileIconClass =
  "flex size-10 shrink-0 items-center justify-center rounded-full bg-card/70 text-foreground";

/** Loading placeholder for one tile. */
export const tileSkeletonClass =
  "h-24 animate-pulse rounded-lg bg-elevated motion-reduce:animate-none";