/** Strip at the top of the user page, above the title (EXPERIENCE.md read-only banner): text on a tint, never the accent. */
export function ReadOnlyBanner({ email }: { email: string }) {
  return (
    <p
      role="note"
      className="mb-6 break-words rounded-md border border-tint-sky-border bg-tint-sky px-4 py-3 text-body-sm font-semibold text-foreground"
    >
      Read-only. You are viewing {email}&apos;s data.
    </p>
  );
}
