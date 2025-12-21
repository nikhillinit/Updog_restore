# Test Fixture Generator

## Overview

This skill defines patterns and strategies for generating test fixtures, factory
functions, and golden datasets. It ensures consistent, maintainable test data
across the codebase while reducing boilerplate and preventing fixture drift.

**Core principle**: Fixtures should be generated via factories, not hard-coded.
Golden datasets should be version-controlled and schema-validated.

## When This Skill Activates

- Creating test data for a new module or feature
- Refactoring existing hard-coded test data into factories
- Generating golden datasets for validation (XIRR, waterfall, etc.)
- Building stress test data generators
- Syncing fixtures with schema changes

## Fixture Hierarchy

```
                    +------------------+
                    | Golden Datasets  |  Validated against external source
                    | (Excel, known    |  Version controlled
                    | correct values)  |  Read-only in tests
                    +------------------+
                           |
                    +------------------+
                    | Factory Functions|  Sensible defaults
                    | createTestFund() |  Override-friendly
                    | createTestLot()  |  Type-safe
                    +------------------+
                           |
                    +------------------+
                    | Sample Datasets  |  Pre-built variations
                    | SAMPLE_FUNDS[]   |  Edge cases included
                    | SAMPLE_LOTS[]    |  Realistic scenarios
                    +------------------+
                           |
                    +------------------+
                    | Batch Generators |  Stress testing
                    | generateBatch()  |  Configurable count
                    | generateRandom() |  Seeded randomness
                    +------------------+
```

## Factory Function Pattern

### Basic Factory

```typescript
/**
 * Create a test [Entity] with sensible defaults
 *
 * @param overrides - Partial properties to override defaults
 * @returns Complete test entity
 *
 * @example
 * const fund = createTestFund({ name: 'Growth Fund', size: '100000000.00' });
 */
export function createTestFund(overrides?: Partial<TestFund>): TestFund {
  const now = new Date();
  return {
    // Required fields with sensible defaults
    id: Math.floor(Math.random() * 10000) + 1,
    name: `Test Fund ${randomUUID().slice(0, 8)}`,
    size: '50000000.00',
    managementFee: '0.0200',
    carryPercentage: '0.2000',
    vintageYear: 2024,
    status: 'active',
    isActive: true,
    createdAt: now,
    // Spread overrides last to allow customization
    ...overrides,
  };
}
```

### Factory with Relationships

```typescript
/**
 * Create a test investment with fund relationship
 */
export function createTestInvestment(
  overrides?: Partial<TestInvestment>,
  options?: { fund?: TestFund }
): TestInvestment {
  const fund = options?.fund ?? createTestFund();

  return {
    id: Math.floor(Math.random() * 10000) + 1,
    fundId: fund.id,
    companyId: 1,
    investmentDate: new Date('2024-03-15'),
    amount: '1000000.00',
    round: 'Series A',
    ...overrides,
  };
}
```

### Factory with Variants

```typescript
/**
 * Create test funds with predefined profiles
 */
export const FundProfiles = {
  earlyStage: () =>
    createTestFund({
      name: 'Early Stage Fund',
      size: '25000000.00',
      managementFee: '0.0250',
    }),

  growth: () =>
    createTestFund({
      name: 'Growth Fund',
      size: '100000000.00',
      managementFee: '0.0200',
    }),

  opportunity: () =>
    createTestFund({
      name: 'Opportunity Fund',
      size: '50000000.00',
      managementFee: '0.0150',
    }),
};
```

## Golden Dataset Pattern

Golden datasets are reference data validated against an external source of truth
(Excel, known calculations, etc.).

### Structure

```
tests/fixtures/golden-datasets/
  xirr/
    basic-flows.json         # Simple positive/negative flows
    edge-cases.json          # Zero flows, single flow, etc.
    excel-validated.json     # Verified against Excel XIRR
  waterfall/
    american-basic.json      # Standard American waterfall
    european-basic.json      # Standard European waterfall
    clawback-scenarios.json  # Clawback edge cases
```

### Golden Dataset Format

