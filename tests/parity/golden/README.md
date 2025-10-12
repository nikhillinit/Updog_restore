# Golden Datasets (Excel Parity)

These CSVs hold **fund-level cashflow inputs** and **Excel-calculated expected values** used as the oracle for XIRR/TVPI/DPI calculations.

## Purpose

Validates that our production XIRR calculator (`client/src/lib/xirr.ts`) produces results that match Microsoft Excel's XIRR function, ensuring financial calculation accuracy for LP reporting.

## Reference Standards

- **Excel version**: Microsoft 365 (or Excel 2021+)
- **XIRR reference**: [Excel XIRR Function](https://support.microsoft.com/en-us/office/xirr-function-de1242ec-6477-445b-b11b-a303ad9adc9d)
- **Tolerance**: **1e-6** (6 decimal places) for XIRR/TVPI/DPI
- **Algorithm**: Newton-Raphson with bisection fallback (same as Excel)

## Metrics Tested

1. **XIRR (Internal Rate of Return)**: Excel's XIRR function
2. **TVPI (Total Value to Paid-In)**: `(Distributions + NAV) / Called Capital`
3. **DPI (Distributions to Paid-In)**: `Distributions / Called Capital`

## Files

- **`seed-fund-basic.csv`** — Example cashflow inputs (capital calls and distributions)
  - Format: `date,amount` where negative = capital call, positive = distribution/NAV
- **`seed-fund-basic.results.csv`** — Expected metrics computed in Excel
  - Format: `metric,expected` with XIRR/TVPI/DPI values

## Creating Golden Datasets

To create a new golden dataset:

1. **Gather real fund cashflows** or create realistic scenarios
2. **Calculate in Excel**:
   ```excel
   // In Excel
   =XIRR(amounts_range, dates_range)  // For IRR
   =(SUM(distributions) + NAV) / SUM(capital_calls)  // For TVPI
   =SUM(distributions_only) / SUM(capital_calls)  // For DPI
   ```
3. **Export to CSV** with 6+ decimal places precision
4. **Add test case** in `excel-parity.test.ts`
5. **Verify**: `npm run test:parity`

## Example Dataset

The `seed-fund-basic` dataset represents:
- **Fund**: $2M committed capital
- **Period**: 2.5 years from first call to exit
- **Outcome**: Partial loss scenario (TVPI < 1.0)
  - Two capital calls: -$1M each
  - One partial distribution: +$250K
  - Final exit: +$1.5M
  - **XIRR**: 19.23%
  - **TVPI**: 0.875x
  - **DPI**: 0.75x (excluding final NAV)

> **Note**: Replace with your actual fund data for production parity testing.
