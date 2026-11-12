# Quickstart: Household Plant Care Tracking

**Feature**: [spec.md](spec.md) | **HTTP contract**: [contracts/http.md](contracts/http.md)

This guide validates the feature end to end. Routes and status codes are defined in the
[HTTP contract](contracts/http.md); derived-state rules are defined in
[data-model.md](data-model.md).

## Prerequisites

- The repository devshell is active (`direnv allow` or `nix develop`), providing Node.js 24,
  pnpm, and Biome.
- Commands are run from `sdd-exercise/`.

```bash
pnpm install
```

## Automated validation

```bash
just check
```

Expected: Biome reports no lint or format issues, `tsc --noEmit` reports no errors, and every
`node --test` test passes.

## Manual walkthrough

```bash
PLANTCARE_DB="$(mktemp -d)/home.db" just dev
```

Then open <http://localhost:3000>.

| Step | Action | Expected outcome | Validates |
|------|--------|------------------|-----------|
| 1 | Submit the setup form: name `Home`, time zone `America/New_York` | Redirects to Members | FR-001 |
| 2 | Add members `Alice` and `Bob`; choose `Alice` in the header | The header shows "Acting as Alice" | FR-001, FR-002 |
| 3 | Add plant `Kitchen Basil`, location `kitchen`, every `3` days | The plant page opens; the plant list shows it with "never watered" | US1-1, FR-004 |
| 4 | Open the overview | Basil is under Due today, "never watered" | US2-7, FR-009 |
| 5 | On the plant page, record a watering with a time 5 days ago | The overview shows Basil under Needs attention, "OVERDUE by 2 days … by Alice" | US2-2, US4-1, FR-020 |
| 6 | Choose `Bob`; click **Water** on the overview row | Basil leaves Needs attention; the plant list shows "last watered … by Bob" | US2-3, SC-002 |
| 7 | Choose `Alice`; record a watering again | The confirmation page names Bob; **Cancel** records nothing | US2-4, US2-5, FR-012 |
| 8 | Move Basil outside until today | The overview shows Basil under Needs attention with "BRING INSIDE" and under Outside | US3-1, US3-2, FR-017 |
| 9 | Try to move Basil outside again | `409` page: already outside | US3-5, FR-016 |
| 10 | Move Basil inside | The bring-inside highlight disappears | US3-4, US4-3 |
| 11 | Click **Correct** on Bob's watering | History shows it as voided; the overview recomputes | US2-6, FR-013 |

## Scenario-to-test mapping

Each acceptance scenario MUST have at least one automated test (Principle II), and test names
cite the scenario and requirement IDs:

- US1 and FR-004–FR-006 → `tests/contract/plants.test.ts`
- US2, FR-009, FR-010, and FR-012 → `tests/unit/schedule-watering.test.ts`,
  `tests/contract/water.test.ts`, and `tests/contract/overview.test.ts`
- FR-013 and FR-018 → `tests/contract/history.test.ts`
- US3 and FR-014–FR-017 → `tests/unit/schedule-location.test.ts` and
  `tests/contract/moves.test.ts`
- US4 and FR-019–FR-020 → `tests/contract/attention.test.ts`
- Concurrency edge case → `tests/integration/store-concurrency.test.ts`
- Time zones and daylight saving → `tests/unit/time.test.ts`
- Requirement coverage → `tests/unit/traceability.test.ts`
