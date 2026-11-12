# Implementation Plan: Household Plant Care Tracking

**Branch**: `001-plant-care-tracking` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-plant-care-tracking/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

A shared household plant care tracker, delivered as a small server-rendered web application.
Members choose who they are, register plants with watering intervals, record waterings and
indoor/outdoor moves, and see one overview of overdue, due, upcoming, outside, and
bring-inside plants. The application is TypeScript on Node.js 24, using Hono for HTTP routing and
HTML templating and Node's built-in `node:sqlite` for one local database file. Care history is an
append-only event log, and all status rules are pure functions of plants, events, the household
time zone, and an injected clock (see [research.md](research.md)).

## Technical Context

**Language/Version**: TypeScript 7.0 (`strict`, `erasableSyntaxOnly`) executed directly by
Node.js 24 type stripping; `tsc --noEmit` is used only for type checking

**Primary Dependencies**: `hono` (routing and escaped HTML templates), `@hono/node-server` (HTTP
listener); development only: `typescript`, `@types/node`

**Storage**: One SQLite file per household through `node:sqlite` (`DatabaseSync`); path from
`PLANTCARE_DB`, default `./plantcare.db`

**Testing**: `node:test` with `node:assert/strict`: unit tests for pure domain logic,
integration tests for the store against a temporary database, and HTTP contract tests through
`app.request()` without opening a port

**Target Platform**: A household computer on the home network (macOS or Linux via the repository
Nix devshell); any modern browser as the client

**Project Type**: Web application (single server-rendered project; no client-side JavaScript
bundle)

**Performance Goals**: The overview renders in under 1 second for 100 plants and 10,000 care
events (well within SC-003)

**Constraints**: No external services or network calls; concurrent submissions MUST NOT lose or
silently duplicate care events; every project file inside `sdd-exercise/` except the Nix
dependency module; `just check` passes

**Scale/Scope**: One household per database, 1–10 members, up to about 100 plants; about
6 pages and 14 routes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Pre-design | Post-design |
|-----------|------|------------|-------------|
| I. Spec-First, Traceable Requirements | Every route and rule maps to an FR; tests cite FR and scenario IDs | PASS | PASS — the [HTTP contract](contracts/http.md) maps each route to FRs |
| II. Test-First | Domain logic is testable in isolation; HTTP behavior is testable without a server | PASS | PASS — pure `src/domain`, plus `app.request()` contract tests |
| III. Shared Care Record Integrity | One source of truth; attribution; no lost or silent duplicates; append-only | PASS | PASS — one SQLite file, an append-only `care_events` table, and checks and inserts inside `BEGIN IMMEDIATE` ([data-model.md](data-model.md)) |
| IV. Deterministic Schedule Logic | Pure status functions; injected clock; explicit zone | PASS | PASS — `createApp({ now })`; `src/domain` never calls `Date.now()`; zone math through `Intl` |
| V. Simplicity | Each dependency justified | PASS | PASS — two runtime dependencies (research R1–R3); no client framework, ORM, or build step |
| Technical Constraints | TypeScript strict; files inside `sdd-exercise/`; `just check` | PASS | PASS — the only outside file is `modules/sdd-exercise.nix` (composition) |
| Development Workflow | Spec Kit sequence; clarifications recorded | PASS | PASS — spec clarifications were recorded on 2026-11-12 |

No violations; Complexity Tracking is not required.

## Project Structure

### Documentation (this feature)

```text
specs/001-plant-care-tracking/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── http.md          # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (`sdd-exercise/`)

```text
package.json             # dependencies and npm scripts (pnpm)
tsconfig.json            # strict, noEmit, erasableSyntaxOnly
biome.json               # lint and format rules
justfile                 # lint, fmt, typecheck, test, check, dev
.gitignore               # node_modules, plantcare.db

src/
├── domain/
│   ├── models.ts        # Types and validating constructors for Household, Member, Plant, CareEvent
│   ├── time.ts          # Pure time-zone helpers (local date, zoned parse, day arithmetic)
│   └── schedule.ts      # Pure status rules: due dates, classification, same-cycle check, location, bring-inside flag
├── store.ts             # The only module that touches node:sqlite: schema, transactions, queries
└── web/
    ├── app.ts           # createApp({ db, now }): Hono routes, member cookie, error mapping
    ├── views.ts         # Escaped HTML templates (hono/html)
    └── server.ts        # Entry point: opens the database, supplies the real clock, listens

tests/
├── helpers.ts           # Fixed clock, temporary database, request and HTML-section helpers
├── unit/                # domain/*.ts with fixed clocks and zones
├── integration/         # store.ts against a temporary database, including concurrent writers
└── contract/            # HTTP routes per contracts/http.md
```

**Structure Decision**: Single server-rendered project. `src/domain` has no I/O and no clock
access (Principle IV); `src/store.ts` owns persistence and transactional integrity (Principle
III); `src/web` is the only layer that knows about HTTP, and only `server.ts` reads the real
clock. No separate frontend project, API layer, or client bundle is introduced (Principle V).

**Tooling**: Node.js 24, pnpm, Biome, and spec-kit are declared in `modules/sdd-exercise.nix`,
which extends the shared devshell through `devshell.packages` (an option added to
`modules/devshell.nix`). Every other file lives in `sdd-exercise/`. `just check` means the
recipe in `sdd-exercise/justfile`, run from `sdd-exercise/`.

## Complexity Tracking

Not applicable: the Constitution Check has no violations.
