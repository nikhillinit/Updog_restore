# Golden Datasets (Excel Parity)

These CSVs hold **inputs** and **Excel-calculated expected values** used as the oracle.

- Excel version: Microsoft 365 (or Excel 2021)
- XIRR reference: https://support.microsoft.com/en-us/office/xirr-function-de1242ec-6477-445b-b11b-a303ad9adc9d
- Tolerance: **1e-6** for XIRR/TVPI/DPI, **cent-level** for money values.

## Files
- `seed-fund-basic.csv` — Example input cashflows
- `seed-fund-basic.results.csv` — Expected metrics as computed in Excel

> Replace these with your real golden datasets once you wire the engine call in the test.
