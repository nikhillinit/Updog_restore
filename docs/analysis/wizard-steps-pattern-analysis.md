---
status: ACTIVE
last_updated: 2026-01-19
---

# Pattern Analysis: Wizard Steps - watch() Usage

**Date**: 2025-11-30
**Analysis Type**: Pattern Recognition (Phase 2 of Systematic Debugging)
**Purpose**: Identify all wizard steps with watch() + calculation anti-pattern

---

## Pattern Signature (Anti-Pattern)

```typescript
// [x] ANTI-PATTERN: watch() defeating memoization
const formValues = watch();  // Returns NEW object every render
const { calculations } = useSomeCalculationHook({
  formValues,  // Object identity changes → memo busted
  // ... other deps
});
```

---

## Analysis Results

### Files Analyzed (8 wizard steps)

| File | Pattern | Issue | Priority |
|------|---------|-------|----------|
| CapitalAllocationStep.tsx | [x] Anti-pattern | HIGH | **P0** |
| ExitRecyclingStep.tsx | [x] Anti-pattern | MEDIUM | **P1** |
| FundFinancialsStep.tsx | PASS Safe | None | - |
| ScenariosStep.tsx | PASS Safe | None | - |
| GeneralInfoStep.tsx | [ ] Not analyzed | Unknown | P2 |
| SectorProfilesStep.tsx | [ ] Not analyzed | Unknown | P2 |
| WaterfallStep.tsx | [ ] Not analyzed | Unknown | P2 |
| FeesExpensesStep.tsx | [ ] Not analyzed | Unknown | P2 |

---

## Detailed Analysis

### [x] CapitalAllocationStep.tsx (CRITICAL - P0)

**Lines 85-96:**
```typescript
const formValues = watch();  // [x] NEW object every render
const entryStrategy = watch('entryStrategy');  // Extra watch call
const reserveRatio = watch('followOnStrategy.reserveRatio');  // Extra watch call

const { calculations, validation } = useCapitalAllocationCalculations({
  formValues,  // [x] Memo busted
  fundFinancials,
  sectorProfiles,
  vintageYear: new Date().getFullYear()
});
```

**Lines 99-107: Auto-save (unbounced)**
```typescript
React.useEffect(() => {
  const subscription = watch(value => {
    const result = capitalAllocationSchema.safeParse(value);
    if (result.success) {
      onSave(result.data);  // [x] Fires every keystroke
    }
  });
  return () => subscription.unsubscribe();
}, [watch, onSave]);
```

**Calculation Complexity:**
- **Hook**: `useCapitalAllocationCalculations`
- **Functions**: `calculateCapitalAllocation()`, `validateCapitalAllocation()`
- **Operations**:
  - Weighted round size (iterate sectors)
  - Follow-on cascade (map stage populations)
  - Pacing schedule (5+ periods)
  - Validation (10 checks: 5 errors + 5 warnings)
- **Estimated duration**: 5-10ms per calculation
- **Impact during typing**: 50-100ms CPU per second

**Severity**: **CRITICAL**
- Most complex calculations in wizard
- Used frequently (step 3 of 7)
- Noticeable performance degradation

---

### [x] ExitRecyclingStep.tsx (MEDIUM - P1)

**Lines 68-78:**
```typescript
const formValues = watch();  // [x] NEW object every render
const enabled = watch('enabled');  // Extra watch
const recyclingCap = watch('recyclingCap');  // Extra watch
const exitRecyclingRate = watch('exitRecyclingRate');  // Extra watch

const { calculations, validation } = useExitRecyclingCalculations({
  formValues,  // [x] Memo busted
  fundSize: fundFinancials.fundSize
});
```

**Lines 81-89: Auto-save (unbounced)**
```typescript
React.useEffect(() => {
  const subscription = watch(value => {
    const result = exitRecyclingSchema.safeParse(value);
    if (result.success) {
      onSave(result.data);  // [x] Fires every keystroke
    }
  });
  return () => subscription.unsubscribe();
}, [watch, onSave]);
```

**Calculation Complexity:**
- **Hook**: `useExitRecyclingCalculations`
- **Operations**: Exit recycling projections, policy limit checks
- **Estimated duration**: 2-5ms per calculation
- **Impact**: Less severe than CapitalAllocationStep but same pattern

**Severity**: **MEDIUM**
- Simpler calculations than CapitalAllocationStep
- Used less frequently (optional feature)
- Same anti-pattern needs fixing

---

### PASS FundFinancialsStep.tsx (SAFE)

**Lines 93-110:**
```typescript
// PASS GOOD: useMemo dependencies are primitives/stable arrays
const projections = React.useMemo(() => {
  const safeExpenses = (additionalExpenses ?? []).map(exp => ({
    name: exp.name ?? '',
    annualAmount: exp.annualAmount ?? 0,
    startYear: exp.startYear ?? 1,
    category: exp.category ?? 'overhead'
  }));

  return projectFundExpenses(
    managementFee,
    orgExpenses,
    fundFinancials.fundSize,
    fundFinancials.fundLifespan,
    safeExpenses
  );
}, [managementFee, orgExpenses, fundFinancials.fundSize, fundFinancials.fundLifespan, additionalExpenses]);
```

**Lines 132-134:**
```typescript
// PASS GOOD: Dependencies are primitives + memoized value
const netInvestableCapital = React.useMemo(() => {
  return calculateNetInvestableCapital(fundSize, orgExpenses, projections);
}, [fundSize, orgExpenses, projections]);
```

