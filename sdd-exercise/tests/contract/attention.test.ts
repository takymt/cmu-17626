import assert from "node:assert/strict";
import { test } from "node:test";
import { addPlant, type Client, household, section } from "../helpers.ts";

/** Two overdue plants and two plants due to come inside. */
async function garden() {
  const ctx = await household();
  const plants: [string, string, number, string, string | null][] = [
    ["Fern", "bathroom", 4, "2026-11-07T09:00", null], // overdue by 1
    ["Basil", "kitchen", 3, "2026-11-06T09:00", null], // overdue by 3
    ["Mint", "patio", 30, "2026-11-11T09:00", "2026-11-12"], // bring in today
    ["Thyme", "patio", 30, "2026-11-11T09:00", "2026-11-10"], // 2 days late
  ];
  for (const [name, where, every, wateredAt, until] of plants) {
    const id = await addPlant(ctx.client, name, where, every);
    await ctx.client.post(`/plants/${id}/water`, { at: wateredAt, returnTo: "/" });
    if (until) {
      await ctx.client.post(`/plants/${id}/move-out`, { at: "2026-11-01T09:00", until });
    }
  }
  return ctx;
}

async function attentionNames(client: Client): Promise<string[]> {
  const text = section((await client.get("/")).text, "attention") ?? "";
  return [...text.matchAll(/\[\d+\] (\w+)/g)].map((m) => m[1] ?? "");
}

test("US4-1 FR-020: the attention section comes first, most urgent first", async () => {
  const { client } = await garden();
  const page = (await client.get("/")).text;
  assert.match(page, /<section id="attention" class="attention">/);
  const first = page.indexOf("<section");
  assert.equal(first, page.indexOf('<section id="attention"'));
  assert.deepEqual(await attentionNames(client), ["Basil", "Thyme", "Fern", "Mint"]);
});

test("US4-2 FR-020: bring-inside rows sit alongside overdue rows", async () => {
  const { client } = await garden();
  const text = section((await client.get("/")).text, "attention") ?? "";
  assert.match(text, /OVERDUE by 3 days/);
  assert.match(text, /BRING INSIDE \(due 2026-11-10\)/);
});

test("US4-3 FR-003 FR-020: recording the care removes the highlight for everyone", async () => {
  const { client } = await garden();
  await client.as("Bob");
  await client.post("/plants/2/water", { returnTo: "/" });
  await client.post("/plants/4/move-in");
  await client.as("Alice");
  assert.deepEqual(await attentionNames(client), ["Fern", "Mint"]);
});
