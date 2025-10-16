# Excel Parity Testing Infrastructure

## Overview

The Excel Parity Testing Infrastructure validates deterministic financial calculations against Excel reference results. This ensures that our web application's calculations match industry-standard Excel models used by VCs and LPs.

## Purpose

- **Validate Accuracy**: Ensure TVPI, DPI, IRR, and NAV calculations match Excel outputs
- **Maintain Consistency**: Detect calculation drift across code changes
- **Build Confidence**: Provide reference data for external stakeholders
- **Support Debugging**: Generate comparable outputs for troubleshooting

## Directory Structure

```
excel-parity/
├── README.md                    # This file
├── baseline/                    # Standard VC fund scenario
│   ├── inputs.json             # Fund parameters
│   ├── expected.csv            # Excel reference results
│   └── metadata.json           # Tolerances and formulas
├── aggressive/                  # High-growth scenario
│   ├── inputs.json
│   ├── expected.csv
│   └── metadata.json
└── conservative/                # Low-risk scenario
    ├── inputs.json
    ├── expected.csv
    └── metadata.json
```

## Test Scenarios

### Baseline Scenario

**Profile**: Standard VC fund with balanced portfolio

**Characteristics**:
- Fund Size: $100M
- Fund Term: 10 years
- Management Fee: 2% annually
- Carry: 20%
- Stage Mix: 40% Seed, 40% Series A, 20% Series B
- Target TVPI: 2.5x
- Target IRR: 18.5%

**Use Case**: General validation, regression testing

### Aggressive Scenario

**Profile**: High-growth, early-stage focus

**Characteristics**:
- Fund Size: $100M
- Stage Mix: 70% Seed, 30% Series A
- Average Exit: Year 6
- Target TVPI: 3.8x
- Target IRR: 28.5%

**Use Case**: Validate high-return scenarios, unicorn outcomes

### Conservative Scenario

**Profile**: Late-stage focus, lower risk

**Characteristics**:
- Fund Size: $100M
- Stage Mix: 30% Series A, 40% Series B, 30% Series C
- Average Exit: Year 5
- Target TVPI: 1.85x
- Target IRR: 12.5%

**Use Case**: Validate steady-growth scenarios, safety-first strategies

## Excel Formulas Used

### TVPI (Total Value to Paid-In Capital)

```excel
=SUM(Distributions) + NAV) / SUM(Contributions)
```

**Formula**: `(Cumulative Distributions + Current NAV) / Cumulative Contributions`

**Example**:
- Contributions: $100M
- Distributions: $150M
- NAV: $100M
- TVPI = ($150M + $100M) / $100M = **2.5x**

### DPI (Distributions to Paid-In Capital)

```excel
=SUM(Distributions) / SUM(Contributions)
```

**Formula**: `Cumulative Distributions / Cumulative Contributions`

**Example**:
- Contributions: $100M
- Distributions: $150M
- DPI = $150M / $100M = **1.5x**

### IRR (Internal Rate of Return)

```excel
=XIRR(cash_flows, dates)
```

**Formula**: Newton-Raphson method solving for rate where NPV = 0

**Excel XIRR Parameters**:
- `cash_flows`: Array of contributions (negative) and distributions (positive)
- `dates`: Corresponding dates for each cash flow
- Returns: Annualized IRR as decimal (e.g., 0.185 = 18.5%)

**Example**:
```excel
Date           | Cash Flow
---------------|----------
2020-01-01     | -$100M    (Capital call)
2027-01-01     | +$250M    (Exit proceeds)
XIRR = 0.185 (18.5% annualized)
```

### NAV (Net Asset Value)

```excel
=SUM(Unrealized_Investments) + Cash_Balance - Management_Fees
```

**Formula**: `Remaining Investments + Uninvested Cash - Fees`

**Example**:
- Initial Capital: $100M
- Deployed Capital: $70M
- Unrealized Value: $105M (after appreciation)
- Cash Balance: $28M
- Management Fees Paid: $3M
- NAV = $105M + $28M = **$133M**

