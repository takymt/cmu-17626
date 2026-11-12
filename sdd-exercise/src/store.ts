/** SQLite persistence; the only module that touches node:sqlite. */

import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  type CareEvent,
  type EventKind,
  type Household,
  type Member,
  makeCareEvent,
  makeHousehold,
  makeMemberName,
  makePlant,
  type Plant,
  type PlantChange,
  ValidationError,
} from "./domain/models.ts";
import { lastWatering, location, validEvents } from "./domain/schedule.ts";
import { localDate } from "./domain/time.ts";

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
export class NotInitializedError extends StoreError {}
export class NotFoundError extends StoreError {}
export class ConflictError extends StoreError {}
/** The plant's history changed after the caller read it. */
export class StaleStateError extends ConflictError {}

type Row = Record<string, unknown>;

const SCHEMA = `
CREATE TABLE household (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE members (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE plants (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  interval_days INTEGER NOT NULL CHECK (interval_days >= 1),
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES members(id)
);
CREATE TABLE plant_changes (
  id INTEGER PRIMARY KEY,
  plant_id INTEGER NOT NULL REFERENCES plants(id),
  field TEXT NOT NULL,
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  changed_by INTEGER NOT NULL REFERENCES members(id)
);
CREATE TABLE care_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_id INTEGER NOT NULL REFERENCES plants(id),
  kind TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_by INTEGER NOT NULL REFERENCES members(id),
  bring_inside_date TEXT,
  voids_event_id INTEGER REFERENCES care_events(id),
  confirmed_duplicate INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX care_events_by_plant ON care_events (plant_id, id);
`;

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}

/** Runs `fn` holding SQLite's write lock, so checks and inserts cannot interleave. */
export function immediate<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function one(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): Row | undefined {
  return db.prepare(sql).get(...params) as Row | undefined;
}

export function all(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): Row[] {
  return db.prepare(sql).all(...params) as Row[];
}

export function run(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): number {
  return Number(db.prepare(sql).run(...params).lastInsertRowid);
}

export const text = (row: Row, key: string): string => String(row[key]);
export const int = (row: Row, key: string): number => Number(row[key]);
export const flag = (row: Row, key: string): boolean => Number(row[key]) === 1;
export const instant = (row: Row, key: string): Date => new Date(String(row[key]));

export function isInitialized(db: DatabaseSync): boolean {
  return (
    one(db, "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'household'") !== undefined
  );
}

export function initHousehold(
  db: DatabaseSync,
  name: string,
  timeZone: string,
  now: Date,
): Household {
  const household = makeHousehold({ id: 1, name, timeZone, createdAt: now });
  if (isInitialized(db)) throw new ConflictError("a household already exists in this database");
  immediate(db, () => {
    db.exec(SCHEMA);
    run(
      db,
      "INSERT INTO household (id, name, time_zone, created_at) VALUES (1, ?, ?, ?)",
      household.name,
      timeZone,
      now.toISOString(),
    );
  });
  return household;
}

export function getHousehold(db: DatabaseSync): Household {
  if (!isInitialized(db)) throw new NotInitializedError("the household is not set up yet");
  const row = one(db, "SELECT * FROM household") as Row;
  return makeHousehold({
    id: int(row, "id"),
    name: text(row, "name"),
    timeZone: text(row, "time_zone"),
    createdAt: instant(row, "created_at"),
  });
}

function toMember(row: Row): Member {
  return {
    id: int(row, "id"),
    name: text(row, "name"),
    active: flag(row, "active"),
    createdAt: instant(row, "created_at"),
  };
}

export function addMember(db: DatabaseSync, name: string, now: Date): Member {
  const clean = makeMemberName(name);
  if (one(db, "SELECT 1 FROM members WHERE name = ?", clean)) {
    throw new ConflictError(`member ${clean} already exists`);
  }
  const id = run(
    db,
    "INSERT INTO members (name, created_at) VALUES (?, ?)",
    clean,
    now.toISOString(),
  );
  return { id, name: clean, active: true, createdAt: now };
}

export function listMembers(db: DatabaseSync): Member[] {
  return all(db, "SELECT * FROM members ORDER BY id").map(toMember);
}

export function getMember(db: DatabaseSync, name: string): Member {
  const row = one(db, "SELECT * FROM members WHERE name = ?", name.trim());
  if (!row) throw new NotFoundError(`unknown member: ${name}`);
  return toMember(row);
}

export function getMemberById(db: DatabaseSync, id: number): Member {
  const row = one(db, "SELECT * FROM members WHERE id = ?", id);
  if (!row) throw new NotFoundError(`unknown member: #${id}`);
  return toMember(row);
}

export function removeMember(db: DatabaseSync, id: number): void {
  getMemberById(db, id);
  run(db, "UPDATE members SET active = 0 WHERE id = ?", id);
}

