---
status: HISTORICAL
audience: both
last_updated: 2026-08-31
owner: '@nikhillinit'
---

# Code Review: F_2.0.7 V2 Conformance Closure

**Review Date**: 2026-08-31 **Version**: 2.0.7 (plan-keyed; package version
remains 1.6.0) **Files Reviewed**:

- `shared/lib/internal-economics/v2/event-stream-engine-v2.ts`
- `shared/lib/internal-economics/v2/liquidity-receipt-builder-v2.ts`
- `shared/lib/internal-economics/v2/derive-composite-v2.ts`
- `shared/lib/decimal-string.ts`
- `shared/contracts/internal-economics/internal-economics-input-v2.contract.ts`
- `shared/contracts/internal-economics/internal-economics-receipt-v2.contract.ts`
- `tests/unit/internal-economics/v2/` (atomicity suite, conformance-closure
  suite, changed-case manifest v2, receipt/composite/first-success/opening
  suites)
- `DECISIONS.md` (proposed ADR-090 A1 amendment)
- `docs/ARCHI.md` (section 8 item 6)

**Plan**: `docs/1-plans/F_2.0.7_v2-conformance-closure.plan.md`

---

## Executive Summary

Closes the four verified V2 conformance gaps against the F_2.0.0 normative text
(missing-first refusal precedence for fund-expense allocations, positive
caller-event magnitudes, conditional `other` description, fund-level
`expenseTotalsByCategory` receipt disclosure) and expands atomicity
certification to the complete `EventStreamState`, transitioning the receipt
contract to 2.3.0 and the composite/event-engine/serializer identities to 2.3.0.
Codex loop: round 1 REQUEST_CHANGES (2 Major, 2 Minor), round 2 APPROVED.
Verdict: APPROVED.

---

## Changes Overview

Engine: `processFundExpense` validates lot existence first with a canonical
sorted refusal over all missing lot ids, then eligibility, then amounts and
balances (ADR-090 A1 amendment order); fund-expense effect records carry
`expenseCategory` provenance via a discriminated `EventEffectRecord` union
covered by `cloneEventStreamState`. Contracts: caller `amountUsd` tightened to
an additive `PositiveMoneyDecimalStringSchema`; a validation-only `superRefine`
requires a trimmed non-empty description for `expenseCategory: "other"`; receipt
gains `expenseTotalsByCategory` in the closed shape and canonical preimage with
three-way conservation (journal, partner `cumulativeExpenses`, admitted event
total). Changed-case manifest v1 is frozen as historical 2.2.0 certification;
manifest v2 certifies the 2.2.0 -> 2.3.0 transition with one recorded reason per
changed hash.

---

## Findings

### Critical Issues

None.

### Major Issues

- **A2 refusal identity was allocation-order-dependent** —
  `event-stream-engine-v2.ts` (missing-lot loop). The first missing lot's id
  appeared in the refusal message, so permuted allocation lists produced
  different refusal objects. Disposition: addressed — refusal is now canonical
  over the sorted, deduplicated set of all missing lot ids; tests assert full
  refusal-object strict equality across permutations plus a multiple-missing
  canonical case.
- **A2 implementation precedes A1 ratification** — procedural. Disposition:
  accepted with override — ratification is the merge gate in this solo-governed
  repository; the ADR is drafted as PROPOSED and the candidate stages decision
  and implementation for a single owner review. Nothing lands on `main`
  un-ratified. Reviewer accepted this posture in round 2.

### Minor Issues

- **A6 snapshot omitted the `sourceKind` discriminator** on event-origin cash
  source lots. Disposition: addressed — snapshot emits `sourceKind` on both
  event-origin branches.
- **`docs/ARCHI.md` section 8 item 6 stale** (still described the 2.2.x state).
  Disposition: addressed — rewritten for the F_2.0.7 landed state.

### Suggestions

None.

---

## Checklist

- [x] 1. Functional Requirements — passed
- [x] 2. Architecture & Plan Conformance — passed (A1 ratification is
      merge-gated; accepted override recorded above)
- [x] 3. Code Quality — passed
- [x] 4. Error Handling — passed (refusal-first, canonical, order-independent)
- [x] 5. Security — passed (no new surface; validation-only tightening)
- [x] 6. Performance — passed (single-pass canonicalization; no hot-path change)
- [x] 7. Testing — passed (715 v2+truth; 354 phoenix:truth; 79 calc-gate; full
      suite 13,970 pass with 4 shifting tail flakes proven isolation-green;
      frozen 2.1.0/2.2.0 literals byte-identical; manifest v2 chained to v1)
- [x] 8. Documentation — passed (ADR draft, plan checkboxes, ARCHI update, this
      record)

---

## Verification Evidence

Run with `TZ=UTC` at the reviewed candidate (uncommitted worktree diff on
`feat/v2-conformance-closure`, base `aa355aaf7`):

- `npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/internal-economics/v2/ tests/unit/truth-cases/`
  — 36 files, 715 passed.
- `npm run phoenix:truth` — 354 passed. `npm run calc-gate` — 79 passed.
- `npm test` — 13,970 passed, 81 skipped, tail flakes (`deal-pipeline.contract`,
  `investment-ledger.contract`, `variance-tracking-api`,
  `performance-api-observability`) proven isolation-green (124/124).
- `npm run check` — 0 errors. `npm run lint` — pass. `git diff --check` — clean.

Review loop: codex-code-review, gpt-5.6-luna xhigh (fast tier; sol at capacity),
round 1 REQUEST_CHANGES -> round 2 APPROVED. Reviewer independently recomputed
both manifest v2 hashes.

Owner ratification of the ADR-090 A1 amendment (missing-first precedence and the
component-version tuple, including the unchanged normalizer identity) occurs at
merge review and is a precondition of merging this candidate.
