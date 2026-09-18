---
status: PROPOSED
audience: agents
last_updated: 2026-09-06
owner: Repository Owner
categories: [product-implementation, reserve-intelligence]
---

# Marginal Reserve Metric Admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add paired-counterfactual reserve-intelligence V2 plus
source/corpus-bound admission receipts.

**Architecture:** Create immutable V2 contracts beside V1, compute both legs
through the same producer without mutating V1, and add a database-backed
admission service. Full `FinancialFactsBasisRef` participates in every identity.

**Tech Stack:** TypeScript, Zod, Decimal.js, PostgreSQL/Drizzle, canonical JSON
SHA-256, Vitest.

**Spec:** `docs/specs/C3a-marginal-reserve-metric-admission.md` after
repository-owner exact-body approval.

## Global Constraints

- Include all eight basis fields or explicit legacy null in
  input/result/request/receipt identities.
- Policy 1.4/payload 5 missing or mismatched basis refuses with zero writes;
  NAV/RVPI/TVPI remain unavailable.
- New mutation route uses route manifest, implementation map, both group slices,
  policy entry, and database-idempotency regex.
- Migration number is discovered from current journal at implementation time.

## Required Admission and Serving Surface

- Implement the exact reusable V2/V3 receipt wire object, request-hash preimage,
  receipt-hash projection, literal-pair checks, same-fund unique targets/FKs,
  and immutable accepted-only table from the spec.
- Sole writer path is
  `POST /api/funds/:fundId/moic/reserve-intelligence/admissions`, admin-only,
  fund-scoped, required idempotency, both mounts, route policy, and DB
  idempotency registry.
- Stamp source/corpus identity through both build scripts; production env cannot
  override; unstamped/placeholder command refuses lazily.
- Latest, full-V2 rankings, ranking service/route, and UI require exact accepted
  receipt. Off/shadow/on and nonproduction soak/runbook behavior are tested.
- Implementation scope includes
  `server/services/reserves/ranked-reserve-orchestrator.ts`,
  `server/services/fund-moic-ranking-service.ts`, `server/routes/fund-moic.ts`,
  `server/config/features.ts`, `flags/registry.yaml`, both build scripts,
  reserve hook/panel/page, and shadow-soak runbook.

### Task 1: V2 Contract and Paired Calculation

**Files:**

- Create: `shared/contracts/dynamic-reserve-intelligence-v2.contract.ts`
- Modify:
  `server/services/reserves/dynamic-reserve-intelligence-service.ts:350-590`
- Test: `tests/unit/contracts/dynamic-reserve-intelligence-v2.contract.test.ts`
- Test: `tests/unit/reserves/marginal-reserve-v2.test.ts`
- Test: `tests/regressions/financial-facts-basis-ref-consumers.test.ts`

**Interfaces:**

- Produces:
  `runMarginalReserveV2({ fundId, financialFactsSnapshotId, basisRef, securityId, incrementCents, sourceConfigId, sourceConfigVersion, modelInputAsOfDate })`.
- `basisRef` is the required expected `FinancialFactsBasisRef` (all eight
  fields) for policy 1.4/payload 5, or explicit `null` for legacy policy.
  Compare it against the loaded persisted facts before calculation; any mismatch
  refuses.

- [ ] Test paired source/config equality, all eight basis substitutions, legacy
      null, same-ID/different-hash, unavailable leg, and zero snapshot writes.
- [ ] Run targeted tests; expect missing V2 exports.
- [ ] Add strict V2 schemas and canonical preimages; reuse existing source
      pinning and calculation helpers for both legs.
- [ ] Persist completed V2 run/snapshot only after both legs validate.
- [ ] Re-run tests and `TZ=UTC npm run phoenix:truth`; expect PASS.
- [ ] Commit `feat: add marginal reserve intelligence v2`.

### Task 2: Admission Receipt and Service

**Files:**

- Create: `shared/contracts/reserve-intelligence-admission-v1.contract.ts`
- Create: `shared/schema/reserve-intelligence-admission.ts`
- Modify: `shared/schema.ts`
- Create: `server/config/reserve-intelligence-admission-identity.ts`
- Create: `server/services/reserves/reserve-intelligence-admission-service.ts`
- Create: `config/reserve-corpus-manifest.json`
- Create: next journal-discovered additive migration with suffix
  `_reserve_intelligence_admission.sql`; record the exact filename in the
  execution checkpoint before editing schema.
