---
status: ACTIVE
last_updated: 2026-03-28
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

| Milestone | Title                                 | Status        | Exit Gate                                                     |
| --------- | ------------------------------------- | ------------- | ------------------------------------------------------------- |
| 0A        | Land The Validated Core Gate          | [COMPLETE]    | validate:core green, fix merged                               |
| 0B        | Lock The Gate                         | [COMPLETE]    | Regression test, CI gate, runbook entry                       |
| 1         | Reduce The Runtime Perimeter          | [COMPLETE]    | Registry/tests cover all mounted entrypoints, runtime reduced |
| 2         | Consolidate Route And Flag Control    | [IN PROGRESS] | One flag API for route exposure                               |
| 3         | Make Shared Domain Logic Authority    | [NOT STARTED] | Shared code is single source of truth for fund math           |
| 4         | Move Finalization Authority To Server | [NOT STARTED] | One request owns full lifecycle                               |
| 5         | Clean Backend Boundaries              | [NOT STARTED] | No fake persistence, modular route registration               |
| 6         | Add Narrow Internal Features Only     | [NOT STARTED] | New work inside reduced route set only                        |
| 7         | Reduce Tooling Entropy                | [NOT STARTED] | Short, obvious supported command path                         |

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
- [ ] Retire the remaining route-facing legacy consumers from
      `client/src/core/flags/featureFlags.ts` once equivalent generated keys and
      tests exist for every consumer.
- [ ] Ensure route mounting, navigation visibility, and docs all derive from the
      same control layer.

**Exit criteria:**

- One flag API determines route exposure.
- No product route is mounted outside that control path.

---

### Milestone 3: Make Shared Domain Logic Authoritative

**Goal:** Remove drift between client and shared math.

- [ ] Add parity tests for reserves, pacing, cohorts, and liquidity.
- [ ] Migrate callers away from duplicated client engines such as
      `client/src/core/LiquidityEngine.ts:18` toward
      `shared/core/liquidity/LiquidityEngine.ts:22`.
- [ ] Do the same for reserve, pacing, and cohort engines, starting with the
      largest or most business-critical diffs.
- [ ] Delete client duplicates only after parity tests and caller migration are
      complete.

**Exit criteria:**

- Shared code is the single source of truth for core fund math.
- No duplicated engine pair remains mounted in production paths.

---

### Milestone 4: Move Finalization Authority To The Server

**Goal:** One server-owned lifecycle transaction.

- [ ] Replace the client orchestration in `client/src/pages/ReviewStep.tsx:213`
      with one server finalize endpoint.
- [ ] Shrink the review page so it submits once and renders progress/result
      state only.
- [ ] Keep `client/src/stores/fundStore.ts:124` as draft UI state, not lifecycle
      authority.
- [ ] Finish migration away from deprecated create payload support in
      `server/routes/funds.ts:25` and `server/routes/funds.ts:28`.
- [ ] Replace route-level `console.warn` usage in `server/routes/funds.ts:155`
      and `server/routes/funds.ts:206` with structured logger calls.

**Exit criteria:**

- One request owns create, draft persistence, publish, and result kickoff.
- The review page is orchestration-light.

---

### Milestone 5: Clean Backend Boundaries

**Goal:** No mixed ownership and no fake persistence on mounted paths.

- [ ] Split remaining inline endpoints out of `server/routes.ts:35`, especially
      the ones still defined directly at `server/routes.ts:131` and
      `server/routes.ts:315`.
- [ ] Tighten runtime storage selection from `server/storage.ts:627` so
      unsupported environments fail fast instead of silently dropping to memory.
- [ ] Remove or implement methods still returning mock objects, including the
      areas flagged at `server/storage.ts:565` and `server/storage.ts:584`.
- [ ] Add a boot smoke test proving live routes register with the supported
      storage mode.

**Exit criteria:**

- No mounted endpoint pretends to persist data it does not.
- Route registration is modular and explicit.

---

### Milestone 6: Add Narrow Internal Features Only

**Goal:** Improve analyst throughput inside the stabilized perimeter.

- [ ] Put reserve-planning persistence into the live portfolio surface, not the
      old planning page.
- [ ] Add publish history, recalculation controls, and config-versus-results
      diffing to `client/src/pages/fund-model-results.tsx:86`.
- [ ] Replace blind polling in `client/src/pages/fund-model-results.tsx:121`
      with operation-aware status where practical.
- [ ] Keep every new feature inside the reduced route set.

**Exit criteria:**

- New work improves the internal team's core workflow directly.
- No new side surface is created.

---

### Milestone 7: Reduce Tooling Entropy

**Goal:** Make the repo operable without archaeology.

- [ ] Inventory scripts into supported, internal migration, and archive.
- [ ] Keep a small supported command set in `README.md` and
      `docs/BUILD_READINESS.md`.
- [ ] Archive obsolete plans/docs after each milestone instead of letting them
      accumulate.

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

## Immediate Next Actions

1. Choose the canonical route-control layer so runtime exposure does not stay
   split between `featureFlags.ts` and the broader unified client-flag system.
2. Remove product-surface localStorage overrides that no longer belong in the
   stabilized perimeter.
3. Keep future route or nav changes flowing through the exported governance
   registry and its structural tests.
