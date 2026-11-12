import assert from "node:assert/strict";
import { test } from "node:test";
import { addPlant, type Client, household, section } from "../helpers.ts";

async function rosemary() {
  const ctx = await household();
  await addPlant(ctx.client, "Rosemary", "patio", 7);
  await ctx.client.post("/plants/1/water", { returnTo: "/" });
  return ctx;
}

const moveOut = (client: Client, form: Record<string, string>) =>
  client.post("/plants/1/move-out", form);
const plantPage = async (client: Client) => (await client.get("/plants/1")).text;
const overview = async (client: Client) => (await client.get("/")).text;

test("US3-1 FR-014: a move outside records who, when, and the bring-inside date", async () => {
  const { client } = await rosemary();
  await client.as("Bob");
  const res = await moveOut(client, { until: "2026-11-20" });
  assert.equal(res.status, 303);
  assert.equal(res.location, "/plants/1");
  const page = await plantPage(client);
  assert.match(section(page, "location") ?? "", /outside until 2026-11-20/);
  assert.match(
    section(page, "history") ?? "",
    /2026-11-12 12:00 · moved_outside · by Bob · until 2026-11-20/,
  );
});

test("FR-014: a move outside needs a bring-inside date on or after the move", async () => {
  const { client } = await rosemary();
  assert.equal((await moveOut(client, {})).status, 400);
  assert.equal((await moveOut(client, { until: "2026-11-11" })).status, 400);
});

test("US3-3 FR-014 FR-017: changing the date re-evaluates the flag", async () => {
  const { client } = await rosemary();
  await moveOut(client, { until: "2026-11-30" });
  assert.doesNotMatch(section(await overview(client), "attention") ?? "", /BRING INSIDE/);
  await client.as("Bob");
  const res = await client.post("/plants/1/bring-inside-date", { until: "2026-11-12" });
  assert.equal(res.status, 303);
  assert.match(section(await overview(client), "attention") ?? "", /BRING INSIDE/);
  assert.match(
    section(await plantPage(client), "history") ?? "",
    /bring_inside_date_changed · by Bob · until 2026-11-12/,
  );
});

test("US3-4 FR-014 FR-017: moving inside clears the flag and is in history", async () => {
  const { client } = await rosemary();
  await moveOut(client, { until: "2026-11-12" });
  assert.match(section(await overview(client), "attention") ?? "", /BRING INSIDE/);
  assert.equal((await client.post("/plants/1/move-in")).status, 303);
  assert.equal(section(await overview(client), "attention"), null);
  assert.match(section(await plantPage(client), "history") ?? "", /moved_inside · by Alice/);
});

test("US3-5 FR-016: moving a plant to where it already is records nothing", async () => {
  const { client } = await rosemary();
  const inside = await client.post("/plants/1/move-in");
  assert.equal(inside.status, 409);
  assert.match(inside.text, /already inside/);
  await moveOut(client, { until: "2026-11-20" });
  await client.as("Bob");
  const outside = await moveOut(client, { until: "2026-11-20" });
  assert.equal(outside.status, 409);
  assert.match(outside.text, /already outside/);
  const history = section(await plantPage(client), "history") ?? "";
  assert.equal(history.match(/moved_outside/g)?.length, 1);
});

test("FR-014: only an outside plant has a bring-inside date to change", async () => {
  const { client } = await rosemary();
  assert.equal(
    (await client.post("/plants/1/bring-inside-date", { until: "2026-11-20" })).status,
    409,
  );
});

test("FR-015 FR-017 FR-019: the overview lists outside plants and flags late ones", async () => {
  const { client } = await rosemary();
  await client.as("Bob");
  await moveOut(client, { at: "2026-10-01T09:00", until: "2026-11-12" });
  const page = await overview(client);
  assert.equal(section(page, "outside"), "Outside [1] Rosemary (patio) · bring inside 2026-11-12");
  assert.equal(
    section(page, "attention"),
    "Needs attention [1] Rosemary (patio) · BRING INSIDE (due 2026-11-12) · outside since 2026-10-01 by Bob",
  );
});
