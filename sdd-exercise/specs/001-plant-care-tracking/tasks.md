---

description: "Task list for Household Plant Care Tracking (TypeScript web app)"
---

# Tasks: Household Plant Care Tracking

**Input**: Design documents from `specs/001-plant-care-tracking/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/http.md](contracts/http.md), [quickstart.md](quickstart.md)

**Tests**: REQUIRED. Constitution Principle II mandates writing tests first, observing them fail,
and mapping every acceptance scenario to at least one automated test.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Paths are relative to `sdd-exercise/`. The only file outside it is `../modules/sdd-exercise.nix`
  plus the extension option it uses in `../modules/devshell.nix` (constitution: minimal
  composition).
- Relative imports use explicit `.ts` extensions (Node type stripping).
- Every test name MUST start with the scenario and requirement IDs it verifies (for example,
  `test("US2-4 FR-012: …")`) to satisfy Constitution Principle I.
- `src/domain/` MUST NOT import `node:sqlite` or `hono`, and MUST NOT call `Date.now()` or
  `new Date()` without arguments (Constitution Principle IV).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Toolchain, project configuration, and test helpers

- [X] T001 Add a `devshell.packages` option (`listOf package`, default `[ ]`) to `../modules/devshell.nix` and append it to the default shell's packages; create `../modules/sdd-exercise.nix` setting `devshell.packages = [ pkgs.nodejs_24 pkgs.pnpm pkgs.biome pkgs.spec-kit ]`, and remove `pkgs.spec-kit` from `../modules/devshell.nix`
- [X] T002 Create `package.json` (`"type": "module"`, `"private": true`, `"engines": { "node": ">=24" }`) with dependencies `hono` and `@hono/node-server` and devDependencies `typescript` and `@types/node@24`; run `pnpm install` to produce `pnpm-lock.yaml`
- [X] T003 [P] Create `tsconfig.json` with `strict`, `noEmit`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, `noUncheckedIndexedAccess`, `module`/`moduleResolution` `nodenext`, `target` `es2024`, `types: ["node"]`, and `include: ["src", "tests"]`
- [X] T004 [P] Create `biome.json` (recommended lint rules, 2-space indent, line width 100, ignore `node_modules`)
- [X] T005 [P] Create `justfile` with recipes `lint` (`biome lint .`), `fmt` (`biome check --write .`), `fmt-check` (`biome format .`), `typecheck` (`tsc --noEmit -p .` through `pnpm exec`), `test` (`node --test "tests/**/*.test.ts"`), `check` (`biome ci .`, typecheck, test), and `dev` (`node src/web/server.ts`); create `.gitignore` ignoring `node_modules/` and `plantcare.db`
- [X] T006 Create `tests/helpers.ts` exporting `FIXED_NOW` (`2026-11-12T17:00:00Z`, noon in `America/New_York`), `tempDbPath()`, `newApp(now?)` (fresh database plus `createApp({ db, now })`), a `Client` class wrapping `app.request()` that keeps the `member` cookie and posts form bodies, `household(client)` (sets up `Home`/`America/New_York` with members Alice and Bob), and `section(html, id)` (the text of `<section id=…>` with tags stripped and whitespace collapsed)

**Checkpoint**: `node --test` runs with zero tests; `tsc --noEmit` and `biome ci .` pass

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain types, time helpers, database schema, household and member management, and the web frame every story builds on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests for Foundational (write first, confirm they FAIL)

- [X] T007 [P] Unit tests in `tests/unit/models.test.ts`: `makePlant` rejects an empty or blank name or location ("Required, non-empty") and an `intervalDays` that is not an "integer `>= 1`"; `makeHousehold` rejects an invalid IANA zone; `makeCareEvent` requires a `bringInsideDate` for exactly `moved_outside` and `bring_inside_date_changed`, and a `voidsEventId` for exactly `correction` (FR-004, FR-013, FR-014)
- [X] T008 [P] Unit tests in `tests/unit/time.test.ts`: `localDate` and `localDateTime` in `America/New_York` (including 23:30 local = next UTC day); `zonedToInstant("2026-11-12T08:00", NY)` = `13:00Z`, and correct across the 2026-11-01 fall-back; `addDays` and `daysBetween` across month ends; `isTimeZone` (FR-010)
- [X] T009 [P] Integration tests in `tests/integration/store-household.test.ts`: `openDb` enables `foreign_keys` and `busy_timeout` = 5000; `initHousehold` stores `id` 1 and fails if one exists; member names are "unique (case-insensitive) within the household"; `removeMember` sets `active` to false while `getMember` still returns the name (FR-001, FR-002)
- [X] T010 [P] Contract tests in `tests/contract/household.test.ts`: on an uninitialized database `GET /` → 303 `/setup`; `POST /setup` → 303 `/members`, and an invalid zone → 400 with `class="error"`; `POST /members` adds a member, and a duplicate → 409; `POST /members/:id/remove`; `POST /session` sets the `member` cookie and the header shows "Acting as Alice"; writes without a member, or as an inactive member → 403 (FR-001, FR-002)

### Implementation for Foundational

- [X] T011 [P] Implement `src/domain/models.ts`: `EventKind` and `Status` string-literal unions, `ValidationError`, the `Household`, `Member`, `Plant`, `PlantChange`, and `CareEvent` readonly types, and the validating constructors `makeHousehold`, `makePlant`, and `makeCareEvent` (T007)
- [X] T012 [P] Implement `src/domain/time.ts`: `isTimeZone`, `localDate`, `localDateTime`, `zonedToInstant`, `addDays`, and `daysBetween` using `Intl.DateTimeFormat` only (T008, research R7)
- [X] T013 Implement `src/store.ts`: `openDb(path)` with pragmas; a schema creating `household`, `members`, `plants`, `plant_changes`, and `care_events` (data-model.md) so that later stories need no migrations; `immediate(db, fn)` wrapping `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK`; `StoreError`, `NotInitializedError`, `ConflictError`, and `NotFoundError`; and `isInitialized`, `initHousehold`, `getHousehold`, `addMember`, `listMembers`, `getMember`, `getMemberById`, `removeMember` (depends on T011; T009)
- [X] T014 Implement `src/web/views.ts` base pieces with `hono/html`: `layout({ title, household, member, members, notice, error, body })` with a header member picker (`POST /session`), navigation (Overview, Plants, Members), and inline CSS including the red `.attention` style, plus `setupPage` and `membersPage` (depends on T011)
- [X] T015 Implement `src/web/app.ts`: `createApp({ db, now })` returning a Hono app with the setup redirect middleware, `member` cookie resolution, a `requireMember` helper (403 page), an `onError` mapping (`ValidationError` → 400, `NotFoundError` → 404, `ConflictError` → 409), and the routes `GET/POST /setup`, `GET/POST /members`, `POST /members/:id/remove`, `POST /session`, plus a placeholder `GET /` (depends on T013, T014; T010)
- [X] T016 Implement `src/web/server.ts` as the only caller of the real clock: open `process.env.PLANTCARE_DB ?? "plantcare.db"`, `createApp({ db, now: () => new Date() })`, and `serve` on `PORT` (default 3000) (depends on T015)

**Checkpoint**: T007–T010 pass; `just dev` serves the setup and members pages

---

## Phase 3: User Story 1 - Register plants with watering schedules (Priority: P1) 🎯 MVP

**Goal**: Members maintain one shared inventory of plants with intervals

**Independent Test**: Add plants as Alice, then list, edit, and archive them as Bob

### Tests for User Story 1 (write first, confirm they FAIL)

- [X] T017 [P] [US1] Integration tests in `tests/integration/store-plants.test.ts`: `addPlant` stores `createdBy`; `editPlant` writes one `plant_changes` row per changed field with old and new values, member, and time (FR-002, FR-005); `archivePlant` (FR-006); `findActivePlants(name, location)` matches case-insensitively; `getPlant` on an unknown id → `NotFoundError`
- [X] T018 [P] [US1] Contract tests in `tests/contract/plants.test.ts`: US1-1 (`POST /plants` → 303 to `/plants/:id`; `GET /plants` lists `[1] Kitchen Basil (kitchen)`, `every 3 days`; FR-004), US1-2 (Bob edits the interval to 5; Alice sees `every 5 days`; FR-003, FR-005), US1-3 (a duplicate name and location shows a warning notice naming the existing id; both rows are listed with distinct ids), US1-4 (archive hides the plant from `/plants` but `/plants?all=1` shows it as archived; its detail page still shows history), and invalid input (`intervalDays=0` → 400)

### Implementation for User Story 1

- [X] T019 [US1] Implement `addPlant`, `getPlant`, `listPlants(includeArchived)`, `findActivePlants`, `editPlant` (audit rows inside `immediate`), `archivePlant`, and `plantChanges` in `src/store.ts` (T017)
- [X] T020 [US1] Implement `plantsPage` and `plantPage` (attributes, edit form, archive button) in `src/web/views.ts`, and the routes `GET /plants`, `POST /plants`, `GET /plants/:id`, `POST /plants/:id/edit`, and `POST /plants/:id/archive` in `src/web/app.ts`, with the duplicate-name notice passed through a `notice` query parameter (depends on T019; T018)

**Checkpoint**: User Story 1 is fully functional; T017–T018 pass

---

## Phase 4: User Story 2 - Record watering and see what is due (Priority: P1)

**Goal**: Members record waterings; everyone sees overdue, due-today, and upcoming plants and who watered last; same-cycle waterings need confirmation; mistakes are corrected without losing history

**Independent Test**: Two members water plants (including back-dated waterings); the overview and plant list update; a same-cycle watering shows the confirmation page

**Depends on**: User Story 1

### Tests for User Story 2 (write first, confirm they FAIL)

- [X] T021 [P] [US2] Unit tests in `tests/unit/schedule-watering.test.ts`: `validEvents` drops corrections and voided events; `lastWatering` uses `(occurredAt, id)`; `nextDue` adds calendar days in the zone (including across the DST change); `classify` gives due today (US2-1), overdue by 2 (US2-2), upcoming within 2 days, not due, never watered = due today (US2-7), and responds to an interval change (US1-2); `isSameCycle` is true if and only if `t − w < intervalDays × 24 h` (FR-009, FR-010, FR-012)
- [X] T022 [P] [US2] Integration tests in `tests/integration/store-concurrency.test.ts`: two `DatabaseSync` connections both expecting no prior watering — the first `recordWatering` succeeds and the second throws `StaleStateError`, and the first event is kept; a confirmed second watering is stored with `confirmedDuplicate`; a writer with `busy_timeout = 0` fails with "locked" while another connection holds `BEGIN IMMEDIATE`; `recordCorrection` appends without changing the original row and rejects corrections, already voided events, and unknown ids; archived plants reject waterings (FR-006, FR-012, FR-013, FR-018)
- [X] T023 [P] [US2] Contract tests in `tests/contract/water.test.ts`: US2-3 (Bob's watering from the overview → 303 `/`; Alice's `/plants` shows `last watered 2026-11-12 by Bob`; FR-003, FR-007, FR-011), US2-4 (a second watering → 409 page with `Kitchen Basil was already watered by Bob at 2026-11-12 12:00.` and hidden `confirm=yes` and `expectedLastEventId`; re-posting records it, marked `confirmed duplicate` in history), US2-5 (without confirming, nothing is recorded; the Cancel link points to `returnTo`), a stale `expectedLastEventId` → 409 again, a future `at` → 400 (FR-008), a back-dated `at` drives the due date, and an archived plant → 409
- [X] T024 [P] [US2] Contract tests in `tests/contract/history.test.ts`: US2-6 (`POST /events/:id/correct` → 303 to the plant page; history shows the event as voided and the correction as `voids #1`; the plant returns to `never watered`; FR-013), invalid corrections → 409, an unknown event → 404, and history ordered oldest-first by occurrence time in the household zone (FR-018)
- [X] T025 [P] [US2] Contract tests in `tests/contract/overview.test.ts`: `section(html, "attention")` contains `OVERDUE by 2 days` and `last watered 2026-11-07 by Alice`; `due-today` contains `never watered` and a Water button; `upcoming` contains `due 2026-11-14`; not-due and archived plants are absent; empty sections are omitted; `OVERDUE by 1 day` is singular; an empty household shows `Nothing needs care right now.` (FR-006, FR-010, FR-011, FR-019)

