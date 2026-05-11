---
status: ACTIVE
last_updated: 2026-05-11
owner: Core Team
review_cadence: P30D
categories: [governance, roadmap, stabilization]
keywords: [global-rules, milestones, stabilization, roadmap, governance]
---

# Stabilization Roadmap

## Purpose

This document is the single canonical reference for the project's global rules
and milestone plan. It governs PR scope, milestone sequencing, and development
constraints during the stabilization program. All contributors and agents must
follow these rules.

Milestone 0A is now landed on `main`. The canonical validation command is
`npm run validate:core`, and the integration harness now coordinates startup
through a machine-readable ready-file contract instead of human log parsing.

## Global Rules

1. **Do not start milestone N+1 until milestone N is merged and
   `npm run validate:core` is green.**
2. **Never use human log parsing for test coordination again.** Integration
   harnesses must coordinate through files, environment variables, or IPC --
   never log text.
3. **No route removal until structural route-governance tests cover all mounted
   entrypoints.**
4. **Public contracts and internal surfaces must be classified separately.**
5. **Default action for uncertain surfaces is unmount, not improve.** No LP,
   KPI, portal, or Compass expansion during this program.
6. **Every PR must state which milestone it belongs to and must touch only that
   concern.** Sandbox validation is required where practical, and route or nav
   changes should validate against the exported governance registry.

## Milestone Summary

| Milestone | Title                                 | Status     | Exit Gate                                                     |
| --------- | ------------------------------------- | ---------- | ------------------------------------------------------------- |
| 0A        | Land The Validated Core Gate          | [COMPLETE] | validate:core green, fix merged                               |
| 0B        | Lock The Gate                         | [COMPLETE] | Regression test, CI gate, runbook entry                       |
| 1         | Reduce The Runtime Perimeter          | [COMPLETE] | Registry/tests cover all mounted entrypoints, runtime reduced |
| 2         | Consolidate Route And Flag Control    | [COMPLETE] | One flag API for route exposure                               |
| 3         | Make Shared Domain Logic Authority    | [COMPLETE] | Shared code is single source of truth for fund math           |
| 4         | Move Finalization Authority To Server | [COMPLETE] | One request owns full lifecycle                               |
| 5         | Clean Backend Boundaries              | [COMPLETE] | No fake persistence, modular route registration               |
| 6         | Add Narrow Internal Features Only     | [COMPLETE] | New work inside reduced route set only                        |
| 7         | Reduce Tooling Entropy                | [COMPLETE] | Short, obvious supported command path                         |

## Milestone Details

### Milestone 0A: Land The Validated Core Gate

**Goal:** Merge the sandbox-proven validation fix and make it the canonical
gate.

- [x] Implement a readiness handshake between `server/bootstrap.ts` and
      `tests/integration/global-setup.ts` so integration tests no longer depend
      on human-readable log parsing.
- [x] Add a machine-readable `TEST_READY_FILE` contract and remove log-based
      port detection from the integration harness.
- [x] Add a consolidated `validate:core` command to `package.json`.
- [x] Update the docs so the authoritative validation command is
      `npm run validate:core`.
- [x] Add one short engineering rule to docs: integration harnesses must
      coordinate through files/env/IPC, never log text.

**Exit criteria:**

- `npm run test:phase4:integration` passes.
- `npm run validate:core` passes.
- The fix is merged, not just present in a dirty worktree.

---

### Milestone 0B: Lock The Gate

**Goal:** Make it hard to regress the validation lane.

- [x] Add a CI job or required local pre-merge checklist item for
      `npm run validate:core`.
- [x] Add a small regression test around the readiness contract so future
      startup refactors do not silently break integration tests.
- [x] Add a short runbook entry describing how the integration server handshake
      works and where the ready file is written.

**Exit criteria:**

- The team has one obvious command and one obvious failure mode.
- A future change to startup logging cannot break integration setup.

---

### Milestone 1: Reduce The Runtime Perimeter

**Goal:** Make the mounted app match the internal-tool product truth.

- [x] Make client route tests work from sandbox/worktree checkouts by resolving
      Vitest setup files from project-root-relative paths in `vitest.config.ts`.
- [x] Export the mounted route surfaces from `client/src/App.tsx` and add a
      central route-governance registry at
      `client/src/app/route-governance-registry.ts`.
- [x] Add structural and behavioral client tests covering `APP_ROUTES`,
      `LP_ROUTES`, legacy redirects, public contracts, and admin entrypoints.
- [x] Wire `ENABLE_LP_REPORTING` into route mounting or remove LP routes from
      the main shell so LP exposure is explicitly governed.
- [x] Reduce default exposure down to the core internal workflow: `/fund-setup`,
      `/fund-model-results/:fundId`, `/dashboard`, `/portfolio`, `/pipeline`,
      `/reports`, `/settings`, `/help`.
- [x] Remove or archive placeholder surfaces, including the standalone planning
      and KPI pages, after the registry-backed perimeter tests guard the change.
