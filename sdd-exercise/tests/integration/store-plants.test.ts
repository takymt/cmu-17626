import assert from "node:assert/strict";
import { test } from "node:test";
import { ValidationError } from "../../src/domain/models.ts";
import {
  addMember,
  addPlant,
  archivePlant,
  editPlant,
  findActivePlants,
  getPlant,
  initHousehold,
  listPlants,
  NotFoundError,
  openDb,
  plantChanges,
} from "../../src/store.ts";
import { FIXED_NOW, NY, tempDbPath } from "../helpers.ts";

function setup() {
  const db = openDb(tempDbPath());
  initHousehold(db, "Home", NY, FIXED_NOW);
  const alice = addMember(db, "Alice", FIXED_NOW);
  return { db, alice };
}

const basil = { name: "Basil", location: "kitchen", intervalDays: 3 };

test("US1-1 FR-002 FR-004: a new plant is attributed to the member who added it", () => {
  const { db, alice } = setup();
  const plant = addPlant(db, basil, alice, FIXED_NOW);
  assert.equal(plant.createdBy, "Alice");
  assert.deepEqual(getPlant(db, plant.id), plant);
});

test("FR-004: invalid plants are rejected before storage", () => {
  const { db, alice } = setup();
  assert.throws(
    () => addPlant(db, { ...basil, intervalDays: 0 }, alice, FIXED_NOW),
    ValidationError,
  );
  assert.deepEqual(listPlants(db), []);
});

test("US1-2 FR-002 FR-005: edits update the plant and record who changed what", () => {
  const { db, alice } = setup();
  const plant = addPlant(db, basil, alice, FIXED_NOW);
  const later = new Date(FIXED_NOW.getTime() + 3_600_000);
  const edited = editPlant(db, plant.id, { location: "window", intervalDays: 5 }, alice, later);
  assert.equal(edited.location, "window");
  assert.equal(edited.intervalDays, 5);
  const changes = plantChanges(db, plant.id).map((c) => [c.field, c.oldValue, c.newValue]);
  assert.deepEqual(changes, [
    ["location", "kitchen", "window"],
    ["intervalDays", "3", "5"],
  ]);
  assert.ok(plantChanges(db, plant.id).every((c) => c.changedBy === "Alice"));
});

test("US1-4 FR-006: archived plants leave the active list but remain stored", () => {
  const { db, alice } = setup();
  const plant = addPlant(db, basil, alice, FIXED_NOW);
  archivePlant(db, plant.id, alice, FIXED_NOW);
  assert.deepEqual(listPlants(db), []);
  assert.deepEqual(
    listPlants(db, true).map((p) => [p.id, p.archived]),
    [[plant.id, true]],
  );
});

test("US1-3: same name and location among active plants is detected", () => {
  const { db, alice } = setup();
  const fern = addPlant(
    db,
    { name: "Fern", location: "bathroom", intervalDays: 4 },
    alice,
    FIXED_NOW,
  );
  assert.deepEqual(
    findActivePlants(db, "fern", "Bathroom").map((p) => p.id),
    [fern.id],
  );
  assert.deepEqual(findActivePlants(db, "Fern", "hall"), []);
});

test("FR-004: unknown plants are reported as not found", () => {
  const { db } = setup();
  assert.throws(() => getPlant(db, 99), NotFoundError);
});
