---
status: PROPOSED
audience: agents
last_updated: 2026-09-06
owner: Repository Owner
categories: [product-implementation, decision-workspace]
---

# Forecast Variance Decision Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add source-verified forecast variance evidence and atomic
evidence-linked decision creation.

**Architecture:** Extend dual-forecast with a server-authored variance contract,
persist it through the existing analysis-reference basis, and compose existing
decision/link persistence inside one transaction. Reuse
`forecastFundSnapshotId`; add no forecast table.

**Tech Stack:** TypeScript, Zod, Express, Drizzle/PostgreSQL, React/Preact,
Vitest, Playwright.

**Spec:** `docs/specs/C1-forecast-variance-decision-workflow.md` after
repository-owner exact-body approval.

## Global Constraints

- Stop unless spec frontmatter is `APPROVED`, `approval.state` is `approved`,
  and source/body/approval digests validate.
- No client financial calculation; no task creation in atomic decision command.
- New route requires manifest, implementation map, both common-route group
  slices, route-policy entry, and
  `server/lib/database-backed-idempotency-routes.ts` regex.
- Any schema change uses fresh journal-discovered additive migration number and
  pins its own journal entry.
- Program A A4 GO and runtime identity gates still block serving/release.

## Required Source-Identity Decisions

- Live serving resolves `getAcceptedCurrentForecastReferenceHead({ fundId })`;
  held serving resolves exact `held.referenceId` through
  `getCurrentForecastReferenceById`. Never select latest snapshot.
- `fundSnapshotId` comes from resolved reference, because wire response lacks
  it.
- Strict full `ForecastVarianceV1`, fixed omission order, canonical
  `evidenceHash`, paired JSONB/hash columns, and wire/reference/snapshot
  equality are required deliverables.
- Add `server/services/current-forecast-reference-service.ts`,
  `server/services/current-forecast-serving-seam.ts`, and
  `server/services/metrics-aggregator.ts` to implementation/review scope.
- Load `CurrentPlanVersionV1` once as the pinned before identity and load the
  accepted/held V2 after payload from its verified persisted `fundSnapshotId`.
  V2 carries the same plan ID/hash and no distinct assumption snapshot; never
  reload that plan as after data or invent a delta.
- Under the inspected contracts, emit `drivers: []` and all twelve taxonomy
  omissions with exact reason, before/after identity, and fixed order. Do not
  widen current-plan or current-forecast persistence/contracts for hypothetical
  after assumptions.

### Task 1: Forecast Variance Contract and Server Derivation

**Files:**

- Create: `shared/contracts/forecast-variance-v1.contract.ts`
- Create: `server/services/forecast-variance-service.ts`
- Modify:
  `shared/contracts/dual-forecast/dual-forecast-response.contract.ts:240-270`
- Modify: `server/routes/dual-forecast.ts`
- Read: `server/services/current-plan-version-service.ts`
- Read: `server/services/current-forecast-v2-service.ts`
- Modify: `server/services/current-forecast-reference-service.ts:240-280`
- Modify: `server/services/current-forecast-serving-seam.ts`
- Modify: `server/services/metrics-aggregator.ts:1030-1135`
- Read: `shared/contracts/current-plan-version-v1.contract.ts`
- Read: `shared/contracts/current-forecast-v2.contract.ts`
- Read: `shared/core/cohorts/CohortProjectionV2.ts`
- Read: `server/services/construction-forecast-calculator.ts`
- Test: `tests/unit/contracts/forecast-variance-v1.contract.test.ts`
- Test: `tests/unit/server/forecast-variance-service.test.ts`

**Interfaces:**

- Produces: strict `ForecastVarianceV1Schema` and
  `deriveForecastVariance({ fundId, served, reference, snapshot })`.
- Consumes: served V2 block, live accepted-head or exact held reference, and its
  verified `CURRENT_FORECAST_V2` `fundSnapshotId`.

- [ ] Write failing contract tests for all serving/engine/basis mappings, absent
      V2, structural refusal precedence, and exact omission object shape.
- [ ] Assert current baseline returns `drivers: []` and twelve omissions in
      taxonomy order with exact reason mapping from the spec.
- [ ] Prove `afterSource` is the persisted current-forecast reference/snapshot:
      assert its reference ID, `fundSnapshotId`, `resultHash`, and plan ID/hash
      match the stored row; assert plan loading occurs only for `beforeSource`.