const PLANT_SELECT = `
SELECT p.*, m.name AS creator FROM plants p JOIN members m ON m.id = p.created_by
`;

function toPlant(row: Row): Plant {
  return makePlant({
    id: int(row, "id"),
    name: text(row, "name"),
    location: text(row, "location"),
    intervalDays: int(row, "interval_days"),
    archived: flag(row, "archived"),
    createdAt: instant(row, "created_at"),
    createdBy: text(row, "creator"),
  });
}

export type PlantFields = { name: string; location: string; intervalDays: number };

export function addPlant(db: DatabaseSync, fields: PlantFields, member: Member, now: Date): Plant {
  const draft = makePlant({
    id: 0,
    archived: false,
    createdAt: now,
    createdBy: member.name,
    ...fields,
  });
  const id = run(
    db,
    "INSERT INTO plants (name, location, interval_days, created_at, created_by) VALUES (?, ?, ?, ?, ?)",
    draft.name,
    draft.location,
    draft.intervalDays,
    now.toISOString(),
    member.id,
  );
  return getPlant(db, id);
}

export function getPlant(db: DatabaseSync, id: number): Plant {
  const row = one(db, `${PLANT_SELECT} WHERE p.id = ?`, id);
  if (!row) throw new NotFoundError(`unknown plant: #${id}`);
  return toPlant(row);
}

export function listPlants(db: DatabaseSync, includeArchived = false): Plant[] {
  const where = includeArchived ? "" : " WHERE p.archived = 0";
  return all(db, `${PLANT_SELECT}${where} ORDER BY p.id`).map(toPlant);
}

export function findActivePlants(db: DatabaseSync, name: string, location: string): Plant[] {
  return all(
    db,
    `${PLANT_SELECT} WHERE p.archived = 0 AND p.name = ? COLLATE NOCASE AND p.location = ? COLLATE NOCASE ORDER BY p.id`,
    name.trim(),
    location.trim(),
  ).map(toPlant);
}

const COLUMNS = {
  name: "name",
  location: "location",
  intervalDays: "interval_days",
  archived: "archived",
} as const;
type Field = keyof typeof COLUMNS;

function recordChange(
  db: DatabaseSync,
  plant: Plant,
  field: Field,
  value: string | number | boolean,
  member: Member,
  now: Date,
): void {
  run(
    db,
    `UPDATE plants SET ${COLUMNS[field]} = ? WHERE id = ?`,
    typeof value === "boolean" ? Number(value) : value,
    plant.id,
  );
  run(
    db,
    "INSERT INTO plant_changes (plant_id, field, old_value, new_value, changed_at, changed_by) VALUES (?, ?, ?, ?, ?, ?)",
    plant.id,
    field,
    String(plant[field]),
    String(value),
    now.toISOString(),
    member.id,
  );
}

export function activePlant(db: DatabaseSync, id: number): Plant {
  const plant = getPlant(db, id);
  if (plant.archived) throw new ConflictError(`[${plant.id}] ${plant.name} is archived`);
  return plant;
}

export function editPlant(
  db: DatabaseSync,
  id: number,
  changes: Partial<PlantFields>,
  member: Member,
  now: Date,
): Plant {
  return immediate(db, () => {
    const current = activePlant(db, id);
    const next = makePlant({ ...current, ...changes });
    for (const field of ["name", "location", "intervalDays"] as const) {
      if (next[field] !== current[field])
        recordChange(db, current, field, next[field], member, now);
    }
    return getPlant(db, id);
  });
}

export function archivePlant(db: DatabaseSync, id: number, member: Member, now: Date): void {
  immediate(db, () => {
    const current = getPlant(db, id);
    if (!current.archived) recordChange(db, current, "archived", true, member, now);
  });
}

export function plantChanges(db: DatabaseSync, plantId: number): PlantChange[] {
  return all(
    db,
    "SELECT c.*, m.name AS member FROM plant_changes c JOIN members m ON m.id = c.changed_by WHERE c.plant_id = ? ORDER BY c.id",
    plantId,
  ).map((row) => ({
    id: int(row, "id"),
    plantId: int(row, "plant_id"),
    field: text(row, "field"),
    oldValue: text(row, "old_value"),
    newValue: text(row, "new_value"),
    changedAt: instant(row, "changed_at"),
    changedBy: text(row, "member"),
  }));
}

const EVENT_SELECT = `
SELECT e.*, m.name AS member FROM care_events e JOIN members m ON m.id = e.recorded_by
`;

function toEvent(row: Row): CareEvent {
  return makeCareEvent({
    id: int(row, "id"),
    plantId: int(row, "plant_id"),
    kind: text(row, "kind") as EventKind,
    occurredAt: instant(row, "occurred_at"),
    recordedAt: instant(row, "recorded_at"),
    recordedBy: text(row, "member"),
    bringInsideDate: row.bring_inside_date === null ? null : text(row, "bring_inside_date"),
    voidsEventId: row.voids_event_id === null ? null : int(row, "voids_event_id"),
    confirmedDuplicate: flag(row, "confirmed_duplicate"),
  });
}

