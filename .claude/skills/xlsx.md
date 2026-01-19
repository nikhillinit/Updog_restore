---
status: ACTIVE
last_updated: 2026-01-19
---

# Excel/XLSX Integration

## Overview

Comprehensive spreadsheet operations for VC fund LP reporting, portfolio data
import/export, and calculation validation. Enables formula-driven Excel files
(not hardcoded values) with professional financial formatting.

**Critical Principle**: Always use Excel formulas instead of calculating values
in code and hardcoding them. This ensures dynamic, updatable spreadsheets.

## When to Use

**LP Reporting**:

- Quarterly fund performance reports
- Waterfall distribution calculations for LPs
- Portfolio company valuations and metrics
- Carry calculation breakdowns

**Data Import**:

- Import portfolio data from LP Excel templates
- Load fund terms from standardized formats
- Import company ownership and investment details

**Golden Testing**:

- Validate Monte Carlo simulations against Excel models
- Compare ReserveEngine output to Excel reference
- Verify waterfall calculations match Excel formulas

**Data Export**:

- Generate professional Excel reports with charts
- Export scenario analysis results
- Create investor dashboards

## Core Operations

### Reading Excel Files

```python
import pandas as pd

# Read entire sheet
df = pd.read_excel('portfolio_template.xlsx')

# Read specific columns
df = pd.read_excel('lp_data.xlsx', usecols=['Company', 'Ownership', 'Valuation'])

# Read multiple sheets
sheets = pd.read_excel('fund_data.xlsx', sheet_name=None)

# Type specification
df = pd.read_excel('companies.xlsx', dtype={'CompanyID': str, 'Valuation': float})
```

### Writing Excel Files with Formulas

```python
from openpyxl import Workbook

wb = Workbook()
sheet = wb.active

# Always use formulas, not hardcoded values
sheet['A1'] = 'Total Investment'
sheet['B1'] = '=SUM(B2:B10)'  # Formula, not Python sum()

# Cell references for dynamic updates
sheet['C2'] = '=B2*(1+$B$6)'  # Relative + absolute references

# Named ranges for clarity
wb.define_name('TotalReserves', '=Sheet1!$B$1')

wb.save('fund_report.xlsx')
```

### Modifying Existing Files

```python
from openpyxl import load_workbook

# Preserve formulas during edits
wb = load_workbook('existing_report.xlsx')
sheet = wb['Portfolio']

# Add new data without breaking formulas
sheet.insert_rows(5)  # Formulas auto-adjust
sheet['A5'] = 'New Company'
sheet['B5'] = '=VLOOKUP(A5, Valuations, 2, FALSE)'

wb.save('updated_report.xlsx')
```

## VC Fund-Specific Examples

### Example 1: LP Quarterly Report Export

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

wb = Workbook()
sheet = wb.active
sheet.title = 'Fund Performance'

# Headers with formatting
header_fill = PatternFill(start_color='366092', end_color='366092', fill_type='solid')
sheet['A1'] = 'Fund Metrics Q4 2025'
sheet['A1'].font = Font(bold=True, size=14)

# Key assumptions (blue text = inputs)
blue_font = Font(color='0000FF')
sheet['A3'] = 'Total Committed Capital ($mm)'
sheet['B3'].font = blue_font
sheet['B3'] = 100  # Hardcoded input (blue)

# Formulas for calculations (black text)
sheet['A4'] = 'Deployed Capital ($mm)'
sheet['B4'] = '=SUM(Investments!B:B)'  # Formula (black)

sheet['A5'] = 'Reserve Remaining ($mm)'
sheet['B5'] = '=B3-B4'  // Formula for dynamic calculation

# Performance metrics
sheet['A7'] = 'Portfolio TVPI'
sheet['B7'] = '=Valuations!B1/B3'  # Cross-sheet formula

# Waterfall distribution
sheet['A10'] = 'LP Distribution'
sheet['B10'] = '=IF(B7>1.08, B4*0.8, B4)'  # Conditional formula

wb.save('Q4_2025_LP_Report.xlsx')
```

### Example 2: Import Portfolio Companies

```python
import pandas as pd

