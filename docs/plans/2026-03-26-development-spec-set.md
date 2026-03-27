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
9. The mounted app sidebar is `client/src/components/layout/sidebar.tsx` driven
   by `client/src/components/layout/navigation-config.ts`.
   `client/src/components/layout/expandable-sidebar.tsx` is not mounted in
   `client/src/App.tsx` and should be treated as secondary cleanup.
10. Current active-module detection in `client/src/App.tsx` copies the raw
    pathname segment and does not normalize dynamic routes like
    `/fund-model-results/:fundId`.
11. The checked-in sidebar test at
    `client/src/components/__tests__/Sidebar.test.tsx` is not part of the active
    Vitest include set and also mocks `wouter` with `to` instead of `href`; new
    navigation coverage must live under `tests/unit/**/*`.
12. The live sidebar currently falls back to `/${item.id}` for most links and
    renders nested interactive controls (`Link` wrapping `button`), so the
    results navigation work should be used to make navigation metadata explicit
    and correct the accessibility/behavior contract.
13. The navigation code currently uses `client/src/core/flags/featureFlags.ts`
    as its flag source; new sidebar work should keep that as the authoritative
    source rather than mixing in the older runtime `useFlag` hook path.

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

#### S1.4 Results Navigation Alignment

- Size: `S`
- Scope:
  - add one canonical results/status destination in the mounted navigation
    source of truth:
    - `client/src/components/layout/navigation-config.ts`
  - decide whether that destination belongs in both navigation modes:
    - legacy/full nav
    - `NEW_IA` simplified nav
  - centralize fund-scoped navigation behavior in one shared helper or
    equivalent implementation:
    - resolve href from route fund ID first, then `currentFund.id`, else a safe
      disabled or setup fallback
    - determine whether the nav item is enabled
    - match dynamic locations back to a stable nav ID
  - replace implicit `id -> /${id}` navigation with explicit nav metadata so
    route generation is not encoded in `sidebar.tsx`
  - update `client/src/components/layout/sidebar.tsx` to consume that shared
    behavior instead of blindly linking to `/${item.id}`
  - replace mirrored `activeModule` state in `client/src/App.tsx` with direct
    route-derived matching so `/fund-model-results/:fundId` highlights correctly
    without an effect-driven sync layer
  - remove nested interactive nav controls in the live sidebar so enabled items
    render as links and disabled items render as disabled controls
  - clean up stale `Publish` wording in
    `client/src/components/layout/expandable-sidebar.tsx` only after the live
    sidebar path is aligned
- Primary files:
  - `client/src/components/layout/navigation-config.ts`
  - `client/src/components/layout/sidebar.tsx`
  - `client/src/App.tsx`
  - `client/src/contexts/FundContext.tsx`
  - `client/src/lib/fund-routes.ts`
  - `tests/unit/components/layout/sidebar-navigation.test.tsx`

### Acceptance

1. Completing the active wizard no longer lands users on a results route that
   immediately reports `Publish your fund configuration to see this section.`
2. If publish succeeds, the results page loads in `calculating` or `ready`
   state.
3. If draft save or publish fails, the user remains in the active flow with an
   actionable error and without data loss.
4. The active handoff path is covered by at least one boot-path automated test.
5. The sidebar no longer exposes stale `Publish` wording as a primary action; it
   exposes a results/status destination that opens `/fund-model-results/:fundId`
   for the selected or route-addressed fund.
6. The results/status nav item highlights correctly on deep-linked dynamic
   routes such as `/fund-model-results/42`.
7. Navigation coverage for this behavior runs inside the active Vitest project,
   not only in dormant `client/src/components/__tests__`.
8. The live sidebar no longer relies on nested `Link` + `button` controls for
   primary navigation, and disabled results navigation does not navigate.
9. Navigation behavior is derived from explicit config metadata plus current
   route context, not from `item.id` string concatenation.

### Validation

- `npm run test:phase4`
- `npm run lint:phase4`
- `npx vitest run tests/unit/contexts/fund-context-route-selection.test.tsx --project=client`
- `npx vitest run tests/unit/components/layout/sidebar-navigation.test.tsx --project=client`

### Sandbox-Validated Revisions

1. Treat `client/src/components/layout/sidebar.tsx` plus
   `client/src/components/layout/navigation-config.ts` as the implementation
   path. `expandable-sidebar.tsx` cleanup is follow-through only.
2. Do not scope this as a label change. The live issue also requires fund-scoped
   href generation and route-aware active matching.
