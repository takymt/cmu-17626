import assert from "node:assert/strict";
import { test } from "node:test";
import { addPlant, household } from "../helpers.ts";

test("US1-1 FR-004: a new plant appears in the shared list with its interval", async () => {
  const { client } = await household();
  const res = await client.post("/plants", {
    name: "Kitchen Basil",
    location: "kitchen",
    intervalDays: "3",
  });
  assert.equal(res.status, 303);
  assert.equal(res.location, "/plants/1");
  await client.as("Bob");
  const list = (await client.get("/plants")).text;
  assert.match(list, /\[1\] Kitchen Basil \(kitchen\)/);
  assert.match(list, /every 3 days/);
});

test("US1-2 FR-003 FR-005: an edited interval is visible to every member", async () => {
  const { client } = await household();
  const id = await addPlant(client, "Kitchen Basil", "kitchen", 3);
  await client.as("Bob");
  const res = await client.post(`/plants/${id}/edit`, {
    name: "Kitchen Basil",
    location: "kitchen",
    intervalDays: "5",
  });
  assert.equal(res.status, 303);
  await client.as("Alice");
  assert.match((await client.get("/plants")).text, /every 5 days/);
});

test("US1-3: a duplicate name and location warns and both plants keep distinct ids", async () => {
  const { client } = await household();
  const first = await addPlant(client, "Fern", "bathroom", 4);
  const res = await client.post("/plants", {
    name: "Fern",
    location: "bathroom",
    intervalDays: "4",
  });
  assert.equal(res.status, 303);
  const page = await client.get(res.location ?? "");
  assert.match(page.text, new RegExp(`class="notice">[^<]*\\[${first}\\]`));
  const list = (await client.get("/plants")).text;
  assert.match(list, /\[1\] Fern \(bathroom\)/);
  assert.match(list, /\[2\] Fern \(bathroom\)/);
});

test("US1-4 FR-006: archived plants are hidden unless all plants are requested", async () => {
  const { client } = await household();
  const id = await addPlant(client, "Old Cactus", "shelf", 14);
  assert.equal((await client.post(`/plants/${id}/archive`)).status, 303);
  assert.doesNotMatch((await client.get("/plants")).text, /Old Cactus/);
  assert.match((await client.get("/plants?all=1")).text, /Old Cactus \(shelf\)[\s\S]*archived/);
  assert.equal((await client.get(`/plants/${id}`)).status, 200);
});

test("FR-004: invalid plant input is rejected", async () => {
  const { client } = await household();
  const res = await client.post("/plants", {
    name: "Basil",
    location: "kitchen",
    intervalDays: "0",
  });
  assert.equal(res.status, 400);
  assert.match(res.text, /class="error"/);
  assert.equal((await client.get("/plants/99")).status, 404);
});
