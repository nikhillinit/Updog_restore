# Engine Validation Scripts

This directory contains critical scripts for validating reserve engine implementations against golden datasets.

## Overview

These tools ensure deterministic behavior and catch regressions in the reserve allocation engine by comparing current outputs against known-good "golden" fixtures.

## Scripts

### 1. Golden Fixture Generation (`generate-golden-reserve-fixture.ts`)

Generates comprehensive, deterministic test fixtures for the Reserve Engine.

**Purpose**: Create baseline datasets with known-good outputs that can be used for regression testing.

**Features**:
- Deterministic generation with fixed random seeds
- Contract-compliant inputs and outputs (Zod validated)
- Comprehensive edge case coverage
- Three-file structure: inputs, expected outputs, and metadata

**Usage**:
```bash
# Basic usage
npm run generate:golden:reserve -- --name reserve-v1 --portfolio-size 10

# With custom seed
npm run generate:golden:reserve -- --name my-test --portfolio-size 20 --seed 12345

# Include edge cases (empty reserves, strategic companies)
npm run generate:golden:reserve -- --name edge-cases --seed 999 --edge-cases

# Show help
npm run generate:golden:reserve -- --help
```

**CLI Arguments**:
- `--name <string>` (required): Name of the fixture
- `--portfolio-size <number>`: Number of companies (default: 10)
- `--seed <number>`: Random seed for reproducibility (default: 42)
- `--edge-cases`: Include strategic companies and edge cases
- `--help, -h`: Show help message

**Output Structure**:
```
tests/fixtures/golden-datasets/reserve-engine-v1/<fixture-name>/
├── inputs.json      # All engine inputs (portfolio, strategies, constraints)
├── expected.json    # Expected allocation outputs
└── metadata.json    # Test metadata, tolerances, assumptions
```

**Example Output**:
```bash
$ npm run generate:golden:reserve -- --name reserve-v1 --portfolio-size 15 --edge-cases

✓ Generated request with 15 companies
✓ Ran reserve engine (allocated $90.29M)
✓ Generated fixture: reserve-v1
  Location: C:\dev\Updog_restore\tests\fixtures\golden-datasets\reserve-engine-v1\reserve-v1
  Portfolio size: 15
  Random seed: 42
  Total allocated: $90.29M
  Files created:
    - inputs.json
    - expected.json
    - metadata.json
```

### 2. Engine Parity CLI (`engine-parity.ts`)

Validates current reserve engine implementation against golden fixtures.

**Purpose**: Detect regressions by comparing actual engine outputs to expected golden outputs.

**Features**:
- Precision-aware comparison (configurable tolerance)
- Detailed difference reporting
- Exit codes for CI/CD integration (0=pass, 1=fail, 2=error)
- Verbose mode for debugging

**Usage**:
```bash
# Basic parity check
npm run parity -- --fixture reserve-v1

# With custom tolerance
npm run parity -- --fixture reserve-v1 --tolerance 1e-8

# Verbose output (show all differences)
npm run parity -- --fixture reserve-v1 --verbose

# Shortcut for reserve-v1 fixture
npm run parity:reserve

# Show help
npm run parity -- --help
```

**CLI Arguments**:
- `--fixture, -f <string>` (required): Name of the fixture to validate against
- `--tolerance, -t <number>`: Comparison tolerance (default: 1e-6)
- `--verbose, -v`: Show detailed comparison output
- `--help, -h`: Show help message

**Exit Codes**:
- `0`: All tests passed (parity achieved)
- `1`: Tests failed (parity broken)
- `2`: Error loading fixture or running engine

**Example Output (Pass)**:
```bash
$ npm run parity:reserve

Loading fixture: reserve-v1
✓ Loaded fixture: reserve-v1
  Version: 1.0.0
  Description: Golden dataset for reserve engine with 15 companies

Running current reserve engine...
✓ Engine completed
  Processed 15 companies
  Total allocated: $90.29M

Comparing outputs (tolerance: 0.000001)...

================================================================================
ENGINE PARITY CHECK: reserve-v1
================================================================================

Total comparisons: 97
Failed comparisons: 0
Pass rate: 100.00%

✓ PASS - Engine output matches golden fixture
  All numeric values are within tolerance

================================================================================
```

**Example Output (Fail)**:
```bash
$ npm run parity -- --fixture reserve-v1 --verbose

...

================================================================================
ENGINE PARITY CHECK: reserve-v1
================================================================================

Total comparisons: 97
Failed comparisons: 3
Pass rate: 96.91%

✗ FAIL - Engine output differs from golden fixture
  Found 3 differences:

  Path:     companyAllocations[0].allocatedReserve
  Expected: 2640000
  Actual:   2641234
  Diff:     1.234000e+3 (0.0467% relative)

  Path:     totalAllocated
  Expected: 90290597
  Actual:   90291831
  Diff:     1.234000e+3 (0.0014% relative)

  Path:     portfolioMetrics.totalProjectedValue
  Expected: 180581194
  Actual:   180583662
  Diff:     2.468000e+3 (0.0014% relative)

================================================================================
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Engine Parity Check

on:
  pull_request:
    paths:
      - 'client/src/core/reserves/**'
      - 'shared/contracts/reserve-engine.contract.ts'

jobs:
  parity-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Run parity checks
        run: |
          npm run parity:reserve
          npm run parity -- --fixture edge-cases
```