### Management Fees

```excel
=Fund_Size * Annual_Fee_Rate * (Period_Length_Months / 12)
```

**Formula**: Pro-rated based on period length

**Example** (Quarterly):
- Fund Size: $100M
- Annual Fee: 2%
- Period: 3 months (Q1)
- Fee = $100M × 0.02 × (3/12) = **$500K**

**Horizon Limit**: Fees stop after `managementFeeYears` (typically 10 years)

### GP Carry (Carried Interest)

```excel
=MAX(0, (LP_Proceeds - Total_Contributions) * Carry_Rate)
```

**Formula (European Waterfall)**:
```
Total Proceeds = Distributions + NAV
LP Capital Return = Total Contributions
Carry Base = Total Proceeds - LP Capital Return
GP Carry = Carry Base × Carry Rate
LP Net Proceeds = Total Proceeds - GP Carry
```

**Example**:
- Total Proceeds: $250M
- LP Contributions: $100M
- Carry Rate: 20%
- Carry Base = $250M - $100M = $150M
- GP Carry = $150M × 0.20 = **$30M**
- LP Net Proceeds = $250M - $30M = **$220M**

## Tolerance Requirements

### Standard Tolerances

| Metric | Absolute Tolerance | Relative Tolerance | Rationale |
|--------|-------------------|-------------------|-----------|
| TVPI   | 0.01 (1%)        | 1%                | Rounding differences in cash flow timing |
| DPI    | 0.01 (1%)        | 1%                | Cumulative rounding effects |
| IRR    | 0.005 (0.5%)     | 0.5%              | Newton-Raphson convergence variance |
| NAV    | $1M              | 1%                | Mark-to-market approximations |

### Tolerance Logic

Tests pass if **BOTH** conditions are met:
1. Absolute difference ≤ absolute tolerance **AND**
2. Relative difference ≤ relative tolerance

**Example** (TVPI comparison):
```typescript
actual = 2.512
expected = 2.500
absoluteDiff = |2.512 - 2.500| = 0.012  ✓ (≤ 0.01? NO)
relativeDiff = 0.012 / 2.500 = 0.0048   ✓ (≤ 0.01? YES)
FAIL: absoluteDiff exceeds tolerance
```

## File Formats

### inputs.json

Fund model parameters in JSON format:

```json
{
  "fundSize": 100000000,
  "fundTermYears": 10,
  "periodLengthMonths": 3,
  "managementFeeRate": 0.02,
  "managementFeeYears": 10,
  "carryRate": 0.20,
  "stageAllocations": [
    {
      "stage": "seed",
      "allocationPct": 0.40
    }
  ],
  "averageCheckSizes": {
    "seed": 1000000
  },
  "monthsToExit": {
    "seed": 84
  }
}
```

### expected.csv

Time-series results from Excel calculations:

```csv
# Excel Parity Reference Data - Baseline Scenario
periodIndex,tvpi,dpi,irr,nav,contributions,distributions,managementFees
0,1.000000,0.000000,0.000000,100000000.000000,100000000.000000,0.000000,500000.000000
4,0.980000,0.000000,0.000000,96000000.000000,100000000.000000,0.000000,2500000.000000
28,2.500000,2.500000,0.185000,0.000000,100000000.000000,250000000.000000,14500000.000000
```

**Format Rules**:
- Numeric precision: 6 decimal places
- Header row required
- Metadata lines start with `#`
- Trailing newline required

### metadata.json

Scenario documentation and validation rules:

```json
{
  "name": "baseline",
  "description": "Standard VC fund with balanced portfolio",
  "expectedOutcomes": {
    "finalTVPI": 2.500000,
    "finalDPI": 2.500000,
    "finalIRR": 0.185000
  },
  "tolerances": {
    "tvpi": { "absolute": 0.01, "relative": 0.01 },
    "irr": { "absolute": 0.005, "relative": 0.005 }
  },
  "formulasUsed": [
    "XIRR() - Internal Rate of Return",
    "SUM() - Cumulative totals"
  ]
}
```