### Implementation for User Story 2

- [X] T026 [US2] Implement `validEvents`, `lastWatering`, `nextDue`, `classify` (returning `{ status, dueDate, daysOverdue, last }`), and `isSameCycle` in `src/domain/schedule.ts` (T021)
- [X] T027 [US2] Implement `listEvents`, `getEvent`, `recordWatering({ plantId, member, occurredAt, now, expectedLastEventId, confirmedDuplicate })` (re-reads inside `immediate` and throws `StaleStateError`), and `recordCorrection` in `src/store.ts` (depends on T026; T022)
- [X] T028 [US2] Implement `POST /plants/:id/water` and `confirmWaterPage` in `src/web/app.ts` and `src/web/views.ts`, parsing `at` with `zonedToInstant` and rejecting future times (depends on T027; T023)
- [X] T029 [US2] Extend `plantPage` with a water form and the history table (with voided and confirmed-duplicate markers and a Correct button per eligible event), show last watered in `plantsPage`, and add `POST /events/:id/correct` (depends on T027; T024)
- [X] T030 [US2] Implement `overviewPage` and `GET /` with the `attention` (overdue rows), `due-today`, and `upcoming` sections and one-click Water buttons (`returnTo=/`) (depends on T026; T025)

**Checkpoint**: User Stories 1 and 2 work; quickstart steps 1–7 and 11 behave as documented

