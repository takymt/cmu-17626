import assert from "node:assert/strict";
import { test } from "node:test";
import type { CareEvent, EventKind, Plant } from "../../src/domain/models.ts";
import {
  bringInsideDate,
  lastMove,
  location,
  needsBringInside,
} from "../../src/domain/schedule.ts";
import { zonedToInstant } from "../../src/domain/time.ts";
import { FIXED_NOW, NY } from "../helpers.ts";

const ROSEMARY: Plant = {
  id: 1,
  name: "Rosemary",
  location: "patio",
  intervalDays: 7,
  archived: false,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  createdBy: "Bob",
};

function event(
  id: number,
  kind: EventKind,
  daysAgo: number,
  extra: Partial<CareEvent> = {},
): CareEvent {
  const at = new Date(FIXED_NOW.getTime() - daysAgo * 86_400_000);
  return {
    id,
    plantId: 1,
    kind,
    occurredAt: at,
    recordedAt: at,
    recordedBy: "Bob",
    bringInsideDate: null,
    voidsEventId: null,
    confirmedDuplicate: false,
    ...extra,
  };
}

const out = (id: number, daysAgo: number, until: string) =>
  event(id, "moved_outside", daysAgo, { bringInsideDate: until });

test("FR-015: a plant without moves is inside and never flagged", () => {
  assert.equal(location([]), "inside");
  assert.equal(bringInsideDate([]), null);
  assert.equal(needsBringInside(ROSEMARY, [], FIXED_NOW, NY), null);
});

test("US3-1 FR-014 FR-015: an outside plant shows its bring-inside date", () => {
  const events = [out(1, 3, "2026-11-14")];
  assert.equal(location(events), "outside");
  assert.equal(lastMove(events)?.id, 1);
  assert.equal(bringInsideDate(events), "2026-11-14");
  assert.equal(needsBringInside(ROSEMARY, events, FIXED_NOW, NY), null);
});

test("US3-2 FR-017: the flag is raised on the bring-inside date and after it", () => {
  assert.equal(needsBringInside(ROSEMARY, [out(1, 5, "2026-11-12")], FIXED_NOW, NY), 0);
  assert.equal(needsBringInside(ROSEMARY, [out(1, 5, "2026-11-10")], FIXED_NOW, NY), 2);
});

test("FR-017: the flag uses the household date, not the UTC date", () => {
  const evening = zonedToInstant("2026-11-11T20:00", NY); // already Nov 12 in UTC
  assert.equal(needsBringInside(ROSEMARY, [out(1, 5, "2026-11-12")], evening, NY), null);
});

test("US3-3 FR-014: a later date change replaces the bring-inside date", () => {
  const events = [
    out(1, 5, "2026-11-12"),
    event(2, "bring_inside_date_changed", 1, { bringInsideDate: "2026-11-15" }),
  ];
  assert.equal(bringInsideDate(events), "2026-11-15");
  assert.equal(needsBringInside(ROSEMARY, events, FIXED_NOW, NY), null);
});

test("US3-4 FR-017: moving the plant inside clears the flag", () => {
  const events = [out(1, 5, "2026-11-12"), event(2, "moved_inside", 0)];
  assert.equal(location(events), "inside");
  assert.equal(bringInsideDate(events), null);
  assert.equal(needsBringInside(ROSEMARY, events, FIXED_NOW, NY), null);
});

test("FR-013: a voided move no longer counts", () => {
  const events = [out(1, 5, "2026-11-12"), event(2, "correction", 0, { voidsEventId: 1 })];
  assert.equal(location(events), "inside");
});

test("FR-006: archived plants are never flagged", () => {
  const archived = { ...ROSEMARY, archived: true };
  assert.equal(needsBringInside(archived, [out(1, 5, "2026-11-12")], FIXED_NOW, NY), null);
});
