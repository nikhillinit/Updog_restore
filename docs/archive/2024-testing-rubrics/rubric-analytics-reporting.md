---
archived: true
lastUpdated: 2026-01-28
---

# Analytics & Reporting Testing Rubric

**Domain:** Performance dashboards, variance analysis, time-travel, exports
**Estimated Time:** 50 minutes **Prerequisites:** Test fund with investment
history, completed transactions

---

## Overview

This rubric covers all analytics dashboards, reporting features, and data export
capabilities. The platform provides multiple lenses for analyzing fund
performance.

**Key Features:**

- Performance dashboards (fund-level, portfolio-level, company-level)
- Variance analysis (budget vs actual, plan vs execution)
- Time-travel reporting (historical snapshots, point-in-time views)
- Custom report generation
- Data export (CSV, Excel, PDF)
- Interactive charts (Recharts, Nivo)

---

## Test Cases

### TC-AR-001: Fund Performance Dashboard

**Objective:** Verify fund-level performance metrics display correctly
**Steps:**

**Test 1a: Overview Metrics**

1. Navigate to fund dashboard (`/funds/{fundId}`)
2. Verify key metrics displayed:
   - Total Fund Size: $50M
   - Deployed Capital: $30M
   - Remaining Capital: $20M
   - Deployment %: 60%
   - Number of Investments: 12
   - Active Companies: 10
   - Exited Companies: 2

**Test 1b: Performance Metrics**

1. Verify performance section displays:
   - Gross MOIC: 1.85x
   - Net MOIC: 1.62x (after fees)
   - Gross IRR: 18.5%
   - Net IRR: 14.2%
   - DPI (Distributed to Paid-In): 0.45x
   - TVPI (Total Value to Paid-In): 1.85x

**Test 1c: Metric Calculation Accuracy**

1. Export underlying data
2. Verify MOIC = (Realized Value + Unrealized Value) / Total Invested
3. Verify TVPI = DPI + RVPI (Residual Value to Paid-In)
4. Verify calculations match manual Excel verification

**Time:** 6 minutes

---

### TC-AR-002: Portfolio Performance Table

**Objective:** Verify portfolio-level performance breakdown **Steps:**

**Test 2a: Table Display**

1. Navigate to Portfolio Performance tab
2. Verify table columns:
   - Company Name
   - Sector
   - Stage
   - Invested Amount
   - Current Value
   - MOIC
   - IRR
   - Status
3. Verify all active + exited companies listed

**Test 2b: Sorting**

1. Click "MOIC" column header
2. Verify descending sort (highest MOIC first)
3. Click "Invested Amount" column
4. Verify descending sort (largest investments first)
5. Click "IRR" column
6. Verify descending sort (highest returns first)

**Test 2c: Performance Indicators**

1. Verify MOIC >3.0x highlighted in green
2. Verify MOIC <1.0x highlighted in red
3. Verify IRR >25% has "Top Performer" badge
4. Verify IRR <0% has "Loss" badge

**Time:** 5 minutes

---

### TC-AR-003: Interactive Charts - Fund Composition

**Objective:** Verify chart rendering and interactivity **Steps:**

**Test 3a: Pie Chart - Sector Allocation**

1. Navigate to Fund Overview dashboard
2. Verify pie chart displays sector allocation:
   - Software: 35%
   - Healthcare: 25%
   - Fintech: 20%
   - Other: 20%
3. Hover over pie slice
4. Verify tooltip shows:
   - Sector name
   - Invested amount
   - Percentage of fund
   - Number of companies

**Test 3b: Bar Chart - Stage Distribution**

1. Verify bar chart displays investment by stage:
   - Seed: $8M (5 companies)
   - Series A: $12M (4 companies)
   - Series B: $10M (3 companies)
2. Verify x-axis: Stage labels
3. Verify y-axis: Dollar amounts
4. Verify bars colored by performance (green/yellow/red)

**Test 3c: Line Chart - Deployment Over Time**

1. Verify line chart shows cumulative deployment:
   - X-axis: Months since fund inception
   - Y-axis: Cumulative deployed capital
   - Target pace line (dotted)
   - Actual pace line (solid)