- [ ] Add cases showing same-plan check size, graduation, follow-on, and other
      assumptions cannot yield deltas; V2 cumulative deployed series, residual
      capital, and projected fee dollars remain omitted because no matching
      persisted construction field/measure/horizon exists.
- [ ] Run
      `TZ=UTC npx vitest run tests/unit/contracts/forecast-variance-v1.contract.test.ts tests/unit/server/forecast-variance-service.test.ts --retry=0`;
      expect failures for missing exports.
- [ ] Implement accepted/held wire/reference/snapshot fund/hash/version checks,
      persisted after-source loading, empty drivers, and ordered omissions.
- [ ] Re-run the same tests; expect PASS. Verify dual-forecast response omits
      the variance object only when the V2 block itself is absent.
- [ ] Re-run targeted tests; expect PASS.
- [ ] Commit `feat: add source-verified forecast variance evidence`.

### Task 2: Immutable Reference and Atomic Decision Link

**Files:**

- Create:
  `shared/contracts/operating-objects/evidence-linked-decision.contract.ts`
- Create:
  `server/services/operating-objects/evidence-linked-decision-service.ts`
- Modify:
  `shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract.ts:190-231`
- Modify: `shared/schema/internal-analysis.ts:136-216`
- Modify:
  `server/services/internal-analysis/analysis-checkpoint-service.ts:644-800`
- Modify: `server/routes/operating-object-decisions.ts:150-210`
- Modify: `shared/routes/api-route-manifest.ts`
- Modify: `server/routes/mount-common-routes.ts`
- Modify: `server/route-policy/api-route-policy-registry.ts`
- Modify: `server/lib/database-backed-idempotency-routes.ts`
- Create: next journal-discovered additive migration with suffix
  `_forecast_variance_reference.sql`; record the exact filename in the execution
  checkpoint before editing schema.
- Modify: `migrations/meta/_journal.json`
- Test:
  `tests/integration/internal-analysis/forecast-variance-reference.pg.test.ts`
- Test:
  `tests/integration/operating-decisions/evidence-linked-decision.pg.test.ts`

**Interfaces:**

- Produces:
  `createEvidenceLinkedDecision({ fundId, actorId, idempotencyKey, request, database })`
  returning `{ decision, evidenceLink, replayed }`.
- Consumes: Task 1 evidence and existing `createDecisionCommand`/decision-link
  storage inside caller transaction.

- [ ] Write real-PostgreSQL failures for wrong type/fund/hash, inaccessible
      reference, replay, material conflict, and forced link-insert rollback with
      zero decision/link rows.
- [ ] Run both test files with
      `TZ=UTC npx vitest run --config vitest.config.int.ts ... --retry=0`;
      expect failures for missing schema/service.
- [ ] Persist the exact variance evidence on analysis reference, bump contract
      version, and add replay-safe migration using current `_journal.json` next
      index.
- [ ] Implement one transaction: validate target, insert/replay decision,
      insert/replay evidence link, store one durable response; map failures
      without partial writes.
- [ ] Register route on manifest, implementation map, both group slices, policy
      registry, and database-idempotency regex.
- [ ] Re-run integration tests and `TZ=UTC npm run policy:verify`; expect PASS.
- [ ] Commit `feat: create evidence-linked decisions atomically`.

### Task 3: Client Display and Verification

**Files:**

- Modify: `client/src/components/dashboard/dual-forecast-dashboard.tsx`
- Modify: `client/src/hooks/useDecisions.ts`
- Test: `tests/unit/client/forecast-variance-display.test.tsx`
- Test: `tests/e2e/forecast-variance-decision.spec.ts`

**Interfaces:**

- Consumes: Task 1 response and Task 2 command.

- [ ] Write tests proving no client delta calculation, textual statuses,
      keyboard order, polite announcement, and disabled action explanation.
- [ ] Implement display and mutation hook using server fields unchanged.
- [ ] Run targeted unit/E2E tests, then `TZ=UTC npm run lint`,
      `TZ=UTC npm run check`, `TZ=UTC npm run docs:routing:check`, and
      `git diff --check`.
- [ ] Commit `feat: add forecast variance decision workflow`.