3. Reuse the route-fund precedence already proven by
   `tests/unit/contexts/fund-context-route-selection.test.tsx`: route fund ID
   first, then `currentFund.id`, then safe fallback.
4. Do not rely on `client/src/components/__tests__/Sidebar.test.tsx` for
   validation. A sandbox test run against that file returned
   `No test files found` under the active client Vitest project, and the file's
   `wouter` mock is out of date.
5. Because `navigationItems` and `footerItems` are currently resolved at module
   load in `client/src/components/layout/sidebar.tsx`, the implementation should
   avoid making new route/flag behavior depend on stale module-scope state where
   a render-time helper would be clearer and easier to test.
6. The route-derived active-module work should remove the redundant
   location-to-state effect in `client/src/App.tsx` rather than layering new
   matching logic on top of it.
7. The sidebar implementation should standardize on the existing
   `client/src/core/flags/featureFlags.ts` path so nav behavior and tests do not
   split across multiple flag systems.

### Non-Goals

- full wizard architecture replacement
- DB-backed infra restoration across the whole suite
- secondary feature implementation

## Sprint 2: One Active Wizard

### Goal

Reduce architecture drift by establishing one production wizard owner, removing
machine-specific coupling from shared wizard logic, and moving the routed flow
from partial local persistence to an authoritative server-backed draft
lifecycle.

### Stories

#### S2.1 Production Wizard Ownership Decision

- Size: `S`
- Scope:
  - explicitly confirm the routed store-based wizard as the production owner
  - document the XState wizard as non-authoritative unless a replacement plan is
    approved separately

#### S2.2 Extract Shared Wizard Seams From Machine-Specific Context

- Size: `M`
- Scope:
  - extract shared wizard calculation/domain types so active routed-flow code
    does not depend directly on `ModelingWizardContext`
  - target the smallest useful shared seam first:
    - `steps.generalInfo`
    - `steps.sectorProfiles`
    - `steps.capitalAllocation`
    - optional `calculations.reserves`
  - preserve compatibility for any remaining XState consumers behind an adapter
    or compatibility seam
  - do not rewrite the active wizard to XState
- Primary files:
  - `client/src/hooks/useWizardCalculations.ts`
  - `client/src/hooks/useEngineComparison.ts`
  - `client/src/lib/wizard-reserve-bridge.ts`
  - `client/src/lib/wizard-calculations.ts`
  - `client/src/machines/modeling-wizard.machine.ts`

#### S2.3 Quarantine The Parallel Wizard UI And Ownership Claims

- Size: `S`
- Scope:
  - retire the XState wizard from production ownership after shared seams are
    extracted
  - quarantine or archive entry points, docs, and tests that still imply it is
    live
  - keep only code that still serves an active shared-library purpose
- Primary files:
  - `client/src/components/modeling-wizard/ModelingWizard.tsx`
  - `client/src/machines/modeling-wizard.machine.ts`
  - any tests or docs that still present it as the main flow

#### S2.4 Draft Identity Bootstrap For The Active Wizard

- Size: `M`
- Scope:
  - create a server-recognized draft identity before the review step
  - use the existing canonical create path (`POST /api/funds`) and its atomic
    initial-draft behavior once minimum fund basics are valid
  - persist the canonical `fundId` in the active routed flow so subsequent
    autosave and resume operations target one fund consistently
  - make bootstrap idempotent and retry-safe so the wizard does not create
    duplicate funds on transient failure
  - if step 1 still allows navigation before minimum createable basics exist,
    keep the review-step create fallback explicit during the transition instead
    of assuming universal pre-review identity bootstrap
- Primary files:
  - `client/src/pages/fund-setup.tsx`
  - `client/src/pages/FundBasicsStep.tsx`
  - `client/src/stores/fundStore.ts`
  - `client/src/services/funds.ts`
  - `server/routes/funds.ts`

#### S2.5 Server-Backed Draft Autosave For The Active Wizard

- Size: `M`
- Scope:
  - add debounced or step-bound draft upsert against `PUT /api/funds/:id/draft`
    after draft identity bootstrap succeeds
  - persist authoritative draft data during the wizard, not only in review
  - include dirty-state and retry behavior that is explicit about create vs
    draft-save failures
- Primary files:
  - `client/src/pages/fund-setup.tsx`
  - step pages under `client/src/pages/*`
  - `client/src/stores/fundStore.ts`
  - `server/routes/fund-config.ts`

