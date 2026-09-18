---
status: PROPOSED
audience: agents
last_updated: 2026-09-06
owner: Repository Owner
categories: [product-implementation, decision-workspace]
---

# Reserve Evidence Decision Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save admitted reserve V3 evidence and atomically create decisions
linked to immutable analysis references.

**Architecture:** Verify V3 snapshot and its V2/V3 receipt chain on analysis
save and decision creation. Serialize correction save and decision creation with
one per-fund advisory transaction lock, then reuse C1's atomic decision command
and existing task evidence APIs.

**Tech Stack:** TypeScript, Zod, PostgreSQL/Drizzle, Express, React/Preact,
Vitest, Playwright.

**Spec:** `docs/specs/C3c-reserve-evidence-decision-workflow.md` after
repository-owner exact-body approval.

## Global Constraints

- C3a and C3b accepted admission receipts required.
- Lookup never inserts, updates, or repairs a receipt.
- Full eight-field basis equality required; payload-5 missing NAV/RVPI/TVPI stay
  unavailable.
- Decision/task remain separate actions; no direct decision-task relation.

## Required Same-Fund Schema Decision

Unconditionally add `fund_snapshots (id, fund_id)` unique target and composite
FKs from both draft and reference `(reserve_reference_id, fund_id)` columns with
delete restriction. Remove the plan's conditional service-only alternative. Keep
service type/hash/admission checks. Schema clone/reconcile tests and direct SQL
cross-fund insertion tests are mandatory, alongside zero-write counts and
two-session supersession races.

### Task 1: Reserve Evidence Verifier

**Files:**

- Create: `server/services/reserves/reserve-evidence-verifier.ts`
- Modify: `server/services/reserves/reserve-intelligence-admission-service.ts`
- Test: `tests/integration/internal-analysis/reserve-reference.pg.test.ts`

**Interfaces:**

- Produces: `verifyReserveEvidence({ database, fundId, snapshotId })` returning
  verified V3 payload/receipt identity.

- [ ] Test same-fund snapshot/type, all sections, V3 receipt hash, V2
      predecessor hash, source/corpus/equivalence, marginal hashes, every basis
      field, and zero writes.
- [ ] Run real-PostgreSQL test; expect missing verifier.
- [ ] Implement ordered read-only verification steps 2-7 from spec with typed
      refusals.
- [ ] Re-run test; expect PASS.
- [ ] Commit `feat: verify admitted reserve evidence`.

### Task 2: Analysis Reference Save and Race Lock

**Files:**

- Modify:
  `shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract.ts:190-231`
- Modify: `shared/schema/internal-analysis.ts:136-216`
- Modify:
  `server/services/internal-analysis/analysis-checkpoint-service.ts:644-829`
- Create: `server/services/internal-analysis/analysis-reference-fund-lock.ts`
- Create: next journal-discovered additive migration with suffix
  `_reserve_reference_integrity.sql`; record the exact filename in the execution
  checkpoint before editing schema.
- Modify: `migrations/meta/_journal.json`
- Test:
  `tests/integration/internal-analysis/reserve-reference-decision-race.pg.test.ts`

**Interfaces:**

- Produces: `withAnalysisReferenceFundLock(transaction, fundId, fn)`; consumes
  Task 1 verifier.

- [ ] Test two sessions: correction commits first causes decision refusal;
      decision commits first may later be superseded and retains immutable link.
- [ ] Run test; expect race failure before shared lock exists.
- [ ] Add per-fund advisory transaction lock using existing current-forecast
      lock pattern and a distinct class constant.
- [ ] Acquire lock for correction save with non-null `sourceReferenceId`,
      recheck terminal state/successor, then insert successor.
- [ ] Add `fund_snapshots (id, fund_id)` unique target and composite
      `(reserve_reference_id, fund_id)` foreign keys from both analysis drafts
      and references with `ON DELETE RESTRICT`; retain service type/hash checks.
- [ ] Re-run race, schema-clone, and schema-reconcile tests; expect PASS.
- [ ] Commit `feat: serialize reserve reference corrections`.

### Task 3: Atomic Decision and Separate Task Flow

**Files:**

- Modify:
  `server/services/operating-objects/evidence-linked-decision-service.ts`
- Modify: `server/routes/operating-object-decisions.ts`
- Modify: `client/src/hooks/useDecisions.ts`
- Modify: `client/src/hooks/useTasks.ts`
- Test:
  `tests/integration/operating-decisions/reserve-evidence-linked-decision.pg.test.ts`
- Test: `tests/e2e/reserve-evidence-decision.spec.ts`

**Interfaces:**

- Consumes: Task 1 verifier, Task 2 fund lock, C1 atomic command, existing task
  evidence link API.

- [ ] Test missing/superseded/inaccessible evidence, replay, material conflict,
      forced rollback, optional later task/evidence link, and decision
      supersession.
- [ ] Inside decision transaction acquire fund lock, load reference by
      `(id, fundId)`, reject committed successor, run reserve verification, then
      insert decision/link.
- [ ] Add client flow for decision followed by optional existing task and task
      evidence-link calls; display immutable reference/supersession states.
- [ ] Run targeted tests, `TZ=UTC npm run lint`, `TZ=UTC npm run check`,
      `TZ=UTC npm run policy:verify`, and `git diff --check`.
- [ ] Commit `feat: add reserve evidence decision workflow`.

### Task 4: Render Verified Reserve Evidence Detail

**Files:**

- Modify:
  `shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract.ts:319-350`
- Modify: `server/routes/internal-analysis.ts:618-648`
- Modify: `client/src/hooks/useInternalAnalysis.ts`
- Modify: `client/src/pages/fund-model-results-operations.tsx:120-180`
- Test: `tests/unit/client/reserve-evidence-detail.test.tsx`
- Test: `tests/integration/routes/internal-analysis-reference-detail.test.ts`
- Test: `tests/e2e/reserve-evidence-decision.spec.ts`

**Interfaces:**

- Produces: `ReserveEvidenceDetailV1Schema` and
  `useAnalysisReferenceDetail(fundId, referenceId)`.

- [ ] Test same-fund detail read, no-reserve `null`, pinned invalid typed error,
      source/corpus/receipt/equivalence fields, partial unavailable deployed
      section, and successor identity.
- [ ] Extend existing reference-detail response and route; reuse reserve
      verifier read path without mutation.
- [ ] Replace operations-page `Analysis reference #id` only display with an
      expandable detail control showing verified fields and refusal states.
- [ ] Test loading `aria-busy`, error alert, `aria-expanded`, keyboard
      operation, textual unavailable state, and successor navigation.
- [ ] Run targeted tests, lint, typecheck, and `git diff --check`.
- [ ] Commit `feat: show verified reserve evidence details`.
