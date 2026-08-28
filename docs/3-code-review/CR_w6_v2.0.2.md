# Code Review: F2 Completion — Opening State, Balance-Forward Journal, Receipt 2.1.0

**Review Date**: 2026-08-25  
**Version**: 2.0.2 (plan F_2.0.2; package version remains 1.6.0)  
**Files Reviewed**:

- `CHANGELOG.md`
- `DECISIONS.md`
- `docs/ARCHI.md`
- `shared/contracts/internal-economics/internal-economics-input-v2.contract.ts`
- `shared/contracts/internal-economics/internal-economics-receipt-v2.contract.ts`
- `shared/lib/internal-economics/v2/derive-composite-v2.ts`
- `shared/lib/internal-economics/v2/event-stream-engine-v2.ts`
- `shared/lib/internal-economics/v2/liquidity-receipt-builder-v2.ts`
- `shared/lib/internal-economics/v2/normalize-input-v2.ts`
- `shared/lib/internal-economics/v2/waterfall-deal-by-deal-v2.ts`
- `tests/unit/internal-economics/v2/derive-composite-v2.test.ts`
- `tests/unit/internal-economics/v2/event-stream-engine-v2.test.ts`
- `tests/unit/internal-economics/v2/liquidity-receipt-builder-v2.test.ts`
- `tests/unit/internal-economics/v2/normalize-input-v2.test.ts`
- `tests/unit/internal-economics/v2/support/canonical-receipt-changed-case-manifest-v1.ts`
- `tests/unit/internal-economics/v2/support/canonical-receipt-oracle-v1.ts`
- `tests/unit/truth-cases/internal-economics-v2-first-success.test.ts`
- `tests/unit/truth-cases/internal-economics-v2-opening-state.test.ts`

**Plan**: `docs/1-plans/F_2.0.2_v2-f2-completion-state-journal-receipt-spine.plan.md`

---

## Executive Summary

Change completes bounded F2 zero-event opening-state support, balance-forward journal, closed receipt 2.1.0 contract, conservation checks, deterministic hashes, and output limits. Initial owner-domain finding was corrected and verified during incremental review.

APPROVED

---

## Changes Overview

Normalized inputs are deeply sealed before hydration. Runtime state now represents opening cash lots, investment slices, entitlement pools, and journal entries without changing event processing or whole-fund behavior.

Receipt 2.1.0 adds closed component versions, opening-position disclosures, journal rows, expanded ledgers, one exact result-hash preimage, prospective row limits, and final canonical UTF-8 byte limits. Hash-pinned V2-S-0100 and V2-S-0101 evidence covers new and changed receipt cases.

---

## Findings

### Critical Issues

None.

### Major Issues

- **Receipt contract permitted invalid investment owners** — `shared/contracts/internal-economics/internal-economics-receipt-v2.contract.ts:40-45,56-63,90-113`; `shared/lib/internal-economics/v2/event-stream-engine-v2.ts:75-126`; `shared/lib/internal-economics/v2/liquidity-receipt-builder-v2.ts:172-176,365-451`. Initial contract allowed cash-only `fund` and `entitlement_pool` owners on investment slices and investment journal postings. **Disposition: addressed.** Partner-only owner union, discriminated journal entry variants, matching runtime types, and narrowed builder branches now enforce plan domain while preserving receipt bytes and hashes.

### Minor Issues

None.

### Suggestions

None.

---

## Checklist

- [x] 1. Functional Requirements — passed
- [x] 2. Code Quality — passed
- [x] 3. Architectural Compliance — passed
- [x] 4. Error Handling — passed
- [x] 5. Security — passed
- [x] 6. Performance — passed

---

## Verdict

**APPROVED**

All findings are addressed; none remain open or overridden. Final reported gates: lint clean, typecheck clean, 287 affected tests passed, Phoenix truth 353 passed, calculation gate 79 passed, and full test suite 13,519 passed across 1,049 files. Review also confirmed exact two-predicate admission widening, unchanged `processEvents` and whole-fund behavior, ten conservation invariants, exact receipt-minus-`resultHash` preimage, final-object byte measurement, and consumed changed-case evidence.