#### S2.6 Draft Hydration And Authority Policy

- Size: `M`
- Scope:
  - define deterministic load authority across:
    - pre-bootstrap local persisted slice
    - server draft after bootstrap
    - empty defaults
  - do not implement a vague whole-object merge between server and local state
  - once a canonical server draft exists, make server draft authoritative and
    either invalidate or explicitly quarantine the partial local persisted slice
  - do not persist `draftFundId` alone before server draft hydration is in
    place; durable draft identity must ship together with authoritative reload
    behavior or explicit local invalidation
  - ensure reload/resume behavior is deterministic across tabs and devices
- Primary files:
  - `client/src/stores/fundStore.ts`
  - `client/src/pages/fund-setup.tsx`
  - `client/src/pages/ReviewStep.tsx`
  - `server/routes/fund-config.ts`

### Acceptance

1. The repo has one explicit production wizard owner.
2. Shared routed-wizard logic no longer depends directly on
   `ModelingWizardContext` where a shared domain seam is sufficient.
3. When minimum fund basics are valid, the active wizard acquires a stable
   canonical `fundId` before review and reuses it for autosave; if step 1 still
   permits incomplete progression, the review-step fallback remains explicit and
   duplicate-safe during the transition.
4. The active wizard can save, reload, and resume from server-backed draft
   state.
5. Local persistence no longer acts as the only durable source of wizard truth,
   and its authority after bootstrap is explicitly defined.
6. Obsolete wizard ownership claims are removed from production docs/tests.

### Validation

- `npx vitest run tests/unit/adapters/fund-store-adapters.test.tsx --project=client`
- `npx vitest run tests/unit/contract/fund-draft-round-trip.test.ts --project=server`
- exact targeted routed-wizard bootstrap/autosave/resume tests under
  `tests/unit/pages/*`
- `npm run test:wave3`
- `npm run test:wave4`
- `npm run test:phase4` remains green

### Sprint-2 Revisions From Codebase Review

1. Do not start autosave before the routed wizard has a stable draft identity.
   The current server draft API is fund-scoped (`PUT /api/funds/:id/draft`),
   while canonical fund creation already creates an initial draft atomically in
   `server/routes/funds.ts`.
2. Do not treat XState retirement as a pure delete task. Shared hooks and libs
   still import `ModelingWizardContext`, so seam extraction must precede UI
   quarantine.
3. Do not describe hydration as a generic merge. The live `fundStore`
   local-persisted slice is partial (`stages`, `sectorProfiles`, `allocations`,
   `followOnChecks`, and capital plan inputs), so an unqualified server/local
   merge would be lossy and ambiguous.
4. Prefer a clear authority rule:
   - before bootstrap: local persisted slice may seed in-progress work
   - after bootstrap: server draft is authoritative
   - local persisted data becomes cache-only or is invalidated explicitly
5. Keep this sprint focused on ownership, draft identity, autosave, and resume.
   Do not expand it into a replacement of the routed wizard with the XState
   implementation.

### Sandbox-Validated Revisions

1. The early draft-identity bootstrap is valid, but it is currently conditional.
   `FundBasicsStep` can still advance without enough data to call
   `POST /api/funds`, so the Sprint 2 plan must keep the review-step create
   fallback until step-level validation or blocking bootstrap behavior is
   explicitly accepted.
2. A session-scoped `draftFundId` is useful immediately, but persisting that ID
   before server hydration is unsafe because the live local persisted slice is
   partial. The durable identity story must stay coupled to S2.6 authority and
   hydration work.
3. The shared seam extraction is smaller than the machine type implies. A
   minimal computation context covering `generalInfo`, `sectorProfiles`,
   `capitalAllocation`, and optional `calculations.reserves` was enough to
   remove direct `ModelingWizardContext` dependency from the touched shared
   calculation helpers.
4. Bootstrap work changes test-double contracts. Review-step and integration
   harnesses that stub `fundStore` now also need `draftFundId` and
   `setDraftFundId`, so Sprint 2 should budget for test-harness updates
   alongside feature work.
5. Sandbox validation exposed intermittent `spawn EPERM` failures when running
   direct or parallel single-file Vitest commands. For reliable sandbox
   validation, prefer serial named scripts (`test:wave3`, `test:wave4`,
   `test:phase4`) and treat one-off direct Vitest file runs as best-effort.

### Non-Goals

- replacing the active wizard with the XState flow
- broad UI redesign of wizard steps

