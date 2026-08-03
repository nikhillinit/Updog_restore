---
status: ACTIVE
last_updated: 2026-08-03
---

# ADR-004: Waterfall Calculation Naming and Rounding Contract

**Status:** Accepted, amended 2026-08-03 by ADR-068 **Date:** 2025-10-27
**Decision Makers:** Technical Team **Tags:** #waterfall #nomenclature #rounding
#excel-parity

> **Amendment notice (2026-08-03).** The canonical naming table below is
> unchanged and remains authoritative. What changed is the status of the
> EUROPEAN / whole-fund row's implementation: it is being restored as public,
> parseable vocabulary. Live wizard/draft selection and persistence remain
> American-only. See
> [Amendment: dual-waterfall restoration (ADR-068)](#amendment-dual-waterfall-restoration-adr-068)
> at the end of this document, and `DECISIONS.md` ADR-068 for the governing
> record. The rounding contract is untouched.

---

## Context

Waterfall calculations (carry distribution logic) are central to venture capital
fund modeling. However, terminology varies widely across the industry, leading
to confusion and implementation errors. Additionally, ensuring calculation
parity with Excel spreadsheets is critical, as Excel is the de facto standard
for financial modeling.

### Problem Statement

1. **Terminology Ambiguity**: Terms like "AMERICAN" vs "EUROPEAN" waterfall,
   "deal-by-deal" vs "whole-fund", cause confusion
2. **Rounding Inconsistencies**: JavaScript's `Math.round()` uses banker's
   rounding (round half to even), while Excel's `ROUND()` function rounds ties
   away from zero
3. **Documentation Drift**: Code changes without synchronized documentation
   updates lead to unreliable docs
4. **Type System Mismatch**: TypeScript types suggest European waterfall is
   implemented, but it was removed (zero usage confirmed)

### Key Constraints

- Must maintain Excel calculation parity for user trust and validation
- Must clearly distinguish implemented vs aspirational functionality
- Must support mechanical validation to prevent documentation drift
- Must use industry-standard terminology where possible

---

## Decision

### Canonical Terminology

We adopt the following **canonical naming convention** for waterfall types:

| Term         | Industry Alias | Status             | Description                                                                                |
| ------------ | -------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| **AMERICAN** | Deal-by-deal   | Implemented        | Carry calculated per individual investment exit. Standard for US VC funds.                 |
| **EUROPEAN** | Whole-fund     | Removed (Jan 2026) | Carry calculated on aggregate fund performance. Removed in PR #339 (zero usage confirmed). |

**Rationale:**

- "AMERICAN" / "EUROPEAN" are established industry terms (despite geographic
  inaccuracy)
- Clear distinction between implemented (AMERICAN) and historical/removed
  (EUROPEAN)
- Type aliases (`DEAL_BY_DEAL`, `WHOLE_FUND`) provided in `shared/types.ts` for
  readability

### Rounding Contract

All waterfall calculations use **Excel ROUND semantics** to ensure calculation
parity:

#### Excel ROUND Behavior

- **Tie handling**: Ties (exactly 0.5) round **away from zero** (not banker's
  rounding)
- **Negative digits**: Supported for rounding to tens, hundreds, etc.
- **Precision**: Standard precision is **2 decimal places** for currency amounts

#### Implementation

- **Utility**: `shared/lib/excelRound.ts`
- **Signature**: `excelRound(value: number, numDigits = 0): number`
- **Error Handling**: Throws on non-finite values or non-integer `numDigits`

#### Examples

```typescript
import { excelRound } from '@shared/lib/excelRound';

// Tie cases - round away from zero
excelRound(0.005, 2); // 0.01  (not 0.00 like banker's rounding)
excelRound(-0.005, 2); // -0.01 (not 0.00 like banker's rounding)

// Regular rounding
excelRound(2.345, 2); // 2.35
excelRound(-2.345, 2); // -2.35

// Negative digits
excelRound(123.45, -1); // 120   (round to tens)
excelRound(1250, -2); // 1300  (round to hundreds)
```

**Why Excel ROUND?**

1. **User Expectation**: Financial users expect Excel-compatible calculations
2. **Validation**: Enables direct comparison with Excel models for QA
3. **Consistency**: Single rounding standard across all financial calculations
4. **Determinism**: Predictable tie-breaking eliminates floating-point ambiguity

---

## Validation

This ADR is valid **iff** the following tests pass:

### Automated Tests (Blocking)

| Test Suite          | Location                                   | Required Pass Rate | Purpose                   |
| ------------------- | ------------------------------------------ | ------------------ | ------------------------- |
| Excel ROUND utility | `tests/unit/excelRound.test.ts`            | 100% (30/30 tests) | Validates Excel parity    |
| Truth table         | `tests/unit/waterfall-truth-table.test.ts` | 100% (15/15 tests) | Regression protection     |
| Invariants          | `tests/unit/waterfall-invariants.test.ts`  | 100% (5/5 tests)   | Property-based validation |

### Truth Table

Canonical test scenarios documented in `docs/waterfall.truth-cases.json`:

- **15 scenarios** covering basic, edge, and rounding cases
- **JSON Schema validation**: `docs/schemas/waterfall-truth-case.schema.json`
- **Automated regression**: Any change to waterfall logic must pass all
  scenarios

### Invariants (Property-Based Tests)

1. **Conservation**: `LP total + GP total = distributable` (within rounding
   tolerance)
2. **Non-negativity**: All tier values ≥ 0
3. **Tier exhaustiveness**: Sum of tier allocations = distributable
4. **ROC priority**: Return of capital paid first
5. **Catch-up target**: GP achieves target carry % after catch-up completion

**Enforcement**: CI pipeline blocks merges if any test fails below 100%

---

## Consequences

### Positive

- **Clear Terminology**: Eliminates AMERICAN/EUROPEAN confusion
- **Excel Parity**: Users can validate calculations against Excel models
- **Mechanical Validation**: Documentation drift prevented by test-linked ADRs
- **Type Safety**: TypeScript types accurately reflect implementation status
- **Regression Protection**: 15-scenario truth table catches calculation bugs

### Negative

- **WARNING: European Waterfall Removed**: No whole-fund carry calculation (zero
  usage confirmed)
- **WARNING: Rounding Overhead**: Small performance cost (~2% for `excelRound()`
  vs native)
- **WARNING: Floating-Point Edge Cases**: Rare micro-drift possible despite 2dp
  rounding

### Mitigation

- **Performance**: Profiled at <50ms per waterfall for 10K Monte Carlo runs
  (acceptable)
- **Precision**: 2dp standard with `excelRound()` eliminates practical drift
- **European Future**: Can be added in Phase 4 (Q2 2026) if demand emerges

---

## Scope

### In Scope

- AMERICAN waterfall (deal-by-deal carry calculation)
- Excel ROUND utility implementation
- Truth table with 15 canonical scenarios
- Invariant test suite (5 property-based checks)
- JSON Schema validation for truth cases

### Out of Scope (Non-goals)

- **Hybrid Models**: No AMERICAN-with-EUROPEAN-tiers support
- **Clawback Provisions**: Beyond standard GP catch-up
- **Multi-Currency**: No currency conversion in waterfall
- **Tax Withholding**: No integrated tax calculation
- **Time Value of Money**: No present value discounting in waterfall tiers

---

## Implementation

### Current State (October 2025)

- **Implemented**: AMERICAN waterfall only
- **Type System**: `z.literal('AMERICAN')` in
  `shared/schemas/waterfall-policy.ts`
- **Calculation Function**: `calculateAmericanWaterfall()` in
  `shared/schemas/waterfall-policy.ts` (lines 156-251)
- **Client Helper**: `applyWaterfallChange()` in `client/src/lib/waterfall.ts`
  for field updates

### Migration Path

**Current:** AMERICAN waterfall only (implemented) **Future:** EUROPEAN
waterfall support (Phase 4, Q2 2026 if demand emerges)

**Breaking Changes:** European waterfall type removed (January 2026)

- EUROPEAN type removed from schema in PR #339
- Schema now enforces American-only: `z.literal('AMERICAN')`
- Adding EUROPEAN implementation in future would be **additive** (new
  discriminated union branch)
- Existing AMERICAN calculations unaffected

### Historical Context

**European Waterfall Removal (January 2026)**:

- **PR**: #339 (commit `404df43c`) - "refactor: Remove European waterfall
  support (American-only schema)"
- **Rationale**: Zero usage in production, added complexity, confusion risk
- **Validation**: Query confirmed no funds using European waterfall type
- **Impact**: Type definition completely removed from schema, tests updated to
  American-only
- **Migration**: N/A (zero usage confirmed)

---

## Risks

### Risk 1: Floating-Point Precision

**Description**: Floating-point arithmetic can produce micro-drift despite
rounding **Likelihood**: Low **Impact**: Low (cosmetic only, no business logic
impact) **Mitigation**:

- Excel ROUND utility with 2dp standardization
- Truth table includes tie cases (0.005, -0.005) to catch drift
- Invariant tests validate conservation within rounding tolerance

### Risk 2: Edge Case Rounding

**Description**: Uncommon inputs might expose rounding edge cases
**Likelihood**: Very Low **Impact**: Medium (calculation errors if undetected)
**Mitigation**:

- 15-scenario truth table covers basic + edge cases
- Property-based invariant tests with randomized inputs
- Manual QA review for atypical fund structures

### Risk 3: Performance at Scale

**Description**: `excelRound()` adds overhead to Monte Carlo simulations
**Likelihood**: Low **Impact**: Low (<50ms per waterfall, profiled)
**Mitigation**:

- Benchmarked at 10K+ Monte Carlo iterations (acceptable)
- `isAlreadyRounded()` helper for optimization (skip unnecessary rounds)
- Can add memoization if performance degrades

### Risk 4: Documentation Drift

**Description**: Code changes without test updates cause stale docs
**Likelihood**: Medium (without enforcement) **Impact**: High (user trust,
incorrect calculations) **Mitigation**:

- **Test-linked ADR**: This document is valid iff tests pass
- **CI Gates**: Block merges if domain score < 92%
- **Truth table**: Mechanical regression protection

---

## Alternatives Considered

### Alternative 1: BigDecimal / Decimal.js

**Pros**: Arbitrary precision, eliminates floating-point issues **Cons**:
Performance overhead (10-20x slower), larger bundle size **Decision**:
**Rejected** - 2dp precision with `excelRound()` sufficient, performance cost
unjustified

### Alternative 2: Server-Side Only Calculation

**Pros**: Single source of truth, simpler state management **Cons**: Client-side
UI needs real-time waterfall updates (wizard) **Decision**: **Rejected** -
Real-time client calculation required for UX

### Alternative 3: Banker's Rounding (IEEE 754)

**Pros**: Native JavaScript behavior, zero library dependency **Cons**: **Breaks
Excel parity**, confuses users expecting Excel behavior **Decision**:
**Rejected** - Excel compatibility is non-negotiable

### Alternative 4: No Rounding (High Precision)

**Pros**: Maximum accuracy, no rounding artifacts **Cons**: Display clutter (10+
decimals), JSON payload bloat **Decision**: **Rejected** - 2dp standard balances
precision and readability

---

## Glossary

### Waterfall Terms

| Term                        | Definition                                                       | Example                               |
| --------------------------- | ---------------------------------------------------------------- | ------------------------------------- |
| **Hurdle Rate**             | Minimum return threshold before GP carry participation           | 8% preferred return                   |
| **Catch-Up**                | GP receives disproportionate share until target carry % achieved | GP gets 100% until reaching 20% carry |
| **Carry**                   | GP's performance-based compensation                              | 20% of profits above hurdle           |
| **ROC (Return of Capital)** | LP's contributed capital returned first                          | $500K invested → $500K ROC            |
| **Distributed Capital**     | Total proceeds available for waterfall distribution              | $1M exit → $1M distributable          |
| **Preferred Return**        | LP's minimum return before GP carry participation                | 8% × contributed capital              |
| **Residual**                | Remaining proceeds after ROC, preferred return, and catch-up     | Split by carry % (80/20 LP/GP)        |

### Rounding Terms

| Term                     | Definition                                | Example                      |
| ------------------------ | ----------------------------------------- | ---------------------------- |
| **Tie**                  | Value ending in exactly 0.5 after scaling | 0.005 with 2dp precision     |
| **Round Away from Zero** | Ties increase absolute value              | 0.005 → 0.01, -0.005 → -0.01 |
| **Banker's Rounding**    | Ties round to nearest even number         | 0.5 → 0, 1.5 → 2, 2.5 → 2    |
| **Negative Digits**      | Rounding to tens, hundreds, etc.          | 123.45 with -1 digit → 120   |

---

## References

- **Code**: [`shared/lib/excelRound.ts`](../../shared/lib/excelRound.ts)
- **Tests**:
  [`tests/unit/excelRound.test.ts`](../../tests/unit/excelRound.test.ts)
- **Waterfall Logic**:
  [`shared/schemas/waterfall-policy.ts`](../../shared/schemas/waterfall-policy.ts)
- **Truth Cases**:
  [`docs/waterfall.truth-cases.json`](../waterfall.truth-cases.json)
- **JSON Schema**:
  [`docs/schemas/waterfall-truth-case.schema.json`](../schemas/waterfall-truth-case.schema.json)
- **Related**: [ADR-001: Evaluator Metrics](./0001-evaluator-metrics.md),
  [ADR-002: Token Budgeting](./0002-token-budgeting.md)

---

## Amendment: dual-waterfall restoration (ADR-068)

**Date:** 2026-08-03 **Governing record:** `DECISIONS.md` ADR-068 **Trail:**
issues #1304 through #1309 (Wave W), parent #1171

This ADR's canonical naming table is **unchanged**. AMERICAN still means
deal-by-deal and EUROPEAN still means whole-fund. The rounding contract, the
Excel ROUND semantics, and the validation suite are untouched. What this
amendment changes is the implementation status recorded in the table's EUROPEAN
row and the type-system posture around the term.

### What changed

- **Both terms are public vocabulary.** AMERICAN / deal-by-deal and EUROPEAN /
  whole-fund are both accepted by the standalone public vocabulary schema.
  AMERICAN remains the default and the **only activation-certified template**
  (ADR-066 / GR2-3). EUROPEAN is not yet selectable or persistable through live
  wizard/draft contracts and is not activation-certified.
- **Silent coercion removed.** The public `WaterfallTypeSchema` previously
  rewrote `european` to `american` without signal, destroying caller intent and
  making a whole-fund value indistinguishable from a deal-by-deal one. It is now
  an honest two-value enum that preserves what the caller supplied and rejects
  unknown values with a structured error.
- **Forbidden-token set narrowed.** `european` is no longer a forbidden token.
  All eight Line-of-Credit bans remain under the runtime/source scanner. A
  typecheck-evaluated deep-key assertion protects frozen KPI v1 public contracts
  instead of the former unconsumed type alias.
- **No schema migration.** Vocabulary and validation only. The live persisted
  schema (`FundDraftWriteV1.waterfallType`) and the peripheral fund-config
  schemas still accept deal-by-deal only; later Wave-W work owns any widening.
- **A third public term, `hybrid`, already ships** on the scenario-methodology
  surface. It is a genuine third structure, not an alias for whole-fund: this
  document's own non-goals list defines Hybrid Models as
  "AMERICAN-with-EUROPEAN-tiers", and
  `docs/plans/2026-05-08-gp-economics-extension-design.md` specifies
  `HybridWaterfallPolicyV1` as four independent per-tier scope switches
  (`returnCapitalScope`, `prefScope`, `catchUpScope`, `carryScope`, each
  `'deal' | 'whole_fund'`). AMERICAN and EUROPEAN are its degenerate corners.
  Its shipped selector label, "Hybrid (fund-level)", is therefore misleading.
  #1306 reconciles the surface; see ADR-068 for the evidence.

### Governance state recorded

- **Gate 0D business re-approval** (issue #1171, 2026-07-29 BLOCKED-EXTERNAL
  comment): satisfied for public vocabulary restoration only. It does not
  authorize a live whole-fund calculator, wizard/draft selection, persistence,
  activation certification, or LP-facing results.
- **#1285 narrowed but remains binding**: the LPA carry-basis question no longer
  gates the v1 activation critical path or public vocabulary. It remains the
  conditional business gate for parked #1291 and therefore #1308.
- **Side-trail sequencing**: Wave W runs parallel to the activation critical
  path (#1294 through #1299) and does not touch the GR2-4 side trail (#1300,
  #1301).
- **Merge fence and held-remainder step-up**: each Wave W ticket merges before
  the first #1298 soak window or it holds; a held remainder steps up to the
  post-activation horizon and re-enters after #1299's flip decision. The fence
  is per ticket, so a merged prefix stays merged.
- **Historical verification scripts**: `scripts/verify-european-waterfalls.mjs`
  and `.sql` were re-read. A development or staging check is **not possible** as
  they stand — two of three queries target `fund_models`, a table no migration
  creates, and the `.mjs` wrapper reports a missing table as a zero count rather
  than an error, producing a false clean. No development or staging database is
  reachable (no `DATABASE_URL`, mock DSN in `.env.development`, template-only
  `.env.staging.example`). Production was not queried and no production
  authorization was sought. Details in ADR-068.

### Superseded statements in this document

The following statements above are historical as of 2026-08-03 and are retained
for the record rather than edited in place:

- "WARNING: European Waterfall Removed" (Consequences / Negative) — the removal
  happened in January 2026 and is accurately recorded; restoration is now in
  progress under Wave W.
- "European Future: Can be added in Phase 4 (Q2 2026) if demand emerges"
  (Mitigation) — superseded. Restoration proceeds under ADR-068, not Phase 4.
- "Current State (October 2025) ... Implemented: AMERICAN waterfall only" and
  "Type System: `z.literal('AMERICAN')`" (Implementation) — superseded only for
  the standalone public vocabulary schema. Live wizard/draft contracts and
  frozen KPI selector v1 remain American-only.
- "Migration Path ... Future: EUROPEAN waterfall support (Phase 4, Q2 2026 if
  demand emerges)" (Implementation) — superseded as above. The prediction that
  re-addition would be **additive** (a new discriminated-union branch, leaving
  existing AMERICAN calculations unaffected) remains a requirement for later
  Wave-W implementation.

---

## Changelog

| Date       | Change                                                                             | Author                  |
| ---------- | ---------------------------------------------------------------------------------- | ----------------------- |
| 2025-10-27 | Initial ADR creation with rounding contract and validation                         | Phase 3 NotebookLM Team |
| 2025-10-27 | Document European waterfall removal (commit ebd963a)                               | Phase 3 NotebookLM Team |
| 2026-01-04 | Update European status to "Removed" (PR #339, commit 404df43c)                     | Claude Code             |
| 2026-08-03 | Amend status: dual-waterfall vocabulary restored per ADR-068 (issue #1304, Wave W) | Claude Code             |

---

**Review Cycle**: Every 6 months or when waterfall logic changes **Next
Review**: 2026-04-27
