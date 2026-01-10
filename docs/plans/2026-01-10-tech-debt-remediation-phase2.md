# Technical Debt Remediation Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Reduce technical debt score from 650 to <450 by splitting the
monolithic schema, improving type safety, and strengthening quality gates.

**Architecture:** Incremental refactoring using barrel file pattern for backward
compatibility. Each task follows TDD cycle (RED-GREEN-REFACTOR) with frequent
commits. Schema split maintains all existing imports via re-exports.

**Tech Stack:** TypeScript, Drizzle ORM, Zod validation, ESLint, Vitest tests

---

## Phase Overview

| Batch | Focus         | Tasks   | Estimated Time |
| ----- | ------------- | ------- | -------------- |
| A     | Schema Split  | 4 tasks | 2 hours        |
| B     | Type Safety   | 3 tasks | 1.5 hours      |
| C     | Quality Gates | 3 tasks | 1 hour         |

**CHECKPOINT** after each batch for review.

---

## Batch A: Schema Split

**Problem:** `shared/schema.ts` is 3,108 lines - a God file causing:

- Merge conflicts
- Cognitive overload
- Slow IDE performance

**Solution:** Split into domain modules with barrel file re-exports.

### Task A1: Create Fund Schema Module

**Files:**

- Create: `shared/schema/fund.ts`
- Modify: `shared/schema.ts` (add re-export)
- Test: TypeScript compilation

**Step 1: Identify fund-related tables in schema.ts**

```bash
grep -n "export const fund" shared/schema.ts | head -20
```

Expected: Lines containing fund table definitions (~100-200 lines)

**Step 2: Create fund schema module**

Location: `shared/schema/fund.ts`

```typescript
/**
 * Fund-related database schemas
 *
 * Contains: funds, fundConfigs, fundSnapshots, fundEvents
 *
 * @module shared/schema/fund
 */

import {
  pgTable,
  serial,
  text,
  decimal,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

// ============================================================================
// FUNDS TABLE
// ============================================================================

export const funds = pgTable('funds', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  size: decimal('size', { precision: 15, scale: 2 }).notNull(),
  deployedCapital: decimal('deployed_capital', {
    precision: 15,
    scale: 2,
  }).default('0'),
  managementFee: decimal('management_fee', {
    precision: 5,
    scale: 4,
  }).notNull(),
  carryPercentage: decimal('carry_percentage', {
    precision: 5,
    scale: 4,
  }).notNull(),
  vintageYear: integer('vintage_year').notNull(),
  establishmentDate: text('establishment_date'),
  status: text('status').notNull().default('active'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Zod schemas
export const insertFundSchema = createInsertSchema(funds);
export const selectFundSchema = createSelectSchema(funds);

// Types
export type Fund = typeof funds.$inferSelect;
export type NewFund = typeof funds.$inferInsert;

// ============================================================================
// FUND CONFIGS TABLE (if exists in schema.ts)
// ============================================================================

// TODO: Extract fundConfigs table definition from schema.ts
// Follow same pattern as funds table above

// ============================================================================
// FUND SNAPSHOTS TABLE (if exists)
// ============================================================================

// TODO: Extract fundSnapshots table definition
```

**Step 3: Add re-export to main schema.ts**

Location: `shared/schema.ts:1` (add at top)

```typescript
// Domain-specific schema modules (barrel re-exports for backward compatibility)
export * from './schema/fund';
```

**Step 4: Verify TypeScript compilation**

```bash
npm run check
```

Expected output:

```
✅ No new TypeScript errors introduced
```

**Step 5: Commit**

```bash
git add shared/schema/fund.ts shared/schema.ts
git commit -m "refactor(schema): extract fund tables to dedicated module"
```

---

### Task A2: Create Portfolio Schema Module

**Files:**

- Create: `shared/schema/portfolio.ts`
- Modify: `shared/schema.ts` (add re-export)
- Test: TypeScript compilation