---

## Phase 5: User Story 3 - Track plants moved outside and know when to bring them in (Priority: P2)

**Goal**: Moves outside carry a bring-inside date; everyone sees outside plants and the ones to bring in

**Independent Test**: Move a plant out until today; it is flagged for every member; moving it in clears the flag

**Depends on**: User Story 1; independent of User Story 2 except for the shared overview (T036 extends T030)

### Tests for User Story 3 (write first, confirm they FAIL)

- [X] T031 [P] [US3] Unit tests in `tests/unit/schedule-location.test.ts`: no moves → inside; `lastMove`; `bringInsideDate` from the move or a later date change; `needsBringInside` on and after the date (US3-2), not before it, evaluated with the household date (20:00 local on 11-11 is not yet 11-12); a date change replaces the date (US3-3); moving in clears it (US3-4); voided moves are ignored; archived plants are never flagged (FR-014, FR-015, FR-017)
- [X] T032 [P] [US3] Contract tests in `tests/contract/moves.test.ts`: US3-1 (`move-out` with `until` → the plant page shows `outside until 2026-11-20` and the history row `moved_outside … by Bob`; FR-014), a missing `until` → 400, an `until` before the move date → 400, US3-3 (`bring-inside-date` changes the date and re-evaluates the flag), US3-4 (`move-in` clears the flag and appears in history), US3-5 (`move-out` twice → 409 "already outside"; `move-in` while inside → 409 "already inside"; FR-016), `bring-inside-date` while inside → 409, a back-dated `at`, and the overview `outside` section listing `bring inside 2026-11-20` and the `attention` row `BRING INSIDE (due 2026-11-12) · outside since 2026-10-01 by Bob` (FR-015, FR-017, FR-019)

