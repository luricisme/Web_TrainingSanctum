/** Shared class names for the Classes screen, all drawn from DESIGN.md tokens. */

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const buttonPrimary = `rounded-md bg-accent px-6 py-3 text-base font-bold leading-[1.5] text-on-accent transition-colors duration-150 ease-in-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

export const buttonSecondary = `rounded-md border border-border px-6 py-3 text-base leading-[1.5] text-foreground-secondary transition-colors duration-150 ease-in-out hover:bg-row-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

/** Danger action: error colour, never the accent (DESIGN.md Do's and Don'ts). */
export const buttonDanger = `rounded-md border border-error px-6 py-3 text-base leading-[1.5] text-error transition-colors duration-150 ease-in-out hover:bg-row-hover disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;

export const labelClass = "text-sm leading-[1.45] text-foreground-secondary";

export const inputClass =
  "w-full rounded-sm border border-border bg-background px-3 py-3 text-base text-foreground transition-colors duration-150 ease-in-out focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent aria-[invalid=true]:border-error aria-[invalid=true]:focus:border-error";

export const fieldErrorClass = "break-words text-sm leading-[1.45] text-error";

export const overlineClass =
  "text-[0.6875rem] font-semibold uppercase leading-[1.3] tracking-[0.08em] text-foreground-tertiary";

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
