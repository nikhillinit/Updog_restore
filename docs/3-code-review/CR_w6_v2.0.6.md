# Code Review: F3b-hotfix-expense-eligibility-and-attribution

**Review Date**: 2026-08-30  
**Version**: 2.0.6  
**Files Reviewed**:

- `docs/ARCHI.md`
- `shared/contracts/internal-economics/internal-economics-receipt-v2.contract.ts`
- `shared/lib/internal-economics/v2/derive-composite-v2.ts`
- `shared/lib/internal-economics/v2/event-stream-engine-v2.ts`
- `shared/lib/internal-economics/v2/liquidity-receipt-builder-v2.ts`
- `tests/unit/internal-economics/v2/event-stream-engine-v2.test.ts`
- `tests/unit/internal-economics/v2/eventful-receipt-v2.test.ts`
- `tests/unit/internal-economics/v2/support/canonical-receipt-changed-case-manifest-v1.ts`
- `tests/unit/truth-cases/internal-economics-v2-first-success.test.ts`
- `tests/unit/truth-cases/internal-economics-v2-opening-state.test.ts`

**Plan**:
`docs/1-plans/F_2.0.5_v2-f3b-atomicity-lineage-eventful-receipt.plan.md`

---

## Executive Summary

Hotfix restricts fund-expense funding to event-origin contribution-settlement
lots and attributes exact expense allocations to partner and class ledgers.
Iterative review found implementation-version provenance and
documentation-currency issues; both were resolved or accepted under established
TRIP-3 release sequencing.

**APPROVED with observations**

---

## Changes Overview

`processFundExpense` now rejects opening and realization-proceeds lots before
mutation and records partner expense effects using exact allocation amounts.
Receipt construction projects staged expenses and verifies journal-to-partner
expense conservation.

Composite, event-engine, and receipt-serializer identities moved to `2.2.1`;
receipt contract and waterfall identities remain `2.2.0`. Canonical hashes and
truth-case expectations were regenerated.

---

## Findings

### Critical Issues

None.

### Major Issues

1. **Implementation component identities reused `2.2.0` after behavior changed**
   — `shared/lib/internal-economics/v2/derive-composite-v2.ts:38-39`,
   `shared/lib/internal-economics/v2/event-stream-engine-v2.ts:23-24`,
   `shared/lib/internal-economics/v2/liquidity-receipt-builder-v2.ts:46-47`,
   `shared/contracts/internal-economics/internal-economics-receipt-v2.contract.ts:240-247`.
   Identical component identifiers could previously produce different refusals
   and receipt hashes. **Disposition: addressed.** Implementation identities now
   use `2.2.1`; regenerated evidence is recorded at
   `tests/unit/internal-economics/v2/support/canonical-receipt-changed-case-manifest-v1.ts:23-40`.
   Receipt contract and waterfall versions intentionally remain `2.2.0`.

### Minor Issues

1. **Active architecture documentation retained the pre-hotfix implementation
   identity** — `docs/ARCHI.md:613-619`. **Disposition: addressed with accepted
   release-flow deferral.** ARCHI now records current `2.2.1` identities and
   hotfix semantics. Historical plan and ADR wording remains unchanged; release
   changelog addendum and review promotion are deferred to TRIP-3 as required.

### Suggestions

None.

---

## Checklist

- [x] 1. Functional Requirements — Passed; eligibility, attribution,
      conservation, and refusal behavior match stated intent.
- [x] 2. Code Quality — Passed; typed Decimal-based implementation with minimal
      localized changes.
- [x] 3. Architectural Compliance — Passed; implementation identities and active
      ARCHI documentation now agree.
- [x] 4. Error Handling — Passed; invalid provenance refuses before cash,
      ledger, or consumption-record mutation.
- [x] 5. Security — Passed; no authentication, secret, persistence, or external
      trust-boundary changes.
- [x] 6. Performance — Passed; allocation and ledger processing remain linear
      over bounded collections.

---

## Verdict

**APPROVED with observations**

All review findings are resolved or explicitly deferred to the authorized TRIP-3
documentation step. Requester reports clean lint, three-project typecheck, 655
affected tests, Phoenix truth 354, and calculation gate 79. Approval covers
source-review readiness only; production dispatch remains separately governed.
