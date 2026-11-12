import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addMember,
  addPlant,
  archivePlant,
  ConflictError,
  initHousehold,
  listEvents,
  NotFoundError,
  openDb,
  recordCorrection,
  recordWatering,
  StaleStateError,
} from "../../src/store.ts";
import { FIXED_NOW, NY, tempDbPath } from "../helpers.ts";

function setup() {
  const path = tempDbPath();
  const db = openDb(path);
  initHousehold(db, "Home", NY, FIXED_NOW);
  const alice = addMember(db, "Alice", FIXED_NOW);
  const bob = addMember(db, "Bob", FIXED_NOW);
  const plant = addPlant(
    db,
    { name: "Basil", location: "kitchen", intervalDays: 3 },
    alice,
    FIXED_NOW,
  );
  return { path, db, alice, bob, plant };
}

const at = { occurredAt: FIXED_NOW, now: FIXED_NOW };

test("US2-4 FR-012: near-simultaneous waterings cannot both skip the warning", () => {
  const { path, alice, bob, plant } = setup();
  const [a, b] = [openDb(path), openDb(path)];
  const first = recordWatering(a, {
    plantId: plant.id,
    member: alice,
    ...at,
    expectedLastEventId: null,
  });
  assert.throws(
    () => recordWatering(b, { plantId: plant.id, member: bob, ...at, expectedLastEventId: null }),
    StaleStateError,
  );
  assert.deepEqual(
    listEvents(b, plant.id).map((e) => e.id),
    [first.id],
  );
});

test("US2-4 FR-012 FR-018: a confirmed second watering is kept and flagged", () => {
  const { db, alice, bob, plant } = setup();
  const first = recordWatering(db, {
    plantId: plant.id,
    member: alice,
    ...at,
    expectedLastEventId: null,
  });
  const second = recordWatering(db, {
    plantId: plant.id,
    member: bob,
    ...at,
    expectedLastEventId: first.id,
    confirmedDuplicate: true,
  });
  assert.deepEqual(
    listEvents(db, plant.id).map((e) => [e.id, e.recordedBy, e.confirmedDuplicate]),
    [
      [first.id, "Alice", false],
      [second.id, "Bob", true],
    ],
  );
});

test("FR-012: the check and the insert hold SQLite's write lock", () => {
  const { path, alice, plant } = setup();
  const [holder, waiter] = [openDb(path), openDb(path)];
  waiter.exec("PRAGMA busy_timeout = 0");
  holder.exec("BEGIN IMMEDIATE");
  assert.throws(
    () =>
      recordWatering(waiter, {
        plantId: plant.id,
        member: alice,
        ...at,
        expectedLastEventId: null,
      }),
    /locked/,
  );
  holder.exec("ROLLBACK");
});

test("US2-6 FR-013 FR-018: corrections append without rewriting history", () => {
  const { db, alice, bob, plant } = setup();
  const first = recordWatering(db, {
    plantId: plant.id,
    member: alice,
    ...at,
    expectedLastEventId: null,
  });
  const correction = recordCorrection(db, first.id, bob, FIXED_NOW);
  assert.equal(correction.kind, "correction");
  assert.equal(correction.voidsEventId, first.id);
  assert.deepEqual(listEvents(db, plant.id), [first, correction]);
  assert.throws(() => recordCorrection(db, first.id, bob, FIXED_NOW), ConflictError);
  assert.throws(() => recordCorrection(db, correction.id, bob, FIXED_NOW), ConflictError);
  assert.throws(() => recordCorrection(db, 999, bob, FIXED_NOW), NotFoundError);
});

test("FR-006: archived plants take no new waterings", () => {
  const { db, alice, plant } = setup();
  archivePlant(db, plant.id, alice, FIXED_NOW);
  assert.throws(
    () =>
      recordWatering(db, { plantId: plant.id, member: alice, ...at, expectedLastEventId: null }),
    ConflictError,
  );
});
