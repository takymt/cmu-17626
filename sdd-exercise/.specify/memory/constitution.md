# Household Plant Care Constitution

## Core Principles

### I. Spec-First, Traceable Requirements

- Every feature MUST originate from a specification (`spec.md`) produced through the Spec Kit
  workflow before any implementation begins.
- Every functional requirement MUST carry a stable identifier (e.g., `FR-001`), and every
  task, test, and implementation change MUST reference at least one requirement identifier.
- Behavior not traceable to a requirement MUST NOT be implemented; it is either added to the
  spec first or removed.

**Rationale**: The project exists to exercise specification-driven development; traceability is
what makes the spec, the tests, and the code verifiably consistent with one another.

### II. Test-First (NON-NEGOTIABLE)

- Tests MUST be written before the implementation they cover and MUST be observed failing
  before the implementation is written (Red → Green → Refactor).
- Each acceptance scenario in the spec MUST map to at least one automated test.
- A change that adds behavior without a corresponding failing-then-passing test MUST NOT be
  merged.

**Rationale**: Tests derived from acceptance scenarios are the executable form of the spec and
the primary evidence that a requirement is satisfied.

### III. Shared Care Record Integrity

- Care records (plants, schedules, watering events, indoor/outdoor moves) MUST have a single
  source of truth shared by all household members.
- Every care event MUST record who performed it and when it occurred.
- Recording the same care action concurrently or repeatedly MUST NOT produce silent duplicate
  events, and an acknowledged recording MUST NOT be lost.
- Care history MUST be append-only from the user's perspective; corrections MUST be recorded
  as new events rather than destructive edits.

**Rationale**: The core problem is coordination among multiple caretakers; duplicate or missed
care is the failure mode the system exists to prevent.

### IV. Deterministic Schedule Logic

- Computations of upcoming, overdue, and bring-inside status MUST be pure functions of
  stored records, configuration, and an explicitly supplied current time.
- Domain logic MUST NOT read the system clock; the clock MUST be injected so that tests can fix
  time.
- Timestamps MUST be stored in UTC or with an explicit offset, and calendar decisions MUST use
  an explicit time zone.

**Rationale**: Schedule correctness depends on time; hidden clock access and implicit time zones
make due-date behavior untestable and nondeterministic.

### V. Simplicity

- The simplest design that satisfies the current spec MUST be chosen; speculative features,
  abstractions, and extension points MUST NOT be added (YAGNI).
- Every dependency, service, or architectural layer MUST be justified in `plan.md` against a
  specific requirement.
- Changes MUST be delivered in the smallest shippable unit.

**Rationale**: Unrequested complexity obscures traceability and enlarges the surface that tests
and reviewers must cover.

## Technical Constraints

- The implementation language is TypeScript with the compiler's `strict` mode enabled; `any`
  MUST NOT be used without a justifying comment.
- All project files MUST live inside `sdd-exercise/`. Files outside it MAY be changed only for
  minimal composition with the repository (for example, declaring development dependencies in a
  dedicated Nix module).
- `just check`, run from `sdd-exercise/`, MUST pass before any commit; it covers linting,
  formatting, type checking, and tests.
- Household data MUST NOT be transmitted to third parties beyond what a requirement explicitly
  demands.
- Concrete framework, storage, and tooling choices are deferred to `/speckit-plan` and MUST be
  recorded with rationale in `research.md`.

## Development Workflow

- Features MUST follow the Spec Kit sequence: specify → clarify (when ambiguities exist) →
  plan → tasks → implement.
- Ambiguities MUST be resolved through `/speckit-clarify` or by asking the stakeholder; they
  MUST NOT be resolved by assumption.
- Commits MUST follow Conventional Commits (enforced by the `commit-msg` hook), and each commit
  MUST contain one logical change.
- Before implementation, `/speckit-analyze` SHOULD be run to confirm consistency among
  `spec.md`, `plan.md`, and `tasks.md`.

## Governance

- This constitution supersedes other project practices; conflicts MUST be resolved in favor of
  this document or by amending it.
- Amendments MUST be made through `/speckit-constitution`, MUST state their rationale, and MUST
  update the version and Last Amended date.
- Versioning follows semantic versioning: MAJOR for principle removals or incompatible
  redefinitions, MINOR for new principles or materially expanded guidance, PATCH for
  clarifications and wording fixes.
- Every `plan.md` MUST include a Constitution Check; any violation MUST be justified in its
  Complexity Tracking section or the plan MUST be revised.

**Version**: 1.0.0 | **Ratified**: 2026-11-12 | **Last Amended**: 2026-11-12