# Read LP template
companies_df = pd.read_excel('LP_Portfolio_Template.xlsx', sheet_name='Companies')

# Map to ReserveEngine schema
reserve_input = {
    'portfolioCompanies': companies_df.apply(lambda row: {
        'id': str(row['CompanyID']),
        'name': row['CompanyName'],
        'stage': row['Stage'],  # Seed, Series A, etc.
        'ownershipPercent': row['Ownership'] / 100,
        'totalInvested': row['TotalInvested'],
        'currentValuation': row['Valuation']
    }, axis=1).tolist()
}

# Validate against ReserveInputSchema
validated_input = ReserveInputSchema.parse(reserve_input)
```

### Example 3: Golden Test - Validate Monte Carlo

```python
import pandas as pd
from openpyxl import load_workbook

# Run Monte Carlo simulation
monte_carlo_results = run_monte_carlo_simulation(iterations=10000)

# Load Excel reference model
wb = load_workbook('Monte_Carlo_Reference.xlsx', data_only=False)
sheet = wb['Results']

# Compare key metrics
excel_median_tvpi = sheet['B10'].value  # Excel formula result
code_median_tvpi = monte_carlo_results['median_tvpi']

# Tolerance for floating point comparison
tolerance = 0.01
assert abs(excel_median_tvpi - code_median_tvpi) < tolerance, \
    f"TVPI mismatch: Excel={excel_median_tvpi}, Code={code_median_tvpi}"

# Validate formulas haven't changed
assert sheet['B10'].value.startswith('=PERCENTILE'), "Excel formula changed"
```

### Example 4: Waterfall Distribution Export

```python
from openpyxl import Workbook

wb = Workbook()
sheet = wb.active
sheet.title = 'Waterfall Calculation'

# Inputs (blue)
blue = Font(color='0000FF')
sheet['A1'] = 'Proceeds'
sheet['B1'] = 150000000
sheet['B1'].font = blue

sheet['A2'] = 'Preferred Return (%)'
sheet['B2'] = 0.08
sheet['B2'].font = blue
sheet['B2'].number_format = '0.0%'

# Return of Capital (formula)
sheet['A5'] = 'Return of Capital'
sheet['B5'] = '=MIN(B1, 100000000)'  # Cap at committed capital

# Preferred Return
sheet['A6'] = 'Preferred Return'
sheet['B6'] = '=MIN(B1-B5, 100000000*B2)'

# LP Catch-up
sheet['A7'] = 'LP Catch-up'
sheet['B7'] = '=MIN((B1-B5-B6), (B6*0.2/0.8))'

# Remaining Split
sheet['A8'] = 'Remaining (80/20 split)'
sheet['B8'] = '=B1-SUM(B5:B7)'

# LP Total
sheet['A10'] = 'LP Total Distribution'
sheet['B10'] = '=(B5+B6+B7)+(B8*0.8)'
sheet['B10'].font = Font(bold=True)

# GP Carry
sheet['A11'] = 'GP Carry'
sheet['B11'] = '=B1-B10'
sheet['B11'].font = Font(bold=True)

# Currency formatting
for row in range(5, 12):
    sheet[f'B{row}'].number_format = '$#,##0'

wb.save('Waterfall_Distribution.xlsx')
```

## Financial Model Standards

### Color Coding Conventions

```python
from openpyxl.styles import Font, PatternFill

# Blue text: Hardcoded inputs
blue_input = Font(color='0000FF')

# Black text: Formulas/calculations
black_formula = Font(color='000000')

# Green text: Internal cross-sheet links
green_link = Font(color='00B050')

# Red text: External file links
red_external = Font(color='FF0000')

# Yellow background: Key assumptions
yellow_highlight = PatternFill(start_color='FFFF00', end_color='FFFF00', fill_type='solid')
```

### Number Formatting

```python
# Currency with millions
sheet['B1'].number_format = '$#,##0'

# Percentages
sheet['B2'].number_format = '0.0%'