```typescript
// tests/fixtures/golden-datasets/xirr/excel-validated.ts
export interface XIRRGoldenCase {
  id: string;
  description: string;
  flows: Array<{ date: string; amount: number }>;
  expectedIRR: number;
  tolerance: number;
  source: 'excel' | 'manual' | 'external';
  validatedAt: string;
}

export const XIRR_GOLDEN_CASES: XIRRGoldenCase[] = [
  {
    id: 'xirr-001',
    description: 'Basic investment with single exit',
    flows: [
      { date: '2020-01-01', amount: -1000000 },
      { date: '2024-01-01', amount: 2000000 },
    ],
    expectedIRR: 0.189207,
    tolerance: 1e-7,
    source: 'excel',
    validatedAt: '2024-01-15',
  },
  // ... more cases
];
```

### Using Golden Datasets

```typescript
import { XIRR_GOLDEN_CASES } from '@/tests/fixtures/golden-datasets/xirr';
import { assertIRREquals } from '@/tests/setup/test-infrastructure';

describe('XIRR Golden Tests', () => {
  XIRR_GOLDEN_CASES.forEach((goldenCase) => {
    it(`should match Excel: ${goldenCase.description}`, () => {
      const result = calculateXIRR(goldenCase.flows);
      assertIRREquals(result, goldenCase.expectedIRR, goldenCase.tolerance);
    });
  });
});
```

## Batch Generator Pattern

For stress testing and performance validation:

```typescript
/**
 * Generate a batch of entities for stress testing
 *
 * @param count - Number of entities to generate
 * @param options - Generation options
 */
export function generateFundBatch(
  count: number,
  options?: {
    vintageRange?: [number, number];
    sizeRange?: [number, number];
    seed?: number;
  }
): TestFund[] {
  const rng = options?.seed ? seededRandom(options.seed) : Math.random;
  const [minVintage, maxVintage] = options?.vintageRange ?? [2020, 2024];
  const [minSize, maxSize] = options?.sizeRange ?? [10_000_000, 100_000_000];

  return Array.from({ length: count }, (_, i) => {
    const vintage = minVintage + Math.floor(rng() * (maxVintage - minVintage));
    const size = minSize + Math.floor(rng() * (maxSize - minSize));

    return createTestFund({
      id: i + 1,
      name: `Batch Fund ${i + 1}`,
      vintageYear: vintage,
      size: size.toFixed(2),
    });
  });
}
```

### Seeded Random for Reproducibility

```typescript
/**
 * Create a seeded random number generator
 * Essential for reproducible stress tests
 */
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Usage
const funds = generateFundBatch(1000, { seed: 12345 });
// Always produces same 1000 funds
```

## Schema Synchronization

Fixtures must stay synchronized with Zod/Drizzle schemas:

### Validation Helper

```typescript
import { fundSchema } from '@shared/schema';

/**
 * Validate fixture against schema
 * Use in CI to catch drift
 */
export function validateFixture<T>(
  fixture: unknown,
  schema: z.ZodType<T>,
  context: string
): T {
  const result = schema.safeParse(fixture);
  if (!result.success) {
    throw new Error(
      `Fixture validation failed for ${context}:\n` +
        result.error.issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n')
    );
  }
  return result.data;
}

// Usage in factory
export function createTestFund(overrides?: Partial<TestFund>): TestFund {
  const fixture = { /* ... defaults ... */ ...overrides };
  return validateFixture(fixture, fundSchema, 'createTestFund');
}
```

### Schema Drift Detection

```typescript
// tests/fixtures/schema-sync.test.ts
import { SAMPLE_FUNDS, SAMPLE_INVESTMENTS } from './portfolio-fixtures';
import { fundSchema, investmentSchema } from '@shared/schema';

describe('Fixture Schema Sync', () => {
  it('SAMPLE_FUNDS match fundSchema', () => {
    SAMPLE_FUNDS.forEach((fund, i) => {
      expect(() => fundSchema.parse(fund)).not.toThrow();
    });
  });

  it('SAMPLE_INVESTMENTS match investmentSchema', () => {
    SAMPLE_INVESTMENTS.forEach((inv, i) => {
      expect(() => investmentSchema.parse(inv)).not.toThrow();
    });
  });
});
```

## Financial Fixture Patterns

