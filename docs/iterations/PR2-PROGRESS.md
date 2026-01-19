---
status: ACTIVE
last_updated: 2026-01-19
---

# PR #2 Progress: CSV Exports & Frozen Calc API

**Status**: 🟡 60% Complete
**Estimated Remaining**: 1 day
**Last Updated**: 2025-10-03

---

## ✅ Completed (60%)

### 1. Frozen Zod Schemas ✅
**File**: [shared/schemas/fund-model.ts](../../shared/schemas/fund-model.ts)

**Features**:
- ✅ Complete type-safe API contract (FundModelInputs, FundModelOutputs)
- ✅ All 5 feasibility constraints integrated
- ✅ Stage allocation validation
- ✅ Check size constraints
- ✅ Graduation vs exit time validation
- ✅ Warning constraints (reserve pool sanity, capacity check)

**Lines**: 355 lines of production-ready code

---

### 2. Decimal Math Utilities ✅
**File**: [client/src/lib/decimal-utils.ts](../../client/src/lib/decimal-utils.ts)

**Features**:
- ✅ Decimal.js configured globally (20-digit precision)
- ✅ Rounding functions (currency, ratio, percent)
- ✅ CSV formatting with proper decimal places
- ✅ Calculation helpers (sum, cumulativeSum, safeDivide)
- ✅ Validation helpers (tolerance checking)
- ✅ Type guards and converters

**Lines**: 185 lines

---

### 3. XIRR Calculator (Hardened) ✅
**File**: [client/src/lib/xirr.ts](../../client/src/lib/xirr.ts)

**Features**:
- ✅ Newton-Raphson method (fast convergence)
- ✅ Bisection fallback (reliable convergence)
- ✅ Sign-change assertion (catches invalid inputs)
- ✅ Period-end date usage (Excel parity)
- ✅ Actual/365 day count convention
- ✅ Cashflow schedule builder from period results
- ✅ Edge case handling (insufficient cashflows, no sign change, convergence failures)

**Lines**: 235 lines

---

## 📝 Remaining Work (40%)

### 4. Fund Calculation Engine (Stub)
**File**: `client/src/lib/fund-calc.ts` (TO CREATE)

**Required Functions**:
```typescript
// Main engine entry point
export function runFundModel(inputs: FundModelInputs): FundModelOutputs {
  // TODO: Full implementation in next iteration
  // For PR #2, return stub for testing CSV exports
  throw new Error('Engine not yet implemented - see PR #2 follow-up');
}

// Fee calculation with horizon
export function calculateManagementFee(
  fundSize: number,
  periodLengthMonths: number,
  managementFeeRate: number,
  managementFeeYears: number,
  periodIndex: number
): number {
  const periodsPerYear = 12 / periodLengthMonths;
  const periodYears = periodIndex / periodsPerYear;

  // Stop fees after managementFeeYears
  if (periodYears >= managementFeeYears) {
    return 0;
  }

  const periodFeeRate = managementFeeRate / periodsPerYear;
  return new Decimal(fundSize).times(periodFeeRate).toNumber();
}

// KPI calculations
export function calculateKPIs(periodResults: PeriodResult[]): {
  tvpi: number;
  dpi: number;
  irrAnnualized: number;
} {
  const totalDistributions = sum(periodResults.map(p => p.distributions));
  const totalContributions = sum(periodResults.map(p => p.contributions));
  const finalNAV = periodResults[periodResults.length - 1].nav;

  const tvpi = safeDivide(totalDistributions.plus(finalNAV), totalContributions);
  const dpi = safeDivide(totalDistributions, totalContributions);
  const irr = calculateIRRFromPeriods(periodResults);

  return {
    tvpi: roundRatio(tvpi),
    dpi: roundRatio(dpi),
    irrAnnualized: roundPercent(irr),
  };
}
```

**Estimated**: 2-3 hours (stub only, full implementation later)

---

### 5. CSV Export Routes
**File**: `server/routes/calculations.ts` (TO CREATE)

**Required Endpoints**:

#### POST /api/dev/export-forecast
Exports period-level forecast CSV with lineage fields.

