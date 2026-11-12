import assert from "node:assert/strict";
import { test } from "node:test";
import type { CareEvent, Plant } from "../../src/domain/models.ts";
import {
  classify,
  isSameCycle,
  lastWatering,
  nextDue,
  validEvents,
} from "../../src/domain/schedule.ts";
import { zonedToInstant } from "../../src/domain/time.ts";
import { FIXED_NOW, NY } from "../helpers.ts";

const BASIL: Plant = {
  id: 1,
  name: "Basil",
  location: "kitchen",
  intervalDays: 3,
  archived: false,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  createdBy: "Alice",
};

const local = (wallClock: string): Date => zonedToInstant(wallClock, NY);

function watered(id: number, at: Date): CareEvent {
  return {
    id,
    plantId: 1,
    kind: "watered",
    occurredAt: at,
    recordedAt: at,
    recordedBy: "Alice",
    bringInsideDate: null,
    voidsEventId: null,
    confirmedDuplicate: false,
  };
}

function correction(id: number, target: number): CareEvent {
  return { ...watered(id, FIXED_NOW), kind: "correction", voidsEventId: target };
}

test("US2-7 FR-009: a plant that was never watered is due immediately", () => {
  const result = classify(BASIL, [], FIXED_NOW, NY);
  assert.equal(result.status, "due_today");
  assert.equal(result.last, null);
});

test("US2-1 FR-009 FR-010: due today three days after a watering with a 3-day interval", () => {
  const result = classify(BASIL, [watered(1, local("2026-11-09T09:00"))], FIXED_NOW, NY);
  assert.equal(result.status, "due_today");
  assert.equal(result.dueDate, "2026-11-12");
});

test("US2-2 FR-010: overdue by 2 days five days after the last watering", () => {
  const result = classify(BASIL, [watered(1, local("2026-11-07T18:00"))], FIXED_NOW, NY);
  assert.equal(result.status, "overdue");
  assert.equal(result.daysOverdue, 2);
});

test("FR-010: upcoming means due within the next 2 days", () => {
  const status = (wallClock: string) =>
    classify(BASIL, [watered(1, local(wallClock))], FIXED_NOW, NY).status;
  assert.equal(status("2026-11-10T08:00"), "upcoming");
  assert.equal(status("2026-11-11T08:00"), "upcoming");
  assert.equal(status("2026-11-12T08:00"), "not_due");
});

test("FR-010: the due date counts household calendar days, not UTC days", () => {
  const daily = { ...BASIL, intervalDays: 1 };
  // 23:30 on Nov 11 in New York is already Nov 12 in UTC.
  const result = classify(daily, [watered(1, local("2026-11-11T23:30"))], FIXED_NOW, NY);
  assert.equal(result.status, "due_today");
});

test("FR-009 FR-010: due dates stay on calendar days across the daylight saving change", () => {
  const daily = { ...BASIL, intervalDays: 1 };
  const events = [watered(1, local("2026-11-01T00:30"))]; // EDT, before the fall-back
  assert.equal(nextDue(daily, events, NY), "2026-11-02");
  assert.equal(classify(daily, events, local("2026-11-01T23:45"), NY).status, "upcoming");
});

test("US2-6 FR-013: corrected waterings no longer count", () => {
  const events = [
    watered(1, local("2026-11-07T09:00")),
    watered(2, local("2026-11-11T09:00")),
    correction(3, 2),
  ];
  assert.deepEqual(
    validEvents(events).map((e) => e.id),
    [1],
  );
  assert.equal(lastWatering(events)?.id, 1);
  assert.equal(classify(BASIL, events, FIXED_NOW, NY).status, "overdue");
});

test("FR-007: a back-dated watering does not replace a later one", () => {
  const later = watered(1, local("2026-11-11T09:00"));
  const backdated = watered(2, local("2026-11-08T09:00"));
  assert.equal(lastWatering([later, backdated])?.id, 1);
});

test("US1-2 FR-005 FR-009: changing the interval moves the due date", () => {
  const events = [watered(1, local("2026-11-08T09:00"))];
  assert.equal(classify(BASIL, events, FIXED_NOW, NY).status, "overdue");
  assert.equal(classify({ ...BASIL, intervalDays: 5 }, events, FIXED_NOW, NY).status, "upcoming");
});

test("US2-4 FR-012: a watering within one interval of the last is a same-cycle watering", () => {
  const threeDaysAgo = watered(1, new Date(FIXED_NOW.getTime() - 3 * 86_400_000));
  assert.equal(isSameCycle(BASIL, null, FIXED_NOW), false);
  assert.equal(isSameCycle(BASIL, threeDaysAgo, FIXED_NOW), false);
  assert.equal(isSameCycle(BASIL, threeDaysAgo, new Date(FIXED_NOW.getTime() - 60_000)), true);
});