2. Verify shaded area between lines shows variance

**Time:** 6 minutes

---

### TC-AR-004: Variance Analysis - Budget vs Actual

**Objective:** Verify variance tracking and alerting **Steps:**

**Test 4a: Deployment Variance**

1. Navigate to Variance Analysis page
2. Verify deployment variance table:
   - Quarter 1: Budgeted $5M, Actual $4M, Variance -$1M (-20%)
   - Quarter 2: Budgeted $5M, Actual $6M, Variance +$1M (+20%)
   - Quarter 3: Budgeted $5M, Actual $5M, Variance $0 (0%)
3. Verify variance color coding:
   - Negative variance: Red
   - Positive variance (over budget): Yellow
   - On target: Green

**Test 4b: Sector Allocation Variance**

1. View sector allocation variance:
   - Software: Target 40%, Actual 35%, Variance -5%
   - Healthcare: Target 20%, Actual 25%, Variance +5%
2. Verify variance bars chart
3. Verify alerts for >10% variance from target

**Test 4c: Management Fee Variance**

1. View fee variance:
   - Budgeted annual fee: $1M (2% of $50M)
   - Actual fee: $980K (includes fee discounts)
   - Variance: -$20K (-2%)
2. Verify explanation note displayed

**Time:** 6 minutes

---

### TC-AR-005: Time-Travel Reporting

**Objective:** Verify historical point-in-time reporting **Steps:**

**Test 5a: Select Historical Date**

1. Navigate to Time-Travel page
2. Select date: 2024-06-30 (mid-year snapshot)
3. Click "View Snapshot"
4. Verify all metrics recalculated as of 2024-06-30:
   - Deployed capital as of that date
   - Portfolio valuations as of that date
   - Performance metrics as of that date

**Test 5b: Compare Two Snapshots**

1. Select date 1: 2024-03-31 (Q1 end)
2. Select date 2: 2024-06-30 (Q2 end)
3. Click "Compare Periods"
4. Verify comparison table shows:
   - Metric changes (Deployed capital: +$5M)
   - Performance changes (MOIC: 1.5x → 1.7x)
   - New investments in period (3 companies)
   - Exits in period (1 company)

**Test 5c: Quarterly Trend Analysis**

1. Select: "Show Quarterly Trends"
2. Verify line chart displays quarterly evolution:
   - Q1 2024: MOIC 1.3x
   - Q2 2024: MOIC 1.5x
   - Q3 2024: MOIC 1.7x
   - Q4 2024: MOIC 1.85x
3. Verify trend line (linear regression)

**Time:** 8 minutes

---

### TC-AR-006: Custom Report Builder

**Objective:** Verify custom report generation **Steps:**

**Test 6a: Create Custom Report**

1. Navigate to Reports page
2. Click "Create Custom Report"
3. Configure report:
   - Report name: "Q4 2024 Board Report"
   - Date range: 2024-10-01 to 2024-12-31
   - Metrics: MOIC, IRR, Deployed Capital, TVPI
   - Grouping: By Sector
   - Filters: Active companies only
4. Click "Generate Report"
5. Verify report preview displays

**Test 6b: Report Sections**

1. Verify generated report includes:
   - Executive Summary (key metrics)
   - Portfolio Overview (table)
   - Sector Analysis (charts)
   - Investment Activity (timeline)
   - Performance Attribution (variance analysis)
2. Verify all sections render correctly

**Test 6c: Save Report Template**

1. Click "Save as Template"
2. Name template: "Quarterly Board Report"
3. Verify template saved
4. Navigate to Reports page
5. Verify template listed in "My Templates"

**Test 6d: Reuse Template**

1. Select "Quarterly Board Report" template
2. Change date range: Q1 2025
3. Click "Generate"
4. Verify report regenerates with new date range
5. Verify all sections updated

**Time:** 8 minutes

---

### TC-AR-007: Data Export - CSV

**Objective:** Verify CSV export functionality **Steps:**

**Test 7a: Export Portfolio Data**