- [x] Treat `/shared/:shareId` and `/portal/:rest*` as explicit contract
      decisions instead of incidental leftovers.
- [x] Sync README and build-readiness docs to the reduced route set after the
      public-contract and placeholder cleanup decisions are finalized.

**Exit criteria:**

- Mounted routes match product truth.
- Registry-backed route-governance tests cover every mounted entrypoint.
- No dead-end placeholder page is reachable.

---

### Milestone 2: Consolidate Route And Flag Control

**Goal:** One control plane for route exposure.

- [x] Introduce a route-control adapter over the generated registry for
      route/admin exposure, centered on `client/src/app/route-control-flags.ts`.
- [x] Move LP route mounting, onboarding-tour shell mounting, and admin route
      gating onto that route-control layer.
- [x] Remove localStorage overrides for route/admin exposure in the canonical
      route-control path and align generated defaults with the current product
      perimeter.
- [x] Retire the remaining route-adjacent legacy consumers by moving
      `GuidedTour.tsx` and `dynamic-fund-header.tsx` off
      `client/src/core/flags/featureFlags.ts` and shrinking the legacy shim to
      compatibility-only exports.
- [x] Add direct tests for `client/src/app/route-control-flags.ts` and trim the
      old legacy route/admin flag tests accordingly.
- [x] Add a generated-registry key for engine integration, then migrate
      `useEngineComparison.ts` and `CapitalAllocationStep.tsx` off the legacy
      shim.
- [x] Ensure route mounting, navigation visibility, and docs all derive from the
      same control layer.

**Exit criteria:**

- One flag API determines route exposure.
- No product route is mounted outside that control path.

---

### Milestone 3: Make Shared Domain Logic Authoritative

**Goal:** Remove drift between client and shared math.

- [x] Extend the boundary completeness guard to cover existing shared-authority
      shims, including constrained reserves, liquidity, graduation, and
      deterministic reserves.
- [x] Add a normalized `DeterministicReserveEngine` parity harness comparing
      direct inputs plus wizard-transformed requests, including shared-authority
      validation and canonical fallback coverage.
- [x] Migrate callers away from duplicated client engines such as
      `client/src/core/LiquidityEngine.ts:18`,
      `client/src/core/graduation/GraduationRateEngine.ts:1`, and
      `client/src/core/reserves/DeterministicReserveEngine.ts:1` toward their
      shared-authoritative implementations.
- [x] Delete client duplicates only after parity tests and caller migration are
      complete for liquidity, graduation, and deterministic reserve flows.
- [x] Converge `CapitalAllocationEngine` by porting `dynamic_ratio` into the
      shared implementation, validating parity, and shimming the client engine.

**Exit criteria:**

- Shared code is the single source of truth for the active liquidity,
  graduation, reserve, capital-allocation, pacing, and cohort math paths.
- Any remaining non-shim client engine is either converged or explicitly
  deferred by milestone policy.

---

### Milestone 4: Move Finalization Authority To The Server

**Goal:** One server-owned lifecycle transaction.

- [x] Replace the client orchestration in `client/src/pages/ReviewStep.tsx:213`
      with one server finalize endpoint.
- [x] Shrink the review page so it submits once and renders progress/result
      state only.
- [x] Keep `client/src/stores/fundStore.ts:124` as draft UI state, not lifecycle
      authority.
- [x] Finish migration away from deprecated create payload support in
      `server/routes/funds.ts:25` and `server/routes/funds.ts:28`.
- [x] Replace route-level `console.warn` usage in `server/routes/funds.ts:155`
      and `server/routes/funds.ts:206` with structured logger calls.

**Exit criteria:**

- One request owns create, draft persistence, publish, and result kickoff.
- The review page is orchestration-light.

---

### Milestone 5: Clean Backend Boundaries

**Goal:** No mixed ownership, no fake-success writes on mounted paths, and no
implicit storage mode.

- [x] Build the ownership matrix for the remaining inline routes in
      `server/routes.ts`. Remaining inline ownership has been collapsed to
      dedicated route modules: dashboard summary, investments, portfolio
      companies, activities, legacy fund metrics, and engine summaries.
      Unsupported scenario writes remain explicit `501` contracts until real
      persistence exists.
- [x] Remove fake-success semantics from mounted write routes first.
      `POST /api/investments/:id/rounds` and `POST /api/investments/:id/cases`
      now return explicit `501 UNSUPPORTED_STORAGE_OPERATION` until real
      persistence exists.
- [x] Add observable storage runtime state in `server/storage.ts` and expose it
      through `/readyz` and `/health/detailed`.
- [x] Extract the safest remaining boundaries first. Dashboard summary now lives
      behind `server/services/dashboard-summary-read-service.ts` and
      `server/routes/dashboard-summary.ts`, and investment routes now live in
      `server/routes/investments.ts`.
- [x] Extract the remaining real CRUD route modules from `server/routes.ts`.
      Portfolio companies and activities now live in
      `server/routes/portfolio-companies.ts` and `server/routes/activities.ts`.