## Sprint 3: Orchestration Truth And Test Hardening

### Goal

Make the authoritative publish pipeline explicitly reserve-and-pacing based,
keep queue-less mode truthful for development and test environments, and add one
real-DB lifecycle lane that validates persisted publish state.

### Stories

#### S3.1 Extract Reusable Authoritative Calculation Services

- Size: `M`
- Scope:
  - extract pure reserve and pacing execution services from the BullMQ worker
    wrappers
  - keep queue, health-server, and signal-handling concerns inside worker entry
    modules
  - make the authoritative calculation path callable from both:
    - queue workers
    - queue-less publish flow
  - do not call worker entry modules directly from request or publish code
  - migrate static invariant proofs that inspect snapshot inserts from worker
    wrappers to the extracted services
  - keep the new service seam baseline-clean under the repo's strict TypeScript
    settings, including `exactOptionalPropertyTypes`
- Primary files:
  - `server/services/reserve-calculation-service.ts`
  - `server/services/pacing-calculation-service.ts`
  - `server/services/pacing-fund-size.ts`
  - `workers/reserve-worker.ts`
  - `workers/pacing-worker.ts`
  - `tests/unit/phase2a/config-invariants.test.ts`

#### S3.2 Introduce A Shared Authoritative Engine Registry

- Size: `S`
- Scope:
  - define one typed source of truth for engine metadata:
    - engine key
    - snapshot type
    - authoritative vs experimental status
    - queue key
    - whether synchronous local execution is supported
  - use that registry in:
    - publish dispatch
    - calc-run completion logic
    - lifecycle derivation
    - read contracts
    - queue registration and operational classification
  - keep reserve and pacing as the only authoritative engines for this sprint
  - mark cohort as experimental in registry-backed operational surfaces instead
    of leaving it classified like a primary lifecycle dependency
- Primary files:
  - `shared/contracts/fund-authoritative-calculations.contract.ts`
  - `server/services/fund-persistence-service.ts`
  - `server/services/calc-run-tracking.ts`
  - `server/services/fund-state-derivation.ts`
  - `shared/contracts/fund-state-read-v1.contract.ts`
  - `server/queues/registry.ts`

#### S3.3 Make Queue-Less Publish Truthful

- Size: `M`
- Scope:
  - when queues are disabled or a producer queue is absent, do not let publish
    fail solely because the queue layer is unavailable
  - run authoritative reserve and pacing calculations synchronously using the
    extracted services when the registry says they are sync-capable
  - preserve the queue-backed asynchronous path when queues are enabled
  - keep persisted attribution consistent across both execution modes:
    - `calcRuns`
    - `fundSnapshots`
    - `runId`
    - `configId`
    - `configVersion`
  - ensure redispatch only targets missing authoritative snapshots and does not
    treat experimental cohort work as part of authoritative readiness
  - make user-facing and API copy neutral between queued and inline execution;
    use wording like `calculations started`, not `calculations queued`
  - ensure `/api/funds/:id/state` and `/api/funds/:id/results` derive truthful
    lifecycle state from persisted authoritative evidence
- Primary files:
  - `server/routes/fund-config.ts`
  - `server/services/fund-persistence-service.ts`
  - extracted authoritative calculation services from S3.1

#### S3.4 Add Explicit Real-DB Backend Selection For Tests

- Size: `S`
- Scope:
  - stop assuming the current Vitest integration project is a truthful
    persistence lane
  - add an explicit backend-selection mechanism so test runs can opt out of
    `databaseMock`, for example `USE_REAL_DB_IN_VITEST=1`
  - land this selection seam before building the real-DB lifecycle lane
  - keep the existing lightweight mock-backed ratchets intact for fast feedback
- Primary files:
  - `server/db.ts`
  - `tests/integration/setup.ts`
  - `vitest.config.int.ts`
  - any new DB-specific Vitest config or helper introduced by this sprint

#### S3.5 Create One In-Process DB-Backed Lifecycle Suite

- Size: `M`
- Scope:
  - add one dedicated lifecycle suite that validates
    `create -> save draft -> publish -> state/results` against real persisted
    rows
  - prefer in-process app boot with explicit environment control over the
    current spawned-server integration lane
  - validate persisted lifecycle records directly where useful:
    - `fund_configs`
    - `calc_runs`
    - `fund_snapshots`
  - deliver the DB lifecycle lane behind a named `npm run test:lifecycle:db`
    script instead of relying on ad hoc single-file runs
