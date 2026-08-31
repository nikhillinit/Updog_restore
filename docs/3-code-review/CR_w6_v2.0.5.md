# Code Review: V2 F3b: Event-Stream Atomicity, Source-Lot Lineage, Eventful Receipt

**Review Date**: 2026-08-30  
**Version**: 2.0.5 (plan F_2.0.5; package version remains 1.6.0)  
**Files Reviewed**:

- `DECISIONS.md`
- `docs/1-plans/F_2.0.5_v2-f3b-atomicity-lineage-eventful-receipt.plan.md`
- `docs/ARCHI.md`
- `docs/_generated/router-fast.json`
- `docs/_generated/router-index.json`
- `docs/_generated/staleness-report.md`
- `shared/contracts/internal-economics/internal-economics-receipt-v2.contract.ts`
- `shared/lib/internal-economics/v2/derive-composite-v2.ts`
- `shared/lib/internal-economics/v2/event-stream-engine-v2.ts`
- `shared/lib/internal-economics/v2/liquidity-receipt-builder-v2.ts`
- `shared/lib/internal-economics/v2/reserve-funding-classifier-v2.ts`
- `shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2.ts`
- `shared/lib/internal-economics/v2/waterfall-whole-fund-v2.ts`
- `tests/unit/internal-economics/v2/benchmark-v2.test.ts`
- `tests/unit/internal-economics/v2/derive-composite-v2.test.ts`
- `tests/unit/internal-economics/v2/event-stream-atomicity-v2.test.ts`
- `tests/unit/internal-economics/v2/event-stream-engine-v2.test.ts`
- `tests/unit/internal-economics/v2/event-stream-lineage-v2.test.ts`
- `tests/unit/internal-economics/v2/eventful-receipt-v2.test.ts`
- `tests/unit/internal-economics/v2/liquidity-receipt-builder-v2.test.ts`
- `tests/unit/internal-economics/v2/property-tests-v2.test.ts`
- `tests/unit/internal-economics/v2/reserve-funding-classifier-v2.test.ts`
- `tests/unit/internal-economics/v2/support/canonical-receipt-changed-case-manifest-v1.ts`
- `tests/unit/truth-cases/internal-economics-v2-first-success.test.ts`
- `tests/unit/truth-cases/internal-economics-v2-opening-state.test.ts`

**Plan**:
`docs/1-plans/F_2.0.5_v2-f3b-atomicity-lineage-eventful-receipt.plan.md`

---

## Executive Summary

F3b implements staged whole-stream atomicity, source-lot lineage, eventful
receipt 2.2.0, and dual-lane certification. All actionable findings raised
during iterative review were addressed; allocation semantics explicitly excluded
by plan remain deferred.

**APPROVED**

---

## Changes Overview

Event processing now clones mutable state and publishes only fully successful
staged results. Receipt 2.2.0 adds event/distribution journals, lineage
disclosures, staged-derived partner figures, corrected reserve classification,
and complete output-limit accounting.

Certification executes both waterfall lanes with lane-correct component
identity. Truth cases retain frozen historical receipts while proving current
2.2.0 derivations and unchanged economics.

---

## Findings

### Critical Issues

None.

### Major Issues

1. **Unknown-partner contributions could succeed or partially stage state** —
   `shared/lib/internal-economics/v2/event-stream-engine-v2.ts:401-407`,
   `shared/lib/internal-economics/v2/event-stream-engine-v2.ts:783-791`. Both
   callable-tracker and settlement-ledger paths now refuse with
   `SCHEMA_VALIDATION_FAILED/settlement` before staging. Certification and
   direct-processor regression at
   `tests/unit/internal-economics/v2/eventful-receipt-v2.test.ts:492-519`.
   **Disposition: addressed.**

2. **Realizations could relieve investment lots belonging to another deal** —
   `shared/lib/internal-economics/v2/event-stream-engine-v2.ts:837-850`. Deal
   identity is validated before relief or proceeds mutation. Regression at
   `tests/unit/internal-economics/v2/eventful-receipt-v2.test.ts:522-547`.
   **Disposition: addressed.**