**Step 1: Identify portfolio-related tables**

```bash
grep -n "export const portfolio\|export const company\|export const investment" shared/schema.ts | head -30
```

**Step 2: Create portfolio schema module**

Location: `shared/schema/portfolio.ts`

```typescript
/**
 * Portfolio and Company database schemas
 *
 * Contains: portfolios, companies, investments, valuations
 *
 * @module shared/schema/portfolio
 */

import {
  pgTable,
  serial,
  text,
  decimal,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { relations } from 'drizzle-orm';
import { funds } from './fund';

// ============================================================================
// PORTFOLIOS TABLE
// ============================================================================

export const portfolios = pgTable('portfolios', {
  id: serial('id').primaryKey(),
  fundId: integer('fund_id').references(() => funds.id),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ============================================================================
// COMPANIES TABLE
// ============================================================================

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  portfolioId: integer('portfolio_id').references(() => portfolios.id),
  name: text('name').notNull(),
  stage: text('stage').notNull(),
  sector: text('sector'),
  // ... (extract full definition from schema.ts)
});

// Zod schemas
export const insertPortfolioSchema = createInsertSchema(portfolios);
export const selectPortfolioSchema = createSelectSchema(portfolios);
export const insertCompanySchema = createInsertSchema(companies);
export const selectCompanySchema = createSelectSchema(companies);

// Types
export type Portfolio = typeof portfolios.$inferSelect;
export type NewPortfolio = typeof portfolios.$inferInsert;
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
```

**Step 3: Add re-export to main schema.ts**

Location: `shared/schema.ts:2`

```typescript
export * from './schema/portfolio';
```

**Step 4: Verify TypeScript compilation**

```bash
npm run check
```

Expected: ✅ No new TypeScript errors

**Step 5: Commit**

```bash
git add shared/schema/portfolio.ts shared/schema.ts
git commit -m "refactor(schema): extract portfolio/company tables to dedicated module"
```

---

### Task A3: Create Scenario Schema Module

**Files:**

- Create: `shared/schema/scenario.ts`
- Modify: `shared/schema.ts`
- Test: TypeScript compilation

**Step 1: Identify scenario-related tables**

```bash
grep -n "export const scenario\|export const simulation\|export const monteCarlo" shared/schema.ts | head -20
```

**Step 2: Create scenario schema module**

Location: `shared/schema/scenario.ts`

```typescript
/**
 * Scenario and Simulation database schemas
 *
 * Contains: scenarios, simulations, monteCarloResults
 *
 * @module shared/schema/scenario
 */

import {
  pgTable,
  serial,
  text,
  decimal,
  integer,
  timestamp,
  jsonb,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { funds } from './fund';

// ============================================================================
// SCENARIOS TABLE
// ============================================================================

export const scenarios = pgTable('scenarios', {
  id: serial('id').primaryKey(),
  fundId: integer('fund_id').references(() => funds.id),
  name: text('name').notNull(),
  description: text('description'),
  config: jsonb('config'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ... (extract full definitions)

// Zod schemas and types
export const insertScenarioSchema = createInsertSchema(scenarios);
export const selectScenarioSchema = createSelectSchema(scenarios);
export type Scenario = typeof scenarios.$inferSelect;
export type NewScenario = typeof scenarios.$inferInsert;
```

**Step 3: Add re-export**

```typescript
export * from './schema/scenario';
```

**Step 4: Verify and commit**

```bash
npm run check && \
git add shared/schema/scenario.ts shared/schema.ts && \
git commit -m "refactor(schema): extract scenario/simulation tables to dedicated module"
```

---

### Task A4: Create Schema Index and Verify All Imports

**Files:**

- Create: `shared/schema/index.ts`
- Modify: `shared/schema.ts` (convert to barrel)
- Test: Full test suite

**Step 1: Create schema index**

Location: `shared/schema/index.ts`

