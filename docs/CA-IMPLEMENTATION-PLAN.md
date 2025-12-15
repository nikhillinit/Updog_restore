# Capital Allocation Phase 1 Implementation Plan

**Branch**: `claude/ca-phase1-implementation-RFFN3`
**Estimate**: 60-100 hours
**Approach**: Claude Code assisted, TDD-first

---

## Executive Summary

<ultrathink>

### Problem Analysis

**Goal**: Implement CA engine passing 20 truth cases with conservation invariants.

**Constraints**:
- Must follow semantic lock exactly (no deviations)
- TDD-first approach per semantic lock Section 1.3
- Integer cents + basis points for determinism
- CA-005 deferred (skip gate)

**Risk Analysis**:
1. **Highest risk**: LRM float nondeterminism (CA-018 fails if basis points not used)
2. **Medium risk**: Unit inference mismatches (commitment=$M vs buffer=$)
3. **Lower risk**: Timezone parsing (well-documented prohibition)

### Strategy Options

**Option A: Vertical Slice (one truth case end-to-end)**
- Pro: Proves integration works early
- Con: May require rework when patterns change
- Risk: Medium

**Option B: Horizontal Foundation (utilities first, then engine)**
- Pro: Stable foundation, less rework
- Con: Delayed integration feedback
- Risk: Low

**Option C: TDD Layers (test infrastructure → utilities → engine → integration)**
- Pro: Maximum coverage, catches issues early
- Con: More upfront investment
- Risk: Lowest

### Recommendation

**Option C (TDD Layers)** is optimal because:
1. Semantic lock mandates non-tautological tests before implementation
2. Utility functions (rounding, LRM, sort) have explicit test vectors
3. Integration tests catch conservation violations early
4. 60-100h budget allows proper TDD

### Implementation Order Analysis

**Phase 0 (Foundation)**: ~8-12h
- Test infrastructure setup
- Utility functions with locked test vectors
- Critical: bankersRound, allocateLRM, cohortSortKey

**Phase 1 (Core Engine)**: ~20-30h
- Adapter for truth case input normalization
- CapitalAllocationEngine with conservation invariants
- Unit inference + mismatch detection

**Phase 2 (Truth Cases)**: ~20-30h
- Adapter validation against CA-001 through CA-020
- Violation handling (binding vs breach)
- Edge cases (CA-004 adversarial, CA-019 negative)

**Phase 3 (Integration)**: ~10-15h
- API endpoint wiring
- Integration with existing engines
- Output formatting + sorting

**Buffer**: ~10-15h
- Edge case fixes
- Documentation
- Code review refinements

### Critical Path

```
Test Infra → bankersRound → allocateLRM → cohortSortKey → effectiveBuffer
    → CapitalAllocationEngine → Adapter → Truth Cases → Integration
```

### Success Criteria

1. All 20 truth cases pass (excluding CA-005)
2. 10-run determinism test passes
3. Conservation invariants verified
4. No `new Date('YYYY-MM-DD')` in production code
5. Output arrays always present (never undefined)

</ultrathink>

**Recommended Approach**: TDD Layers (test infrastructure → utilities → engine → integration)

**Rationale**: Semantic lock mandates non-tautological tests. Utility functions have explicit test vectors. This approach minimizes rework and catches issues early.

---

## Phase Breakdown

### Phase 0: Foundation (8-12 hours)

**Goal**: Test infrastructure + deterministic utility functions

| Task | Hours | Deliverable | Validation |
|------|-------|-------------|------------|
| 0.1 Test infrastructure | 2-3h | `tests/unit/truth-cases/capital-allocation-adapter.ts` | Loads all 20 cases |
| 0.2 Banker's rounding | 2-3h | `client/src/core/capitalAllocation/rounding.ts` | 6 test vectors pass |
| 0.3 LRM allocation | 2-3h | `client/src/core/capitalAllocation/allocateLRM.ts` | CA-018 verification |
| 0.4 Cohort sort key | 1-2h | `client/src/core/capitalAllocation/sorting.ts` | 6 sort test cases |
| 0.5 Unit inference | 1-2h | `client/src/core/capitalAllocation/units.ts` | Mismatch detection |

**Exit Criteria**:
- [ ] All utility test vectors pass
- [ ] No epsilon comparisons in rounding code
- [ ] No localeCompare in sort code
- [ ] No float remainders in LRM

