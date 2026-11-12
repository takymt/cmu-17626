# Feature Specification: Household Plant Care Tracking

**Feature Branch**: `001-plant-care-tracking` (no branch hook configured; work currently on `main`)

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "Household plant care app. Multiple household members share plant
care records. Record plants, maintain individual care schedules, record watering events, identify
upcoming and overdue watering, track when plants are moved outside and identify when they should
be brought inside, and avoid duplicate or missed care actions. Delivered as a web application."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register plants with watering schedules (Priority: P1)

A household member adds each plant in the home with a name, location, and how often it needs
watering, so that the household has one shared inventory of plants and their care needs.

**Why this priority**: Every other capability (due dates, watering records, outdoor tracking)
depends on plants and their schedules existing.

**Independent Test**: Can be fully tested by adding several plants with different watering
intervals and confirming that every household member sees the same list with the same schedules.

**Acceptance Scenarios**:

1. **Given** an empty household, **When** a member adds a plant named "Kitchen Basil" with a
   3-day watering interval, **Then** the plant appears in the household plant list with that
   interval.
2. **Given** a plant exists, **When** a member changes its watering interval from 3 to 5 days,
   **Then** all members see the new interval and the plant's next due date is recalculated from
   its last watering.
3. **Given** two plants with the same name, **When** a member views the list, **Then** each plant
   is distinguishable by its location or another identifying attribute.
4. **Given** a plant is no longer in the household, **When** a member archives it, **Then** it no
   longer appears in due or overdue lists but its care history remains viewable.

---

### User Story 2 - Record watering and see what is due (Priority: P1)

A household member waters a plant and records it. Any member can open the app and see which
plants are overdue, which are due soon, and who watered each plant last, so that no plant is
forgotten and no plant is watered twice.

**Why this priority**: This is the core coordination problem the product exists to solve:
preventing missed and duplicate watering across multiple caretakers.

**Independent Test**: Can be fully tested with two members and a set of plants: one member
records waterings, and the other confirms that due status and "last watered by" update correctly.

**Acceptance Scenarios**:

1. **Given** a plant with a 3-day interval last watered 3 days ago, **When** a member opens the
   overview, **Then** the plant is shown as due today.
2. **Given** a plant with a 3-day interval last watered 5 days ago, **When** a member opens the
   overview, **Then** the plant is shown as overdue by 2 days.
3. **Given** a plant is due, **When** member A records a watering, **Then** member B sees the
   plant as watered by member A at that time, and the plant's next due date moves forward by its
   interval.
4. **Given** member A has already recorded a watering for a plant in the current cycle, **When**
   member B attempts to record a watering for the same plant, **Then** the system warns member B
   that member A already watered the plant (showing when), and records the second watering only
   if member B explicitly confirms it.
5. **Given** member B receives the duplicate-watering warning, **When** member B cancels,
   **Then** no watering is recorded.
6. **Given** a member recorded a watering by mistake, **When** the member records a correction,
   **Then** the original record is retained in history, marked as corrected, and the due date
   reflects the correction.
7. **Given** a plant has never been watered since it was added, **When** a member opens the
   overview, **Then** the plant is shown as due.

---

### User Story 3 - Track plants moved outside and know when to bring them in (Priority: P2)

A household member records that a plant has been moved outdoors and when it should come back.
The household can see which plants are currently outside and which should be brought back inside,
so that plants are not left out in harmful conditions.

**Why this priority**: This addresses a real but seasonal risk; the product delivers value
without it, but it is part of the stated scope.

**Independent Test**: Can be fully tested by moving a plant outside with a bring-inside date,
confirming that it appears as outside for all members, reaching that date, and confirming that
the plant is flagged.

**Acceptance Scenarios**:

1. **Given** a plant is inside, **When** a member records that it was moved outside and sets a
   bring-inside date, **Then** all members see the plant as outside, with who moved it, when, and
   its bring-inside date.
2. **Given** a plant is outside with a bring-inside date of today or earlier, **When** a member
   opens the overview, **Then** the plant is flagged as needing to be brought inside.
3. **Given** a plant is outside, **When** a member changes its bring-inside date, **Then** all
   members see the new date and the flag is re-evaluated against it.
4. **Given** a plant is flagged to be brought inside, **When** a member records that it was moved
   inside, **Then** the flag clears and the move appears in the plant's history.
5. **Given** a plant is outside, **When** another member also tries to record moving it outside,
   **Then** the system indicates that the plant is already outside and does not create a second
   move.

---

### User Story 4 - See care that needs attention at a glance (Priority: P3)

When household members open the app, overdue watering and plants that should be brought inside
stand out immediately, so that urgent care is not overlooked among routine items.

**Why this priority**: Viewing due status (User Story 2) already prevents most misses; prominent
highlighting improves reliability but depends on the earlier stories.

**Independent Test**: Can be fully tested by letting a plant become overdue and confirming that
it is highlighted at the top of the overview for every member.

**Acceptance Scenarios**:

1. **Given** a plant becomes overdue, **When** any member opens the app, **Then** the plant is
   visually highlighted at the top of the household overview, ahead of plants that are merely
   due or upcoming, with the most overdue first.
2. **Given** a plant is flagged to be brought inside, **When** any member opens the app, **Then**
   the plant is highlighted on the household overview alongside overdue plants.
3. **Given** a plant is highlighted, **When** a member records the care action, **Then** the
   highlight is removed for all members.

---

### Edge Cases

- A watering is recorded with a time in the past (e.g., "I watered it yesterday"); due dates use
  the recorded care time, not the entry time.
- A watering is recorded with a time in the future; the system rejects it.
- Two members record the same watering at nearly the same moment; the later submission receives
  the duplicate-watering warning (FR-012) rather than being recorded silently, and the earlier
  member's record is never lost.