```typescript
/**
 * Database Schema Index
 *
 * Re-exports all schema modules for unified imports.
 * Maintains backward compatibility with existing imports.
 *
 * @module shared/schema
 */

export * from './fund';
export * from './portfolio';
export * from './scenario';

// Keep any schemas that haven't been extracted yet
// These will be moved in future iterations
```

**Step 2: Update main schema.ts to minimal barrel**

After extracting all major tables, `shared/schema.ts` should become:

```typescript
/**
 * Database Schema (Barrel Export)
 *
 * This file re-exports all schema modules for backward compatibility.
 * Import directly from specific modules for new code:
 *   import { funds } from '@shared/schema/fund';
 *
 * @module shared/schema
 */

// Re-export all domain modules
export * from './schema/fund';
export * from './schema/portfolio';
export * from './schema/scenario';

// ============================================================================
// REMAINING TABLES (to be extracted in future iterations)
// ============================================================================

// Keep any tables that haven't been moved yet
// ... (remaining ~2000 lines until fully split)
```

**Step 3: Verify all imports still work**

```bash
# TypeScript check
npm run check

# Run tests to verify no regressions
npm test -- --run --project=server tests/unit/
```

Expected:

```
✅ No new TypeScript errors introduced
✓ Tests pass (no import errors)
```

**Step 4: Commit**

```bash
git add shared/schema/ shared/schema.ts
git commit -m "refactor(schema): add schema index, convert main file to barrel export"
```

---

**CHECKPOINT A:** Schema split complete. Review before continuing.

**Verification:**

- [ ] TypeScript compiles without new errors
- [ ] All tests pass
- [ ] No import breakages
- [ ] schema.ts reduced by ~500+ lines

---

## Batch B: Type Safety

**Problem:** 154 `any` types violate TypeScript strict mode policy.

**Solution:** Replace high-impact `any` types with proper types, prioritizing
financial calculation paths.

### Task B1: Fix `any` Types in Enhanced Fund Model (Top 10)

**Files:**

- Modify: `client/src/models/enhanced-fund-model.ts`
- Test: TypeScript compilation

**Step 1: Identify all `any` usages**

```bash
grep -n ": any\|as any" client/src/models/enhanced-fund-model.ts | head -15
```

**Step 2: Analyze each `any` and determine proper type**

For each `any` found, determine:

1. What data flows through this variable?
2. What type should it be?
3. Does a type already exist in `@shared/types`?

**Step 3: Replace top 10 `any` types**

Example replacements:

```typescript
// BEFORE (line ~45)
private config: any;

// AFTER
import type { FundConfig } from '@shared/types/fund';
private config: FundConfig;
```

```typescript
// BEFORE (line ~78)
processData(data: any): void {
  // ...
}

// AFTER
import type { PeriodResult } from '@shared/schemas/fund-model';
processData(data: PeriodResult[]): void {
  // ...
}
```

```typescript
// BEFORE (line ~120)
const result = calculation as any;

// AFTER
import type { CalculationResult } from './types';
const result = calculation as CalculationResult;
```

**Step 4: Verify compilation**

```bash
npm run check
```

Expected: ✅ No new errors, 10 fewer `any` usages

**Step 5: Commit**

```bash
git add client/src/models/enhanced-fund-model.ts
git commit -m "fix(types): replace 10 any types in enhanced-fund-model"
```

---

### Task B2: Fix `any` Types in Cohort Engine (Top 10)

**Files:**

- Modify: `client/src/engines/enhanced-cohort-engine.ts`
- Test: TypeScript compilation

**Step 1: Identify `any` usages**

```bash
grep -n ": any\|as any" client/src/engines/enhanced-cohort-engine.ts | head -15
```

**Step 2: Analyze and determine proper types**

Common patterns in cohort engines:

- `cohortData: any` → `cohortData: CohortData`
- `metrics: any` → `metrics: CohortMetrics`
- `result as any` → `result as CohortResult`