1. Navigate to Portfolio Performance table
2. Click "Export to CSV"
3. Verify CSV file downloads: `portfolio-performance-{date}.csv`
4. Open CSV in Excel
5. Verify columns match table:
   - Company, Sector, Stage, Invested, Value, MOIC, IRR
6. Verify all rows exported (no truncation)
7. Verify currency formatted as numbers (not text)

**Test 7b: Export with Filters**

1. Apply filters: Sector = Software, Status = Active
2. Click "Export to CSV"
3. Open exported file
4. Verify only filtered rows exported (not all companies)
5. Verify filter criteria noted in filename or header row

**Test 7c: Export Transaction History**

1. Navigate to Transaction History page
2. Click "Export to CSV"
3. Verify CSV includes:
   - Date, Company, Type (Investment/Exit), Amount
4. Verify chronological order
5. Verify dates formatted as YYYY-MM-DD

**Time:** 6 minutes

---

### TC-AR-008: Data Export - Excel

**Objective:** Verify Excel export with formatting **Steps:**

**Test 8a: Export Fund Overview to Excel**

1. Navigate to Fund Dashboard
2. Click "Export to Excel"
3. Verify Excel file downloads: `fund-overview-{date}.xlsx`
4. Open in Excel
5. Verify multiple worksheets:
   - Summary (key metrics)
   - Portfolio (company list)
   - Transactions (investment history)
   - Performance (charts)

**Test 8b: Excel Formatting**

1. Verify Summary sheet includes:
   - Formatted header row (bold, colored)
   - Currency cells formatted as currency ($X,XXX.XX)
   - Percentage cells formatted as percentages (XX.XX%)
   - Number cells formatted with commas