### Pre-commit Hook

Add to `.husky/pre-commit`:
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run parity check on staged reserve engine changes
if git diff --cached --name-only | grep -q 'client/src/core/reserves/'; then
  echo "Reserve engine changes detected, running parity check..."
  npm run parity:reserve || exit 1
fi
```

## Workflow

### 1. Creating a New Golden Fixture

When creating a new test case or updating the engine contract:

```bash
# Generate fixture with descriptive name
npm run generate:golden:reserve -- --name my-feature-test --portfolio-size 20 --seed 42

# Verify it passes immediately
npm run parity -- --fixture my-feature-test

# Commit the fixture to version control
git add tests/fixtures/golden-datasets/reserve-engine-v1/my-feature-test/
git commit -m "feat: add golden fixture for new feature"
```

### 2. Updating an Existing Fixture

When making intentional changes to engine behavior:

```bash
# Regenerate the fixture with the same seed
npm run generate:golden:reserve -- --name reserve-v1 --portfolio-size 15 --seed 42 --edge-cases

# Verify parity
npm run parity:reserve

# Review changes
git diff tests/fixtures/golden-datasets/reserve-engine-v1/reserve-v1/expected.json

# Commit if changes are intentional
git add tests/fixtures/golden-datasets/reserve-engine-v1/reserve-v1/
git commit -m "chore: update reserve-v1 golden fixture for new allocation logic"
```

### 3. Debugging Parity Failures

When parity checks fail unexpectedly:

```bash
# Run with verbose output
npm run parity -- --fixture reserve-v1 --verbose

# Check which metrics failed
# Common causes:
#   - Floating-point precision issues
#   - Non-deterministic random number generation
#   - Unintended side effects in engine logic

# If tolerance is too strict, adjust
npm run parity -- --fixture reserve-v1 --tolerance 1e-5
```

## Best Practices

### Fixture Naming Conventions

- `reserve-v1`: Primary regression test fixture
- `edge-case-*`: Edge cases (empty portfolios, extreme values)
- `strategic-*`: Strategic company scenarios
- `<feature>-test`: Feature-specific test fixtures

### Seed Selection

- Use consistent seeds (e.g., 42) for main fixtures
- Use different seeds for diversity in test coverage
- Document seed in fixture metadata

### Tolerance Configuration

- Default (`1e-6`): Suitable for most financial calculations
- Strict (`1e-8`): For critical precision requirements
- Relaxed (`1e-4`): For approximate comparisons or when floating-point drift is expected

### Version Control

- **DO** commit all three files (inputs.json, expected.json, metadata.json)
- **DO** review changes to expected.json carefully in PRs
- **DO** regenerate fixtures when contract schemas change
- **DON'T** manually edit expected.json (always regenerate)

## Troubleshooting

### "Failed to load fixture"
- Ensure fixture directory exists
- Check file permissions
- Verify JSON syntax

### "Incompatible contract version"
- Regenerate fixture with current contract version
- Update CONTRACT_VERSION in scripts if needed

### "Unallocated reserves is negative"
- Engine allocated more than available reserves
- Check portfolio size vs available reserves ratio
- Review allocation multipliers

### "Row count mismatch"
- Portfolio size changed
- Regenerate fixture with correct portfolio size

## Technical Details

### Deterministic Random Number Generation

Scripts use a Linear Congruential Generator (LCG) to ensure reproducibility:

```typescript
class SeededRandom {
  private seed: number;
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
}
```

### Precision-Aware Comparison

Uses `isEqual()` from `@shared/lib/precision`:

```typescript
function isEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) < epsilon;
}
```

### Contract Validation

All inputs and outputs are validated with Zod schemas:

```typescript
const request = ReserveOptimizationRequestSchema.parse(generatedRequest);
const response = ReserveOptimizationResponseSchema.parse(engineOutput);
```

## Related Files

- `shared/contracts/reserve-engine.contract.ts` - Reserve engine API contract
- `shared/lib/precision.ts` - Precision utilities
- `client/src/core/reserves/ReserveEngine.ts` - Reserve engine implementation
- `tests/utils/golden-dataset.ts` - Golden dataset utilities (general purpose)

## Support

For issues or questions:
1. Check this README
2. Review script help text (`--help`)
3. Examine existing fixtures in `tests/fixtures/golden-datasets/reserve-engine-v1/`
4. Consult `shared/contracts/reserve-engine.contract.ts` for contract details