### Phase 1: Core Engine (20-30 hours)

**Goal**: CapitalAllocationEngine with conservation invariants

| Task | Hours | Deliverable | Validation |
|------|-------|-------------|------------|
| 1.1 Types + schemas | 3-4h | `types.ts`, Zod schemas | Type-safe I/O |
| 1.2 Input adapter | 4-6h | `adapter.ts` | Unit normalization works |
| 1.3 Effective buffer | 2-3h | Formula implementation | CA-001/002/003 pass |
| 1.4 Allocation engine | 8-12h | `CapitalAllocationEngine.ts` | Conservation holds |
| 1.5 Invariant validators | 3-4h | `invariants.ts` | Non-tautological tests |

**Exit Criteria**:
- [ ] Cash conservation: `reserve + allocated = available`
- [ ] Capacity conservation: `commitment = sum(allocations) + remaining`
- [ ] CA-001, CA-002, CA-003 pass

### Phase 2: Truth Case Coverage (20-30 hours)

**Goal**: Pass all 20 truth cases (except CA-005)

| Task | Hours | Deliverable | Validation |
|------|-------|-------------|------------|
| 2.1 Reserve cases | 6-8h | CA-001 to CA-007 | 6/7 pass (CA-005 skipped) |
| 2.2 Pacing cases | 4-6h | CA-008 to CA-013 | 6/6 pass |
| 2.3 Cohort cases | 6-8h | CA-014 to CA-019 | 6/6 pass |
| 2.4 Integration case | 4-6h | CA-020 | Full integration pass |
| 2.5 Determinism test | 2-3h | 10-run verification | All runs identical |

**Exit Criteria**:
- [ ] 19/20 truth cases pass
- [ ] CA-005 has skip gate with rationale
- [ ] Determinism: 10 runs produce identical output
- [ ] No violations in passing cases (except CA-004)

### Phase 3: Integration (10-15 hours)

**Goal**: API endpoint + existing engine integration

| Task | Hours | Deliverable | Validation |
|------|-------|-------------|------------|
| 3.1 API endpoint | 4-5h | `server/routes/ca.ts` | POST /api/ca/calculate |
| 3.2 Output formatting | 2-3h | Sorted arrays, field presence | Schema validation |
| 3.3 Engine integration | 3-4h | Wire to Reserves/Pacing | Cross-engine tests |
| 3.4 Error handling | 2-3h | Violation responses | Error schema matches |

**Exit Criteria**:
- [ ] API returns truth case expected outputs
- [ ] Output arrays always present (never undefined)
- [ ] Violations have correct severity

### Buffer: Polish (10-15 hours)

| Task | Hours | Purpose |
|------|-------|---------|
| Edge case fixes | 4-6h | Issues discovered during integration |
| Documentation | 2-3h | CHANGELOG, ADRs |
| Code review | 4-6h | Address review feedback |

---

## File Structure

```
client/src/core/capitalAllocation/
├── index.ts                    # Public exports
├── CapitalAllocationEngine.ts  # Main engine class
├── types.ts                    # TypeScript types + Zod schemas
├── adapter.ts                  # Input normalization, unit inference
├── invariants.ts               # Conservation validators
├── rounding.ts                 # bankersRoundPositive, bankersRoundSymmetric
├── allocateLRM.ts              # Largest Remainder Method (integer)
├── sorting.ts                  # cohortSortKey, deterministic comparator
├── units.ts                    # Unit inference, mismatch detection
├── violations.ts               # Violation types + triggers
└── __tests__/
    ├── rounding.test.ts        # 6 banker's rounding vectors
    ├── allocateLRM.test.ts     # CA-018 verification
    ├── sorting.test.ts         # 6 sort key vectors
    ├── units.test.ts           # Mismatch detection
    ├── invariants.test.ts      # Conservation laws
    └── determinism.test.ts     # 10-run verification

tests/unit/truth-cases/
├── runner.test.ts              # (UPDATED) Add CA section
├── capital-allocation-adapter.ts
└── capital-allocation-helpers.ts

server/routes/
└── ca.ts                       # API endpoint
```

---

## Critical Implementation Details

### 1. Banker's Rounding (NO EPSILON)

```typescript
// CORRECT - strict comparison (0.5 exactly representable)
function bankersRoundPositive(x: number): number {
  const n = Math.floor(x);
  const frac = x - n;
  if (frac < 0.5) return n;
  if (frac > 0.5) return n + 1;
  return (n % 2 === 0) ? n : n + 1;
}
```