**Step 3: Replace top 10 `any` types**

```typescript
// BEFORE
function processCohort(data: any): any {
  // ...
}

// AFTER
import type { CohortInput, CohortOutput } from '@/core/cohorts/types';
function processCohort(data: CohortInput): CohortOutput {
  // ...
}
```

**Step 4: Verify and commit**

```bash
npm run check && \
git add client/src/engines/enhanced-cohort-engine.ts && \
git commit -m "fix(types): replace 10 any types in enhanced-cohort-engine"
```

---

### Task B3: Replace `parseFloat` in Financial Paths (Top 10)

**Files:**

- Modify: `server/services/variance-tracking.ts` (13 occurrences)
- Test: Existing variance tracking tests

**Step 1: Identify parseFloat usages**

```bash
grep -n "parseFloat" server/services/variance-tracking.ts
```

**Step 2: Write test for precision**

Location: `tests/unit/services/variance-tracking-precision.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { calculateVariance } from '../../../server/services/variance-tracking';
import Decimal from 'decimal.js';

describe('Variance Tracking Precision', () => {
  it('maintains precision with large numbers', () => {
    // This test would fail with parseFloat due to precision loss
    const actual = '123456789.123456789';
    const expected = '123456789.123456780';

    const variance = calculateVariance(actual, expected);

    // Should detect the small difference (9 vs 0 in last digit)
    expect(variance).not.toBe(0);
  });

  it('handles currency calculations without floating point errors', () => {
    // Classic floating point issue: 0.1 + 0.2 !== 0.3
    const amounts = ['0.1', '0.2'];
    const expected = '0.3';

    const total = amounts.reduce(
      (sum, amt) => sum.plus(new Decimal(amt)),
      new Decimal(0)
    );

    expect(total.toString()).toBe(expected);
  });
});
```

**Step 3: Run test to see current behavior**

```bash
npm test -- variance-tracking-precision.test.ts
```

**Step 4: Replace parseFloat with Decimal.js**

```typescript
// BEFORE
const value = parseFloat(inputString);
const result = value * 0.08;

// AFTER
import Decimal from 'decimal.js';

const value = new Decimal(inputString);
const result = value.mul('0.08');
```

**Step 5: Verify tests pass and commit**

```bash
npm test -- variance-tracking && \
git add server/services/variance-tracking.ts tests/unit/services/variance-tracking-precision.test.ts && \
git commit -m "fix(precision): replace parseFloat with Decimal.js in variance tracking"
```

---

**CHECKPOINT B:** Type safety improved. Review before continuing.

**Verification:**

- [ ] 20 fewer `any` types
- [ ] 10 fewer `parseFloat` in financial paths
- [ ] All tests pass
- [ ] TypeScript compiles

---

## Batch C: Quality Gates

**Problem:** 107 `eslint-disable` statements bypass quality rules.

**Solution:** Remove unnecessary disables, document remaining ones.

### Task C1: Audit eslint-disable Statements

**Files:**

- Create: `docs/tech-debt/eslint-disable-audit.md`
- No code changes (audit only)

**Step 1: Generate full list**

```bash
grep -rn "eslint-disable" --include="*.ts" --include="*.tsx" | \
  grep -v node_modules | \
  grep -v ".test." > /tmp/eslint-disables.txt

wc -l /tmp/eslint-disables.txt
```

**Step 2: Categorize each disable**

Create audit document:

