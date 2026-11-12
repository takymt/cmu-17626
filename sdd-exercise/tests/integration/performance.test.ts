import assert from "node:assert/strict";
import { test } from "node:test";
import { addPlant, getMember, immediate } from "../../src/store.ts";
import { FIXED_NOW, household } from "../helpers.ts";

test("SC-003 FR-019: the overview of 100 plants and 10,000 events renders in under 1 s", async () => {
  const { db, client } = await household();
  const alice = getMember(db, "Alice");
  const insert = db.prepare(
    "INSERT INTO care_events (plant_id, kind, occurred_at, recorded_at, recorded_by) VALUES (?, 'watered', ?, ?, ?)",
  );
  immediate(db, () => {
    for (let i = 0; i < 100; i++) {
      const plant = addPlant(
        db,
        { name: `Plant ${i}`, location: "room", intervalDays: 1 + (i % 7) },
        alice,
        FIXED_NOW,
      );
      for (let n = 0; n < 100; n++) {
        const at = new Date(FIXED_NOW.getTime() - n * 3_600_000).toISOString();
        insert.run(plant.id, at, FIXED_NOW.toISOString(), alice.id);
      }
    }
  });
  const started = performance.now();
  const res = await client.get("/");
  const elapsed = performance.now() - started;
  assert.equal(res.status, 200);
  assert.ok(elapsed < 1000, `overview took ${elapsed.toFixed(0)} ms`);
});
