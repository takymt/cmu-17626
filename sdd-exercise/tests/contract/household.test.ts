import assert from "node:assert/strict";
import { test } from "node:test";
import { getMember } from "../../src/store.ts";
import { household, NY, newApp } from "../helpers.ts";

test("FR-001: an uninitialized app sends every page to setup", async () => {
  const { client } = newApp();
  for (const path of ["/", "/plants", "/members"]) {
    const res = await client.get(path);
    assert.equal(res.status, 303);
    assert.equal(res.location, "/setup");
  }
  assert.equal((await client.get("/setup")).status, 200);
});

test("FR-001: setup creates the household and then manages members", async () => {
  const { client } = newApp();
  const res = await client.post("/setup", { name: "Home", timeZone: NY });
  assert.equal(res.status, 303);
  assert.equal(res.location, "/members");
  assert.equal((await client.post("/members", { name: "Alice" })).status, 303);
  assert.match((await client.get("/members")).text, /Alice/);
  assert.equal((await client.get("/setup")).location, "/");
});

test("FR-010: an invalid time zone re-renders setup with an error", async () => {
  const { client } = newApp();
  const res = await client.post("/setup", { name: "Home", timeZone: "Nowhere/Land" });
  assert.equal(res.status, 400);
  assert.match(res.text, /class="error"/);
});

test("FR-001: member names are unique", async () => {
  const { client } = await household();
  assert.equal((await client.post("/members", { name: "alice" })).status, 409);
});

test("FR-002: choosing a member sets who is acting", async () => {
  const { client } = await household();
  assert.match((await client.get("/")).text, /Acting as Alice/);
  await client.as("Bob");
  assert.match((await client.get("/")).text, /Acting as Bob/);
});

test("FR-002: writes need an active acting member", async () => {
  const { client, db } = await household();
  client.cookie = "";
  const anonymous = await client.post("/plants", {
    name: "Basil",
    location: "kitchen",
    intervalDays: "3",
  });
  assert.equal(anonymous.status, 403);
  await client.as("Bob");
  await client.post(`/members/${getMember(db, "Bob").id}/remove`);
  const removed = await client.post("/plants", {
    name: "Basil",
    location: "kitchen",
    intervalDays: "3",
  });
  assert.equal(removed.status, 403);
});
