/**
 * True when a key event comes from a field the user types into, so page-level
 * shortcuts (Review grading, the card viewer's Space and arrows) stay out of
 * the way.
 */
export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
