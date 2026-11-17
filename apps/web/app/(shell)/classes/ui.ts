/** The Classes screen uses the shared token-based classes in app/components/ui. */
export {
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  fieldErrorClass,
  inputClass,
  labelClass,
  overlineClass,
  tileClass,
  tileGridClass,
  tileIconClass,
  tileSkeletonClass,
  tintAt,
  tintFor,
  CLASS_COLOR_LABELS,
} from "@/app/components/ui";

/** UX-DR34: the member-count line of a destructive confirmation (call only when n > 0). */
export function membersStudying(n: number): string {
  return n === 1 ? "1 member is studying this." : `${n} members are studying this.`;
}

export function membersWillLose(n: number): string {
  return n === 1 ? "1 member will lose it." : `${n} members will lose it.`;
}

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
