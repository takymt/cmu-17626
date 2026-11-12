# Data Model: Household Plant Care Tracking

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

Instants are stored as UTC ISO-8601 strings (for example, `2026-11-12T17:00:00.000Z`) and handled
as `Date` values in code. Calendar dates are `YYYY-MM-DD` strings interpreted in the household
time zone (research R7).

## Entities

### Household (FR-001)

| Field | Type | Rules |
|-------|------|-------|
| `id` | integer | Always `1`: one household per database file |
| `name` | text | Required, non-empty |
| `timeZone` | text | Required; MUST be a valid IANA zone name |
| `createdAt` | instant | Set on creation |

### Member (FR-001, FR-002)

| Field | Type | Rules |
|-------|------|-------|
| `id` | integer | Primary key |
| `name` | text | Required, non-empty; unique (case-insensitive) within the household |
| `active` | boolean | `false` after the member leaves; past records keep the attribution |
| `createdAt` | instant | Set on creation |

### Plant (FR-004–FR-006)

| Field | Type | Rules |
|-------|------|-------|
| `id` | integer | Primary key; shown to users to tell plants with the same name apart |
| `name` | text | Required, non-empty |
| `location` | text | Required, non-empty |
| `intervalDays` | integer | Required; integer `>= 1` |
| `archived` | boolean | Default `false` |
| `createdAt` / `createdBy` | instant / member name | Set on creation |

If a member adds a plant with the same `(name, location)` as an active plant, the response warns,
and the plants remain distinguishable by `id`.

### PlantChange (FR-002, FR-005)

An append-only audit of plant edits.

| Field | Type | Rules |
|-------|------|-------|
| `id` | integer | Primary key |
| `plantId` | Plant | Required |
| `field` | text | One of `name`, `location`, `intervalDays`, `archived` |
| `oldValue` / `newValue` | text | String form of the values |
| `changedAt` / `changedBy` | instant / member name | Required |

### CareEvent (FR-007, FR-013, FR-014, FR-018)

Append-only; rows are never updated or deleted (Principle III).

| Field | Type | Rules |
|-------|------|-------|
| `id` | integer | Primary key; monotonically increasing |
| `plantId` | Plant | Required |
| `kind` | text | One of `watered`, `moved_outside`, `moved_inside`, `bring_inside_date_changed`, `correction` |
| `occurredAt` | instant | Required; MUST NOT be later than `now` (FR-008) |
| `recordedAt` | instant | Set to `now` on insert |
| `recordedBy` | member name | Required |
| `bringInsideDate` | date or null | Required for `moved_outside` and `bring_inside_date_changed`; otherwise null; MUST NOT be earlier than the household-zone date of `occurredAt` |
| `voidsEventId` | CareEvent or null | Required for `correction`; otherwise null; MUST reference an event that is not a correction and is not already voided |
| `confirmedDuplicate` | boolean | `true` when a member confirmed a same-cycle watering (FR-012) |

An event is **valid** if no `correction` event voids it.

## Derived state rules (`src/domain/schedule.ts`)

- **Last watering**: the valid `watered` event with the latest `(occurredAt, id)`.
- **Next due date** (FR-009): `addDays(localDate(lastWatering.occurredAt, tz), intervalDays)`. A
  plant with no valid watering has no due date and is due immediately.
- **Status** (FR-010): let `d = daysBetween(today, nextDueDate)`. If `d < 0`, the plant is
  `overdue` by `−d` days. If `d = 0`, or the plant has never been watered, it is `due_today`. If
  `1 ≤ d ≤ 2`, it is `upcoming`. Otherwise it is `not_due`.
- **Same-cycle watering** (FR-012): a watering at `t` is a same-cycle watering if
  `t − lastWatering.occurredAt < intervalDays × 24 h` (research R6).
- **Location** (FR-015): `outside` if the latest valid move (`moved_outside` or `moved_inside`)
  is `moved_outside`; otherwise `inside`.
- **Bring-inside date** (FR-014): while the plant is outside, the date from the latest valid
  `moved_outside` or `bring_inside_date_changed` event that is not older than that move.
- **Bring-inside flag** (FR-017): the plant is active, outside, and its bring-inside date is on or
  before today in the household zone; days late = `daysBetween(bringInsideDate, today)`.
- **Archived plants** (FR-006) appear in no overview section.

## State transitions

```text
Location:  inside --moved_outside(bringInsideDate)--> outside
           outside --bring_inside_date_changed--> outside (new date)
           outside --moved_inside--> inside
           Moving to the current location is rejected (FR-016).

Watering:  not_due --(time passes)--> upcoming --> due_today --> overdue
           any --watered--> status recomputed

Plant:     active --archive--> archived   (one-way within this feature)

Event:     valid --correction--> voided   (one-way)
```

## Integrity mechanisms (Principle III)

- Inserts that depend on current state (a watering after the duplicate check, a move after the
  location check, a correction after the validity check) run in one `BEGIN IMMEDIATE`
  transaction that re-reads that state (research R5).
- `PRAGMA foreign_keys = ON`, and `busy_timeout` is set to 5000 ms.
- No `UPDATE` or `DELETE` statement ever targets `care_events` or `plant_changes`.
