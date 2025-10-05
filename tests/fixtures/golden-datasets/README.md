# Golden Dataset Testing Infrastructure

## Purpose

Golden datasets provide machine-checkable reference outputs for deterministic engine validation. Each dataset consists of CSV fixtures that can be compared byte-for-byte in CI pipelines, ensuring computational stability across code changes.

## Directory Structure

```
golden-datasets/
├── README.md                  # This file
├── simple/                    # Basic fund scenario
│   ├── inputs.csv            # Fund parameters and stage profiles
│   ├── expected.csv          # Expected time-series outputs
│   └── metadata.json         # Dataset metadata and tolerances
└── [other-scenarios]/        # Additional test scenarios
```

## File Format Specifications

### inputs.csv

Defines fund parameters and stage allocation profiles.

**Format:**
```csv
field,value,unit,notes
fundSize,100000000.000000,USD,Total committed capital
carryPct,0.200000,decimal,GP carried interest
```

**Sections:**
- **Fund Basics**: Core fund parameters (fundSize, carryPct, managementFeePct, etc.)
- **Stage Profiles**: Investment allocation by stage (pre_seed, seed, series_a, etc.)

**Rules:**
- Numeric values: 6-decimal precision (e.g., `0.200000`, `100000000.000000`)
- Percentages: Decimal format (20% = `0.200000`)
- Indexes: Zero-based (stage_0, stage_1, etc.)
- Sorting: Alphabetical by field name within sections

### expected.csv

Time-series outputs for fund metrics at specific time points.

**Format:**
```csv
month,quarter,contributions,fees,distributions,nav,dpi,tvpi,gpCarry,lpProceeds
0,0,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000
12,4,25000000.000000,500000.000000,0.000000,24500000.000000,0.000000,0.245000,0.000000,0.000000
```

**Columns:**
- `month`: Integer, zero-indexed (0 = fund inception)
- `quarter`: Integer, zero-indexed (0 = Q1 of year 1)
- `contributions`: Capital called from LPs (USD)
- `fees`: Management fees paid (USD)
- `distributions`: Cash returned to LPs (USD)
- `nav`: Net Asset Value (USD)
- `dpi`: Distributions to Paid-In Capital (ratio)
- `tvpi`: Total Value to Paid-In Capital (ratio)
- `gpCarry`: GP carried interest earned (USD)
- `lpProceeds`: LP net proceeds after carry (USD)

**Rules:**
- All numeric values: 6-decimal precision
- Monotonically increasing month/quarter values
- Sorted by month (ascending)
- No missing rows for specified time points

### metadata.json

Dataset metadata, assumptions, and validation tolerances.

**Format:**
```json
{
  "name": "simple",
  "description": "Basic fund scenario with two stages",
  "assumptions": [
    "Linear deployment over 3 years",
    "No reserves allocated",
    "Single exit event at year 7"
  ],
  "expectedOutcomes": {
    "finalDPI": 2.500000,
    "finalTVPI": 2.500000,
    "finalIRR": 0.180000
  },
  "tolerances": {
    "absolute": 0.000001,
    "relative": 0.000001,
    "description": "1e-6 for both absolute and relative differences"
  },
  "version": "1.0.0",
  "author": "System",
  "createdDate": "2025-10-04"
}
```

## Canonicalization Rules

To ensure byte-level reproducibility:

1. **Numeric Precision**: Always 6 decimals (`%.6f`)
2. **Sorting**: Alphabetical by primary key (field name or month)
3. **Indexing**: Zero-based for all sequences
4. **Line Endings**: LF (`\n`) on all platforms
5. **Encoding**: UTF-8 without BOM
6. **Trailing Newline**: Required on all CSV files

## Validation Tolerances

### Numeric Comparison

- **Absolute tolerance**: `1e-6` (0.000001)
- **Relative tolerance**: `1e-6` (0.0001%)
- **Use case**: Floating-point arithmetic may introduce tiny rounding differences

### Byte-Level Comparison

- **Use case**: Verify export format stability
- **Requirement**: Exact match after canonicalization
- **Triggers**: Any change to time-series export logic

## Usage Examples

### Load and Compare

```typescript
import { loadGoldenDataset, compareToExpected } from '@/tests/utils/golden-dataset';

const dataset = await loadGoldenDataset('simple');
const actual = await runEngine(dataset.inputs);
const comparison = compareToExpected(actual, dataset.expected, dataset.tolerances);

expect(comparison.matches).toBe(true);
```

### Export to Golden Format

```typescript
import { exportToGoldenFormat } from '@/tests/utils/golden-dataset';

const timeSeries = { /* engine output */ };
const csv = exportToGoldenFormat(timeSeries);

// Write to disk for manual inspection
await fs.writeFile('debug-output.csv', csv);
```

### Byte-Level Validation

```typescript
import { compareCSVBytes } from '@/tests/utils/golden-dataset';

const expectedCSV = await fs.readFile('expected.csv', 'utf-8');
const actualCSV = exportToGoldenFormat(engineOutput);

const result = compareCSVBytes(expectedCSV, actualCSV);
expect(result.identical).toBe(true);
```

## Adding New Datasets

1. Create directory: `tests/fixtures/golden-datasets/[scenario-name]/`
2. Add `inputs.csv` with canonicalized parameters
3. Generate `expected.csv` from verified engine run
4. Create `metadata.json` with assumptions and tolerances
5. Write test case in `tests/integration/golden-dataset.test.ts`
6. Verify byte-level match before committing

## Maintenance

- **Review**: Quarterly audit of all datasets
- **Updates**: Version bump in metadata.json on changes
- **Deprecation**: Move obsolete datasets to `_archive/` subdirectory
- **Documentation**: Update assumptions when engine logic changes
