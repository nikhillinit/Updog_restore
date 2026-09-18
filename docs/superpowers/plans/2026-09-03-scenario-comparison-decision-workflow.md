---
status: PROPOSED
audience: agents
last_updated: 2026-09-06
owner: Repository Owner
categories: [product-implementation, decision-workspace]
---

# Scenario Comparison Decision Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save source-pinned economics scenario comparisons as analysis evidence
and create linked decisions through C1's atomic command.

**Architecture:** Wire existing comparison lineage into production comparison
reads, define one versioned scenario basis on analysis references, and reuse C1
decision creation. Browser renders economics V1 response only.

**Tech Stack:** TypeScript, Zod, PostgreSQL/Drizzle, React/Preact, Vitest,
Playwright.

**Spec:** `docs/specs/C2-scenario-comparison-decision-workflow.md` after
repository-owner exact-body approval.

## Global Constraints

- C1 atomic command must be admitted first.
- Economics V1 only; baseline has no variant ID; no scenario-set version column.
- Keep existing `UNSUPPORTED_OVERRIDE_TYPE` and `snapshot_hash_mismatch`
  refusals.
- New persistence uses a fresh journal-discovered additive migration and exact
  route/policy manifests when route shapes change.

## Required ADR Reconciliation

Amend `docs/adr/ADR-022-fund-scenario-architecture.md` in the same package.
Preserve original fee-profile-only baseline as history and record current-source
economics comparison support for `fee_profile`, `allocation`, `sector_profile`,
and `methodology`; `reserve_allocation` retains existing typed refusal.
Contract, service, result union, ADR, and tests must enumerate the same set.

### Task 1: Canonical Scenario Evidence Identity

**Files:**

- Create:
  `shared/contracts/internal-analysis/scenario-comparison-basis-v1.contract.ts`
- Modify: `shared/contracts/fund-scenario-comparison-v1.contract.ts:80-129`
- Modify: `shared/schema/fund.ts:190-438`
- Modify: `server/services/fund-scenario-comparison-service.ts:234-379`
- Modify: `server/services/fund-scenario-comparison-lineage-service.ts:74-309`
- Test: `tests/unit/contracts/scenario-comparison-basis-v1.contract.test.ts`
- Test: `tests/integration/scenarios/scenario-comparison-lineage.pg.test.ts`

**Interfaces:**

- Produces: `ScenarioComparisonBasisV1Schema`,
  `comparisonResultHash({ variantIds, comparison })`.

- [ ] Test exact identity fields, sorted unique variants, methodology override,
      baseline-without-ID, result hash, and state/input mismatch.
- [ ] Run tests with retry zero; expect missing-schema/hash failures.
- [ ] Add `methodology` to current schema union, call lineage service from
      production comparison path, and calculate canonical result hash over
      sorted variant IDs plus response.
- [ ] Re-run tests; expect PASS.
- [ ] Commit `feat: bind scenario comparisons to source lineage`.

### Task 2: Persist Scenario Basis

**Files:**

- Modify:
  `shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract.ts:190-231`
- Modify: `shared/schema/internal-analysis.ts:136-216`
- Modify:
  `server/services/internal-analysis/analysis-checkpoint-service.ts:644-800`
- Modify: `server/routes/internal-analysis.ts`
- Create: next journal-discovered additive migration with suffix
  `_scenario_comparison_basis.sql`; record the exact filename in the execution
  checkpoint before editing schema.
- Modify: `migrations/meta/_journal.json`
- Test:
  `tests/integration/internal-analysis/scenario-comparison-reference.pg.test.ts`

**Interfaces:**

- Consumes: Task 1 basis; produces immutable nullable basis on saved reference.

- [ ] Test same-fund ownership, inaccessible run/snapshot, immutable hash
      persistence, supersession, and zero-write refusals.
- [ ] Run test; expect missing columns/contract failure.
- [ ] Bump analysis-reference version, add nullable structured columns required
      to reconstruct exact basis, and verify lineage before insert.
- [ ] Re-run test and production schema-clone/reconcile tests; expect PASS.
- [ ] Commit `feat: persist scenario comparison evidence`.

### Task 3: Decision and Client Flow

**Files:**

- Modify: `client/src/pages/fund-scenario-workspace.tsx`
- Modify: `client/src/hooks/useDecisions.ts`
- Test: `tests/e2e/scenario-comparison-decision.spec.ts`

**Interfaces:**

- Consumes: C1 `createEvidenceLinkedDecision` route with saved analysis
  reference.

- [ ] Test economics-only display, typed unavailable NAV/RVPI/TVPI, decision
      replay/conflict, and separate later task action.
- [ ] Add save-reference and linked-decision controls without client
      calculations.
- [ ] Run targeted tests, `TZ=UTC npm run lint`, `TZ=UTC npm run check`,
      `TZ=UTC npm run policy:verify`, and `git diff --check`.
- [ ] Commit `feat: add scenario comparison decision workflow`.
