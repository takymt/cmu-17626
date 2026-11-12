# Research: Household Plant Care Tracking

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-12

The stakeholder fixed the language to TypeScript and the delivery to a web application. The
constitution requires strict TypeScript, no external services, and a justification for every
dependency. The decisions below resolve the remaining choices.

## R1. Rendering model: server-rendered HTML or a client SPA

- **Decision**: Server-rendered HTML pages with plain `<form>` posts and the
  Post/Redirect/Get pattern; no client-side JavaScript.
- **Rationale**: Every requirement is a list, a form, or a confirmation, which HTML forms express
  directly. Recording a watering is one button on the overview (SC-002). Each page load reads the
  shared database, which satisfies FR-003 and SC-003 without client caching or synchronization.
  Server rendering also keeps every behavior testable through HTTP requests alone.
- **Alternatives considered**: A React SPA with TanStack Query and a JSON API was rejected
  because it adds a bundler, a second test environment, and client state that must be kept
  consistent with the shared record, and no requirement needs client interactivity
  (Principle V).

## R2. HTTP framework and templating

- **Decision**: Hono with `@hono/node-server`. Pages are built with `hono/html` tagged templates,
  which escape interpolated values.
- **Rationale**: Hono is small, fully typed, and its `app.request()` executes routes in-process,
  so contract tests need no open port. The `html` helper gives auto-escaped templates without JSX.
  This matters because Node's type stripping does not transform `.tsx` files.
- **Alternatives considered**: `node:http` alone was rejected because hand-written routing, body
  parsing, cookies, and escaping would add more code than the dependency. Express was rejected
  because it needs separate type packages and a templating engine. Fastify was rejected because
  it is heavier than this application needs.

## R3. Running TypeScript

- **Decision**: Run `.ts` files directly with Node.js 24's built-in type stripping, and use
  `tsc --noEmit` for type checking only. `tsconfig.json` enables `strict`,
  `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, and
  `noUncheckedIndexedAccess`.
- **Rationale**: This needs no build step, no `dist/`, and no extra runner such as `tsx` or
  `ts-node`. `erasableSyntaxOnly` makes the compiler reject syntax that stripping cannot handle,
  such as `enum` and parameter properties, so domain kinds are string-literal unions.
- **Alternatives considered**: Bundling with `tsc` emit or esbuild was rejected because it adds a
  build artifact and a step to keep in sync with the source.

## R4. Storage

- **Decision**: Use `node:sqlite` (`DatabaseSync`) with one file per household,
  `PRAGMA foreign_keys = ON`, and `PRAGMA busy_timeout = 5000`.
- **Rationale**: It is built into Node 24, so there is no native add-on to compile, and the
  synchronous API keeps transactions simple. One file is the single source of truth (Principle
  III). The scale (about 100 plants and 10,000 events) is far below SQLite's limits.
- **Alternatives considered**: `better-sqlite3` was rejected because it requires a native build
  in the Nix environment. An ORM (Drizzle or Prisma) was rejected because five tables with
  hand-written SQL do not justify it. A JSON file was rejected because it provides no
  transactions and no safe concurrent writers.

## R5. Preventing lost or silently duplicated waterings (FR-012)

- **Decision**: The watering form carries the id of the last watering the member saw
  (`expectedLastEventId`). The store re-reads the latest valid watering inside
  `BEGIN IMMEDIATE`. If it differs, the store throws `StaleStateError`, and the server
  re-renders the confirmation page with fresh data. If the new watering is in the same cycle and
  is not confirmed, the server responds with a confirmation page (HTTP 409) and records nothing.
  Confirming re-submits with `confirm=yes`.
- **Rationale**: `BEGIN IMMEDIATE` serializes writers on SQLite's write lock, and the expected-id
  check closes the gap while a member reads the confirmation page. Events are only ever inserted,
  so an earlier record cannot be lost.
- **Alternatives considered**: A per-cycle unique constraint was rejected because cycle
  boundaries depend on time and interval, and confirmed duplicates are allowed. A client-side
  confirm dialog was rejected because it cannot see another member's concurrent watering.

## R6. Same-cycle rule and due dates (FR-009, FR-012)

- **Decision**: The next due date is the household-zone calendar date of the last valid watering
  plus `intervalDays` days. A new watering at instant `t` is a same-cycle watering if and only if
  `t − w < intervalDays × 24 h`, where `w` is the last valid watering.
- **Rationale**: Calendar-day arithmetic keeps "due in N days" stable across daylight saving
  transitions, which adding 24-hour multiples to an instant does not. The same-cycle rule is a
  simple elapsed-time comparison that matches the acceptance scenarios.

## R7. Time-zone handling without a date library

- **Decision**: Use pure helpers in `src/domain/time.ts` built on `Intl.DateTimeFormat`:
  - `localDate(instant, tz)` returns the calendar date (`YYYY-MM-DD`) in the zone.
  - `localDateTime(instant, tz)` returns the display time (`YYYY-MM-DD HH:mm`).
  - `zonedToInstant("YYYY-MM-DDTHH:mm", tz)` resolves the zone offset with one correction pass
    for daylight saving.
  - `addDays` and `daysBetween` operate on calendar dates through UTC arithmetic.
  - `isTimeZone` validates IANA names.

  Instants are stored as UTC ISO-8601 strings.
- **Rationale**: `Temporal` is not available in Node 24 without flags. These five small
  functions cover every need and are unit-tested across a daylight saving boundary.
- **Alternatives considered**: `date-fns-tz` or Luxon were rejected because a dependency is not
  justified for five functions.

## R8. Member identity

- **Decision**: A member chooses their name in a header form. The server stores the member id in
  an `HttpOnly`, `SameSite=Lax` cookie named `member`. Write routes require an active member and
  respond with 403 and a prompt otherwise.
- **Rationale**: The spec assumes equal permissions, no authentication, and a trusted household
  network. A plain cookie attributes every write (FR-002) without accounts.
- **Alternatives considered**: Signed sessions were rejected because they add a secret to manage
  and protect nothing beyond what the trusted-network assumption already accepts.

## R9. Testing and tooling

- **Decision**: Use `node --test` over `tests/**/*.test.ts`, Biome for linting and formatting,
  `tsc --noEmit` for types, and pnpm for dependencies. Development tools (Node, pnpm, Biome) come
  from the Nix devshell; `typescript` and `@types/node` are pinned in `pnpm-lock.yaml`.
- **Rationale**: The built-in runner needs no test dependency, and Biome replaces
  ESLint + Prettier with one binary. Contract tests call `createApp({ db, now })` with a fixed
  clock, so every scenario is deterministic (Principles II and IV).
- **Alternatives considered**: Vitest was rejected because it adds a dependency and its own
  transform pipeline that the built-in runner does not need.
