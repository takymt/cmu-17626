import assert from "node:assert/strict";
import { test } from "node:test";
import { addPlant, type Client, household, section } from "../helpers.ts";

async function water(client: Client, id: number, at: string) {
  const res = await client.post(`/plants/${id}/water`, { at, confirm: "yes", returnTo: "/" });
  assert.equal(res.status, 303, res.text);
}

test("US2-1 US2-2 US2-7 FR-010 FR-011 FR-019: the household overview sections", async () => {
  const { client } = await household();
  const basil = await addPlant(client, "Kitchen Basil", "kitchen", 3);
  await addPlant(client, "Fern", "bathroom", 4);
  const pothos = await addPlant(client, "Pothos", "living room", 7);
  const cactus = await addPlant(client, "Cactus", "shelf", 30);
  await water(client, basil, "2026-11-07T09:00");
  await client.as("Bob");
  await water(client, pothos, "2026-11-07T09:00");
  await water(client, cactus, "2026-11-11T09:00");
  const page = (await client.get("/")).text;
  assert.equal(
    section(page, "attention"),
    "Needs attention [1] Kitchen Basil (kitchen) · OVERDUE by 2 days · last watered 2026-11-07 by Alice Water",
  );
  assert.equal(section(page, "due-today"), "Due today [2] Fern (bathroom) · never watered Water");
  assert.equal(
    section(page, "upcoming"),
    "Upcoming [3] Pothos (living room) · due 2026-11-14 · last watered 2026-11-07 by Bob",
  );
  assert.doesNotMatch(page, /Cactus/);
});

test("FR-019: empty sections are omitted", async () => {
  const { client } = await household();
  await addPlant(client, "Fern", "bathroom", 4);
  const page = (await client.get("/")).text;
  assert.notEqual(section(page, "due-today"), null);
  assert.equal(section(page, "upcoming"), null);
  assert.equal(section(page, "attention"), null);
});

test("US2-2 FR-010: one day overdue is singular", async () => {
  const { client } = await household();
  const fern = await addPlant(client, "Fern", "bathroom", 4);
  await water(client, fern, "2026-11-07T09:00");
  assert.match(section((await client.get("/")).text, "attention") ?? "", /OVERDUE by 1 day ·/);
});

test("US1-4 FR-006: archived plants are not in the overview", async () => {
  const { client } = await household();
  const fern = await addPlant(client, "Fern", "bathroom", 4);
  await client.post(`/plants/${fern}/archive`);
  const page = (await client.get("/")).text;
  assert.doesNotMatch(page, /Fern/);
  assert.match(page, /Nothing needs care right now\./);
});