```typescript
import express from 'express';
import crypto from 'crypto';
import { stringify } from 'csv-stringify/sync';
import type { FundModelInputs, FundModelOutputs } from '@shared/schemas/fund-model';
import { formatForCSV } from '../../client/src/lib/decimal-utils';
import { ENGINE_VERSION } from '../version';

const router = express.Router();

/**
 * Generate deterministic hash of inputs for lineage tracking
 */
function hashInputs(inputs: FundModelInputs): string {
  const canonical = JSON.stringify(inputs, Object.keys(inputs).sort());
  return crypto.createHash('sha256')
    .update(canonical)
    .digest('hex')
    .substring(0, 8);
}

/**
 * POST /api/dev/export-forecast
 * Export forecast CSV with lineage fields
 */
router.post('/dev/export-forecast', async (req, res) => {
  try {
    const { inputs, outputs, scenarioId } = req.body as {
      inputs: FundModelInputs;
      outputs: FundModelOutputs;
      scenarioId?: string;
    };

    const inputsHash = hashInputs(inputs);

    const rows = outputs.periodResults.map(period => ({
      engine_version: ENGINE_VERSION,
      inputs_hash: inputsHash,
      scenario_id: scenarioId || 'adhoc',
      period_index: period.periodIndex,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      contributions: formatForCSV(period.contributions, 'currency'),
      investments: formatForCSV(period.investments, 'currency'),
      management_fees: formatForCSV(period.managementFees, 'currency'),
      exit_proceeds: formatForCSV(period.exitProceeds, 'currency'),
      distributions: formatForCSV(period.distributions, 'currency'),
      unrealized_pnl: formatForCSV(period.unrealizedPnl, 'currency'),
      nav: formatForCSV(period.nav, 'currency'),
      tvpi: formatForCSV(period.tvpi, 'ratio'),
      dpi: formatForCSV(period.dpi, 'ratio'),
      irr_annualized: formatForCSV(period.irrAnnualized, 'percent'),
    }));

    const csv = stringify(rows, { header: true });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="forecast-${inputsHash}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/dev/export-companies
 * Export company ledger CSV with lineage fields
 */
router.post('/dev/export-companies', async (req, res) => {
  try {
    const { inputs, outputs, scenarioId } = req.body as {
      inputs: FundModelInputs;
      outputs: FundModelOutputs;
      scenarioId?: string;
    };

    const inputsHash = hashInputs(inputs);

    const rows = outputs.companyLedger.map(company => ({
      engine_version: ENGINE_VERSION,
      inputs_hash: inputsHash,
      scenario_id: scenarioId || 'adhoc',
      company_id: company.companyId,
      stage_at_entry: company.stageAtEntry,
      initial_investment: formatForCSV(company.initialInvestment, 'currency'),
      follow_on_investment: formatForCSV(company.followOnInvestment, 'currency'),
      total_invested: formatForCSV(company.totalInvested, 'currency'),
      ownership_at_exit: formatForCSV(company.ownershipAtExit, 'ratio'),
      exit_bucket: company.exitBucket,
      exit_value: formatForCSV(company.exitValue, 'currency'),
      proceeds_to_fund: formatForCSV(company.proceedsToFund, 'currency'),
    }));

    const csv = stringify(rows, { header: true });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="companies-${inputsHash}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
```

**Estimated**: 1-2 hours

---

### 6. Wire Routes to Server
**File**: `server/app.ts` (TO MODIFY)

Add:
```typescript
import calculationsRouter from './routes/calculations.js';

// After health routes
app.use('/api', calculationsRouter);
```

**Estimated**: 5 minutes

---

## 📊 Progress Summary

| Component | Status | LOC | Time Spent |
|-----------|--------|-----|------------|
| Zod Schemas | ✅ Complete | 355 | 1.5 hours |
| Decimal Utils | ✅ Complete | 185 | 1 hour |
| XIRR Calculator | ✅ Complete | 235 | 1.5 hours |
| Fund Calc Stub | 📝 Remaining | ~150 | 2 hours |
| CSV Routes | 📝 Remaining | ~120 | 1.5 hours |
| Server Wiring | 📝 Remaining | ~5 | 5 min |

**Total Completed**: ~775 lines, ~4 hours
**Total Remaining**: ~275 lines, ~4 hours

**Overall**: 60% complete by LOC, 50% by time

---

## ✅ Acceptance Criteria

### Completed:
- [x] Frozen Zod schemas with all 5 feasibility constraints
- [x] Decimal.js configured (20-digit precision)
- [x] Rounding utilities (currency, ratio, percent)
- [x] CSV formatting functions
- [x] XIRR with sign-change assertion
- [x] XIRR with bisection fallback
- [x] Period-end date usage (Excel parity)

### Remaining:
- [ ] Fund calc stub with fee calculation
- [ ] KPI calculation helpers (TVPI, DPI, IRR)
- [ ] CSV export endpoints (/dev/export-forecast, /dev/export-companies)
- [ ] Deterministic inputs hashing
- [ ] Routes wired to server
- [ ] CSV lineage fields (engine_version, inputs_hash, scenario_id)

---

## 🚀 Next Steps

1. **Create `client/src/lib/fund-calc.ts`** (stub)
2. **Create `server/routes/calculations.ts`** (CSV exports)
3. **Wire routes in `server/app.ts`**
4. **Test CSV exports** with mock data
5. **Commit and create PR**

**Estimated remaining time**: 4 hours (1 work session)

---

## 📁 Files Created

1. ✅ `shared/schemas/fund-model.ts` - Complete
2. ✅ `client/src/lib/decimal-utils.ts` - Complete
3. ✅ `client/src/lib/xirr.ts` - Complete
4. 📝 `client/src/lib/fund-calc.ts` - To create
5. 📝 `server/routes/calculations.ts` - To create

---

**Status**: Ready to complete remaining 40% in next session (4 hours estimated).