- [x] Move remaining composed reads into dedicated services as needed. Dashboard
      summary now reads through
      `server/services/dashboard-summary-read-service.ts`, and the remaining
      summary endpoints live in dedicated route modules instead of the central
      registrar.
- [x] Tighten storage enforcement after observability is in place.
      `server/db.ts` and `server/storage.ts` now share explicit boot policy via
      `server/storage-runtime-policy.ts`, with fail-fast behavior when neither
      DB mode nor explicit dev memory mode is allowed.
- [x] Add regression guards: boot-surface route tests, storage-mode assertions,
      and no-fake-mounted- writes coverage are now enforced by the M5
      integration/unit suites.

**Exit criteria:**

- No mounted endpoint pretends to persist data it does not.
- Storage mode and capabilities are explicit and testable.
- `server/routes.ts` is registration-focused rather than a mixed business-logic
  module.

**Status:** [COMPLETE]

---

### Milestone 6: Add Narrow Internal Features Only

**Goal:** Improve analyst throughput inside the stabilized perimeter.

- [x] Put reserve-planning persistence into the live portfolio surface, not the
      old planning page.
- [x] Add publish history, stale-evidence alerting, and recalculation controls
      to `client/src/pages/fund-model-results.tsx`.
- [x] Replace coarse results polling with lifecycle-aware exponential backoff
      polling and keep history refresh tied to the same results-status model.
- [x] Keep every new feature inside the reduced route set.

**Exit criteria:**

- New work improves the internal team's core workflow directly.
- No new side surface is created.

---

### Milestone 7: Reduce Tooling Entropy

**Goal:** Make the repo operable without archaeology.

- [x] Inventory scripts into supported, internal migration, and archive.
      Historical classification was recorded in
      `docs/archive/2026-q2/generated-inventory-snapshots/script-classification.json`.
      That generated file is currently a stale snapshot from an older repo state
      and is not authoritative until regeneration is unblocked by the Node
      runtime issue. Current repo truth is 90 root npm scripts; the older
      `340 scripts / 65 supported / 21     internal-migration / 254 archived`
      split is preserved only as historical milestone context.
- [x] Keep a small supported command set in `README.md` and
      `docs/BUILD_READINESS.md`. Dead `test:run` reference removed from
      `CLAUDE.md`. All docs now reference only scripts that exist.
- [x] Archive obsolete plans/docs after each milestone instead of letting them
      accumulate. 87 files archived to `docs/archive/m7-cleanup/` with manifest.
      8 ephemeral log files deleted. 22 source-of-truth files kept.

**Exit criteria:**

- The supported command path is short and obvious.
- Historical docs no longer compete with live docs.

## What Changed From The Prior Plan

- Milestone 0 is now split into 0A and 0B because the sandbox proved the exact
  first fix and showed that hardening it is separate work.
- `validate:core` is now mandatory infrastructure, not just a convenience
  command.
- Milestone 1 now starts with Vitest worktree portability and an exported route
  registry instead of jumping straight to route removal.
- Route-governance testing now covers all mounted entrypoints, not just the
  quarantined secondary surfaces.
- LP route control is pulled slightly forward so LP exposure cannot stay mounted
  outside the perimeter decision path.
- A dedicated test boot script moved from "must do early" to "optional later
  improvement," because the existing API-only boot path already works.
- Log cleanup in fund routes moved out of Milestone 0 and into lifecycle/backend
  cleanup, where it belongs.

## Program Status (2026-04-05)

Milestones 0A through 7 are all complete. The stabilization program has landed.
Active product and hardening work now lives in `docs/plans/` as dated plan
documents; this roadmap remains the **governance** source of truth for the rules
below, not a backlog.

**Post-stabilization active streams** (see `docs/plans/` for details):

- Variance / baseline automation hardening —
  `2026-04-03-phase-1a2-baseline-automation-hardening-validated.md`
- Alert evaluation and scheduling —
  `2026-04-02-phase-1c1-alert-evaluation-implementation-strategy.md`,
  `2026-04-02-phase-1c2-alert-scheduling-and-remaining-capital-plan.md`
- Scenario comparison consolidation —
  `2026-04-02-phase-2-scenario-comparison-consolidation-plan.md` and the
  2026-04-03 slice 3 / slice 4 follow-ups
- Dual-forecast PR queue — `2026-04-03-phase-1b-single-owner-pr-queue.md`
- Doc truthfulness remediation (CLOSED 2026-04-08, settled on main) —
  `docs/archive/2026-q2/2026-04-05-todo-report-remediation-strategy.md`

**Standing rules that outlast the program:**

1. Route or nav changes must flow through the exported governance registry and
   the generated route-control adapter.
2. Shared math stays authoritative; no new client-side engine forks.
3. `npm run validate:core` remains the hard delivery gate.
4. LP / KPI / Compass expansion remains off-limits until their gate decisions
   reopen (see `DECISIONS.md` ADR-020 for Phase 3C Track B).
