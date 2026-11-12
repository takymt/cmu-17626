import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..");
const SPEC = join(ROOT, "specs", "001-plant-care-tracking", "spec.md");

function specIds(): Set<string> {
  const ids = new Set<string>();
  let story = 0;
  for (const line of readFileSync(SPEC, "utf8").split("\n")) {
    const fr = line.match(/\*\*(FR-\d{3})\*\*/);
    if (fr?.[1]) ids.add(fr[1]);
    const heading = line.match(/^### User Story (\d+)/);
    if (heading) story = Number(heading[1]);
    else if (line.startsWith("### Edge Cases")) story = 0;
    const scenario = line.match(/^(\d+)\. \*\*Given\*\*/);
    if (story && scenario) ids.add(`US${story}-${scenario[1]}`);
  }
  return ids;
}

function idsCitedInTestNames(): Set<string> {
  const ids = new Set<string>();
  const files = readdirSync(join(ROOT, "tests"), { recursive: true, encoding: "utf8" });
  for (const file of files.filter((f) => f.endsWith(".test.ts"))) {
    const source = readFileSync(join(ROOT, "tests", file), "utf8");
    for (const [, name] of source.matchAll(/\btest\(\s*"([^"]+)"/g)) {
      for (const [id] of (name ?? "").matchAll(/FR-\d{3}|US\d+-\d+/g)) ids.add(id);
    }
  }
  return ids;
}

test("FR-001: the traceability check sees all 20 FRs and 19 scenarios", () => {
  const ids = [...specIds()];
  assert.equal(ids.filter((id) => id.startsWith("FR-")).length, 20);
  assert.equal(ids.filter((id) => id.startsWith("US")).length, 19);
});

test("Constitution I: every FR and acceptance scenario is named by a test", () => {
  const cited = idsCitedInTestNames();
  assert.deepEqual(
    [...specIds()].filter((id) => !cited.has(id)),
    [],
  );
});