2. Verify no cell value errors (#DIV/0!, #N/A)

**Test 8c: Excel Charts**

1. Navigate to Performance worksheet
2. Verify embedded charts:
   - Sector allocation pie chart
   - Deployment over time line chart
3. Verify charts are editable (not images)

**Time:** 5 minutes

---

### TC-AR-009: Data Export - PDF

**Objective:** Verify PDF export for professional reporting **Steps:**

**Test 9a: Export Report to PDF**

1. Generate custom report (from TC-AR-006)
2. Click "Export to PDF"
3. Verify PDF downloads: `board-report-q4-2024.pdf`
4. Open PDF
5. Verify professional formatting:
   - Header with fund name and logo
   - Page numbers
   - Table of contents
   - Section breaks

**Test 9b: PDF Chart Rendering**

1. Verify all charts render as vector graphics (sharp, not pixelated)
2. Verify chart legends included
3. Verify color scheme maintained (not grayscale)

**Test 9c: PDF Table Formatting**

1. Verify tables fit page width
2. Verify no awkward page breaks mid-table
3. Verify currency and percentage formatting preserved

**Time:** 4 minutes

---

### TC-AR-010: Real-Time Dashboard Updates

**Objective:** Verify dashboards update when data changes **Steps:**

**Test 10a: Live Update on Investment**

1. Open Fund Dashboard in browser tab
2. In separate tab, record new investment: $2M
3. Return to dashboard tab
4. Verify metrics auto-refresh within 5 seconds:
   - Deployed Capital: +$2M
   - Remaining Capital: -$2M
   - Number of Investments: +1
5. Verify no full page reload required

**Test 10b: Live Update on Exit**

1. Keep dashboard open
2. Record company exit in separate tab
3. Return to dashboard
4. Verify metrics update:
   - Active Companies: -1
   - Exited Companies: +1
   - MOIC recalculated with exit proceeds

**Test 10c: WebSocket Connection**

1. Open browser DevTools → Network tab
2. Filter by WS (WebSocket)
3. Verify WebSocket connection established
4. Make data change
5. Verify WebSocket message received
6. Verify dashboard updates without polling

**Time:** 5 minutes

---

### TC-AR-011: Performance Attribution Analysis

**Objective:** Verify performance attribution breakdown **Steps:**

**Test 11a: Attribution by Sector**

1. Navigate to Performance Attribution page
2. Select: "By Sector"
3. Verify attribution table shows:
   - Sector: Software
   - Contribution to Fund MOIC: +0.60x
   - Weight in Fund: 35%
   - Sector MOIC: 2.8x
4. Verify all sectors sum to total fund MOIC

**Test 11b: Attribution by Vintage**

1. Select: "By Vintage Year"
2. Verify attribution by investment year:
   - 2024 vintage: 0.30x contribution (early stage)
   - 2023 vintage: 0.85x contribution (maturing)
   - 2022 vintage: 0.70x contribution (some exits)
3. Verify chart visualizes contributions

**Test 11c: Top/Bottom Contributors**

1. View "Top 5 Contributors" section
2. Verify lists top 5 companies by MOIC contribution
3. View "Bottom 5 Contributors" section
4. Verify lists bottom 5 (losses or write-offs)

**Time:** 5 minutes

---

### TC-AR-012: Benchmark Comparisons

**Objective:** Verify fund performance vs industry benchmarks **Steps:**

**Test 12a: Load Benchmark Data**

1. Navigate to Benchmarks page
2. Select benchmark: "Cambridge Associates VC Index"
3. Verify benchmark data loads:
   - Median MOIC: 1.6x
   - Top Quartile MOIC: 2.5x
   - Bottom Quartile MOIC: 0.8x

**Test 12b: Compare Fund to Benchmark**

1. Verify comparison table:
   - Fund MOIC: 1.85x
   - Benchmark Median: 1.6x
   - Relative Performance: +15.6% above median
   - Quartile Rank: "Second Quartile"
2. Verify visual indicator (green if above median)

**Test 12c: Benchmark Chart Overlay**

1. View fund performance chart
2. Enable "Show Benchmark" toggle
3. Verify benchmark line overlaid on fund line
4. Verify shaded area shows outperformance/underperformance

**Time:** 4 minutes

---

## Summary Checklist

After completing all test cases, verify:

- [ ] All dashboard metrics calculate correctly
- [ ] Performance tables sort and filter properly
- [ ] Charts render (Recharts/Nivo) without errors
- [ ] Variance analysis highlights deviations
- [ ] Time-travel snapshots accurate
- [ ] Custom reports generate and save
- [ ] CSV exports contain complete data
- [ ] Excel exports include formatting and charts
- [ ] PDF exports professionally formatted
- [ ] Real-time updates work via WebSocket
- [ ] Attribution analysis sums correctly
- [ ] Benchmark comparisons display

---

## Known Issues

Document any reporting bugs:

| Test Case | Issue Description | Severity | GitHub Issue |
| --------- | ----------------- | -------- | ------------ |
| TC-AR-XXX | [Description]     | [Level]  | #XXX         |

---

## Chart Libraries

**Recharts (Primary):**

- Line charts, Bar charts, Area charts
- Responsive, composable
- TypeScript support

**Nivo (Advanced):**

- Heatmaps, Sunburst, Sankey diagrams
- SVG-based, animated
- Used for complex visualizations

**Verify Both Libraries:**

- [ ] Recharts renders basic charts
- [ ] Nivo renders advanced visualizations
- [ ] Charts resize responsively
- [ ] Tooltips display on hover
- [ ] Legends accurate
- [ ] No console errors

---

## Export Format Specifications

**CSV:**

- UTF-8 encoding
- Comma delimiter
- Quote strings with commas
- YYYY-MM-DD date format
- No currency symbols in numbers (export as numeric)

**Excel:**

- .xlsx format (not .xls)
- Multiple worksheets
- Formatted cells (currency, percentage, date)
- Embedded charts (not images)
- No macros or VBA

**PDF:**

- Letter size (8.5" x 11")
- 1" margins
- Vector graphics for charts
- Professional fonts (Arial, Helvetica)
- Page numbers and headers

---

## Related Documentation

- [cheatsheets/data-visualization.md](../../cheatsheets/data-visualization.md) -
  Chart patterns
- [client/src/components/charts/](../../client/src/components/charts/) - Chart
  components
- [server/routes/reports.ts](../../server/routes/reports.ts) - Report API
  endpoints
