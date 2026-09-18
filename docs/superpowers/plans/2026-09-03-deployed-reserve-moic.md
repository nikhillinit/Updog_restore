---
status: PROPOSED
audience: agents
last_updated: 2026-09-06
owner: Repository Owner
categories: [product-implementation, reserve-intelligence]
---

# Deployed Reserve MOIC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add security-keyed deployed-reserve MOIC in atomic
reserve-intelligence V3 with predecessor-bound admission.

**Architecture:** Consume only Program B's admitted security-lineage output,
extend reserve producer to one V3 snapshot containing planned/marginal/deployed
sections, and require a V2-to-V3 marginal-equivalence receipt before serving.

**Tech Stack:** TypeScript, Decimal.js, Zod, PostgreSQL/Drizzle, canonical JSON
SHA-256, Vitest, Phoenix truth.

**Spec:** `docs/specs/C3b-deployed-reserve-moic.md` after repository-owner
exact-body approval and exact Program B source/version pin.

## Global Constraints

- C3a V2 and Program B security-lineage source admission must precede
  implementation.
- Validate Program B receipt identity and version through
  `shared/contracts/internal-economics/internal-economics-receipt-v2.contract.ts`;
  do not infer authority from payload shape alone.
- No deal-level/first-security fallback. Preserve denominator, weighted price,
  and security lineage separately.
- Full eight-field basis or explicit legacy null participates in every C3
  hash/identity/admission.
- V3 admission cannot waive marginal equivalence.

## Required Ledger Loader and Consumers

- Replace any preassembled-value interface with a loader rooted in persisted
  participation, position event, relief, conversion, correction, and valuation
  rows. Canonical key is `participation:<id>`.
- Fair value is security-attributable only with exactly one eligible live
  participation. Multiple/zero live participations, invalid/missing Program B
  lots, correction successors, or incomplete conversion lineage are typed
  unavailable.
- Modify current-position, position, valuation, conversion, and correction
  services; `shared/schema/investment-positions.ts`; position contracts; ranking
  service/route; reserve panel and MOIC analysis page.
- Real-ledger tests, rather than calculator-only fixtures, prove event
  treatment, security attribution, ranking exclusion, and global conservation.
- One security lineage failure emits an unavailable security entry inside a
  coherent atomic V3 snapshot. Whole-snapshot refusal is reserved for shared
  coherence/basis/config or global conservation failure.

### Task 1: Security-Level MOIC Calculation

**Files:**

- Create: `shared/lib/reserves/deployed-reserve-moic-v3.ts`
- Create: `server/services/reserves/deployed-reserve-security-input-service.ts`
- Modify: `shared/schema/investment-positions.ts`
- Modify: `shared/contracts/investment-ledger/position.contract.ts`
- Modify: `shared/contracts/investment-ledger/current-position.contract.ts`
- Modify: `server/services/investment-ledger/current-position-service.ts`
- Modify: `server/services/investment-ledger/position-service.ts`
- Modify: `server/services/investment-ledger/position-valuation-service.ts`
- Modify: `server/services/investment-ledger/position-conversion-service.ts`
- Modify: `server/services/investment-ledger/ledger-correction-service.ts`
- Modify: `server/services/fund-moic-ranking-service.ts`
- Modify: `server/routes/fund-moic.ts`
- Modify: `client/src/components/fund-results/ReserveIntelligencePanel.tsx`
- Modify: `client/src/pages/fund-model-results-moic-analysis.tsx`
- Test: `tests/unit/reserves/deployed-reserve-moic-v3.test.ts`
- Test: `tests/unit/internal-economics/security-proceeds-conservation.test.ts`
- Test:
  `tests/integration/investment-ledger/deployed-reserve-security-input.pg.test.ts`
- Test: `tests/integration/routes/deployed-reserve-rankings.test.ts`

**Interfaces:**

