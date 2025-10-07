# J-Curve Forecasting Calibration Guide

## Overview

This guide explains how to configure the J-curve forecasting engine for accurate fund performance projections. The engine uses Gompertz/logistic curve fitting to generate mathematically credible forecasts based on fund characteristics.

---

## Key Configuration Parameters

### 1. `finalDistributionCoefficient` (Default: 0.7)

**What it controls:** The percentage of total value distributed by fund end.

**Formula:** `Final DPI = Target TVPI × finalDistributionCoefficient`

**Recommended values by fund type:**

| Fund Type | Coefficient | Rationale |
|-----------|-------------|-----------|
| **Traditional VC** | 0.60 - 0.70 | Moderate exit pace, some residual NAV |
| **Growth Equity** | 0.70 - 0.80 | Faster liquidity, IPO-driven |
| **Buyout** | 0.80 - 0.90 | Aggressive exit timeline, full liquidation |
| **Early Stage** | 0.50 - 0.60 | Long hold periods, patient capital |
| **Impact/Deep Tech** | 0.40 - 0.50 | Extended timelines, delayed exits |

**Example:**
```typescript
const config: JCurveConfig = {
  fundSize: new Decimal(100_000_000),
  targetTVPI: 2.5,
  finalDistributionCoefficient: 0.7, // 70% distributed
  // ...
};

// Result: Final DPI ~1.75x, Final RVPI ~0.75x
```

**Warning:** Setting this too high (> 0.95) assumes near-complete liquidation, which may be unrealistic for most VC funds.

---

### 2. `navCalculationMode` (Options: `'standard'` | `'fee-adjusted'`)

**What it controls:** How Net Asset Value (NAV) is calculated.

#### Standard Mode (Default)
- **NAV = FMV** (Fair Market Value)
- Use when: Fee impact is negligible or fees are tracked separately
- Best for: Quick modeling, early-stage funds

#### Fee-Adjusted Mode
- **NAV = FMV - Accrued Fees + Recyclable Fees**
- Use when: Accurate fee modeling is required
- Best for: Late-stage funds, investor reporting, audit compliance

**Configuration:**
```typescript
// Standard mode
const standardConfig: JCurveConfig = {
  navCalculationMode: 'standard',
  // No feeProfile needed
};

// Fee-adjusted mode
const feeAdjustedConfig: JCurveConfig = {
  navCalculationMode: 'fee-adjusted',
  feeProfile: myFeeProfile, // Required!
  feeBasisTimeline: computeFeeBasisTimeline({...})
};
```

**Warning:** Fee-adjusted mode requires a valid `FeeProfile` and `feeBasisTimeline`. Omitting these will produce inaccurate NAV.

---

### 3. Investment Period & Fund Life

**Investment Period:** Years during which capital is deployed (typically 3-5 years)

**Fund Life:** Total fund duration (typically 10-12 years)

**Recommended values:**

| Fund Stage | Investment Period | Fund Life |
|------------|-------------------|-----------|
| Seed/Early | 3-4 years | 12-15 years |
| Series A/B | 4-5 years | 10-12 years |
| Growth | 3-4 years | 8-10 years |
| Buyout | 2-3 years | 7-10 years |

**Configuration:**
```typescript
const config: JCurveConfig = {
  investmentPeriodQuarters: 20, // 5 years
  fundLifeQuarters: 40,         // 10 years
};
```

---

## Sensitivity Bands Interpretation

The J-curve engine produces three paths:
- **Main Path:** Base case scenario (target TVPI)
- **Upper Band:** Optimistic scenario (+20% TVPI variance)
- **Lower Band:** Conservative scenario (-20% TVPI variance)

### Important: These are NOT confidence intervals!

❌ **Wrong:** "There's a 95% chance TVPI will be between upper and lower bands."

✅ **Correct:** "Upper/lower bands represent plausible optimistic/conservative scenarios based on ±20% variance."

**Usage guidelines:**
- **Upper Band:** Use for best-case planning (e.g., reserve allocation stress tests)
- **Main Path:** Use for base-case forecasting (e.g., investor reports)
- **Lower Band:** Use for downside analysis (e.g., liquidity planning)

---

## Calibration with Actual Data

When a fund has performance history, calibrate forecasts using `actualTVPIPoints`.

### Example: Fund with 3 years of history

```typescript
const config: JCurveConfig = {
  fundSize: new Decimal(100_000_000),
  targetTVPI: 2.5,
  investmentPeriodQuarters: 20,
  fundLifeQuarters: 40,
  actualTVPIPoints: [
    { quarter: 4,  tvpi: 0.85 }, // Year 1
    { quarter: 8,  tvpi: 0.92 }, // Year 2
    { quarter: 12, tvpi: 1.05 }  // Year 3
  ]
};
```

