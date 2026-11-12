import assert from "node:assert/strict";
import { test } from "node:test";
import {
  makeCareEvent,
  makeHousehold,
  makePlant,
  ValidationError,
} from "../../src/domain/models.ts";

const T0 = new Date("2026-11-01T00:00:00Z");
const plant = {
  id: 1,
  name: "Basil",
  location: "kitchen",
  intervalDays: 3,
  archived: false,
  createdAt: T0,
  createdBy: "Alice",
};
const event = {
  id: 1,
  plantId: 1,
  occurredAt: T0,
  recordedAt: T0,
  recordedBy: "Alice",
  bringInsideDate: null,
  voidsEventId: null,
  confirmedDuplicate: false,
};

test("FR-004: a plant has a name, a location, and an interval in days", () => {
  assert.deepEqual(makePlant(plant), plant);
});

test("FR-004: plant name and location are required and non-empty", () => {
  assert.throws(() => makePlant({ ...plant, name: "  " }), ValidationError);
  assert.throws(() => makePlant({ ...plant, location: "" }), ValidationError);
});

test("FR-004: the interval is an integer of at least 1", () => {
  assert.throws(() => makePlant({ ...plant, intervalDays: 0 }), ValidationError);
  assert.throws(() => makePlant({ ...plant, intervalDays: 1.5 }), ValidationError);
});

test("FR-010: the household time zone must be a valid IANA zone", () => {
  assert.throws(
    () => makeHousehold({ id: 1, name: "Home", timeZone: "Mars/Olympus", createdAt: T0 }),
    ValidationError,
  );
  assert.equal(
    makeHousehold({ id: 1, name: "Home", timeZone: "America/New_York", createdAt: T0 }).timeZone,
    "America/New_York",
  );
});

test("FR-014: moves outside and date changes, and only they, carry a bring-inside date", () => {
  assert.throws(() => makeCareEvent({ ...event, kind: "moved_outside" }), ValidationError);
  assert.throws(
    () => makeCareEvent({ ...event, kind: "watered", bringInsideDate: "2026-11-05" }),
    ValidationError,
  );
  const moved = makeCareEvent({ ...event, kind: "moved_outside", bringInsideDate: "2026-11-05" });
  assert.equal(moved.bringInsideDate, "2026-11-05");
});

test("FR-013: corrections, and only they, reference a voided event", () => {
  assert.throws(() => makeCareEvent({ ...event, kind: "correction" }), ValidationError);
  assert.throws(
    () => makeCareEvent({ ...event, kind: "watered", voidsEventId: 1 }),
    ValidationError,
  );
  assert.equal(makeCareEvent({ ...event, kind: "correction", voidsEventId: 1 }).voidsEventId, 1);
});
