/**
 * Shared class names for forms, buttons and text roles. Every value comes from
 * the token layer in globals.css (DESIGN.md / Design DNA): type roles
 * (`text-body`, `text-body-sm`, `text-overline`), `transition-state`
 * (motion.normal, ease-in-out) and `focus-ring`.
 */

/** The one actionable thing per screen: accent fill with `on-accent` text. */
export const buttonPrimary =
  "rounded-md bg-accent px-6 py-3 text-body font-semibold text-on-accent transition-state hover:bg-accent-hover focus-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-accent";

export const buttonSecondary =
  "rounded-md border border-border px-6 py-3 text-body text-foreground-secondary transition-state hover:bg-row-hover hover:text-foreground focus-ring disabled:cursor-not-allowed disabled:opacity-60";

/** Danger action: error colour, never the accent (DESIGN.md Do's and Don'ts). */
export const buttonDanger =
  "rounded-md border border-error px-6 py-3 text-body text-error transition-state hover:bg-row-hover focus-ring disabled:cursor-not-allowed disabled:opacity-40";

/** Quiet text-level action (e.g. Log out in Settings). */
export const buttonQuiet =
  "rounded-sm px-3 py-2 text-body-sm text-foreground-secondary transition-state hover:bg-row-hover hover:text-foreground focus-ring disabled:cursor-not-allowed disabled:opacity-60";

export const labelClass = "text-body-sm text-foreground-secondary";

export const inputClass =
  "w-full rounded-sm border border-border bg-background px-3 py-3 text-body text-foreground transition-state focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent aria-[invalid=true]:border-error aria-[invalid=true]:focus:border-error";

export const fieldErrorClass = "break-words text-body-sm text-error";

/** Form-level error: plain, specific, with an error rule (DNA error_tone). */
export const formErrorClass =
  "break-words border-l-2 border-error py-1 pl-3 text-body-sm text-error";

export const linkClass =
  "text-foreground underline underline-offset-2 focus-ring";

/** DESIGN.md `typography.overline`: section eyebrows and group headers. */
export const overlineClass = "text-overline uppercase text-foreground-tertiary";