- Primary files:
  - new lifecycle DB suite under `tests/integration/*`
  - `package.json`
  - test infra helpers under `tests/helpers/*`
  - any DB-specific Vitest config introduced by this sprint

#### S3.6 Rewrite Or Retire Blocked Infra Tests Around The Supported Lane

- Size: `S`
- Scope:
  - do not blindly unskip quarantined tests that still target obsolete runtime
    assumptions
  - rewrite only the highest-value blocked suites that align with the supported
    real-DB lane
  - treat generic Docker/testcontainers smoke as optional infra verification,
    not the default lifecycle gate
  - assume some legacy suites will be retired rather than revived if they still
    depend on outdated DB exports or obsolete boot assumptions
- Priority order:
  1. one lifecycle DB-backed suite
  2. one high-value persistence or SQL-backed suite rewritten against the new
     lane
  3. one optional infrastructure smoke suite
- Primary files:
  - `tests/integration/circuit-breaker-db.test.ts`
  - `tests/integration/testcontainers-smoke.test.ts`
  - any rewritten supporting suites selected in this sprint

#### S3.7 Reduce Authoritative Worker Warning Debt

- Size: `S`
- Scope:
  - lower the ratcheted warning baseline for reserve and pacing workers first
  - treat cohort warning cleanup as secondary unless cohort returns to a
    truthful supported path
  - do not weaken the existing guard

### Acceptance

1. The authoritative publish contract is defined from one shared registry and is
   explicitly `reserve + pacing`, while cohort is classified as experimental
   unless the sprint also delivers truthful persisted cohort outputs.
2. Core reserve and pacing execution logic no longer lives only inside BullMQ
   worker entry modules; queue-backed and queue-less execution paths share the
   same reusable services.
3. Static invariant coverage follows the extracted services and still proves
   authoritative snapshot inserts include `snapshotTime`.
4. Queue-less publish does not fail solely because producer queues are absent.
5. In queue-less mode, publish still creates a persisted `calcRun` and writes
   attributed reserve and pacing snapshots with `runId`, `configId`, and
   `configVersion`.
6. Publish and redispatch target authoritative engines only; cohort is not
   required for `calculating` or `ready` lifecycle state.
7. Publish responses and logs do not promise queued execution when inline
   fallback is possible.
8. The repo has one explicit real-DB lifecycle validation lane in addition to
   the existing lightweight phase-4 ratchets.
9. Quarantined DB or testcontainers suites are not unskipped unchanged; they are
   either rewritten against the supported lane or left explicitly outside this
   sprint's scope.
10. The worker warning baseline is reduced or, at minimum, does not regress.

### Validation

- `npm run baseline:check`
- `npm run test:publish-orchestration`
- `npm run test:phase4`
- `npm run lint:phase4`
- optional infrastructure smoke verification may exist separately, but it is not
  required to be part of the default lifecycle gate

### Sprint-3 Revisions From Sandbox Validation

1. Service extraction is viable, but the proof must move with it. The sandbox
   spike kept runtime behavior correct, yet `config-invariants.test.ts` broke
   until the `snapshotTime` assertions were repointed from worker wrappers to
   the new reserve and pacing services.
2. One typed registry is enough to drive both publish truth and operational
   classification. The sandbox spike successfully aligned dispatch, calc-run
   completion, read contracts, and queue registration around a single engine
   catalog.
3. Queue-less publish is first-class behavior, not a fallback edge case. The
   spike validated inline reserve and pacing execution when queues are absent,
   and it exposed that route copy must say calculations were `started`, not
   necessarily `queued`.
4. The real-DB switch is small and should land early. A deliberate backend
   selection seam in `server/db.ts` is a prerequisite for the real lifecycle
   lane, not a later refinement.
5. The existing lightweight ratchets remain useful. `npm run test:phase4` and
   the orchestration-focused phase-2A suite already provide fast proof while the
   real-DB lane is being added.
6. The current targeted orchestration suite was the right seed for
   `test:publish-orchestration`; that named wrapper can exist now without
   waiting for the real-DB lifecycle lane from S3.5.

### Non-Goals

- full cohort feature expansion beyond what is needed for publish truthfulness
- broad cleanup of unrelated worker infrastructure
- making Docker or testcontainers smoke the default validation path for every
  local or CI run
- reviving quarantined infrastructure tests unchanged when their runtime
  assumptions are obsolete

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