# Display zeros as dashes
sheet['B3'].number_format = '$#,##0;($#,##0);"-"'

# Negative in parentheses
sheet['B4'].number_format = '$#,##0_);($#,##0)'
```

### Documentation Standards

```python
# Source documentation
sheet['A1'] = 'Source: LiquidityEngine v2.3, 2025-11-29, CLAUDE.md, https://github.com/...'
sheet['A1'].font = Font(size=8, italic=True)
```

## Formula Recalculation (Critical)

### Always Recalculate Before Delivery

```bash
# Mandatory: Recalculate all formulas via LibreOffice
python recalc.py LP_Report.xlsx 30

# Returns validation JSON
{
  "file": "LP_Report.xlsx",
  "formula_errors": 0,  # MUST be zero
  "error_locations": [],
  "error_counts": {
    "#REF!": 0,
    "#DIV/0!": 0,
    "#VALUE!": 0
  }
}
```

**Critical**: Zero formula errors required before LP delivery. Any error =
failed validation.

## Integration with Other Skills

### With test-driven-development

**Excel Golden Tests**:

```typescript
// Test: ReserveEngine matches Excel model
it('should match Excel reference model for reserve allocation', () => {
  const engineOutput = ReserveEngine.calculate(input);
  const excelOutput = readExcelResults('Reserve_Reference.xlsx');

  expect(engineOutput.totalReserves).toBeCloseTo(excelOutput.totalReserves, 2);
  expect(engineOutput.perCompanyAllocation).toBeCloseTo(
    excelOutput.perCompany,
    2
  );
});
```

### With verification-before-completion

**Pre-Delivery Checklist**:

```markdown
Before delivering Excel report:

- [ ] All formulas (no hardcoded values)
- [ ] Zero formula errors (run recalc.py)
- [ ] Color coding correct (blue inputs, black formulas)
- [ ] Number formatting professional (currency, percentages)
- [ ] Source documentation included
- [ ] Charts render correctly
```

### With systematic-debugging

**Formula Debugging**:

```python
# When Excel formula doesn't match code output
# 1. Load workbook with data_only=False (preserve formulas)
wb = load_workbook('report.xlsx', data_only=False)

# 2. Inspect formula structure
formula = sheet['B10'].value
assert formula == '=SUM(B5:B9)', f"Formula changed: {formula}"

# 3. Trace precedents (what cells does this depend on?)
# 4. Compare intermediate values
# 5. Identify divergence point
```

## Best Practices

### 1. Always Use Formulas, Never Hardcode

**BAD**:

```python
# Calculating in Python and hardcoding
total = sum(values)
sheet['B10'] = total  # Hardcoded result
```

**GOOD**:

```python
# Using Excel formula for dynamic calculation
sheet['B10'] = '=SUM(B1:B9)'  # Formula recalculates
```

### 2. Use Named Ranges for Clarity

```python
# Instead of: =B10*C10
wb.define_name('TotalInvestment', '=Sheet1!$B$10')
wb.define_name('Multiple', '=Sheet1!$C$10')
sheet['D10'] = '=TotalInvestment*Multiple'
```

### 3. Document Assumptions

```python
# Always include metadata
sheet['A1'] = 'Fund: Press On Ventures Fund III'
sheet['A2'] = 'Date: 2025-11-29'
sheet['A3'] = 'Source: ReserveEngine v2.1'
sheet['A4'] = 'Assumptions: 8% preferred return, 20% carry'
```

### 4. Validate Before Delivery

```python
# Check for errors before LP delivery
wb = load_workbook('LP_Report.xlsx')
for sheet in wb.worksheets:
    for row in sheet.iter_rows():
        for cell in row:
            if cell.value and str(cell.value).startswith('#'):
                raise ValueError(f"Formula error at {cell.coordinate}: {cell.value}")
```

## Integration with Other Skills

- **test-driven-development**: Excel golden tests for validation
- **verification-before-completion**: Validate outputs before delivery
- **systematic-debugging**: Debug formula mismatches
- **memory-management**: Track Excel template versions
- **continuous-improvement**: Refine formatting and formula patterns
