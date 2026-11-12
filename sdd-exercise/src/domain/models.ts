import { isCalendarDate, isTimeZone } from "./time.ts";

export type EventKind =
  | "watered"
  | "moved_outside"
  | "moved_inside"
  | "bring_inside_date_changed"
  | "correction";

export type Status = "overdue" | "due_today" | "upcoming" | "not_due";

export type Location = "inside" | "outside";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export type Household = Readonly<{
  id: number;
  name: string;
  timeZone: string;
  createdAt: Date;
}>;

export type Member = Readonly<{
  id: number;
  name: string;
  active: boolean;
  createdAt: Date;
}>;

export type Plant = Readonly<{
  id: number;
  name: string;
  location: string;
  intervalDays: number;
  archived: boolean;
  createdAt: Date;
  createdBy: string;
}>;

export type PlantChange = Readonly<{
  id: number;
  plantId: number;
  field: string;
  oldValue: string;
  newValue: string;
  changedAt: Date;
  changedBy: string;
}>;

export type CareEvent = Readonly<{
  id: number;
  plantId: number;
  kind: EventKind;
  occurredAt: Date;
  recordedAt: Date;
  recordedBy: string;
  /** Calendar date (YYYY-MM-DD) in the household zone. */
  bringInsideDate: string | null;
  voidsEventId: number | null;
  confirmedDuplicate: boolean;
}>;

function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(`${field} must not be empty`);
  return trimmed;
}

export function makeHousehold(fields: Household): Household {
  if (!isTimeZone(fields.timeZone)) {
    throw new ValidationError(`unknown time zone: ${fields.timeZone}`);
  }
  return Object.freeze({ ...fields, name: requireText(fields.name, "household name") });
}

export function makeMemberName(name: string): string {
  return requireText(name, "member name");
}

export function makePlant(fields: Plant): Plant {
  if (!Number.isInteger(fields.intervalDays) || fields.intervalDays < 1) {
    throw new ValidationError("watering interval must be a whole number of days, at least 1");
  }
  return Object.freeze({
    ...fields,
    name: requireText(fields.name, "plant name"),
    location: requireText(fields.location, "location"),
  });
}

const DATED_KINDS: ReadonlySet<EventKind> = new Set(["moved_outside", "bring_inside_date_changed"]);

export function makeCareEvent(fields: CareEvent): CareEvent {
  if (DATED_KINDS.has(fields.kind) !== (fields.bringInsideDate !== null)) {
    throw new ValidationError(
      "a bring-inside date is required for moves outside and date changes only",
    );
  }
  if (fields.bringInsideDate !== null && !isCalendarDate(fields.bringInsideDate)) {
    throw new ValidationError(`invalid date: ${fields.bringInsideDate}`);
  }
  if ((fields.kind === "correction") !== (fields.voidsEventId !== null)) {
    throw new ValidationError("only a correction references a voided event");
  }
  return Object.freeze({ ...fields });
}
