# HTTP Contract: Plant Care Web App

**Feature**: [spec.md](../spec.md) | **Data model**: [data-model.md](../data-model.md)

All pages are `text/html; charset=UTF-8`. Forms use `application/x-www-form-urlencoded`. Every
successful `POST` answers `303 See Other`, redirecting to the page named in the table
(Post/Redirect/Get).

## Cross-cutting rules

| Rule | Behavior |
|------|----------|
| Uninitialized database | Every route except `GET/POST /setup` redirects (303) to `/setup` |
| Acting member | The `member` cookie holds the acting member's id. Every write route except `/setup`, `/members`, and `/session` requires an active member; otherwise it responds `403` with a page asking the member to choose their name |
| Validation error | `400` with the form page re-rendered and an error message in `<p class="error">` |
| Unknown plant or event | `404` |
| State conflict | `409` with an explanation (no-op move, already-voided event, or unconfirmed duplicate watering) |
| Times | Form field `at` is optional, `YYYY-MM-DDTHH:mm` (a `datetime-local` input) in the household zone; empty means now; a future time gives `400` (FR-008) |
| Dates | Form fields `until` are `YYYY-MM-DD` |

## Routes

| Method & path | Form fields | Success | FRs |
|---------------|-------------|---------|-----|
| `GET /setup` | — | Setup form (redirects to `/` if already initialized) | FR-001 |
| `POST /setup` | `name`, `timeZone` | → `/members` | FR-001 |
| `GET /members` | — | Member list and add form | FR-001 |
| `POST /members` | `name` | → `/members`; duplicate name → `409` | FR-001 |
| `POST /members/:id/remove` | — | → `/members`; the member becomes inactive | FR-001, FR-002 |
| `POST /session` | `memberId` | Sets the `member` cookie → `/` | FR-002 |
| `GET /` | — | Household overview (below) | FR-003, FR-010, FR-011, FR-015, FR-017, FR-019, FR-020 |
| `GET /plants` | `?all=1` includes archived plants | Plant list with id, name, location, interval, last watered and by whom, and an add form | FR-004, FR-011 |
| `POST /plants` | `name`, `location`, `intervalDays` | → `/plants/:id`; a duplicate active name and location adds a warning notice | FR-002, FR-004 |
| `GET /plants/:id` | — | Plant detail: attributes, location state, edit, water, move, and archive forms, and the full history oldest-first with correct buttons | FR-011, FR-018 |
| `POST /plants/:id/edit` | `name`, `location`, `intervalDays` | → `/plants/:id` | FR-002, FR-005 |
| `POST /plants/:id/archive` | — | → `/plants` | FR-006 |
| `POST /plants/:id/water` | `at?`, `confirm?`, `expectedLastEventId?`, `returnTo?` | → `returnTo` (`/` or `/plants/:id`). For a same-cycle watering without `confirm=yes`, or if `expectedLastEventId` is stale: `409` confirmation page (below) | FR-007, FR-008, FR-012 |
| `POST /plants/:id/move-out` | `until`, `at?` | → `/plants/:id`; already outside → `409` | FR-014, FR-016 |
| `POST /plants/:id/move-in` | `at?` | → `/plants/:id`; already inside → `409` | FR-014, FR-016, FR-017 |
| `POST /plants/:id/bring-inside-date` | `until` | → `/plants/:id`; plant inside → `409` | FR-014 |
| `POST /events/:id/correct` | — | → `/plants/:plantId`; a correction or an already voided event → `409` | FR-013 |

Archived plants reject `water`, `move-*`, `bring-inside-date`, and `edit` with `409`.

## Duplicate-watering confirmation page (FR-012)

The page states `<plant> was already watered by <member> at <YYYY-MM-DD HH:mm>.` and contains:

- a form that re-posts to `/plants/:id/water` with the same `at` and `returnTo`, plus
  `confirm=yes` and `expectedLastEventId=<id of that watering>`, and a button labeled
  **Record another watering**;
- a **Cancel** link back to `returnTo`, which records nothing.

## Overview (`GET /`)

The overview contains these sections in this order. Empty sections are omitted.

| Section | Element | Row content |
|---------|---------|-------------|
| Needs attention | `<section id="attention" class="attention">` | Overdue rows: `OVERDUE by N day(s) · last watered <date> by <member>`. Bring-inside rows: `BRING INSIDE (due <date>) · outside since <date> by <member>`. Sorted by days late (most first), then plant id |
| Due today | `<section id="due-today">` | `never watered` or `last watered <date> by <member>`, plus a one-click **Water** button |
| Upcoming | `<section id="upcoming">` | `due <date> · last watered <date> by <member>`, sorted by due date |
| Outside | `<section id="outside">` | `bring inside <date>` |

- Every row starts with `[id] Name (location)` linking to `/plants/:id`, and overdue and due rows
  carry a **Water** button (`returnTo=/`), so a watering is two interactions at most (SC-002).
- The `attention` section is rendered first and styled with a red border and background (FR-020).
- When nothing needs care, the page says `Nothing needs care right now.`
- The page header shows the household name, the acting member, and a member picker.
