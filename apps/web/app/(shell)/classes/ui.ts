/** The Classes screen uses the shared token-based classes in app/components/ui. */
export {
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  fieldErrorClass,
  inputClass,
  labelClass,
  overlineClass,
} from "@/app/components/ui";

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