**How calibration works:**
1. Levenberg-Marquardt algorithm fits Gompertz curve to actual points
2. Curve is extended to `fundLifeQuarters` using fitted parameters
3. If fitting fails (insufficient data), falls back to piecewise linear

**Best practices:**
- Provide at least 3 actual points for reliable fitting
- Actual points should span at least 2 years
- Points should be quarterly snapshots (not cumulative sums)

---

## Common Calibration Scenarios

### Scenario 1: Construction Forecast (No Investments)

**Use case:** Fund just raised, no portfolio companies yet

**Configuration:**
```typescript
const config: JCurveConfig = {
  fundSize: new Decimal(100_000_000),
  targetTVPI: 2.5,
  investmentPeriodQuarters: 20,
  fundLifeQuarters: 40,
  actualTVPIPoints: [], // No actuals
  navCalculationMode: 'standard',
  finalDistributionCoefficient: 0.7
};
```

**Result:** Pure mathematical J-curve based on target TVPI.

---

### Scenario 2: Current Forecast (Mature Fund)

**Use case:** 5-year-old fund with 12 investments, strong performance

**Configuration:**
```typescript
const config: JCurveConfig = {
  fundSize: new Decimal(100_000_000),
  targetTVPI: 2.5,
  investmentPeriodQuarters: 20,
  fundLifeQuarters: 40,
  actualTVPIPoints: [
    { quarter: 4,  tvpi: 0.85 },
    { quarter: 8,  tvpi: 0.95 },
    { quarter: 12, tvpi: 1.10 },
    { quarter: 16, tvpi: 1.35 },
    { quarter: 20, tvpi: 1.60 }  // Current quarter
  ],
  navCalculationMode: 'fee-adjusted',
  finalDistributionCoefficient: 0.75, // Adjust based on exit pipeline
  feeProfile: myFeeProfile,
  feeBasisTimeline: myFeeBasisTimeline
};
```

**Result:** Calibrated forecast incorporating actual performance trajectory.

---

### Scenario 3: Stressed Scenario (Downside)

**Use case:** Reserve allocation planning under adverse conditions

**Configuration:**
```typescript
const config: JCurveConfig = {
  fundSize: new Decimal(100_000_000),
  targetTVPI: 1.5, // Reduced target (stress scenario)
  investmentPeriodQuarters: 20,
  fundLifeQuarters: 48, // Extended fund life
  actualTVPIPoints: [...], // Use actual data
  finalDistributionCoefficient: 0.5, // Delayed exits
  navCalculationMode: 'fee-adjusted'
};

// Use lowerBand from result for reserve calculations
const { lowerBand } = computeJCurvePath(config);
```

---

## Validation Checklist

Before deploying a J-curve forecast, validate:

- [ ] `fundSize` > 0
- [ ] `targetTVPI` > 1.0 (and realistic for fund stage)
- [ ] `investmentPeriodQuarters` ≤ `fundLifeQuarters`
- [ ] `finalDistributionCoefficient` ∈ [0.4, 0.95]
- [ ] If `navCalculationMode = 'fee-adjusted'`, `feeProfile` provided
- [ ] `actualTVPIPoints` are chronologically ordered
- [ ] Actual points span at least 2 years (if calibrating)

---

## Troubleshooting

### Issue: "J-curve produces unrealistic TVPI trajectory"

**Diagnosis:** Check `finalDistributionCoefficient` and `targetTVPI`

**Fix:**
- Lower `finalDistributionCoefficient` if final DPI is too high
- Adjust `targetTVPI` to match fund stage (seed: 3-5x, growth: 2-3x)

---

### Issue: "Calibration fails with error"

**Diagnosis:** Insufficient actual data points or curve fitting failure

**Fix:**
- Ensure at least 3 `actualTVPIPoints` spanning 2+ years
- Check for data quality issues (negative TVPI, out-of-order quarters)
- Engine will fall back to piecewise linear if fitting fails

---

### Issue: "Fee-adjusted NAV is negative"

**Diagnosis:** Fees exceed FMV in early periods

**Fix:**
- Verify `feeProfile` is realistic (2% management fee is typical)
- Check `feeBasisTimeline` for correct basis amounts
- Use `navCalculationMode: 'standard'` if fees dominate early NAV

---

## Advanced: Custom Curve Shapes

For non-standard funds (e.g., secondary funds, continuation vehicles), you may need custom curve parameters. Contact engineering for assistance with:

- Modified Gompertz curve parameters (a, b, c)
- Logistic curve variants for symmetric profiles
- Hybrid piecewise-curve models

---

## References

- **J-Curve Engine:** `shared/lib/jcurve.ts`
- **Fee Calculation:** `shared/lib/fund-math.ts`
- **Curve Shapes:** `shared/lib/jcurve-shapes.ts`
- **Test Cases:** `tests/shared/jcurve-golden.spec.ts`

---

**Last Updated:** 2025-01-20
**Version:** 1.0 (Phase 2)