For VC fund modeling, use these domain-specific patterns:

### Cash Flow Fixtures

```typescript
export interface CashFlowFixture {
  date: Date;
  amount: number; // Negative = outflow, Positive = inflow
  type: 'capital_call' | 'distribution' | 'fee' | 'carry';
}

export function createCashFlowSeries(config: {
  startDate: Date;
  initialInvestment: number;
  holdingPeriodYears: number;
  exitMultiple: number;
  managementFeeRate?: number;
}): CashFlowFixture[] {
  const flows: CashFlowFixture[] = [];

  // Initial investment
  flows.push({
    date: config.startDate,
    amount: -config.initialInvestment,
    type: 'capital_call',
  });

  // Management fees (if applicable)
  if (config.managementFeeRate) {
    for (let year = 0; year < config.holdingPeriodYears; year++) {
      const feeDate = new Date(config.startDate);
      feeDate.setFullYear(feeDate.getFullYear() + year);
      flows.push({
        date: feeDate,
        amount: -config.initialInvestment * config.managementFeeRate,
        type: 'fee',
      });
    }
  }

  // Exit
  const exitDate = new Date(config.startDate);
  exitDate.setFullYear(exitDate.getFullYear() + config.holdingPeriodYears);
  flows.push({
    date: exitDate,
    amount: config.initialInvestment * config.exitMultiple,
    type: 'distribution',
  });

  return flows;
}
```

### Waterfall Fixtures

```typescript
export const WaterfallScenarios = {
  americanBasic: () => ({
    type: 'AMERICAN' as const,
    hurdleRate: 0.08,
    carryPercentage: 0.2,
    catchUp: true,
    catchUpPercentage: 1.0,
  }),

  europeanWithClawback: () => ({
    type: 'EUROPEAN' as const,
    hurdleRate: 0.08,
    carryPercentage: 0.2,
    clawbackEnabled: true,
    escrowPercentage: 0.3,
  }),

  noHurdle: () => ({
    type: 'AMERICAN' as const,
    hurdleRate: 0,
    carryPercentage: 0.2,
    catchUp: false,
  }),
};
```

## Anti-Patterns

### Hard-Coded Test Data (BAD)

```typescript
// BAD: Hard-coded, inflexible, hard to maintain
const fund = {
  id: 1,
  name: 'Test Fund',
  size: '50000000.00',
  // ... 20 more fields
};
```

### Factory Without Defaults (BAD)

```typescript
// BAD: Requires all fields, defeats purpose of factory
export function createTestFund(data: TestFund): TestFund {
  return data;
}
```

### Unseeded Random Data (BAD)

```typescript
// BAD: Non-deterministic, can't reproduce failures
export function generateRandomFunds(count: number) {
  return Array.from({ length: count }, () => ({
    id: Math.random(), // Different every run!
    // ...
  }));
}
```

### Fixtures Without Schema Validation (BAD)

```typescript
// BAD: Can drift from actual schema
export const SAMPLE_FUNDS = [
  { id: 1, name: 'Fund', oldField: 'value' }, // oldField no longer exists!
];
```

## Integration with Agents

### test-scaffolder

When scaffolding tests, automatically generate fixture file with:

- Factory function for primary entity
- Sample dataset with 3-5 variations
- Batch generator for stress tests

### test-repair

When fixing tests due to schema changes:

- Update factory defaults
- Re-validate sample datasets against schema
- Flag golden datasets that may need re-validation

### schema-drift-checker

When schema changes detected:

- Run fixture validation tests
- Report any fixtures that no longer match schema
- Suggest factory updates

## Checklist for New Fixtures

- [ ] Factory function with sensible defaults
- [ ] Overrides parameter for customization
- [ ] Type-safe (returns typed entity, not `any`)
- [ ] UUID for string IDs (avoid collisions)
- [ ] Random numeric IDs in safe range (1-10000)
- [ ] Dates use `new Date()` or fixed ISO strings
- [ ] BigInt fields use `BigInt()` constructor
- [ ] Decimal strings use proper precision ('50000000.00')
- [ ] Sample dataset with edge cases
- [ ] Schema validation in CI
- [ ] Seeded batch generator for stress tests
