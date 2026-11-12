import assert from "node:assert/strict";
import { test } from "node:test";
import { ValidationError } from "../../src/domain/models.ts";
import {
  addMember,
  ConflictError,
  getHousehold,
  getMember,
  initHousehold,
  isInitialized,
  NotInitializedError,
  openDb,
  removeMember,
} from "../../src/store.ts";
import { FIXED_NOW, NY, tempDbPath } from "../helpers.ts";

test("FR-001: the shared database enforces foreign keys and waits for locks", () => {
  const db = openDb(tempDbPath());
  assert.equal(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
  assert.equal(db.prepare("PRAGMA busy_timeout").get()?.timeout, 5000);
});

test("FR-001: one household per database file", () => {
  const db = openDb(tempDbPath());
  assert.equal(isInitialized(db), false);
  assert.throws(() => getHousehold(db), NotInitializedError);
  assert.equal(initHousehold(db, "Home", NY, FIXED_NOW).id, 1);
  assert.equal(getHousehold(db).timeZone, NY);
  assert.throws(() => initHousehold(db, "Other", "UTC", FIXED_NOW), ConflictError);
});

test("FR-010: an invalid household zone leaves the database uninitialized", () => {
  const db = openDb(tempDbPath());
  assert.throws(() => initHousehold(db, "Home", "Nowhere/Land", FIXED_NOW), ValidationError);
  assert.equal(isInitialized(db), false);
});

test("FR-001: member names are unique regardless of case", () => {
  const db = openDb(tempDbPath());
  initHousehold(db, "Home", NY, FIXED_NOW);
  addMember(db, "Alice", FIXED_NOW);
  assert.throws(() => addMember(db, "alice", FIXED_NOW), ConflictError);
});

test("FR-002: a removed member stays on record as inactive", () => {
  const db = openDb(tempDbPath());
  initHousehold(db, "Home", NY, FIXED_NOW);
  const alice = addMember(db, "Alice", FIXED_NOW);
  removeMember(db, alice.id);
  const member = getMember(db, "alice");
  assert.equal(member.name, "Alice");
  assert.equal(member.active, false);
});
