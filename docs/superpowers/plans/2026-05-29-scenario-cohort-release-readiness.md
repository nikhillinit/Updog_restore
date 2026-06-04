---
status: ACTIVE
audience: agents
last_updated: 2026-05-29
owner: "Platform Team"
review_cadence: P90D
categories: [planning, scenarios, cohorts]
keywords: [scenario-release-hardening, cohort-readiness, authoritative-calculations]
---

# Scenario Cohort Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan red-green, then use superpowers:verification-before-completion before committing or opening a PR.

**Goal:** Make cohort release readiness truthful by locking cohort as an experimental calculation surface that cannot satisfy or block authoritative fund readiness until it writes authoritative snapshots with migration/backfill proof.

**Architecture:** Keep the existing `/api/cohorts` route, cohort worker queue, and Analysis Cohort shared boundary intact. Harden the shared calculation-engine catalog as the single source of truth for authoritative versus experimental engines, mirror that authority into queue registry metadata, and add focused regression tests that prove cohort remains excluded from readiness and completion gates.

**Tech Stack:** TypeScript, shared contracts, BullMQ queue registry metadata, Express route inventory, Vitest server unit tests, docs routing generation.

---

## Inventory Summary

- PR #734 is merged into `main` as `836e59a44afb461ec1177668308d08e140e0b1ce`, and post-merge main checks are green for Documentation Routing Check, CI Unified, CI Gate Status, CodeQL, Security Deep Scan, and pages-build-deployment.
- `server/routes.ts` mounts cohort analysis at `/api/cohorts`; `server/app.ts` has the same legacy app mount. This plan must preserve that public URL and not normalize route mounts.
- `docs/adr/ADR-020-analysis-cohort-boundary.md` separates Analysis Cohort logic in `shared/core/cohorts/analysis/` from the legacy Exit Cohort Model surface in `CohortEngine`.
- `workers/cohort-worker.ts` still processes mock companies, returns attribution fields, and does not write authoritative `fund_snapshots` rows.
- `shared/contracts/fund-authoritative-calculations.contract.ts` currently classifies reserve and pacing as authoritative, while cohort and economics are experimental.
- `shared/contracts/fund-state-read-v1.contract.ts` derives `EXPECTED_SNAPSHOT_TYPES` from authoritative snapshot types; current authoritative readiness is `RESERVE` plus `PACING`.
- `server/services/fund-persistence-service.ts#getEnginesForConfig()` dispatches authoritative engines only by default and adds economics only when its feature flag and assumptions are present.
- `server/services/calc-run-tracking.ts#markCalcRunCompletedIfReady()` completes a run only when authoritative snapshot types are present.
- Existing tests already prove derivation ignores `COHORT` for ready, but there is no explicit experimental-engine export or cross-registry authority drift test.

## Scope

In scope:

- Add explicit experimental calculation exports/helpers to the shared engine catalog.
- Add regression tests proving cohort is experimental, is excluded from authoritative readiness arrays, and is excluded from calc-run completion coverage.
- Derive queue registry calculation authority from the shared engine catalog instead of duplicating literals.
- Keep docs routing artifacts in sync with this new plan.

Out of scope:

- Cohort snapshot writer, cohort backfill migration, authoritative cohort graduation, new route families, new stores, new dependencies, forecast modes, reserve optimization, methodology guardrails, override expansion, canonical hash semantics, schema-directory renames, money utility refactors, engine dedupe, route mount normalization, and Phoenix-protected docs.

## Implementation Steps

- [x] Add failing shared-contract tests in `tests/unit/contract/fund-authoritative-calculations.test.ts`:
  - assert `EXPERIMENTAL_ENGINE_KEYS` includes `cohort`;
  - assert `AUTHORITATIVE_ENGINE_KEYS` equals `['reserve', 'pacing']`;
  - assert `AUTHORITATIVE_SNAPSHOT_TYPES` excludes `COHORT`;
  - assert `getCalculationEngineDescriptorByQueueKey('cohort-calc')` returns an experimental cohort descriptor.
- [x] Add a failing queue-registry drift test in `tests/unit/phase2a/config-invariants.test.ts`:
  - for every lifecycle calculation queue entry with `fundCalculationAuthority`, compare the registry value against `getCalculationEngineDescriptorByQueueKey(entry.queueName).authority`.
- [x] Add calc-run completion coverage in `tests/unit/services/post-calc-trigger.test.ts`:
  - `RESERVE + COHORT` must not complete a run without `PACING`.
- [x] Implement the shared catalog helpers in `shared/contracts/fund-authoritative-calculations.contract.ts`:
  - derive authoritative and experimental descriptor arrays from `FUND_CALCULATION_ENGINE_CATALOG`;
  - export `EXPERIMENTAL_ENGINE_KEYS`, `EXPERIMENTAL_SNAPSHOT_TYPES`, and `getCalculationEngineDescriptorByQueueKey`;
  - keep public authoritative exports compatible.
- [x] Update `server/queues/registry.ts` to source `fundCalculationAuthority` from `getCalculationEngineDescriptorByQueueKey()`.
- [x] Run focused tests:
  - `npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/contract/fund-authoritative-calculations.test.ts tests/unit/phase2a/config-invariants.test.ts tests/unit/services/post-calc-trigger.test.ts tests/unit/phase2b/lifecycle-derivation.test.ts tests/unit/phase2a/calc-runs-publish.test.ts`
- [x] Run docs routing generation/check because this plan is a new tracked docs file.

## Verification Plan

Focused:

- `npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/contract/fund-authoritative-calculations.test.ts tests/unit/phase2a/config-invariants.test.ts tests/unit/services/post-calc-trigger.test.ts tests/unit/phase2b/lifecycle-derivation.test.ts tests/unit/phase2a/calc-runs-publish.test.ts`

Required closeout:

- `npm run check`
- `npm run lint`
- `npm run test:scenario-release-gate`
- `npm run docs:routing:generate`
- `npm run docs:routing:check`
- `git diff --check`
- `git status --short --branch`

Conditional:

- `npm run test:integration:routes` only if route or route-integration behavior changes.
- `npm run calc-gate` only if calculation engine behavior changes beyond catalog metadata.

## Self-Review

- Spec coverage: The plan addresses cohort release readiness as a truthfulness and drift-prevention slice while preserving current cohort analysis route reachability and avoiding authoritative cohort graduation.
- Placeholder scan: The plan names exact files, expected assertions, and commands.
- Type consistency: Engine keys, snapshot types, queue keys, and authority values all come from `shared/contracts/fund-authoritative-calculations.contract.ts`.
