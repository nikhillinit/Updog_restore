---
status: DRAFT
last_updated: 2026-03-26
depends_on:
  - docs/plans/2026-03-20-contract-integrity-final-counterproposal.md
  - docs/plans/2026-03-21-phase-2b-execution-spec.md
  - docs/plans/2026-03-22-phase-3-results-execution-spec.md
  - docs/plans/2026-03-22-phase-4-implementation-spec.md
---

# Development Spec Set: Fund Lifecycle Completion And Architecture Consolidation

## Purpose

This document integrates the reviewed backlog into one executable spec set.

It is grounded in the current live repo state, not older roadmap claims.

The set is organized as four sequential sprints:

1. truthful first-run results
2. one active wizard owner
3. orchestration truth and test hardening
4. secondary-surface triage and documentation convergence

## Current Repo Facts

1. The routed production wizard is the store-based
   `client/src/pages/fund-setup.tsx` flow ending in
   `client/src/pages/ReviewStep.tsx`.
2. A second XState-based wizard still exists under
   `client/src/components/modeling-wizard/*` and
   `client/src/machines/modeling-wizard.machine.ts`, but it is not the routed
   production path.
3. The active review flow creates a fund and saves a draft, then routes directly
   to `/fund-model-results/:id`.
4. `server/services/fund-results-read-service.ts` requires a published config to
   return authoritative results sections and will otherwise emit
   `NO_PUBLISHED_CONFIG`.
5. Publish currently dispatches `reserve`, `pacing`, and `cohort` jobs, but
   `workers/cohort-worker.ts` is still mock-only simulation code.
6. Current contract-integrity validation is green:
   - `npm run baseline:progress`
   - `npm run test:phase4`
   - `npm run lint:phase4`
7. The current wizard-to-results integration test still mocks the create/fetch
   seam and is not yet a DB-backed lifecycle proof.
8. Several user-visible or near-visible surfaces still have placeholder or
   mock-only behavior:
   - `client/src/pages/planning.tsx`
   - `client/src/pages/kpi-manager/KpiDefinitionModal.tsx`
   - `server/compass/routes.ts`

## Plan-Level Rules

1. Treat the routed store-based wizard as authoritative until an explicit
   replacement decision is accepted.
2. Do not expand the XState wizard while the routed flow remains the production
   entry point.
3. Do not leave mock-only workers on the authoritative publish path.
4. Do not expose dead-end UI as if it is production-ready.
5. Prefer one truthful end-to-end path over broad feature expansion.
6. Refresh user-facing docs only after the live architecture is stable.

## Size Scale

- `S`: up to 1 developer day
- `M`: 2-4 developer days
- `L`: 5+ developer days

## Sprint 1: Truthful First-Run Results

### Goal

When a user completes the active wizard, the app should land on a truthful
results route backed by a published config and an active calculation state, not
on a results page that immediately reports `NO_PUBLISHED_CONFIG`.

### Stories

#### S1.1 Publish UX Decision

- Size: `S`
- Decision required:
  - auto-publish from review after draft save, or
  - add an explicit publish step/action before routing to results
- Deliverable:
  - one accepted product rule documented in this file or a successor decision
    note

#### S1.2 Active Flow Handoff Implementation

- Size: `M`
- Scope:
  - update the active review flow to execute
    `create -> save draft -> publish -> route to results`
  - preserve retry behavior for partial failures
  - keep results routing concrete at `/fund-model-results/:id`
- Primary files:
  - `client/src/pages/ReviewStep.tsx`
  - `client/src/adapters/fund-store-adapters.ts`
  - `server/routes/fund-config.ts`
  - `server/services/fund-persistence-service.ts`

#### S1.3 Boot-Path Lifecycle Proof

- Size: `M`
- Scope:
  - add one narrow server-backed proof for the active wizard lifecycle using the
    lightest real boot path available now
  - do not wait for full DB/Testcontainers recovery to prove the publish handoff
- Primary files:
  - `tests/integration/wizard-to-results-e2e.test.ts`
  - `tests/unit/contract/funds-endpoint-snapshots.test.ts`
  - `tests/unit/contract/funds-route-ownership.test.ts`

#### S1.4 Dead-End Surface Hygiene

- Size: `S`
- Scope:
  - hide, flag, or relabel any immediately user-facing route or nav entry that
    conflicts with the chosen publish/results flow
  - avoid leaving users in a state where the sidebar implies a supported flow
    that does not exist

### Acceptance

1. Completing the active wizard no longer lands users on a results route that
   immediately reports `Publish your fund configuration to see this section.`
2. If publish succeeds, the results page loads in `calculating` or `ready`
   state.
3. If draft save or publish fails, the user remains in the active flow with an
   actionable error and without data loss.
4. The active handoff path is covered by at least one boot-path automated test.

### Validation

- `npm run test:phase4`
- `npm run lint:phase4`
- targeted test file runs for any new lifecycle proof added in this sprint

### Non-Goals

- full wizard architecture replacement
- DB-backed infra restoration across the whole suite
- secondary feature implementation

## Sprint 2: One Active Wizard

### Goal

Reduce architecture drift by establishing one production wizard owner and moving
the active flow toward server-backed draft lifecycle behavior.

### Stories

#### S2.1 Production Wizard Ownership Decision

- Size: `S`
- Scope:
  - explicitly confirm the routed store-based wizard as the production owner
  - document the XState wizard as non-authoritative unless a replacement plan is
    approved separately

#### S2.2 Retire Or Quarantine The Parallel Wizard Path

- Size: `M`
- Scope:
  - remove the XState wizard from production ownership
  - quarantine or archive unused entry points, docs, and tests that imply it is
    live
  - keep only code that still serves an active shared library purpose