3. **Unclassified opening cash was counted as eligible paid-in reserve funding**
   — `shared/lib/internal-economics/v2/reserve-funding-classifier-v2.ts:24-40`.
   Classifier now explicitly partitions paid-in, recycling, and excluded lots.
   Regression at
   `tests/unit/internal-economics/v2/reserve-funding-classifier-v2.test.ts:129-145`.
   **Disposition: addressed.**

4. **Input-shape special-case could emit legacy receipt 2.1.0 from live
   derivation** —
   `shared/contracts/internal-economics/internal-economics-receipt-v2.contract.ts:8`,
   `tests/unit/internal-economics/v2/support/canonical-receipt-changed-case-manifest-v1.ts:36-46`.
   All derived receipts now use 2.2.0; V2-S-0100 retains its frozen 2.1.0
   literal only as historical certification, with economics-equivalence
   assertions at
   `tests/unit/truth-cases/internal-economics-v2-opening-state.test.ts:42-44`
   and
   `tests/unit/truth-cases/internal-economics-v2-opening-state.test.ts:103-139`.
   **Disposition: addressed.**

### Minor Issues

1. **Receipt admission omitted nested lineage rows from output-row accounting**
   — `shared/lib/internal-economics/v2/liquidity-receipt-builder-v2.ts:1223`,
   `shared/lib/internal-economics/v2/liquidity-receipt-builder-v2.ts:1246-1252`.
   Counts now include each lineage parent plus nested consuming-event and
   funding-allocation rows. **Disposition: addressed.**

2. **Nested-lineage row-count fix initially lacked a non-vacuous boundary
   regression** —
   `tests/unit/internal-economics/v2/eventful-receipt-v2.test.ts:434-490`. Test
   proves both nested collections are populated, then verifies exact-limit
   success and one-row-over `ADMISSION_LIMIT_EXCEEDED/receipt` refusal.
   **Disposition: addressed.**

3. **Redundant composite aggregate validation used an incorrect refusal code** —
   builder-level conservation checks now own total and per-partner
   reconciliation at
   `shared/lib/internal-economics/v2/liquidity-receipt-builder-v2.ts:930-945`,
   invoked at
   `shared/lib/internal-economics/v2/liquidity-receipt-builder-v2.ts:1261`.
   Redundant composite validation was removed. **Disposition: addressed.**

### Suggestions

1. **Preserve per-security proceeds identity and revise ROC apportionment** —
   current deal-level pool accumulation remains at
   `shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2.ts:92`. Plan
   explicitly excludes invented allocation semantics at
   `docs/1-plans/F_2.0.5_v2-f3b-atomicity-lineage-eventful-receipt.plan.md:225-230`;
   ROC apportionment remains a consumer-backed follow-up at
   `DECISIONS.md:11660-11665`. **Disposition: accepted override/deferred; no F3b
   action required.**

---

## Checklist

- [x] 1. Functional Requirements — Passed; implementation and regressions match
      plan.
- [x] 2. Code Quality — Passed; production typing, naming, and Decimal usage
      remain consistent.
- [x] 3. Architectural Compliance — Passed; engine-internal scope preserved with
      no routes, persistence, queues, migrations, or dependencies added.
- [x] 4. Error Handling — Passed; new failures refuse before mutation with
      actionable codes, stages, and diagnostics.
- [x] 5. Security — Passed; no authentication, secret, provider, or externally
      mutable surface introduced.
- [x] 6. Performance — Passed; output rows include nested lineage,
      serialized-byte limits remain enforced, and benchmark coverage passes.

---

## Verdict

**APPROVED**

All review findings are resolved or explicitly deferred by the plan’s
no-invented-allocation-semantics boundary. Requester reports lint clean,
three-project typecheck clean, 650 affected tests passed, Phoenix truth 354
passed, and calculation gate 79 passed. Approval records code-review readiness
only; it grants no merge, deployment, schema, provider, or production authority.