## Usage

### Running Tests

```bash
# Run all Excel parity tests
npm test excel-parity

# Run specific scenario
npm test excel-parity -- -t "baseline"

# Watch mode for development
npm test excel-parity -- --watch
```

### Generating Debug Output

```typescript
import { exportToCSV } from '@/lib/export';
import { runFundModel } from '@/lib/fund-calc';

const results = runFundModel(inputs);
const csv = exportToCSV(results.periodResults, 'debug-output.csv', {
  includeMetadata: true,
  scenarioName: 'Debug Run',
  precision: 6
});

// Open in Excel for side-by-side comparison
```

### Comparing Results

```typescript
import { compareWithTolerance, visualDiff } from '@/tests/utils/compare';

const comparison = compareWithTolerance(
  actual.tvpi,
  expected.tvpi,
  'TVPI',
  { absoluteTolerance: 0.01, relativeTolerance: 0.01 }
);

if (!comparison.matches) {
  console.log(visualDiff([comparison]));
}
```

## Adding New Scenarios

1. **Create directory**: `tests/fixtures/excel-parity/[scenario-name]/`
2. **Generate Excel reference**: Build model in Excel, export results
3. **Create inputs.json**: Document all fund parameters
4. **Create expected.csv**: Export time-series from Excel
5. **Create metadata.json**: Document formulas, tolerances, assumptions
6. **Add test case**: Update `tests/excel-parity.test.ts`
7. **Verify**: Run tests and check diff reports

## Troubleshooting

### Common Issues

#### IRR Calculation Differences

**Symptom**: IRR differs by > 0.5%

**Causes**:
- Cash flow timing differences (quarterly vs monthly)
- Newton-Raphson convergence tolerance
- Excel XIRR uses different initial guess

**Solution**:
- Check cash flow dates match exactly
- Verify period length consistency
- Increase IRR tolerance if justified

#### TVPI/DPI Rounding Errors

**Symptom**: TVPI differs by small amount (< 0.01)

**Causes**:
- Cumulative rounding in multi-period calculations
- Floating-point precision differences

**Solution**:
- Verify both absolute AND relative tolerances
- Check intermediate period calculations
- Ensure 6-decimal precision in exports

#### NAV Mismatches

**Symptom**: NAV differs significantly

**Causes**:
- Management fee calculation differences
- Unrealized investment valuation methods
- Cash balance tracking errors

**Solution**:
- Verify management fee horizon logic
- Check fee calculation per period
- Validate cash flow waterfall

## Best Practices

1. **Version Control**: Commit all reference data to Git
2. **Documentation**: Update metadata.json when assumptions change
3. **Validation**: Run parity tests before merging calculation changes
4. **Debugging**: Export CSV for side-by-side Excel comparison
5. **Tolerances**: Keep tight tolerances (1% TVPI, 0.5% IRR)
6. **Precision**: Always use 6 decimal places in exports
7. **Determinism**: Ensure same inputs produce same outputs

## References

- [XIRR Function (Microsoft)](https://support.microsoft.com/en-us/office/xirr-function-de1242ec-6477-445b-b11b-a303ad9adc9d)
- [TVPI/DPI Calculation (Preqin)](https://docs.preqin.com/handbook/glossary)
- [IRR Calculation Methods (Investopedia)](https://www.investopedia.com/terms/i/irr.asp)
- [VC Fund Modeling Best Practices](https://www.nvca.org/)

## Maintenance

- **Review**: Quarterly audit of all scenarios
- **Updates**: Document changes in CHANGELOG.md
- **Validation**: Re-run all tests after Excel template updates
- **Communication**: Share test reports with stakeholders

---

**Version**: 1.0.0
**Last Updated**: 2025-10-15
**Author**: Testing Agent
**Status**: Production Ready