- Primary files:
  - `client/src/components/modeling-wizard/ModelingWizard.tsx`
  - `client/src/machines/modeling-wizard.machine.ts`
  - any tests or docs that still present it as the main flow

#### S2.3 Server-Backed Draft Autosave For The Active Wizard

- Size: `M`
- Scope:
  - move draft save earlier in the routed store-based wizard
  - persist authoritative draft data before the review step
- Primary files:
  - `client/src/pages/fund-setup.tsx`
  - step pages under `client/src/pages/*`
  - `client/src/stores/fundStore.ts`
  - `server/routes/fund-config.ts`

#### S2.4 Draft Hydration And Merge Policy

- Size: `M`
- Scope:
  - define which source wins on load:
    - server draft
    - local persisted store
    - empty defaults
  - implement deterministic hydration and conflict behavior
- Primary files:
  - `client/src/stores/fundStore.ts`
  - `client/src/pages/fund-setup.tsx`
  - `client/src/pages/ReviewStep.tsx`

### Acceptance

1. The repo has one explicit production wizard owner.
2. The active wizard can resume from server-backed draft state.
3. Local persistence no longer acts as the only durable source of wizard truth.
4. Obsolete wizard ownership claims are removed from production docs/tests.

### Validation

- targeted routed wizard tests
- create/save/reload draft tests
- `npm run test:phase4` remains green

### Non-Goals

- replacing the active wizard with the XState flow
- broad UI redesign of wizard steps

## Sprint 3: Orchestration Truth And Test Hardening

### Goal

Make the publish pipeline truthful enough to trust operationally, then harden
the test surface around the real lifecycle.

### Stories

#### S3.1 Remove Mock-Only Cohort From The Authoritative Publish Path

- Size: `M`
- Scope:
  - short-term preferred fix: stop dispatching cohort from the authoritative
    publish path until it has a truthful implementation
  - alternative allowed only if equivalent truth is delivered in this sprint:
    implement a real cohort path with persisted authoritative outputs
- Primary files:
  - `server/services/fund-persistence-service.ts`
  - `workers/cohort-worker.ts`

#### S3.2 Establish One DB-Backed Lifecycle Test Lane

- Size: `M`
- Scope:
  - stand up one test lane that exercises
    `create -> save draft -> publish -> results` with real persistence
    dependencies
- Primary files:
  - `tests/integration/*`
  - test infra helpers

#### S3.3 Re-Enable Highest-Value Blocked Persistence Tests

- Size: `M`
- Priority order:
  1. one lifecycle integration suite
  2. one SQL-backed unit/integration suite
  3. one infrastructure smoke suite

#### S3.4 Reduce Authoritative Worker Warning Debt

- Size: `S`
- Scope:
  - lower the ratcheted warning baseline for reserve/pacing/cohort workers
  - do not weaken the existing guard

### Acceptance

1. The publish path does not dispatch mock-only cohort work.
2. At least one DB-backed lifecycle test is green.
3. The worker warning baseline is reduced or, at minimum, does not regress.
4. The authoritative publish/results path has both lightweight and infra-backed
   proof.

### Validation

- `npm run test:phase4`
- targeted DB-backed integration test commands
- `npm run lint:phase4`

### Non-Goals

- full cohort feature expansion beyond what is needed for truthfulness
- broad cleanup of unrelated worker infrastructure

## Sprint 4: Secondary Surfaces And Documentation Convergence

### Goal

Stop exposing ambiguous or placeholder product surfaces, then align the docs
with the stabilized architecture.

### Stories

#### S4.1 Secondary Surface Triage

- Size: `S`
- Surfaces to classify:
  - `client/src/pages/planning.tsx`
  - `client/src/pages/kpi-manager/KpiDefinitionModal.tsx`
  - `server/compass/routes.ts`
- Each surface must be assigned one state:
  - ship now
  - hide behind flag
  - archive

#### S4.2 Implement Or Hide Based On Triage

- Size: `M`
- Scope:
  - implement only surfaces that survive triage
  - hide or archive the rest so the UI no longer overclaims capability

#### S4.3 Documentation Refresh

- Size: `S`
- Scope:
  - update README and current status docs to match the live wizard,
    publish/results behavior, and supported surfaces
- Primary files:
  - `README.md`
  - `docs/BUILD_READINESS.md`
  - `docs/_generated/staleness-report.md`

### Acceptance

1. No user-facing primary surface remains both visible and knowingly dead-end.
2. README no longer contradicts the live fund lifecycle.
3. Stale or contradictory status docs are either updated or clearly marked as
   historical.

### Validation

- targeted UI smoke tests for any still-exposed secondary surfaces
- markdown/doc review

### Non-Goals

- shipping every secondary feature
- rewriting historical archive material

## Dependency Order

1. Sprint 1 before all others
2. Sprint 2 after Sprint 1 handoff behavior is stable
3. Sprint 3 after Sprint 1, with Sprint 2 preferred but not strictly required
   for infra work
4. Sprint 4 after the architecture and orchestration path stop moving

## Recommended Cut Lines

If schedule pressure appears, cut in this order:

1. defer secondary-surface implementation, but keep hide/archive work
2. defer full cohort implementation, but do not defer removing mock-only cohort
   from the authoritative path
3. defer broad doc refresh, but do not defer README correction once Sprint 1
   behavior lands

## Success Condition

This spec set is complete when the repo has:

1. one truthful active wizard path
2. one truthful create/publish/results lifecycle
3. no mock-only work on the authoritative publish path
4. one real persistence-backed lifecycle test lane
5. no prominently exposed dead-end product surfaces pretending to be complete