### Implementation for User Story 3

- [X] T033 [US3] Implement `lastMove`, `location`, `bringInsideDate`, and `needsBringInside` (returning days late or `null`) in `src/domain/schedule.ts` (T031)
- [X] T034 [US3] Implement `recordMove` and `changeBringInsideDate` in `src/store.ts`, re-checking the location and validating the date against the household-zone date inside `immediate` (depends on T033)
- [X] T035 [US3] Implement `POST /plants/:id/move-out`, `/move-in`, and `/bring-inside-date`, plus the location section and move forms on `plantPage` (depends on T034; T032)
- [X] T036 [US3] Extend `overviewPage` with the `outside` section and the `BRING INSIDE` rows in `attention` (depends on T033, T030)

**Checkpoint**: User Stories 1–3 work; quickstart steps 8–10 behave as documented

---

## Phase 6: User Story 4 - See care that needs attention at a glance (Priority: P3)

**Goal**: Overdue and bring-inside plants stand out first, most urgent first

**Independent Test**: Several overdue and late plants appear first in urgency order and disappear once cared for

**Depends on**: User Stories 2 and 3

### Tests for User Story 4 (write first, confirm they FAIL)

- [X] T037 [P] [US4] Contract tests in `tests/contract/attention.test.ts`: US4-1 (the `attention` section is the first section in the page, and its rows are ordered by days late, then id), US4-2 (bring-inside rows are interleaved with overdue rows by urgency), US4-3 (after Bob waters one plant and moves another inside, Alice's overview no longer lists them), and the section carries `class="attention"` (FR-020)

### Implementation for User Story 4

- [X] T038 [US4] Implement the single urgency sort for `attention` rows and confirm the `.attention` red styling in `src/web/views.ts` and `src/web/app.ts` (depends on T036; T037)

**Checkpoint**: All user stories are independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T039 [P] Add `tests/integration/performance.test.ts` seeding 100 plants and 10,000 events and asserting that `GET /` responds in under 1 second (plan performance goal; SC-003)
- [X] T040 [P] Add `tests/unit/traceability.test.ts` that parses `specs/001-plant-care-tracking/spec.md` for all `FR-xxx` IDs and `US<n>-<m>` scenarios and asserts that each appears in at least one test name under `tests/` (Constitution Principle I)
- [X] T041 Run `just check` from `sdd-exercise/` and fix every lint, format, type, and test failure
- [X] T042 Start the server (`just dev`) and run the quickstart manual walkthrough over HTTP; resolve any divergence by updating the spec, contract, or code

---

## Dependencies & Execution Order

```text
Setup → Foundational → US1 ─┬─> US2 ─┐
                            └─> US3 ─┴─> US4 → Polish
```

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup; BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational
- **US2 (Phase 4)** and **US3 (Phase 5)**: Depend on US1; T036 extends T030
- **US4 (Phase 6)**: Depends on US2 and US3
- **Polish (Phase 7)**: Depends on all stories

### Within Each User Story

- Tests are written first and MUST FAIL before implementation (Principle II)
- Domain (`schedule.ts`) before store (`store.ts`) before web (`app.ts`, `views.ts`)
- `store.ts`, `app.ts`, and `views.ts` are shared files, so tasks touching the same file are sequential even across stories

### Parallel Opportunities

- Setup: T003, T004, and T005
- Foundational: the tests T007–T010, then T011 and T012
- Each story: all of its test tasks (separate files)
- Polish: T039 and T040

---

## Parallel Example: User Story 2

```bash
Task: "Unit tests in tests/unit/schedule-watering.test.ts"
Task: "Integration tests in tests/integration/store-concurrency.test.ts"
Task: "Contract tests in tests/contract/water.test.ts"
Task: "Contract tests in tests/contract/history.test.ts"
Task: "Contract tests in tests/contract/overview.test.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 and 2)

The coordination problem (missed and duplicate watering) is solved only with US2, so the MVP is
US1 + US2: Setup → Foundational → US1 → US2, then validate with quickstart steps 1–7 and 11.

### Incremental Delivery

1. Setup + Foundational → household and members
2. + US1 → plant inventory
3. + US2 → MVP: shared watering coordination
4. + US3 → outdoor tracking
5. + US4 → attention ordering
6. Polish → performance, traceability, and the quickstart walkthrough

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Commit after each phase with Conventional Commits, from inside the devshell (the pre-commit
  hooks need its tools)