- Modify: `migrations/meta/_journal.json`
- Test:
  `tests/unit/contracts/reserve-intelligence-admission-v1.contract.test.ts`
- Test: `tests/integration/reserve-intelligence-admission.pg.test.ts`

**Interfaces:**

- Produces: `admitReserveIntelligenceCandidate(input)` returning accepted
  receipt or typed refusal.

- [ ] Test receipt hash, source/corpus identity, replay/conflict, cross-fund,
      calculation mismatch, and zero-row refusal.
- [ ] Run tests; expect missing table/service.
- [ ] Add immutable accepted-only receipt contract and same-fund unique keys.
      Refusals are typed responses with zero admission rows.
- [ ] Add build-time source/corpus identity configuration to both server build
      scripts.
- [ ] Re-run tests, schema clone/reconcile tests, and `TZ=UTC npm run check`;
      expect PASS.
- [ ] Commit `feat: admit reserve intelligence candidates`.

### Task 3: Admission Route and Final Gates

**Files:**

- Create: `server/routes/reserve-intelligence-admission.ts`
- Modify: `shared/routes/api-route-manifest.ts`
- Modify: `server/routes/mount-common-routes.ts`
- Modify: `server/route-policy/api-route-policy-registry.ts`
- Modify: `server/lib/database-backed-idempotency-routes.ts`
- Test: `tests/integration/routes/reserve-intelligence-admission.test.ts`

- [ ] Test auth, fund scope, required idempotency key, exact configured
      identity, and zero-write denial.
- [ ] Register route across both surfaces and policy/idempotency registries.
- [ ] Run targeted tests, `TZ=UTC npm run lint`, `TZ=UTC npm run check`,
      `TZ=UTC npm run phoenix:truth`, `TZ=UTC npm run policy:verify`, and
      `git diff --check`.
- [ ] Commit `feat: expose reserve intelligence admission command`.

### Task 4: Enforce Accepted Receipt in Serving and Ranking

**Files:**

- Modify:
  `server/services/reserves/dynamic-reserve-intelligence-service.ts:350-640`
- Modify: `server/services/reserves/ranked-reserve-orchestrator.ts`
- Modify: `server/services/fund-moic-ranking-service.ts`
- Modify: `server/routes/fund-moic.ts:220-360`
- Modify: `server/config/features.ts`
- Modify: `flags/registry.yaml`
- Modify: `client/src/hooks/useReserveIntelligence.ts`
- Modify: `client/src/components/fund-results/ReserveIntelligencePanel.tsx`
- Modify: `client/src/pages/fund-model-results-moic-analysis.tsx`
- Modify: `docs/runbooks/marginal-moic-nonproduction-shadow-soak.md`
- Test: `tests/integration/routes/reserve-intelligence-serving.test.ts`
- Test: `tests/unit/server/reserve-intelligence-ranking-admission.test.ts`
- Test: `tests/e2e/reserve-intelligence-admission-states.spec.ts`

**Interfaces:**

- Consumes: accepted-only receipt from Tasks 2-3.
- Produces: one shared full-V2 projection for latest and rankings, with exact
  snapshot ID and admission state.

- [ ] Write failures proving latest output and marginal rankings join accepted
      `(fund_id, snapshot_id, payload_version)` receipt; mode `on` without it is
      non-actionable and excluded.
- [ ] Test `off` hidden, `shadow` comparison-only, `on` receipted actionable;
      verify hook, panel, page, and ranking route show source SHA/corpus
      identity and typed non-actionable reason.
- [ ] Route rankings through the same full-V2 producer that persists the
      snapshot; remove standalone ranking input path without snapshot identity.
- [ ] Update flag wiring and shadow-soak runbook to require stable paired replay
      before the admin admission command.
- [ ] Run targeted tests, flag generation/check, both-surface route tests,
      `TZ=UTC npm run phoenix:truth`, lint, typecheck, and `git diff --check`.
- [ ] Commit `feat: require reserve admission for actionable rankings`.