- A plant's watering interval is changed while it is overdue; the due status is recalculated
  immediately from the last watering and the new interval.
- A plant is archived while outside or overdue; it no longer appears in active lists or
  highlights.
- A member leaves the household; their past care records remain attributed to them.
- Daylight saving transitions occur between waterings; "due today" and "overdue" are evaluated
  in the household's time zone using calendar days.

## Requirements *(mandatory)*

### Functional Requirements

**Household and members**

- **FR-001**: System MUST allow a household to have multiple members who share a single set of
  plant and care records.
- **FR-002**: System MUST attribute every created or changed record to the member who made it.
- **FR-003**: System MUST make any recorded change visible to all household members on their next
  view of the affected data.

**Plants and schedules**

- **FR-004**: Members MUST be able to add a plant with a name, a location within the home, and a
  watering interval in days.
- **FR-005**: Members MUST be able to edit a plant's name, location, and watering interval.
- **FR-006**: Members MUST be able to archive a plant; archived plants MUST be excluded from due,
  overdue, outside, and highlight lists while their history remains viewable.

**Watering**

- **FR-007**: Members MUST be able to record a watering event for a plant, including the time the
  watering occurred (defaulting to now).
- **FR-008**: System MUST reject care events recorded with a time in the future.
- **FR-009**: System MUST compute each active plant's next due date as the calendar date of the
  most recent watering plus the plant's watering interval in days; a plant with no recorded
  watering MUST be due immediately.
- **FR-010**: System MUST classify each active plant as overdue (next due date before today),
  due today, upcoming (due within the next 2 days), or not yet due, evaluated in the household's
  time zone.
- **FR-011**: System MUST show, for each plant, when it was last watered and by whom.
- **FR-012**: When a member records a watering for a plant that has already been watered in the
  current watering cycle, System MUST warn the member, showing who watered it and when, and MUST
  record the watering only after the member explicitly confirms it.
- **FR-013**: Members MUST be able to correct a mistaken care event; the original event MUST be
  retained in history and marked as corrected, and due calculations MUST use the corrected
  history.

**Outdoor tracking**

- **FR-014**: Members MUST be able to record that a plant was moved outside or moved inside,
  including who moved it and when; recording a move outside MUST include a bring-inside date,
  which members MUST be able to change while the plant remains outside.
- **FR-015**: System MUST show which active plants are currently outside.
- **FR-016**: System MUST NOT record a move to the location a plant is already in (e.g., moving
  an outside plant outside) and MUST inform the member of the plant's current state.
- **FR-017**: System MUST flag an outside plant as needing to be brought inside when its
  bring-inside date is today or earlier in the household's time zone, and MUST clear the flag
  when the plant is recorded as moved inside.

**History and highlighting**

- **FR-018**: System MUST retain the full care history (waterings, moves, corrections) for each
  plant, ordered by time.
- **FR-019**: System MUST present a single household overview listing overdue plants, plants due
  today, upcoming plants, plants currently outside, and plants that should be brought inside.
- **FR-020**: System MUST visually highlight overdue plants and plants flagged to be brought
  inside at the top of the household overview, most urgent first; notifications outside the app
  are out of scope.

### Key Entities

- **Household**: The group that shares plants and care records; has a time zone used for all
  due-date evaluation.
- **Member**: A person belonging to a household who can view and record care; identified on every
  record they create.
- **Plant**: A plant in the household; has a name, location, watering interval, active or
  archived status, current inside or outside state, and, while outside, a bring-inside date.
- **Care Event**: A recorded action on a plant (watering, moved outside, moved inside,
  bring-inside date change, or correction); has the action type, the time it occurred, the time
  it was recorded, and the member who recorded it. Care events are never deleted; corrections
  reference the event they correct.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can add a new plant with its watering schedule in under 1 minute.
- **SC-002**: A member can record a watering in 2 interactions or fewer from the household
  overview.
- **SC-003**: After one member records a care action, other members see it reflected the next
  time they load the overview, within 5 seconds.
- **SC-004**: Across a 4-week trial with at least 2 members, no plant receives more than one
  watering record per watering cycle unless a member explicitly confirms it.
- **SC-005**: Across a 4-week trial, 100% of plants that become overdue are shown as overdue on
  the overview on the day they become overdue.
- **SC-006**: Across a 4-week trial, every plant flagged to be brought inside is visible on the
  overview from the moment the flag is raised until it is moved inside.
- **SC-007**: At least 90% of trial members can answer "Which plants need watering today, and who
  watered plant X last?" from the app without assistance.

## Assumptions

- Members use the app through a web browser on the household's own network; it is not exposed to
  the public internet.
- Care schedules cover watering only; fertilizing, repotting, and other care types are out of
  scope for this feature.
- A watering schedule is a fixed interval in days per plant; seasonal schedule changes are made
  by editing the interval.
- "Upcoming" means due within the next 2 days.
- All members of a household have equal permissions; members identify themselves by choosing
  their name, and authentication is out of scope.
- Each household has a single time zone used for all due-date evaluation.
- Offline use is out of scope.
- Plant species identification, care recommendations, and photo features are out of scope.
- The bring-inside decision is based solely on the member-set bring-inside date; weather data and
  temperature thresholds are out of scope.
- Members are alerted only through in-app highlighting; push, email, and other notifications
  outside the app are out of scope.

## Clarifications

### Session 2026-11-12

- Q: How should a second watering in the same cycle be handled? → A: Warn the member and record
  it only after explicit confirmation (FR-012).
- Q: What determines when a plant should be brought inside? → A: A per-plant bring-inside date set
  by a member when moving the plant outside (FR-014, FR-017).
- Q: How are members alerted to care that needs attention? → A: In-app highlighting on the
  household overview only (FR-020).
