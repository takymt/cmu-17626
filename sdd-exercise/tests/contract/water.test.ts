import assert from "node:assert/strict";
import { test } from "node:test";
import { addPlant, type Client, household, section } from "../helpers.ts";

async function basil() {
  const ctx = await household();
  await addPlant(ctx.client, "Kitchen Basil", "kitchen", 3);
  return ctx;
}

const water = (client: Client, form: Record<string, string> = {}) =>
  client.post("/plants/1/water", { returnTo: "/", ...form });

async function wateringCount(client: Client): Promise<number> {
  const history = section((await client.get("/plants/1")).text, "history") ?? "";
  return history.match(/· watered ·/g)?.length ?? 0;
}

test("US2-3 FR-003 FR-007 FR-011: other members see who watered last", async () => {
  const { client } = await basil();
  await client.as("Bob");
  const res = await water(client);
  assert.equal(res.status, 303);
  assert.equal(res.location, "/");
  await client.as("Alice");
  assert.match((await client.get("/plants")).text, /last watered 2026-11-12 by Bob/);
});

test("US2-4 FR-012: a same-cycle watering asks for confirmation first", async () => {
  const { client } = await basil();
  await water(client);
  await client.as("Bob");
  const warning = await water(client);
  assert.equal(warning.status, 409);
  assert.match(warning.text, /Kitchen Basil was already watered by Alice at 2026-11-12 12:00\./);
  assert.match(warning.text, /name="confirm" value="yes"/);
  assert.match(warning.text, /name="expectedLastEventId" value="1"/);
  const confirmed = await water(client, { confirm: "yes", expectedLastEventId: "1" });
  assert.equal(confirmed.status, 303);
  assert.equal(await wateringCount(client), 2);
  assert.match(
    section((await client.get("/plants/1")).text, "history") ?? "",
    /confirmed duplicate/,
  );
});

test("US2-5 FR-012: cancelling the warning records nothing", async () => {
  const { client } = await basil();
  await water(client);
  await client.as("Bob");
  const warning = await water(client);
  assert.match(warning.text, /<a href="\/">Cancel<\/a>/);
  assert.equal(await wateringCount(client), 1);
});

test("FR-012: a confirmation based on stale data warns again", async () => {
  const { client } = await basil();
  await water(client);
  await client.as("Bob");
  const stale = await water(client, { confirm: "yes", expectedLastEventId: "99" });
  assert.equal(stale.status, 409);
  assert.match(stale.text, /already watered by Alice/);
  assert.equal(await wateringCount(client), 1);
});

test("FR-008: a future care time is rejected", async () => {
  const { client } = await basil();
  const res = await water(client, { at: "2026-11-13T08:00" });
  assert.equal(res.status, 400);
  assert.equal(await wateringCount(client), 0);
});

test("US2-2 FR-007 FR-009: the care time, not the entry time, sets the due date", async () => {
  const { client } = await basil();
  assert.equal((await water(client, { at: "2026-11-07T09:00" })).status, 303);
  assert.match(section((await client.get("/")).text, "attention") ?? "", /OVERDUE by 2 days/);
});

test("FR-006: archived plants cannot be watered", async () => {
  const { client } = await basil();
  await client.post("/plants/1/archive");
  assert.equal((await water(client)).status, 409);
});