export function listEvents(db: DatabaseSync, plantId: number): CareEvent[] {
  return all(db, `${EVENT_SELECT} WHERE e.plant_id = ? ORDER BY e.id`, plantId).map(toEvent);
}

export function getEvent(db: DatabaseSync, id: number): CareEvent {
  const row = one(db, `${EVENT_SELECT} WHERE e.id = ?`, id);
  if (!row) throw new NotFoundError(`unknown event: #${id}`);
  return toEvent(row);
}

export type NewEvent = {
  plantId: number;
  kind: EventKind;
  member: Member;
  occurredAt: Date;
  now: Date;
  bringInsideDate?: string | null;
  voidsEventId?: number | null;
  confirmedDuplicate?: boolean;
};

export function insertEvent(db: DatabaseSync, e: NewEvent): CareEvent {
  const draft = makeCareEvent({
    id: 0,
    plantId: e.plantId,
    kind: e.kind,
    occurredAt: e.occurredAt,
    recordedAt: e.now,
    recordedBy: e.member.name,
    bringInsideDate: e.bringInsideDate ?? null,
    voidsEventId: e.voidsEventId ?? null,
    confirmedDuplicate: e.confirmedDuplicate ?? false,
  });
  const id = run(
    db,
    `INSERT INTO care_events (plant_id, kind, occurred_at, recorded_at, recorded_by,
       bring_inside_date, voids_event_id, confirmed_duplicate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    draft.plantId,
    draft.kind,
    draft.occurredAt.toISOString(),
    draft.recordedAt.toISOString(),
    e.member.id,
    draft.bringInsideDate,
    draft.voidsEventId,
    Number(draft.confirmedDuplicate),
  );
  return getEvent(db, id);
}

export type Watering = {
  plantId: number;
  member: Member;
  occurredAt: Date;
  now: Date;
  /** The last watering the member saw; a mismatch means someone else just watered. */
  expectedLastEventId: number | null;
  confirmedDuplicate?: boolean;
};

export function recordWatering(db: DatabaseSync, w: Watering): CareEvent {
  return immediate(db, () => {
    activePlant(db, w.plantId);
    const last = lastWatering(listEvents(db, w.plantId));
    if ((last?.id ?? null) !== w.expectedLastEventId) {
      throw new StaleStateError("the plant was just watered by someone else");
    }
    return insertEvent(db, { ...w, kind: "watered" });
  });
}

export function recordCorrection(
  db: DatabaseSync,
  eventId: number,
  member: Member,
  now: Date,
): CareEvent {
  return immediate(db, () => {
    const target = getEvent(db, eventId);
    if (target.kind === "correction") {
      throw new ConflictError(`#${eventId} is a correction and cannot be voided`);
    }
    if (!validEvents(listEvents(db, target.plantId)).some((e) => e.id === eventId)) {
      throw new ConflictError(`#${eventId} is already voided`);
    }
    return insertEvent(db, {
      plantId: target.plantId,
      kind: "correction",
      member,
      occurredAt: now,
      now,
      voidsEventId: eventId,
    });
  });
}

function checkBringInsideDate(db: DatabaseSync, from: Date, until: string): void {
  const earliest = localDate(from, getHousehold(db).timeZone);
  if (until < earliest) {
    throw new ValidationError(`the bring-inside date ${until} is before ${earliest}`);
  }
}

export type Move = {
  plantId: number;
  kind: "moved_outside" | "moved_inside";
  member: Member;
  occurredAt: Date;
  now: Date;
  bringInsideDate?: string | null;
};

export function recordMove(db: DatabaseSync, move: Move): CareEvent {
  const target = move.kind === "moved_outside" ? "outside" : "inside";
  return immediate(db, () => {
    const plant = activePlant(db, move.plantId);
    if (location(listEvents(db, plant.id)) === target) {
      throw new ConflictError(`[${plant.id}] ${plant.name} is already ${target}; nothing recorded`);
    }
    if (move.bringInsideDate) checkBringInsideDate(db, move.occurredAt, move.bringInsideDate);
    return insertEvent(db, move);
  });
}

export function changeBringInsideDate(
  db: DatabaseSync,
  change: { plantId: number; member: Member; now: Date; bringInsideDate: string },
): CareEvent {
  return immediate(db, () => {
    const plant = activePlant(db, change.plantId);
    if (location(listEvents(db, plant.id)) === "inside") {
      throw new ConflictError(`[${plant.id}] ${plant.name} is inside`);
    }
    checkBringInsideDate(db, change.now, change.bringInsideDate);
    return insertEvent(db, {
      ...change,
      kind: "bring_inside_date_changed",
      occurredAt: change.now,
    });
  });
}
