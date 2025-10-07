# PR #113 - Fund Calc Changes Review Comment

## 📊 Fund Calculation Engine Review

### ✅ What's Good

- Deterministic design (no RNG) - same inputs = same outputs
- Decimal.js prevents floating-point errors
- Clear period-by-period tracking
- Good separation of concerns (`deployCompanies`, `simulatePeriods`, `getExitMultiple`)
- Management fee horizon fix (lines 295-304) correctly ensures fees captured even after exits

### ⚠️ Issues to Address

#### 1. Hard-coded Values → Make Configurable

**Problem:** [fund-calc.ts:268](https://github.com/nikhillinit/Updog_restore/pull/113/files#diff-...L268)
```typescript
ownershipAtExit: 0.15,  // TODO: Make configurable per stage
```

**Problem:** [fund-calc.ts:308](https://github.com/nikhillinit/Updog_restore/pull/113/files#diff-...L308)
```typescript
new Date().toISOString(),  // TODO: Make configurable
```

**Fix:** Add to schema:
```typescript
// shared/schemas/fund-model.ts
export const FundModelInputsSchema = z.object({
  fundSize: z.number().positive(),
  fundStartDateISO: z.string().datetime(),  // NEW

  // Stage-specific ownership percentages
  stageOwnership: z.record(                 // NEW
    z.enum(['preseed', 'seed', 'seriesA', 'seriesB', 'seriesC', 'growth']),
    z.number().min(0).max(1)
  ),

  // ... rest
});
```

```typescript
// client/src/lib/fund-calc.ts
companies.push({
  // ...
  ownershipAtExit: inputs.stageOwnership[stageAlloc.stage] || 0.15,
});

const periodDates = generatePeriodDates(
  inputs.fundStartDateISO,  // From inputs, not new Date()
  inputs.periodLengthMonths,
  numPeriods + 1
);
```

#### 2. Reserve Allocation Logic

**Problem:** [fund-calc.ts:243-246](https://github.com/nikhillinit/Updog_restore/pull/113/files#diff-...L243-L246)
```typescript
const stageCapital = toDecimal(inputs.fundSize).times(stageAlloc.allocationPct);
const reserveCapital = stageCapital.times(inputs.reservePoolPct);
const deployableCapital = stageCapital.minus(reserveCapital);
```

**Issue:** Reserves are subtracted from each stage independently. This double-counts reserves. Reserves should be a single pool-level concept.

**Fix:**
```typescript
function deployCompanies(inputs: FundModelInputs): CompanyResult[] {
  const companies: CompanyResult[] = [];

  // ✅ Calculate total reserve pool ONCE at fund level
  const totalReservePool = toDecimal(inputs.fundSize).times(inputs.reservePoolPct);
  const totalDeployableCapital = toDecimal(inputs.fundSize).minus(totalReservePool);

  inputs.stageAllocations.forEach(stageAlloc => {
    // ✅ Stage capital is fraction of DEPLOYABLE capital
    const stageDeployableCapital = totalDeployableCapital.times(stageAlloc.allocationPct);

    const avgCheckSize = toDecimal(inputs.averageCheckSizes[stageAlloc.stage] || 0);
    const numCompanies = stageDeployableCapital.dividedToIntegerBy(avgCheckSize).toNumber();

    // ... rest
  });

  return companies;
}
```

#### 3. Follow-on Investment Logic

**Problem:** [fund-calc.ts:266](https://github.com/nikhillinit/Updog_restore/pull/113/files#diff-...L266)
```typescript
followOnInvestment: 0,  // Will be calculated during simulation
```

**Issue:** Comment says "will be calculated" but it's never actually implemented in `simulatePeriods`.

**Option 1 - Minimal Implementation:**
```typescript
function simulatePeriods(inputs: FundModelInputs, companies: CompanyResult[]): PeriodResult[] {
  let remainingReservePool = toDecimal(inputs.fundSize).times(inputs.reservePoolPct);

  for (let periodIndex = 1; periodIndex <= numPeriods; periodIndex++) {
    const periodMonths = periodIndex * inputs.periodLengthMonths;

    // Handle graduations (deterministic)
    companies.forEach(company => {
      const stageGradMonths = inputs.monthsToGraduate[company.stageAtEntry] || 0;

      if (periodMonths >= stageGradMonths && company.followOnInvestment === 0) {
        // Simple: 50% of initial check
        const targetFollowOn = toDecimal(company.initialInvestment).times(0.5);
        const actualFollowOn = Decimal.min(targetFollowOn, remainingReservePool);

        company.followOnInvestment = actualFollowOn.toNumber();
        company.totalInvested += company.followOnInvestment;
        remainingReservePool = remainingReservePool.minus(actualFollowOn);
      }
    });
  }
}
```

**Option 2 - Remove for Now (RECOMMENDED):**
```typescript
companies.push({
  companyId,
  stageAtEntry: stageAlloc.stage,
  initialInvestment,
  // followOnInvestment: 0,  // ❌ REMOVED - implement in follow-up PR
  totalInvested: initialInvestment,
  // ...
});
```

**Recommendation:** Remove for this PR, implement properly in follow-up PR with reserve optimization logic.

#### 4. Exit Timing Precision

**Current:** [fund-calc.ts:363-376](https://github.com/nikhillinit/Updog_restore/pull/113/files#diff-...L363-L376)
```typescript
if (periodMonths >= stageExitMonths && company.exitValue === 0) {
```

**Issue:** First period that crosses threshold triggers exit. For a company with 36-month exit and 3-month periods, it exits at month 36. But with 4-month periods, it exits at month 40 (4 months late).

**Consider:** More precise timing or document this behavior as acceptable approximation for deterministic model.

#### 5. Management Fee Timing

**Good news:** Lines 295-304 already correctly handle this:
```typescript
const managementFeeMonths = inputs.managementFeeYears * 12;
const simulationMonths = Math.max(maxExitMonths, managementFeeMonths);
```

This ensures fees are captured even after exits. ✅ Keep as-is.

---

### 🧪 Testing Requirements

#### Golden Fixture Tests

Create deterministic test fixtures:

```typescript
// tests/fixtures/fund-calc/smoke-test.json
{
  "name": "Smoke test - no reserves, no exits",
  "inputs": {
    "fundSize": 100000000,
    "fundStartDateISO": "2025-01-01T00:00:00.000Z",
    "periodLengthMonths": 3,
    "managementFeeRate": 0.02,
    "stageOwnership": { "seed": 0.15, "seriesA": 0.12 },
    // ...
  },
  "expected": {
    "numPeriods": 40,
    "finalTVPI": 2.5,
    "finalDPI": 1.8,
    "totalManagementFees": 20000000
  }
}
```

```typescript
// tests/fund-calc.test.ts
import { runFundModel } from '../client/src/lib/fund-calc';
import smokeTest from './fixtures/fund-calc/smoke-test.json';

describe('Fund Calculation Engine', () => {
  it('should match golden fixture: smoke test', () => {
    const result = runFundModel(smokeTest.inputs);

    expect(result.periodResults).toHaveLength(smokeTest.expected.numPeriods);
    expect(result.kpis.tvpi).toBeCloseTo(smokeTest.expected.finalTVPI, 2);
    expect(result.kpis.dpi).toBeCloseTo(smokeTest.expected.finalDPI, 2);

    const totalFees = result.periodResults.reduce((sum, p) => sum + p.managementFees, 0);
    expect(totalFees).toBeCloseTo(smokeTest.expected.totalManagementFees, -3);
  });
});
```

**Additional fixtures needed:**
- With reserves + varied exit timing
- Different period lengths (monthly, quarterly, annual)
- Stage ownership variations

#### CSV Export Test

```typescript
// tests/csv-export.test.ts
describe('CSV Export', () => {
  it('should export with correct formatting', () => {
    const csv = convertToCSV(periodResults);
    const lines = csv.split('\n');

    expect(lines[0]).toContain('periodIndex,periodStart,periodEnd');
    expect(lines[1]).toContain('100000000.00'); // Currency formatting
  });
});
```

---

### 🎯 Approval Checklist

- [ ] `fundStartDateISO` input added (remove `new Date()`)
- [ ] `stageOwnership` input added (remove hard-coded 0.15)
- [ ] Reserve logic fixed (pool-level, not per-stage)
- [ ] Follow-on logic either implemented or removed
- [ ] Golden fixture tests added (at least 3 scenarios)
- [ ] CSV export tests added
- [ ] Documentation updated with input schema changes

---

**Note:** Please split fund-calc changes into separate PR from auth changes. This is a substantial feature that deserves its own review cycle.

### 📚 Additional Recommendations

**File organization:**
Consider moving calc logic to shared lib once stable:
```
shared/lib/
  ├── fund-calc/
  │   ├── deployment.ts      # deployCompanies
  │   ├── simulation.ts      # simulatePeriods
  │   ├── kpis.ts           # calculateKPIs
  │   └── validation.ts      # validateInputs
```

**Future enhancements** (separate PRs):
- Mark-to-market unrealized P&L
- Multiple distribution policies (not just Policy A)
- Dilution modeling for follow-ons
- Waterfall calculations integration
- Scenario comparison (construction vs current)
