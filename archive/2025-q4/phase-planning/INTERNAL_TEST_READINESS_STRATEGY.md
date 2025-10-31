# Internal Test Readiness Strategy

**Updog Fund Modeling Platform** **Date:** 2025-10-05 **Status:** Planning Phase
**Target:** Internal Dogfood Release

---

## Executive Summary

This document outlines a **pragmatic, evidence-based strategy** to move Updog
from "demo-ready" to **internal-test ready**. Unlike the external proposal, this
plan is **grounded in your actual codebase** and leverages the substantial
infrastructure you've already built.

### Key Findings from Codebase Audit

✅ **Already Implemented** (80% of proposed "new" work):

- Comprehensive schema system (`shared/schemas/`) with Decimal.js, branded
  types, and validation
- Fee calculation engine with 6 bases, step-downs, and recycling support
- Waterfall policies (European & American) with complete implementations
- Excel parity validation framework (`excel-parity.ts`,
  `excel-parity-validator.ts`)
- Deterministic fund calculation engine (`fund-calc.ts`)
- IRR/XIRR calculation utilities with numerical stability
- Robust CI/CD with perf gates, bundle checks, and smart test selection
- Property-based testing infrastructure (fast-check)

⚠️ **Gaps Requiring Work** (20% actual effort):

- Construction vs Current mode toggle
- Actuals overlay system
- End-to-end wizard testing (Issue #46)
- Input validation guardrails in UI
- Golden dataset library for Excel parity
- Consolidated validation dashboard

---

## Phase 1: Foundation Audit & Gap Analysis (Week 1)

### Objective

Validate existing capabilities and identify **precise gaps** between current
state and internal-test requirements.

### Tasks

#### 1.1 Schema System Validation (2 hours)

**Status:** ✅ COMPLETE (via audit)

**Findings:**

- `ExtendedFundModelInputs` exists with complete policy support
- `FeeProfile` supports 6 bases: committed_capital, called_capital_cumulative,
  called_capital_net_of_returns, invested_capital, fair_market_value,
  unrealized_cost
- `WaterfallPolicy` supports European (fund-level) and American (deal-by-deal)
- `StageProfile` with deterministic cohort progression
- `CapitalCallPolicy` with 4 modes: upfront, periodic, as_needed, custom
- All schemas use Decimal.js (30-digit precision) and branded types

**Action:** ✅ No new schema work needed

#### 1.2 Fee Calculation Audit (4 hours)

**Files to Review:**

- `shared/schemas/fee-profile.ts` (lines 154-244: complete implementation)
- `client/src/lib/fees.ts` (existing frontend utilities)
- `client/src/lib/fund-calc.ts` (deterministic engine)

**Test:**

```bash
# Verify fee calculation with all 6 bases
npm run test:unit -- --grep "fee calculation"

# Check for missing basis implementations
grep -r "calculateManagementFees" shared/ client/ server/
```

**Expected Output:**

- ✅ All 6 bases implemented in `getBasisAmount()` (lines 202-217)
- ✅ Fee recycling logic present (lines 222-244)
- ⚠️ Verify server-side fee calculation exists

**Gap Assessment:**

- If server lacks fee calculations → **PR-1A: Server Fee Implementation**
- If only committed_capital tested → **PR-1B: Multi-Basis Test Suite**

#### 1.3 Reserves v1.1 Contract Check (3 hours)

**Files:**

- `client/src/lib/reserves-v11.ts`
- `client/src/core/reserves/ReserveEngine.ts`
- `.github/workflows/ci-reserves-v11.yml`

**Test:**

```bash
# Run reserves CI locally
npm run test:unit -- tests/unit/reserves-v11.test.ts --reporter=verbose

# Check bundle for export libs
npm run build
grep -q "xlsx\|papaparse" dist/assets/index-*.js && echo "❌ FAIL" || echo "✅ PASS"

# Perf budget test
node tests/perf/reserves-budget.mjs
```

**Expected Gaps:**

- CI enforces 100ms budget ✅
- Bundle check blocks export libs ✅
- Need to verify: Does current output match
  `{ companyId, plannedReservesCents, roundsFunded, expectedNextDollarMOIC_bps }`
  contract?

**Action:**

```typescript
// Audit current ReserveEngine output shape
// File: client/src/core/reserves/ReserveEngine.ts (lines 20-50)
// Compare against proposal's v1.1 contract
```

#### 1.4 Excel Parity Infrastructure (2 hours)

**Files Found:**

- `client/src/lib/excel-parity.ts` (framework exists!)
- `client/src/lib/excel-parity-validator.ts`
- `scripts/generate-golden-fixture.ts`

**Test:**

```bash
# Check for golden datasets
find tests/ -name "*golden*" -o -name "*fixture*"

# Review parity validator
cat client/src/lib/excel-parity-validator.ts
```

**Expected State:**

- ✅ Parity framework exists (lines 1-50)
- ✅ Tolerance system defined (DEFAULT_TOLERANCE = 0.01, CRITICAL_TOLERANCE =
  0.005)
- ✅ Critical metrics list exists (NAV, DPI, TVPI, MOIC, IRR)
- ⚠️ Likely missing: Golden datasets and Excel oracle files

**Gap:** **PR-2: Golden Dataset Library**

---

## Phase 2: Core Enhancements (Week 2-3)

### PR-A: Construction vs Current Mode Toggle

**Priority:** HIGH **Effort:** 8-12 hours **Dependencies:** None

#### Scope

Implement mode toggle that switches between:

- **Construction**: Forecasts from t=0 with inputs only
- **Current**: Actuals-to-date + re-forecast remainder

#### Implementation Plan

**1. Schema Extension (2 hours)**

```typescript
// File: shared/schemas/fund-model.ts (extend existing)

export const ActualEventSchema = z.object({
  date: z.string().datetime(),
  type: z.enum([
    'capital_call',
    'distribution',
    'fee_payment',
    'investment',
    'exit',
  ]),
  amountCents: z.number().int(),
  companyId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const FundActualsSchema = z.object({
  asOfDate: z.string().datetime(),
  events: z.array(ActualEventSchema),
  navCents: z.number().int(),
  committedCapitalCents: z.number().int(),
});

export const FundModelMode = z.enum(['construction', 'current']);

// Extend ExtendedFundModelInputs
export const ExtendedFundModelInputsSchema = BaseFundModelInputsSchema.extend({
  mode: FundModelMode.default('construction'),
  actuals: FundActualsSchema.optional(),
}).refine(
  (data) => data.mode === 'construction' || data.actuals !== undefined,
  { message: 'Current mode requires actuals data', path: ['actuals'] }
);
```

**2. Actuals Overlay Engine (4 hours)**

```typescript
// File: client/src/lib/actuals-overlay.ts (NEW)

import {
  FundActuals,
  FundModelInputs,
  PeriodResult,
} from '@shared/schemas/fund-model';
import { toDecimal } from './decimal-utils';

/**
 * Stitch actuals into fund model timeline
 * Returns hybrid timeline: actuals until asOfDate, then forecasted
 */
export function overlayActuals(
  inputs: FundModelInputs,
  actuals: FundActuals,
  forecastPeriods: PeriodResult[]
): PeriodResult[] {
  const asOfDate = new Date(actuals.asOfDate);
  const stitchedPeriods: PeriodResult[] = [];

  // STEP 1: Convert actuals to period results
  const actualPeriods = convertActualsToPeriods(
    actuals,
    inputs.periodLengthMonths
  );

  // STEP 2: Find cutoff period
  const cutoffPeriod = actualPeriods.length;

  // STEP 3: Stitch actuals + forecast
  stitchedPeriods.push(...actualPeriods);

  // STEP 4: Adjust forecast periods to start after actuals
  const adjustedForecast = forecastPeriods
    .slice(cutoffPeriod)
    .map((period, idx) => ({
      ...period,
      periodIndex: cutoffPeriod + idx,
      // Adjust starting NAV from last actual
      navStart:
        stitchedPeriods[stitchedPeriods.length - 1]?.navEnd ?? period.navStart,
    }));

  stitchedPeriods.push(...adjustedForecast);

  return stitchedPeriods;
}

function convertActualsToPeriods(
  actuals: FundActuals,
  periodLengthMonths: number
): PeriodResult[] {
  // Group events by period
  // Calculate period-level aggregates
  // Return PeriodResult[] matching schema
  // Implementation: ~100 lines
}
```

**3. UI Toggle Component (2 hours)**

```typescript
// File: client/src/components/wizard/ModeToggle.tsx (NEW)

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import { Tooltip } from '@/components/ui/tooltip';

export function ModeToggle({
  mode,
  onModeChange,
  hasActuals
}: {
  mode: 'construction' | 'current';
  onModeChange: (mode: 'construction' | 'current') => void;
  hasActuals: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-4 border rounded-lg">
      <Switch
        checked={mode === 'current'}
        onCheckedChange={(checked) => onModeChange(checked ? 'current' : 'construction')}
        disabled={!hasActuals}
      />
      <Label>
        {mode === 'construction' ? 'Construction View' : 'Current View'}
      </Label>
      <Tooltip content={
        mode === 'construction'
          ? 'Forecast from fund inception with initial assumptions'
          : 'Actuals to date + re-forecast remainder'
      }>
        <InfoCircledIcon className="w-4 h-4 text-muted-foreground" />
      </Tooltip>
      {!hasActuals && (
        <span className="text-sm text-muted-foreground">
          (No actuals loaded)
        </span>
      )}
    </div>
  );
}
```

**4. Integration with fund-calc.ts (2 hours)**

```typescript
// File: client/src/lib/fund-calc.ts (modify existing)

export function runFundModel(inputs: FundModelInputs): FundModelOutputs {
  // NEW: Check mode
  if (inputs.mode === 'current' && inputs.actuals) {
    return runCurrentMode(inputs, inputs.actuals);
  }

  // Existing construction mode logic
  const companies = deployCompanies(inputs);
  const periodResults = simulatePeriods(inputs, companies);
  const kpis = calculateKPIs(periodResults);

  return { periodResults, companyLedger: companies, kpis };
}

function runCurrentMode(
  inputs: FundModelInputs,
  actuals: FundActuals
): FundModelOutputs {
  // Run forecast (construction mode)
  const forecastResults = runFundModel({ ...inputs, mode: 'construction' });

  // Overlay actuals
  const hybridPeriods = overlayActuals(
    inputs,
    actuals,
    forecastResults.periodResults
  );

  // Recalculate KPIs from hybrid timeline
  const kpis = calculateKPIs(hybridPeriods);

  return {
    periodResults: hybridPeriods,
    companyLedger: forecastResults.companyLedger, // Adjust if needed
    kpis,
  };
}
```

**5. Tests (2 hours)**

```typescript
// File: tests/unit/actuals-overlay.test.ts (NEW)

import { describe, it, expect } from 'vitest';
import { overlayActuals } from '@/lib/actuals-overlay';
import { runFundModel } from '@/lib/fund-calc';

describe('Actuals Overlay', () => {
  it('should stitch actuals with forecast', () => {
    const inputs = createTestInputs({ mode: 'current' });
    const actuals = createTestActuals({
      asOfDate: '2023-06-30',
      events: [
        /* 2 years of actuals */
      ],
    });

    const result = runFundModel({ ...inputs, actuals });

    // First 8 periods (2 years quarterly) = actuals
    expect(result.periodResults.slice(0, 8).every((p) => p.isActual)).toBe(
      true
    );

    // Remaining periods = forecast
    expect(result.periodResults.slice(8).every((p) => !p.isActual)).toBe(true);
  });

  it('should maintain cashflow invariants across stitch point', () => {
    // Verify NAV continuity, no double-counting, etc.
  });
});
```

**Acceptance Criteria:**

- [ ] Mode toggle switches between construction and current
- [ ] Current mode requires actuals (validation error if missing)
- [ ] Actuals overlay produces continuous timeline (no gaps/overlaps)
- [ ] KPIs recalculated correctly from hybrid periods
- [ ] Property test: `TVPI ≥ DPI` holds in both modes
- [ ] UI shows mode indicator on dashboard

---

### PR-B: Golden Dataset Library & Excel Parity

**Priority:** HIGH **Effort:** 12-16 hours **Dependencies:** PR-A (for Current
mode validation)

#### Scope

Create validated golden datasets with Excel oracle files for parity testing.

#### Implementation Plan

**1. Golden Dataset Structure (2 hours)**

```
tests/golden/
├── README.md                    # Dataset documentation
├── early-stage-fund/
│   ├── inputs.json              # Fund model inputs
│   ├── oracle.xlsx              # Excel reference model
│   ├── expected-periods.csv     # Period results from Excel
│   ├── expected-kpis.json       # KPIs from Excel
│   └── tolerance-config.json    # Per-metric tolerances
├── micro-vc-fund/
│   └── ...
└── growth-fund/
    └── ...
```

**2. Excel Oracle Template (4 hours)** Create Excel template with:

- Input parameters sheet
- Period-by-period calculations (matching fund-calc.ts logic)
- KPI summary sheet
- Export macros for CSV generation

**Template Sections:**

- **Inputs**: Committed capital, fee tiers, stage allocations, etc.
- **Capital Calls**: Period-by-period call schedule
- **Deployments**: Company deployment timeline
- **Fees**: Management fee calculations (all 6 bases)
- **Exits**: Company exit modeling with waterfalls
- **Distributions**: LP/GP distribution calculations
- **NAV**: Period-end NAV roll-forward
- **KPIs**: TVPI, DPI, IRR, MOIC

**3. Golden Dataset Generator (4 hours)**

```typescript
// File: scripts/generate-golden-dataset.ts (extend existing)

import * as fs from 'fs';
import * as path from 'path';
import { runFundModel } from '../client/src/lib/fund-calc';
import { FundModelInputs } from '@shared/schemas/fund-model';

interface GoldenDatasetConfig {
  name: string;
  description: string;
  inputs: FundModelInputs;
  oraclePath: string; // Path to Excel file
  tolerances?: Record<string, number>;
}

async function generateGoldenDataset(config: GoldenDatasetConfig) {
  const outputDir = path.join('tests/golden', config.name);
  fs.mkdirSync(outputDir, { recursive: true });

  // 1. Save inputs
  fs.writeFileSync(
    path.join(outputDir, 'inputs.json'),
    JSON.stringify(config.inputs, null, 2)
  );

  // 2. Run web app calculation
  const webResults = runFundModel(config.inputs);

  // 3. Export period results to CSV (for Excel comparison)
  const periodsCsv = convertPeriodsToCsv(webResults.periodResults);
  fs.writeFileSync(path.join(outputDir, 'webapp-periods.csv'), periodsCsv);

  // 4. Save KPIs
  fs.writeFileSync(
    path.join(outputDir, 'webapp-kpis.json'),
    JSON.stringify(webResults.kpis, null, 2)
  );

  // 5. Copy Excel oracle
  fs.copyFileSync(config.oraclePath, path.join(outputDir, 'oracle.xlsx'));

  console.log(`✅ Generated golden dataset: ${config.name}`);
}

// Golden dataset definitions
const datasets: GoldenDatasetConfig[] = [
  {
    name: 'early-stage-fund',
    description: '$50M early-stage fund, 2% fees, 20% carry',
    inputs: {
      /* ... */
    },
    oraclePath: 'excel-oracles/early-stage-fund.xlsx',
  },
  // Add 2-3 more datasets
];

// Generate all datasets
for (const config of datasets) {
  await generateGoldenDataset(config);
}
```

**4. Parity Test Suite (4 hours)**

```typescript
// File: tests/integration/excel-parity.test.ts (NEW)

import { describe, it, expect } from 'vitest';
import { runFundModel } from '@/lib/fund-calc';
import { validateParity } from '@/lib/excel-parity-validator';
import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

const GOLDEN_DATASETS = ['early-stage-fund', 'micro-vc-fund', 'growth-fund'];

describe('Excel Parity Tests', () => {
  for (const dataset of GOLDEN_DATASETS) {
    describe(dataset, () => {
      const datasetDir = path.join('tests/golden', dataset);

      it('should match Excel KPIs within tolerance', () => {
        // Load inputs
        const inputs = JSON.parse(
          fs.readFileSync(path.join(datasetDir, 'inputs.json'), 'utf-8')
        );

        // Load expected KPIs from Excel
        const expectedKpis = JSON.parse(
          fs.readFileSync(path.join(datasetDir, 'expected-kpis.json'), 'utf-8')
        );

        // Run web app
        const webResults = runFundModel(inputs);

        // Compare KPIs
        const comparisons = [
          {
            metric: 'TVPI',
            excel: expectedKpis.tvpi,
            webapp: webResults.kpis.tvpi,
          },
          {
            metric: 'DPI',
            excel: expectedKpis.dpi,
            webapp: webResults.kpis.dpi,
          },
          {
            metric: 'IRR',
            excel: expectedKpis.irrAnnualized,
            webapp: webResults.kpis.irrAnnualized,
          },
        ];

        for (const { metric, excel, webapp } of comparisons) {
          const drift = Math.abs(excel - webapp) / excel;
          const tolerance = metric === 'IRR' ? 0.01 : 0.005; // 1% for IRR, 0.5% for ratios

          expect(drift).toBeLessThan(
            tolerance,
            `${metric} drift ${(drift * 100).toFixed(2)}% exceeds tolerance ${(tolerance * 100).toFixed(2)}%`
          );
        }
      });

      it('should match Excel period results', () => {
        // Load period CSV from Excel
        const excelPeriodsCsv = fs.readFileSync(
          path.join(datasetDir, 'expected-periods.csv'),
          'utf-8'
        );
        const excelPeriods = Papa.parse(excelPeriodsCsv, { header: true }).data;

        // Run web app
        const inputs = JSON.parse(
          fs.readFileSync(path.join(datasetDir, 'inputs.json'), 'utf-8')
        );
        const webResults = runFundModel(inputs);

        // Compare period-by-period
        expect(webResults.periodResults.length).toBe(excelPeriods.length);

        webResults.periodResults.forEach((webPeriod, idx) => {
          const excelPeriod = excelPeriods[idx];

          // Compare key fields
          expect(webPeriod.capitalCalled).toBeCloseTo(
            Number(excelPeriod.capitalCalled),
            2
          );
          expect(webPeriod.distributions).toBeCloseTo(
            Number(excelPeriod.distributions),
            2
          );
          expect(webPeriod.managementFees).toBeCloseTo(
            Number(excelPeriod.managementFees),
            2
          );
          expect(webPeriod.navEnd).toBeCloseTo(Number(excelPeriod.navEnd), 2);
        });
      });
    });
  }
});
```

**5. Validation Dashboard Component (2 hours)**

```typescript
// File: client/src/components/validation/ParityDashboard.tsx (NEW)

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CheckCircledIcon, CrossCircledIcon } from '@radix-ui/react-icons';

interface ParityResult {
  metric: string;
  excelValue: number;
  webappValue: number;
  drift: number;
  tolerance: number;
  passed: boolean;
}

export function ParityDashboard({ results }: { results: ParityResult[] }) {
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.length - passedCount;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Excel Parity Validation</CardTitle>
        <div className="flex gap-4 text-sm">
          <span className="text-green-600">✓ {passedCount} passed</span>
          <span className="text-red-600">✗ {failedCount} failed</span>
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full">
          <thead>
            <tr className="text-left border-b">
              <th>Metric</th>
              <th>Excel</th>
              <th>Web App</th>
              <th>Drift</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map(r => (
              <tr key={r.metric} className="border-b">
                <td className="font-mono">{r.metric}</td>
                <td>{r.excelValue.toFixed(4)}</td>
                <td>{r.webappValue.toFixed(4)}</td>
                <td className={r.drift > r.tolerance ? 'text-red-600' : 'text-green-600'}>
                  {(r.drift * 100).toFixed(2)}%
                </td>
                <td>
                  {r.passed ? (
                    <CheckCircledIcon className="text-green-600" />
                  ) : (
                    <CrossCircledIcon className="text-red-600" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
```

**Acceptance Criteria:**

- [ ] 3 golden datasets created (early-stage, micro-VC, growth)
- [ ] Excel oracle files produce repeatable outputs
- [ ] Parity tests pass for all datasets
- [ ] TVPI/DPI within 0.5%, IRR within 1%
- [ ] Period-by-period validation passes
- [ ] Parity dashboard shows real-time validation
- [ ] CSV export/import workflow documented

---

### PR-C: Wizard E2E & Validation Guardrails

**Priority:** MEDIUM **Effort:** 6-8 hours **Dependencies:** Issue #46

#### Scope

1. Add `data-testid` to wizard steps 3/4
2. Enable e2e wizard test
3. Implement input validation guardrails

#### Implementation Plan

**1. Add data-testid to Wizard (1 hour)**

```typescript
// File: client/src/components/wizard/Steps.tsx (modify existing)

export function Step3Allocations() {
  return (
    <div data-testid="wizard-step-3-allocations">
      {/* existing content */}
    </div>
  );
}

export function Step4Review() {
  return (
    <div data-testid="wizard-step-4-review">
      {/* existing content */}
    </div>
  );
}
```

**2. Enable Wizard E2E Test (2 hours)**

```typescript
// File: tests/e2e/wizard.spec.ts (modify existing blocked test)

import { test, expect } from '@playwright/test';

test.describe('Fund Setup Wizard', () => {
  test('should complete full wizard flow', async ({ page }) => {
    await page.goto('/wizard');

    // Step 1: Fund basics
    await page.getByTestId('wizard-step-1-basics').waitFor();
    await page.fill('[name="fundName"]', 'Test Fund I');
    await page.fill('[name="committedCapital"]', '50000000');
    await page.click('[data-testid="wizard-next"]');

    // Step 2: Fee structure
    await page.getByTestId('wizard-step-2-fees').waitFor();
    await page.selectOption('[name="feeBasis"]', 'committed_capital');
    await page.fill('[name="annualFeeRate"]', '2');
    await page.click('[data-testid="wizard-next"]');

    // Step 3: Allocations (NEWLY UNBLOCKED)
    await page.getByTestId('wizard-step-3-allocations').waitFor();
    await page.fill('[name="seedAllocation"]', '40');
    await page.fill('[name="seriesAAllocation"]', '35');
    await page.fill('[name="reservesAllocation"]', '25');
    await page.click('[data-testid="wizard-next"]');

    // Step 4: Review (NEWLY UNBLOCKED)
    await page.getByTestId('wizard-step-4-review').waitFor();

    // Verify summary
    await expect(page.getByText('Test Fund I')).toBeVisible();
    await expect(page.getByText('$50,000,000')).toBeVisible();

    // Submit
    await page.click('[data-testid="wizard-submit"]');

    // Verify redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
```

**3. Input Validation Guardrails (3 hours)**

```typescript
// File: client/src/components/wizard/validation.ts (NEW)

import { z } from 'zod';
import Decimal from 'decimal.js';

export const Step3AllocationsSchema = z
  .object({
    seedAllocation: z.number().min(0).max(100),
    seriesAAllocation: z.number().min(0).max(100),
    reservesAllocation: z.number().min(0).max(100),
  })
  .refine(
    (data) => {
      const sum =
        data.seedAllocation + data.seriesAAllocation + data.reservesAllocation;
      return Math.abs(sum - 100) < 0.01; // Allow 0.01% rounding error
    },
    {
      message: 'Allocations must sum to exactly 100%',
      path: ['seedAllocation'], // Show error on first field
    }
  );

export function useAllocationValidation() {
  const [allocations, setAllocations] = useState({
    seed: 0,
    seriesA: 0,
    reserves: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const sum = allocations.seed + allocations.seriesA + allocations.reserves;
  const isValid = Math.abs(sum - 100) < 0.01;

  useEffect(() => {
    if (!isValid && sum > 0) {
      setError(`Allocations sum to ${sum.toFixed(1)}%. Must equal 100%.`);
    } else {
      setError(null);
    }
  }, [sum, isValid]);

  return { allocations, setAllocations, error, isValid };
}
```

**4. Validation UI Feedback (2 hours)**

```typescript
// File: client/src/components/wizard/Step3Allocations.tsx (modify)

import { useAllocationValidation } from './validation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function Step3Allocations() {
  const { allocations, setAllocations, error, isValid } = useAllocationValidation();

  return (
    <div data-testid="wizard-step-3-allocations">
      <h2>Stage Allocations</h2>

      <div className="space-y-4">
        <InputField
          label="Seed (%)"
          value={allocations.seed}
          onChange={(val) => setAllocations({ ...allocations, seed: val })}
        />
        <InputField
          label="Series A (%)"
          value={allocations.seriesA}
          onChange={(val) => setAllocations({ ...allocations, seriesA: val })}
        />
        <InputField
          label="Reserves (%)"
          value={allocations.reserves}
          onChange={(val) => setAllocations({ ...allocations, reserves: val })}
        />
      </div>

      {/* Live validation feedback */}
      <div className="mt-4 p-3 bg-gray-100 rounded">
        <div className="flex justify-between">
          <span>Total:</span>
          <span className={isValid ? 'text-green-600' : 'text-red-600'}>
            {(allocations.seed + allocations.seriesA + allocations.reserves).toFixed(1)}%
          </span>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        data-testid="wizard-next"
        disabled={!isValid}
        className="mt-6"
      >
        Next Step
      </Button>
    </div>
  );
}
```

**Acceptance Criteria:**

- [ ] `data-testid` added to wizard steps 3 & 4
- [ ] Wizard e2e test passes (Issue #46 closed)
- [ ] Allocation sum validation prevents invalid submissions
- [ ] Real-time feedback shows running total
- [ ] Next button disabled until valid
- [ ] Error messages are helpful and specific
- [ ] Numeric range validation (0-100%) enforced

---

## Phase 3: Hardening & Runbook (Week 4)

### PR-D: Validation Dashboard & Runbook

**Priority:** MEDIUM **Effort:** 4-6 hours

#### Scope

1. Global validation panel (Construction/Current mode, parity status)
2. Internal test runbook

#### Implementation Plan

**1. Global Validation Panel (2 hours)**

```typescript
// File: client/src/components/dashboard/ValidationPanel.tsx (NEW)

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';

export function ValidationPanel() {
  const { data: parityResults } = useQuery({
    queryKey: ['parity-validation'],
    queryFn: async () => {
      const response = await fetch('/api/validation/parity');
      return response.json();
    }
  });

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-3">Validation Status</h3>

      <div className="space-y-2">
        {/* Mode indicator */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Mode:</span>
          <Badge variant="outline">Construction</Badge>
        </div>

        {/* Input hash (for reproducibility) */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Input Hash:</span>
          <code className="text-xs bg-gray-100 px-2 py-1 rounded">
            {parityResults?.inputsHash?.slice(0, 8)}
          </code>
        </div>

        {/* Parity status */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Excel Parity:</span>
          <Badge variant={parityResults?.passed ? 'success' : 'destructive'}>
            {parityResults?.passed ? 'Within Tolerance' : 'Failed'}
          </Badge>
        </div>

        {/* Last validation */}
        <div className="text-xs text-gray-500">
          Last validated: {new Date().toLocaleString()}
        </div>
      </div>
    </Card>
  );
}
```

**2. Internal Test Runbook (2 hours)**

```markdown
# Internal Test Protocol

**Updog Fund Modeling Platform** **Version:** 1.0 **Audience:** Internal QA Team

## Prerequisites

- Access to staging environment: https://updog-staging.vercel.app
- Excel oracle files (located in `tests/golden/`)
- Test credentials (see 1Password vault)

## Test Scenarios

### Scenario 1: Golden Case A (Early-Stage Fund)

**Objective:** Verify Construction mode matches Excel oracle

1. **Setup**
   - Navigate to `/wizard`
   - Load inputs from `tests/golden/early-stage-fund/inputs.json`

2. **Execute**
   - Complete wizard with loaded inputs
   - Ensure mode = "Construction"
   - Click "Run Forecast"

3. **Export**
   - Click "Export Results" → "CSV"
   - Save as `webapp-output.csv`

4. **Validate**
   - Open Excel oracle: `tests/golden/early-stage-fund/oracle.xlsx`
   - Import `webapp-output.csv` into "Validation" sheet
   - Check "Parity Status" column
   - ✅ **PASS:** All metrics show "Within Tolerance"
   - ❌ **FAIL:** Any metric shows drift > tolerance

5. **Expected Results**
   - TVPI: 2.54 ± 0.013 (0.5% tolerance)
   - DPI: 1.23 ± 0.006
   - IRR: 18.25% ± 0.18% (1% tolerance)

### Scenario 2: Construction → Current Mode Switch

**Objective:** Verify actuals overlay produces continuous timeline

1. **Load Actuals**
   - Use `tests/golden/early-stage-fund/actuals-2yr.json`
   - Upload via "Load Actuals" button

2. **Switch Mode**
   - Toggle from "Construction" to "Current"
   - Verify validation panel updates

3. **Verify Timeline**
   - Open "Period Details" view
   - Check periods 0-7 (2 years quarterly) show "Actual" badge
   - Check periods 8+ show "Forecast" badge
   - Verify NAV continuity at period 7/8 boundary

4. **Export & Validate**
   - Export Current mode results
   - Compare against `expected-current-mode.csv`

### Scenario 3: Wizard E2E

**Objective:** Complete wizard flow without errors

1. Navigate to `/wizard`
2. Complete all 4 steps with valid inputs
3. Verify no validation errors
4. Submit and confirm redirect to `/dashboard`
5. Verify fund appears in dashboard

### Scenario 4: Edge Cases

**Test invalid inputs are rejected:**

- Allocations summing to 99% → Error: "Must sum to 100%"
- Allocations summing to 101% → Error: "Must sum to 100%"
- Negative fee rate → Error: "Must be positive"
- Fund term > 20 years → Warning (not error)

## Pass/Fail Criteria

### PASS ✅

- All golden datasets pass parity (drift < tolerance)
- Construction/Current mode switch works
- Wizard e2e completes
- Edge case validation works

### FAIL ❌

- Any golden dataset exceeds tolerance
- Mode switch produces timeline gaps
- Wizard allows invalid submissions
- Unhandled errors in console

## Reporting

Document results in `INTERNAL_TEST_RESULTS.md`
```

**Acceptance Criteria:**

- [ ] Validation panel integrated into dashboard
- [ ] Panel shows mode, input hash, parity status
- [ ] Runbook documented with step-by-step instructions
- [ ] 4 test scenarios defined with pass/fail criteria
- [ ] Runbook includes screenshots

---

## Phase 4: Deployment Gate (Week 4)

### Pre-Deployment Checklist

**CI/CD Gates:**

- [ ] CI Unified passes (type check, lint, unit tests)
- [ ] CI Reserves v1.1 passes (100ms perf, bundle check)
- [ ] Golden dataset parity tests pass
- [ ] Wizard e2e test passes
- [ ] No quarantined test failures

**Manual Verification:**

- [ ] Internal team completes test protocol
- [ ] All 4 scenarios pass
- [ ] Edge cases handled gracefully
- [ ] No console errors

**Staging Deployment:**

```bash
# Deploy to Vercel staging
npm run deploy:staging

# Wait for deployment
# Run smoke tests
npm run test:smoke

# Monitor health
curl https://updog-staging.vercel.app/api/health
```

**Rollback Plan:** If critical issues found:

1. Revert to previous Vercel deployment
2. Document issues in GitHub
3. Fix in development
4. Re-test before next deployment

---

## Success Metrics

### Definition of "Internal-Test Ready"

1. **Functional Completeness**
   - ✅ Construction mode operational
   - ✅ Current mode with actuals overlay operational
   - ✅ Excel parity harness functional
   - ✅ Wizard e2e test enabled

2. **Quality Gates**
   - ✅ All golden datasets pass parity
   - ✅ CI gates green
   - ✅ No known P0/P1 bugs
   - ✅ Validation panel shows real-time status

3. **Documentation**
   - ✅ Internal test runbook complete
   - ✅ Known issues documented
   - ✅ Rollback procedure documented

---

## Timeline Summary

| Phase                          | Duration | Deliverables                                                  |
| ------------------------------ | -------- | ------------------------------------------------------------- |
| **Phase 1:** Foundation Audit  | Week 1   | Gap analysis, schema validation                               |
| **Phase 2:** Core Enhancements | Week 2-3 | PR-A (Mode toggle), PR-B (Golden datasets), PR-C (Wizard e2e) |
| **Phase 3:** Hardening         | Week 4   | PR-D (Validation panel, runbook)                              |
| **Phase 4:** Deployment        | Week 4   | Staging deployment, smoke tests                               |

**Total Duration:** 4 weeks **Total Effort:** ~40-50 hours (1-2 developers)

---

## Risk Assessment

### LOW RISK ✅

- Schema extensions (already solid foundation)
- Wizard e2e (straightforward testid addition)
- Validation panel (UI work)

### MEDIUM RISK ⚠️

- Actuals overlay (stitching logic complexity)
- Golden dataset creation (Excel oracle quality)

### HIGH RISK 🚨

- None identified (leveraging existing infrastructure)

### Mitigation Strategies

1. **Actuals Overlay:** Start with simple 2-year actual dataset, expand later
2. **Golden Datasets:** Begin with 1 dataset, validate thoroughly before
   creating 2 more
3. **Excel Oracle:** Use simple fund parameters to minimize formula errors

---

## Appendix: Key Differences from External Proposal

| External Proposal                         | Actual Codebase                               | Strategy                      |
| ----------------------------------------- | --------------------------------------------- | ----------------------------- |
| "Create packages/fund-engine"             | Already exists in client/src/lib/fund-calc.ts | ✅ Use existing               |
| "Implement fee basis (Committed Capital)" | All 6 bases in shared/schemas/fee-profile.ts  | ✅ Leverage existing          |
| "Add branded types (Cents, Bps)"          | Already in shared/schemas/unit-schemas.ts     | ✅ Use existing               |
| "Fastify server"                          | Actually Express                              | ⚠️ Use Express patterns       |
| "Rust WASM engine"                        | Not found in codebase                         | ❌ Ignore this assumption     |
| "Create DECISIONS.md"                     | File doesn't exist                            | 📝 Optional: Create if needed |

---

## Next Actions

1. **Review & Approve Strategy** (You + Team)
2. **Create GitHub Issues** for PR-A, PR-B, PR-C, PR-D
3. **Start Phase 1** audit tasks
4. **Schedule** internal test session (end of Week 4)

---

**Document Status:** Draft for Review **Last Updated:** 2025-10-05 **Author:**
Claude (AI Development Assistant) **Reviewers:** [Pending]
