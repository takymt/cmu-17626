import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  daysBetween,
  isTimeZone,
  localDate,
  localDateTime,
  zonedToInstant,
} from "../../src/domain/time.ts";
import { NY } from "../helpers.ts";

test("FR-010: local dates use the household zone, not UTC", () => {
  const lateEvening = new Date("2026-11-12T04:30:00Z"); // 23:30 on Nov 11 in New York
  assert.equal(localDate(lateEvening, NY), "2026-11-11");
  assert.equal(localDateTime(lateEvening, NY), "2026-11-11 23:30");
  assert.equal(localDate(lateEvening, "UTC"), "2026-11-12");
});

test("FR-007, FR-010: local input times are interpreted in the household zone", () => {
  assert.equal(zonedToInstant("2026-11-12T08:00", NY).toISOString(), "2026-11-12T13:00:00.000Z");
  assert.equal(zonedToInstant("2026-07-01T08:00", NY).toISOString(), "2026-07-01T12:00:00.000Z");
});

test("FR-010: zoned parsing is correct on the daylight saving change day", () => {
  // 2026-11-01: clocks fall back from 02:00 EDT to 01:00 EST.
  assert.equal(zonedToInstant("2026-11-01T00:30", NY).toISOString(), "2026-11-01T04:30:00.000Z");
  assert.equal(zonedToInstant("2026-11-01T12:00", NY).toISOString(), "2026-11-01T17:00:00.000Z");
});

test("FR-007: malformed local times are rejected", () => {
  assert.throws(() => zonedToInstant("yesterday", NY));
});

test("FR-009: calendar day arithmetic crosses month ends", () => {
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(daysBetween("2026-10-30", "2026-11-02"), 3);
  assert.equal(daysBetween("2026-11-02", "2026-10-30"), -3);
});

test("FR-010: only valid IANA zones are accepted", () => {
  assert.equal(isTimeZone(NY), true);
  assert.equal(isTimeZone("Mars/Olympus"), false);
});
