/** Pure time-zone helpers; callers always supply the instant and the zone. */

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function parts(instant: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(formatter.formatToParts(instant).map((p) => [p.type, p.value]));
}

/** Calendar date (YYYY-MM-DD) of the instant in the zone. */
export function localDate(instant: Date, timeZone: string): string {
  const p = parts(instant, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Display time (YYYY-MM-DD HH:mm) of the instant in the zone. */
export function localDateTime(instant: Date, timeZone: string): string {
  const p = parts(instant, timeZone);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

function offsetMs(instant: number, timeZone: string): number {
  const p = parts(new Date(instant), timeZone);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
  );
  return asUtc - Math.floor(instant / 60_000) * 60_000;
}

/** Interprets a local `YYYY-MM-DDTHH:mm` wall-clock time in the zone. */
export function zonedToInstant(local: string, timeZone: string): Date {
  const m = LOCAL_INPUT.exec(local);
  if (!m) throw new RangeError(`invalid local time: ${local}`);
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const wallClock = Date.UTC(y, mo - 1, d, h, mi);
  // The zone offset can differ at the guessed instant and the true one around
  // a daylight saving change, so correct once with the offset at the result.
  const first = wallClock - offsetMs(wallClock, timeZone);
  const second = wallClock - offsetMs(first, timeZone);
  return new Date(second);
}

export function isCalendarDate(value: string): boolean {
  const m = CALENDAR_DATE.exec(value);
  if (!m) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function toUtcMs(date: string): number {
  if (!isCalendarDate(date)) throw new RangeError(`invalid date: ${date}`);
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}