**Pattern**: Uses `React.useMemo` directly with primitive dependencies
**Result**: Memoization works correctly
**Note**: Does NOT use `watch()` to create calculation inputs

---

### PASS ScenariosStep.tsx (SAFE)

**Lines 80-88:**
```typescript
// PASS GOOD: useMemo with stable dependencies
const baseModel = React.useMemo(() => ({
  grossMOIC: 2.5,
  netMOIC: 2.1,
  netIRR: 18.5,
  averageHoldingPeriod: 4.5,
  successRate: 0.6
}), []);  // Empty deps = constant
```

**Lines 91-95:**
```typescript
// PASS GOOD: baseModel is stable (from useMemo above)
const { results, comparison } = useScenarioCalculations({
  baseModel,  // Stable reference from useMemo
  scenarios: scenarios as ScenarioAdjustment[],
  fundSize: fundFinancials.fundSize
});
```

**Pattern**: Creates stable `baseModel` with `useMemo`, then passes to calculation hook
**Result**: Memoization works correctly
**Note**: `scenarios` might change, but that's intentional (user editing scenarios)

---

## Pattern Comparison

### Anti-Pattern (BROKEN)
```typescript
// [x] watch() returns NEW object → memo busted
const formValues = watch();
const { calculations } = useCalcHook({ formValues });
```

### Safe Pattern (Option 1: Primitives)
```typescript
// PASS Watch primitives, then useMemo
const field1 = watch('field1');
const field2 = watch('field2');

const calculations = React.useMemo(() => {
  return calculate(field1, field2);
}, [field1, field2]);  // Primitives = stable identity
```

### Safe Pattern (Option 2: Stable Object)
```typescript
// PASS useMemo creates stable object
const inputs = React.useMemo(() => ({
  field1: watch('field1'),
  field2: watch('field2')
}), [watch('field1'), watch('field2')]);

const { calculations } = useCalcHook({ inputs });
```

### Safe Pattern (Option 3: Subscription)
```typescript
// PASS Subscription with state (stable between renders)
const [formValues, setFormValues] = useState(getValues());

useEffect(() => {
  const subscription = watch((value) => setFormValues(value));
  return () => subscription.unsubscribe();
}, [watch]);

const { calculations } = useCalcHook({ formValues });
```

---

## Severity Classification

### P0 - Critical (Fix Immediately)
- **CapitalAllocationStep.tsx**
  - Reason: Most complex calculations, high frequency usage
  - Impact: 50-100ms CPU overhead per second during typing
  - User-facing: Noticeable lag, poor UX

### P1 - High (Fix Same PR)
- **ExitRecyclingStep.tsx**
  - Reason: Same pattern, less complex calculations
  - Impact: 20-50ms CPU overhead per second during typing
  - User-facing: Minor lag, apply consistent pattern

### P2 - Medium (Investigate, Fix if Found)
- **GeneralInfoStep.tsx** - Quick check needed
- **SectorProfilesStep.tsx** - Quick check needed
- **WaterfallStep.tsx** - Quick check needed
- **FeesExpensesStep.tsx** - Quick check needed

---

## Recommended Fix Strategy

### Phase 1: Critical Path (CapitalAllocationStep)
1. Implement **Option 2 (Subscription + Debounce)**
2. Reason: 6+ fields watched, complex form, heavy calculations
3. Add debounce layer (250ms for calculations, 500ms for auto-save)
4. Add optional "calculating..." indicator

### Phase 2: Consistency (ExitRecyclingStep)
1. Apply **same pattern** as CapitalAllocationStep
2. Maintain consistency across wizard
3. Same debounce delays

### Phase 3: Verification (Other Steps)
1. Quick grep for `watch()` + calculation hook patterns
2. Fix if found, document if not
3. Add to cheatsheet to prevent future occurrences

---

## Files Requiring Changes

### Immediate (P0-P1)
1. PASS `client/src/components/modeling-wizard/steps/CapitalAllocationStep.tsx`
2. PASS `client/src/components/modeling-wizard/steps/ExitRecyclingStep.tsx`

### Investigation (P2)
3. PENDING `client/src/components/modeling-wizard/steps/GeneralInfoStep.tsx`
4. PENDING `client/src/components/modeling-wizard/steps/SectorProfilesStep.tsx`
5. PENDING `client/src/components/modeling-wizard/steps/WaterfallStep.tsx`
6. PENDING `client/src/components/modeling-wizard/steps/FeesExpensesStep.tsx`

### New Infrastructure
7. NEW `client/src/hooks/useDebounceDeep.ts` (new hook)
8. NEW `tests/performance/watch-debounce.test.tsx` (performance tests)
9. NEW `cheatsheets/react-performance-patterns.md` (documentation)

---

## Next Steps

1. PASS Phase 1 complete - Root cause identified
2. PASS Phase 2 complete - Pattern analysis done
3. NEXT Phase 3 - Create failing performance tests (TDD)
4. NEXT Phase 4 - Implement fix for CapitalAllocationStep
5. NEXT Phase 5 - Apply to ExitRecyclingStep
6. NEXT Phase 6 - Verify with perf-guard agent

---

## References

- **Root Cause Report**: `docs/analysis/perf-watch-memoization-root-cause.md`
- **React Hook Form docs**: https://react-hook-form.com/docs/useform/watch
- **Systematic Debugging**: `.claude/skills/systematic-debugging.md`
- **Pattern Recognition**: `.claude/skills/pattern-recognition.md`
