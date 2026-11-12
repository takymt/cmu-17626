import assert from "node:assert/strict";
import { test } from "node:test";
import { addPlant, household, section } from "../helpers.ts";

async function basil() {
  const ctx = await household();
  await addPlant(ctx.client, "Kitchen Basil", "kitchen", 3);
  return ctx;
}

test("US2-6 FR-013: a corrected watering stays in history but no longer counts", async () => {
  const { client } = await basil();
  await client.as("Bob");
  await client.post("/plants/1/water", { returnTo: "/" });
  const res = await client.post("/events/1/correct");
  assert.equal(res.status, 303);
  assert.equal(res.location, "/plants/1");
  const history = section((await client.get("/plants/1")).text, "history") ?? "";
  assert.match(history, /#1 · 2026-11-12 12:00 · watered · by Bob · voided/);
  assert.match(history, /#2 · 2026-11-12 12:00 · correction · by Bob · voids #1/);
  assert.match((await client.get("/plants")).text, /never watered/);
  assert.match(section((await client.get("/")).text, "due-today") ?? "", /Kitchen Basil/);
});

test("FR-013: corrections and already voided events cannot be voided; unknown ids are 404", async () => {
  const { client } = await basil();
  await client.post("/plants/1/water", { returnTo: "/" });
  await client.post("/events/1/correct");
  assert.equal((await client.post("/events/2/correct")).status, 409);
  assert.equal((await client.post("/events/1/correct")).status, 409);
  assert.equal((await client.post("/events/99/correct")).status, 404);
});

test("FR-018: history lists events oldest-first in household time", async () => {
  const { client } = await basil();
  await client.post("/plants/1/water", { returnTo: "/" });
  await client.as("Bob");
  await client.post("/plants/1/water", {
    at: "2026-11-10T07:15",
    confirm: "yes",
    expectedLastEventId: "1",
    returnTo: "/",
  });
  const history = section((await client.get("/plants/1")).text, "history") ?? "";
  assert.match(history, /#2 · 2026-11-10 07:15 · watered · by Bob.*#1 · 2026-11-12 12:00/);
});