### 2. LRM with Integer Basis Points

```typescript
// CRITICAL: No float remainders
function allocateLRM(totalCents: number, weightsBps: number[]): number[] {
  const allocations: number[] = [];
  const remainders: { i: number; rem: number }[] = [];

  for (let i = 0; i < weightsBps.length; i++) {
    const base = Math.floor(totalCents * weightsBps[i] / 10_000_000);
    const rem = (totalCents * weightsBps[i]) % 10_000_000;  // INTEGER
    allocations.push(base);
    remainders.push({ i, rem });
  }

  // Sort by remainder DESC, index ASC (tie-break)
  remainders.sort((a, b) => b.rem - a.rem || a.i - b.i);

  let shortfall = totalCents - allocations.reduce((a, b) => a + b, 0);
  for (let j = 0; shortfall > 0; j++) {
    allocations[remainders[j].i]++;
    shortfall--;
  }

  return allocations;
}
```

### 3. Deterministic Sort (NO localeCompare)

```typescript
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function cohortSortKey(c: Cohort): [string, string] {
  return [
    c.start_date || '9999-12-31',
    String(c.id ?? c.name ?? '').toLowerCase()
  ];
}
```

### 4. Effective Buffer (Unified Formula)

```typescript
function calcEffectiveBuffer(
  minCashBuffer: number,
  commitment: number,
  targetReservePct: number
): number {
  return Math.max(
    minCashBuffer ?? 0,
    Math.round(commitment * (targetReservePct ?? 0))
  );
}
```

---

## Test Vectors (Locked)

### Banker's Rounding

| Input | Expected |
|-------|----------|
| `bankersRoundSymmetric(2.5)` | `2` |
| `bankersRoundSymmetric(3.5)` | `4` |
| `bankersRoundSymmetric(-2.5)` | `-2` |
| `bankersRoundSymmetric(-3.5)` | `-4` |
| `bankersRoundSymmetric(2.4)` | `2` |
| `bankersRoundSymmetric(2.6)` | `3` |

### Cohort Sort Key

| start_date | id | Position |
|------------|-----|----------|
| `'2024-01-01'` | `'A'` | First |
| `'2024-01-01'` | `'B'` | Second |
| `'2024-06-01'` | `'A'` | Third |
| `''` | `'Z'` | Last |
| `null` | `'Y'` | Last |
| `'2024-01-01'` | `0` | Works |

### CA-018 LRM Verification

```
Weights: [0.3333333, 0.3333333, 0.3333334]
Total: 1,000,000 cents
Expected: [333333, 333333, 333334]
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Float nondeterminism in LRM | Use 1e7 scale basis points, integer mod |
| Timezone drift | Grep prohibition in CI: `new Date\('[0-9]` |
| Unit mismatch | Ratio-based detector (>100,000x = error) |
| Output ordering drift | Explicit sort before every return |
| Conservation violation | Non-tautological test (hand-calculated expected) |

---

## Definition of Done

### Phase 0 Complete When:
- [ ] `npm test -- client/src/core/capitalAllocation/__tests__/` passes
- [ ] All 6 rounding vectors pass
- [ ] All 6 sort vectors pass
- [ ] CA-018 LRM verification passes

### Phase 1 Complete When:
- [ ] CA-001, CA-002, CA-003 truth cases pass
- [ ] Conservation invariant tests pass (non-tautological)
- [ ] Input adapter handles unit inference

### Phase 2 Complete When:
- [ ] 19/20 truth cases pass
- [ ] CA-005 skipped with documented gate
- [ ] 10-run determinism test passes
- [ ] CA-004 violation correctly emitted

### Phase 3 Complete When:
- [ ] API endpoint returns correct output
- [ ] Output arrays never undefined
- [ ] Integration with Reserves/Pacing verified

### Final Sign-off:
- [ ] All tests green
- [ ] No `new Date('YYYY-MM-DD')` in code
- [ ] CHANGELOG.md updated
- [ ] PR approved

---

## Next Action

**Start Phase 0.1**: Set up test infrastructure and load truth cases.

```bash
# Create directory structure
mkdir -p client/src/core/capitalAllocation/__tests__

# First file: test infrastructure
touch tests/unit/truth-cases/capital-allocation-adapter.ts
```