```markdown
# ESLint Disable Audit

**Date:** 2026-01-10 **Total disables:** 107

## Categories

### REMOVE (unnecessary) - 45 items

| File                   | Line | Rule                               | Reason to Remove    |
| ---------------------- | ---- | ---------------------------------- | ------------------- |
| server/routes/funds.ts | 45   | @typescript-eslint/no-explicit-any | Can use proper type |
| ...                    | ...  | ...                                | ...                 |

### KEEP (necessary) - 32 items

| File                      | Line | Rule                            | Justification                           |
| ------------------------- | ---- | ------------------------------- | --------------------------------------- |
| server/types/express.d.ts | 1    | @typescript-eslint/no-namespace | Express augmentation requires namespace |
| ...                       | ...  | ...                             | ...                                     |

### REFACTOR (requires larger change) - 30 items

| File                         | Line | Rule                               | Required Change                       |
| ---------------------------- | ---- | ---------------------------------- | ------------------------------------- |
| client/src/lib/legacy-api.ts | 12   | @typescript-eslint/no-explicit-any | Needs type definitions for legacy API |
| ...                          | ...  | ...                                | ...                                   |
```

**Step 3: Commit audit**

```bash
git add docs/tech-debt/eslint-disable-audit.md
git commit -m "docs(tech-debt): audit eslint-disable statements"
```

---

### Task C2: Remove Unnecessary eslint-disable (Batch 1 - 20 items)

**Files:**

- Modify: Various files from audit
- Test: `npm run lint`

**Step 1: Select first 20 REMOVE items from audit**

Pick items where the fix is straightforward (< 5 minutes each).

**Step 2: Fix each item**

For each `eslint-disable`:

```typescript
// BEFORE
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = response.data;

// AFTER
interface ApiResponse {
  data: FundData;
}
const data: FundData = response.data;
```

**Step 3: Verify lint passes**

```bash
npm run lint
```

Expected: No new warnings

**Step 4: Commit**

```bash
git add -A
git commit -m "fix(lint): remove 20 unnecessary eslint-disable statements"
```

---

### Task C3: Add Justification Comments to Remaining Disables

**Files:**

- Modify: Files with KEEP items from audit
- Test: `npm run lint`

**Step 1: Add justification to each remaining disable**

```typescript
// BEFORE
// eslint-disable-next-line @typescript-eslint/no-namespace

// AFTER
// eslint-disable-next-line @typescript-eslint/no-namespace -- Express module augmentation requires namespace declaration
```

**Step 2: Verify and commit**

```bash
npm run lint && \
git add -A && \
git commit -m "docs(lint): add justification comments to remaining eslint-disable"
```

---

**CHECKPOINT C:** Quality gates strengthened. Final review.

**Verification:**

- [ ] 20 eslint-disable removed
- [ ] Remaining disables have justification comments
- [ ] `npm run lint` passes with 0 warnings
- [ ] Audit document created

---

## Execution Summary

### Success Metrics

| Metric                   | Before | After  | Target |
| ------------------------ | ------ | ------ | ------ |
| schema.ts lines          | 3,108  | ~2,500 | <2,000 |
| `any` types              | 154    | ~130   | <100   |
| `parseFloat` (financial) | 114    | ~100   | <50    |
| eslint-disable           | 107    | ~85    | <50    |
| Debt Score               | 650    | ~500   | <450   |

### Commit History (Expected)

```
refactor(schema): extract fund tables to dedicated module
refactor(schema): extract portfolio/company tables to dedicated module
refactor(schema): extract scenario/simulation tables to dedicated module
refactor(schema): add schema index, convert main file to barrel export
fix(types): replace 10 any types in enhanced-fund-model
fix(types): replace 10 any types in enhanced-cohort-engine
fix(precision): replace parseFloat with Decimal.js in variance tracking
docs(tech-debt): audit eslint-disable statements
fix(lint): remove 20 unnecessary eslint-disable statements
docs(lint): add justification comments to remaining eslint-disable
```

---

## Execution Options

**Plan saved to:** `docs/plans/2026-01-10-tech-debt-remediation-phase2.md`

**Two execution approaches:**

**1. Subagent-Driven (this session)**

- Dispatch fresh subagent per task
- Review between batches (A, B, C)
- Fast iteration with oversight

**2. Parallel Session (separate)**

- Open new Claude Code session
- Use executing-plans skill
- Batch execution with checkpoints

**Which approach would you like?**
