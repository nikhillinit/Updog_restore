---
status: PROPOSED
audience: agents
last_updated: 2026-09-08
owner: Repository Owner
categories: [product-implementation, decision-workspace]
---

# Forecast Variance Decision Workflow Implementation Plan

**Goal:** Deliver the selected After-assumption comparison with persisted
forecast attribution, immutable analysis evidence, and atomic evidence-linked
decisions.

**Spec:** `docs/specs/C1-forecast-variance-decision-workflow.md`, source-pinned
to `c9361248a486a346f3b32b5212cad582373b3b3a`. The spec is DRAFT and this plan
is PROPOSED. The source-contract revision is documentation work; the product
tasks below are not authorized until their gates pass.

**Architecture:** Reuse `current_plan_versions`, `current_forecast_references`,
`fund_snapshots`, and analysis draft/reference persistence. Load explicit before
and after plans and their persisted forecast outputs. Reuse existing
decision/link services inside a shared transaction; no new forecast-reference
table, client financial calculation, implicit plan mint, or pointer advance.

## Gates Before Product Work

- [x] Replace the old same-plan comparison with an explicit direct-successor
      before/after contract, full facts basis, source/head validation, and
      refusal rules.
- [x] Propose a versioned attribution method with disjoint groups, persisted
      counterfactuals, endpoint reproduction, interaction disclosure, and
      residual reconciliation. Keep all twelve taxonomy categories and concrete
      source gaps.
- [x] Regenerate interfaces, source manifest, and prospective
      test/implementation scope around the selected contract. Baseline omissions
      remain characterization.
- [x] Independently review this exact source-contract body and resolve findings.
- [ ] Obtain named repository-owner exact-body approval; validate source/body
      and approval digests. Keep approval metadata unset until that approval
      occurs.
- [ ] Prove Program A GO and final runtime identity for the implementation gate.
      Source CI and document review do not replace these predicates.
- [ ] Establish qualifying pre-existing after plan/snapshot/accepted-reference
      evidence, or complete a separately approved pinned producer contract and
      its behavioral proofs. Current latest-config/latest-facts minting is
      insufficient.
- [ ] Approve the attribution methodology and resolve unsupported input mapping
      choices through exact-body review. Implementation and persisted-evidence
      proofs are completion requirements for Tasks 1-2, not entry prerequisites;
      never reduce the product to input differences or a four-category cap.

No product task starts while a prerequisite is unresolved. Refresh the inspected
source commit at execution time and reapprove any body/source drift. Use an
isolated dedicated branch and preserve unrelated work. Existing route
registration, fund authorization, idempotency, optimistic locking, transaction
support, additive migration, and Phoenix calculation gates apply.

### Task 1: Source Pair and Forecast Attribution

**Create:**

- `shared/contracts/forecast-variance-v1.contract.ts`
- `server/services/forecast-variance-service.ts`
- `tests/unit/contracts/forecast-variance-v1.contract.test.ts`
- `tests/unit/server/forecast-variance-service.test.ts`

**Modify only as required by the approved contract:**

- `shared/contracts/dual-forecast/dual-forecast-response.contract.ts`
- `server/routes/dual-forecast.ts`
- `server/services/current-forecast-reference-service.ts`
- `server/services/current-forecast-serving-seam.ts`
- `server/services/metrics-aggregator.ts`

**Grounding sources:** Current-plan schema/contract/service and
`shared/lib/current-plan/derive-current-plan-v1.ts`; V2 schema/service and
`shared/core/cohorts/CohortProjectionV2.ts`; qualified financial-facts contract,
parser, basis-ref helper, and snapshot service; canonical hashing; the C1 exact
source manifest. Existing construction forecast output is not the before source.

**Interface:** A strict `ForecastVarianceV1Schema` containing both complete
source references, independent serving/engine/basis/attribution states,
observations, ordered drivers and omissions, forecast changes, full versioned
attribution proof, action eligibility, and canonical evidence hash. The service
receives explicit pair IDs, expected hashes/versions, and a full qualified facts
basis. It never re-resolves missing IDs to latest, mints a plan, or changes
serving mode.

- [ ] Write a positive direct-successor fixture with matching full facts basis,
      distinct persisted plan assumptions derived with `deriveCurrentPlanV1`
      from pinned source configurations, both forecast endpoint reproductions,
      and a measured effect. Verify all twelve category entries appear once
      across drivers and omissions, including a mixed effect/omission entry for
      different quarters.
- [ ] Exercise independently changed allocation checks, investment horizons, and
      capital weights. Use complete derived plans to verify the approved
      economic projection covers every changed aggregate without treating
      authenticated observation rows as unmapped inputs. Require
      source-integrity refusal for a changed observation row with an unchanged
      source hash.
- [ ] Add exact link/head/version/hash and full-basis mismatch refusals; include
      expected before supersession as a passing case and cross-fund zero
      disclosure.
- [ ] Cover source gaps, placeholder exit assumptions, ownership/recycling
      absence, unused follow-on inputs, and reserve versus total-capital measure
      distinctions. Keep the same-plan empty-driver/twelve-omission case only as
      a baseline test.