- Produces:
  `loadDeployedReserveSecurityInputs({ database, fundId, asOfDate, admittedProgramBIdentity })`
  and `calculateDeployedReserveMoic(loadedSecurityProjection)`. No
  caller-provided lots or attributed value are accepted.

- [ ] Write expected-output tests for multiple securities, weighted acquisition
      price, partial sale, write-off, correction, conversion, missing lineage,
      and global conservation.
- [ ] Run tests; expect missing function.
- [ ] Write real-PostgreSQL loader tests with persisted participations, position
      events, basis reliefs, conversion reliefs, corrections, and valuations;
      cover zero/multiple live participation, invalid/missing Program B lot,
      live successor selection, and zero-write typed refusal.
- [ ] Implement persisted ledger loader with canonical
      `participation:<vehicle_financing_participations.id>` mapping, live-head
      correction/conversion treatment, and exactly-one-live-participation fair
      value rule; then aggregate with Decimal.js.
- [ ] Emit a typed unavailable entry when one security has missing/ambiguous
      lineage before metric construction; exclude it from ranking while the
      coherent atomic V3 snapshot retains other available securities.
- [ ] Re-run tests and Program B exact-routing tests; expect PASS.
- [ ] Commit `feat: calculate deployed reserve moic by security`.

### Task 2: Atomic V3 Payload

**Files:**

- Create: `shared/contracts/dynamic-reserve-intelligence-v3.contract.ts`
- Modify:
  `server/services/reserves/dynamic-reserve-intelligence-service.ts:350-590`
- Test: `tests/unit/contracts/dynamic-reserve-intelligence-v3.contract.test.ts`
- Test: `tests/phoenix/truth-cases/deployed-reserve-moic-v3.test.ts`
- Modify: current Phoenix changed-case manifest selected by repository scripts.

**Interfaces:**

- Consumes: C3a marginal section and Task 1 deployed section; produces one V3
  run/snapshot.

- [ ] Test full coherence envelope, section availability/refusals, exact
      result-hash projection, all basis-field changes, and atomic rollback.
- [ ] Test mixed available/unavailable securities persist together with stable
      ordering/hash, ranking excludes unavailable entries, and shared coherence
      or global conservation failure writes no V3 snapshot.
- [ ] Run tests; expect missing V3 contract.
- [ ] Build planned, marginal, and deployed sections before one
      completed-run/snapshot transaction; use exact C3b canonical projection.
- [ ] Bind expected-output and receipt/hash changes in Phoenix changed-case
      manifest.
- [ ] Run targeted tests plus `TZ=UTC npm run phoenix:truth`; expect PASS.
- [ ] Commit `feat: add reserve intelligence v3 payload`.

### Task 3: V3 Predecessor Admission

**Files:**

- Modify: `shared/contracts/reserve-intelligence-admission-v1.contract.ts`
- Modify: `shared/schema/reserve-intelligence-admission.ts`
- Modify: `server/services/reserves/reserve-intelligence-admission-service.ts`
- Create: `scripts/reserves/verify-v2-v3-marginal-equivalence.mjs`
- Modify: `config/reserve-corpus-manifest.json`
- Test: `tests/integration/reserve-intelligence-admission.pg.test.ts`

**Interfaces:**

- Produces: `reserve-intel-v2-v3-marginal-equivalence` evidence and accepted V3
  receipt.

- [ ] Test missing/cross-fund/unaccepted predecessor, predecessor hash mismatch,
      marginal input/config/section mismatch, source/corpus mismatch, replay,
      and zero inserts.
- [ ] Implement equivalence script over committed V2 corpus and store
      equivalence run ID plus predecessor/current hashes.
- [ ] Load/recompute same-fund V2 predecessor before V3 receipt insertion.
- [ ] Run targeted tests, `TZ=UTC npm run calc-gate`, `TZ=UTC npm run lint`,
      `TZ=UTC npm run check`, and `git diff --check`.
- [ ] Commit `feat: admit reserve intelligence v3 by predecessor proof`.
