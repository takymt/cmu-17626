/** Pure care-status rules; callers supply the current time and household zone. */

import type { CareEvent, EventKind, Location, Plant, Status } from "./models.ts";
import { addDays, daysBetween, localDate } from "./time.ts";

const UPCOMING_DAYS = 2;
const DAY_MS = 86_400_000;

export type WateringStatus = Readonly<{
  status: Status;
  dueDate: string | null;
  daysOverdue: number;
  last: CareEvent | null;
}>;

/** Events still in force: corrections and the events they void are dropped. */
export function validEvents(events: readonly CareEvent[]): CareEvent[] {
  const voided = new Set(events.map((e) => e.voidsEventId).filter((id) => id !== null));
  return events.filter((e) => e.kind !== "correction" && !voided.has(e.id));
}

const isLater = (a: CareEvent, b: CareEvent): boolean =>
  a.occurredAt.getTime() > b.occurredAt.getTime() ||
  (a.occurredAt.getTime() === b.occurredAt.getTime() && a.id > b.id);

function latest(events: readonly CareEvent[], kinds: readonly EventKind[]): CareEvent | null {
  let found: CareEvent | null = null;
  for (const event of validEvents(events)) {
    if (kinds.includes(event.kind) && (found === null || isLater(event, found))) found = event;
  }
  return found;
}

export function lastWatering(events: readonly CareEvent[]): CareEvent | null {
  return latest(events, ["watered"]);
}

export function nextDue(plant: Plant, events: readonly CareEvent[], tz: string): string | null {
  // Calendar arithmetic keeps "due in N days" stable across daylight saving
  // changes, unlike adding N * 24 hours to the watering instant.
  const last = lastWatering(events);
  return last ? addDays(localDate(last.occurredAt, tz), plant.intervalDays) : null;
}

export function classify(
  plant: Plant,
  events: readonly CareEvent[],
  now: Date,
  tz: string,
): WateringStatus {
  const last = lastWatering(events);
  const dueDate = nextDue(plant, events, tz);
  if (dueDate === null) return { status: "due_today", dueDate, daysOverdue: 0, last };
  const daysUntil = daysBetween(localDate(now, tz), dueDate);
  if (daysUntil < 0) return { status: "overdue", dueDate, daysOverdue: -daysUntil, last };
  const status =
    daysUntil === 0 ? "due_today" : daysUntil <= UPCOMING_DAYS ? "upcoming" : "not_due";
  return { status, dueDate, daysOverdue: 0, last };
}

export function isSameCycle(plant: Plant, last: CareEvent | null, at: Date): boolean {
  return last !== null && at.getTime() - last.occurredAt.getTime() < plant.intervalDays * DAY_MS;
}

export function lastMove(events: readonly CareEvent[]): CareEvent | null {
  return latest(events, ["moved_outside", "moved_inside"]);
}

export function location(events: readonly CareEvent[]): Location {
  return lastMove(events)?.kind === "moved_outside" ? "outside" : "inside";
}

export function bringInsideDate(events: readonly CareEvent[]): string | null {
  const move = lastMove(events);
  if (move?.kind !== "moved_outside") return null;
  const dated = latest(events, ["moved_outside", "bring_inside_date_changed"]);
  return dated && !isLater(move, dated) ? dated.bringInsideDate : move.bringInsideDate;
}

/** Days past the bring-inside date (0 on the day itself), or null when not flagged. */
export function needsBringInside(
  plant: Plant,
  events: readonly CareEvent[],
  now: Date,
  tz: string,
): number | null {
  const due = plant.archived ? null : bringInsideDate(events);
  if (due === null) return null;
  const late = daysBetween(due, localDate(now, tz));
  return late >= 0 ? late : null;
}