- [ ] Test the approved disjoint mapping and deterministic substitution order:
      endpoint reproduction, valid hybrid inputs, interactions assigned to later
      groups, a proven zero effect, unmapped capital inputs, and nonzero
      residuals.
- [ ] Verify exact measure/period matching, USD/ratio/count precision, null IRR,
      duplicate/unmatched periods, flow/stock/cumulative distinctions, and no
      arbitrary tolerance. Incomplete attribution cannot enable the decision
      action.
- [ ] Implement source admission and attribution using the approved producer and
      existing engine/hash conventions. Persist proof through Task 2; do not
      publish an attribution claim backed only by transient calculations or
      input deltas.
- [ ] Run
      `TZ=UTC npx vitest run tests/unit/contracts/forecast-variance-v1.contract.test.ts tests/unit/server/forecast-variance-service.test.ts --retry=0`.
      Run applicable lint/typecheck and Phoenix truth checks for calculation
      changes.

### Task 2: Evidence Persistence and Atomic Decision Link

**Create:**

- `shared/contracts/operating-objects/evidence-linked-decision.contract.ts`
- `server/services/operating-objects/evidence-linked-decision-service.ts`
- `tests/integration/internal-analysis/forecast-variance-reference.pg.test.ts`
- `tests/integration/operating-decisions/evidence-linked-decision.pg.test.ts`

**Modify:**

- `shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract.ts`
- `shared/schema/internal-analysis.ts`
- `server/services/internal-analysis/analysis-checkpoint-service.ts`
- `server/routes/operating-object-decisions.ts`
- `shared/routes/api-route-manifest.ts`
- `server/routes/mount-common-routes.ts`
- `server/route-policy/api-route-policy-registry.ts`
- `server/lib/database-backed-idempotency-routes.ts`
- Next journal-discovered additive migration and
  `migrations/meta/_journal.json`. Record the actual migration filename before
  editing; never use a stale index.

**Interface:**
`createEvidenceLinkedDecision({ fundId, actorId, idempotencyKey, request, database })`
returns `{ decision, evidenceLink }` from one transaction. Request pins the
saved analysis reference and expected evidence hash. Analysis save remains its
own atomic command with source validation, evidence, draft close, and receipt.
Reuse the basis's forecast snapshot field for after and store the complete
before/after proof through the approved additive persistence.

- [ ] Check existing dedicated columns before adding paired nullable variance
      JSONB/hash fields. Strict-parse and verify stored evidence on every
      save/load. Counterfactual records are analysis evidence, never accepted
      forecast pointers.
- [ ] Move complete pair/head/hash checks into the write transaction. Lock the
      rows used by existing source/head writers in deterministic order; preserve
      version/CAS predicates and draft `If-Match`. Prove compatibility with
      those writers; serializable isolation alone is not a head-change fence.
- [ ] Add real PostgreSQL tests racing after-plan supersession, pointer advance,
      mode/draft version changes, and concurrent identical/conflicting commands.
      Assert no stale acceptance or orphan/duplicate decision/link/evidence
      rows.
- [ ] Verify key-first replay after head movement, different-material conflicts,
      mixed-basis acknowledgement refusal for C1, wrong snapshot type/fund/hash,
      and rollback on evidence/reference/link/receipt insert failures. A failed
      decision command must preserve an already saved immutable reference.
- [ ] Add the route manifest, implementation map, both common-route group
      slices, policy entry, and database-idempotency registration; retain
      fund/write-role auth.
- [ ] Run affected integration tests with `TZ=UTC`,
      `--config vitest.config.int.ts --retry=0`; run
      `TZ=UTC npm run policy:verify` and the applicable real-driver lane for
      both production surfaces. If a serialization failure is retried, retry the
      complete command transaction and its decisions, never only the failed
      statement.

### Task 3: Client Display and Final Verification

**Modify:** `client/src/components/dashboard/dual-forecast-dashboard.tsx` and
`client/src/hooks/useDecisions.ts`.

**Create:** `tests/unit/client/forecast-variance-display.test.tsx` and
`tests/e2e/forecast-variance-decision.spec.ts`.

- [ ] Trace the actual route to the dashboard; read `DESIGN.md` before visual
      changes. Display server values, both sources, units/horizons, method,
      interaction limitation, omissions, residual, and eligibility without
      client financial math.
- [ ] Verify textual status, keyboard order, polite announcements, associated
      disabled-action reasons, historical-source labels, and live/held behavior.
- [ ] Exercise the full qualifying comparison -> immutable reference -> atomic
      decision/link flow. An input-only report or baseline omissions cannot
      satisfy the success case. Exercise stale evidence and
      incomplete-attribution refusals.
- [ ] Run affected unit/E2E tests, `TZ=UTC npm run lint`,
      `TZ=UTC npm run check`, `TZ=UTC npm run docs:routing:check`, and
      `git diff --check`; retain exact command results and distinguish local
      checks from hosted CI and production evidence.
- [ ] Review the full feature diff independently after the testing gate, correct
      legitimate findings, and rerun affected checks. Record a durable scoped
      checkpoint according to session authority; publication/release remains
      separate.
