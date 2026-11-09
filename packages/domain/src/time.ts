/**
 * Local-day helper (AD-8). `User.timezone` (IANA) is the single source of
 * local-day truth; every "start of today" computation goes through here.
 */

/** The wall-clock time `instant` shows in `timeZone`, read as if it were UTC. */
function wallClockAsUtc(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(instant));
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
}

/**
 * The UTC instant at which the calendar day containing `now` began in
 * `timeZone` (an IANA name such as "Asia/Ho_Chi_Minh").
 */
export function toLocalCalendarDay(now: Date, timeZone: string): Date {
  const wallNow = wallClockAsUtc(now.getTime(), timeZone);
  const wallMidnight = Math.floor(wallNow / 86_400_000) * 86_400_000;
  // Offset (wall - real) at `now`; refine once so a DST change between local
  // midnight and `now` does not shift the result.
  let guess = now.getTime() - (wallNow - wallMidnight);
  const refined = wallClockAsUtc(guess, timeZone);
  guess += wallMidnight - refined;
  return new Date(guess);
}
