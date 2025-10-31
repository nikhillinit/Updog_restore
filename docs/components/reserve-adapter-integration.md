# RESERVE ADAPTER INTEGRATION ANALYSIS

**Date**: 2025-01-07 **Status**: Phase 0 Complete - Integration Strategy Defined
**Risk Level**: LOW (wrapper approach prevents breaking changes)

---

## 🎯 **EXECUTIVE SUMMARY**

The repository contains a **comprehensive 245-line reserve adapter** at
[client/src/adapters/reserves-adapter.ts](client/src/adapters/reserves-adapter.ts)
that already handles:

- ✅ Unit conversions (dollars ↔ cents, percentages ↔ basis points)
- ✅ Data normalization (multiple field name variations)
- ✅ Validation helpers
- ✅ Bidirectional conversion (existing format ↔ reserves v1.1 format)

**CRITICAL FINDING**: The proposed plan to create a **NEW** `reserve-adapter.ts`
would duplicate existing infrastructure and break existing reserve calculations.

**RECOMMENDATION**: Create a **thin wrapper** (`wizard-reserve-bridge.ts`) that
translates between wizard context and existing adapter.

---

## 📊 **EXISTING ADAPTER ANALYSIS**

### **Unit Conventions**

| Value Type  | Wizard Format            | Adapter Format             | Conversion         |
| ----------- | ------------------------ | -------------------------- | ------------------ |
| Money       | Dollars (float)          | Cents (integer)            | `dollars * 100`    |
| MOIC        | Decimal (e.g., 2.5)      | Basis points (e.g., 25000) | `moic * 100 * 100` |
| Percentages | Decimal 0-1 (e.g., 0.35) | Basis points (e.g., 3500)  | `percent * 10000`  |
| Ownership   | Decimal 0-1 or 0-100     | Decimal 0-1                | Normalize if > 1   |

**Key Functions**:

```typescript
// Money conversion
export function dollarsToCents(dollars: number | undefined | null): number {
  if (dollars == null || isNaN(dollars)) return 0;
  return Math.floor(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

// Percentage to basis points
export function percentToBps(percent: number | undefined | null): number {
  if (percent == null || isNaN(percent)) return 0;
  return Math.round(percent * 100);
}
```

**Critical Insight**: The existing adapter uses **BASIS POINTS** for
percentages/multiples, not decimals. This is important for precision in
financial calculations.

---

### **Input Format** (Adapter Expects)

```typescript
interface Company {
  id: string;
  name: string;
  invested_cents: number; // ← cents, not dollars
  exit_moic_bps: number; // ← basis points, not decimal
  ownership_pct: number; // ← 0-1 decimal
  stage?: string;
  sector?: string;
  metadata?: {
    source: string;
    original_id?: string;
  };
}

interface ReservesInput {
  companies: Company[];
  fund_size_cents: number; // ← cents, not dollars
  quarter_index: number;
}

interface ReservesConfig {
  reserve_bps: number; // ← basis points, not decimal
  remain_passes: number;
  cap_policy: {
    kind: 'fixed_percent' | 'stage_based';
    default_percent: number;
    stage_caps?: Record<string, number>;
  };
  audit_level: 'basic' | 'detailed' | 'debug';
}
```

---

### **Output Format** (Adapter Returns)

```typescript
interface AdaptedReservesResult {
  allocations: Array<{
    companyId: string;
    companyName?: string;
    plannedReserve: number; // ← dollars (converted from cents)
    reservePercent: number; // ← percentage of initial investment
    reason: string;
  }>;
  remainingReserve: number; // ← dollars (converted from cents)
  totalReserve: number; // ← dollars (converted from cents)
  companiesFunded: number;
  success: boolean;
  errors?: string[];
  warnings?: string[];
}
```

**Critical Insight**: The adapter **already converts back to dollars** in the
output. This means the wizard doesn't need to handle cents at all if we use the
adapter correctly.

---

## 🔀 **WIZARD VS. ADAPTER FORMAT GAP**

### **What `wizard-calculations.ts` Expects** (lines 260-298)

```typescript
async function calculateReserves(
  ctx: ModelingWizardContext
): Promise<ReserveAllocation> {
  const general = ctx.steps.generalInfo;
  const capital = ctx.steps.capitalAllocation;

  // Wizard works in DOLLARS and DECIMALS:
  const fundSize = general.fundSize; // e.g., 50000000 (dollars)
  const reserveRatio = capital.followOnStrategy.reserveRatio; // e.g., 0.35 (decimal)
  const initialCheck = capital.initialCheckSize; // e.g., 500000 (dollars)

  // Generate synthetic portfolio (also in dollars/decimals)
  const portfolio = generateSyntheticPortfolio({
    fundSize,
    initialCheckSize: initialCheck,
    reserveRatio,
  });

  // Expected return format:
  return {
    totalPlanned: 17500000, // dollars
    optimalMOIC: 2.8, // decimal multiple
    companiesSupported: 15,
    avgFollowOnSize: 1166666, // dollars
    allocations: [
      {
        companyId: 'synthetic-0',
        companyName: 'Company A',
        plannedReserve: 1200000, // dollars
        exitMOIC: 3.2, // decimal multiple
      },
    ],
  };
}
```

### **What Existing Adapter Needs**

```typescript
// Input to adapter:
{
  companies: [{
    id: 'synthetic-0',
    name: 'Company A',
    invested_cents: 50000000,      // cents (500000 * 100)
    exit_moic_bps: 32000,          // basis points (3.2 * 100 * 100)
    ownership_pct: 0.15,           // decimal (already correct)
    stage: 'seed',
    sector: 'fintech'
  }],
  fund_size_cents: 5000000000,     // cents (50000000 * 100)
  quarter_index: 42
}

// Config:
{
  reserve_bps: 3500,               // basis points (0.35 * 10000)
  remain_passes: 0,
  cap_policy: {
    kind: 'fixed_percent',
    default_percent: 0.5
  },
  audit_level: 'basic'
}
```

### **Mismatch Summary**

| Field              | Wizard Format       | Adapter Input              | Adapter Output  | Conversion Needed?               |
| ------------------ | ------------------- | -------------------------- | --------------- | -------------------------------- |
| `fundSize`         | Dollars (float)     | Cents (int)                | N/A             | ✅ Yes (multiply by 100)         |
| `reserveRatio`     | Decimal 0-1         | Basis points               | N/A             | ✅ Yes (multiply by 10000)       |
| `initialCheckSize` | Dollars (float)     | Cents (int)                | N/A             | ✅ Yes (multiply by 100)         |
| `exitMOIC`         | Decimal (e.g., 3.2) | Basis points (e.g., 32000) | N/A             | ✅ Yes (multiply by 10000)       |
| `plannedReserve`   | N/A                 | N/A                        | Dollars (float) | ❌ No (adapter already converts) |
| `totalReserve`     | N/A                 | N/A                        | Dollars (float) | ❌ No (adapter already converts) |

---

## 🎯 **INTEGRATION STRATEGY**

### **Option A: Thin Wrapper (RECOMMENDED)**

**Approach**: Create `wizard-reserve-bridge.ts` that translates wizard context
to adapter format and back.

**Architecture**:

```
wizard-calculations.ts
  ↓ (calls)
wizard-reserve-bridge.ts
  ↓ (converts units)
reserves-adapter.ts (existing)
  ↓ (calls)
@shared/types/reserves-v11 (engine)
```

**Implementation**:

**File**: `client/src/lib/wizard-reserve-bridge.ts` (new, ~150 lines)

```typescript
/**
 * Bridge between wizard context and reserves adapter
 * Handles unit conversions and data transformation
 */

import {
  adaptCompany,
  adaptFundToReservesInput,
  adaptReservesConfig,
  adaptReservesResult,
  dollarsToCents,
  percentToBps,
} from '@/adapters/reserves-adapter';
import { calculateReserves } from '@shared/engines/reserves-v11';
import type { ModelingWizardContext } from '@/machines/modeling-wizard.machine';
import type { ReserveAllocation } from '@/lib/wizard-calculations';

/**
 * Convert wizard synthetic portfolio to adapter format
 */
function wizardPortfolioToAdapterFormat(
  portfolio: Array<{
    id: string;
    name: string;
    investedAmount: number; // dollars
    currentValuation: number; // dollars
    currentStage: string;
    ownershipPercent: number; // percentage (0-100)
    sector: string;
  }>
): Array<{
  id: string;
  name: string;
  invested_cents: number;
  exit_moic_bps: number;
  ownership_pct: number;
  stage: string;
  sector: string;
}> {
  return portfolio.map((company) => {
    // Calculate MOIC from invested and current valuation
    const moic =
      company.investedAmount > 0
        ? company.currentValuation / company.investedAmount
        : 1.0;

    return {
      id: company.id,
      name: company.name,
      invested_cents: dollarsToCents(company.investedAmount),
      exit_moic_bps: percentToBps(moic * 100), // Convert 2.5x to 25000 bps
      ownership_pct:
        company.ownershipPercent > 1
          ? company.ownershipPercent / 100
          : company.ownershipPercent,
      stage: company.currentStage,
      sector: company.sector,
    };
  });
}

/**
 * Calculate reserves for wizard context
 * Bridges wizard format (dollars/decimals) with adapter format (cents/bps)
 */
export async function calculateReservesForWizard(
  ctx: ModelingWizardContext,
  portfolio: Array<{
    id: string;
    name: string;
    investedAmount: number;
    currentValuation: number;
    currentStage: string;
    ownershipPercent: number;
    sector: string;
  }>
): Promise<ReserveAllocation> {
  const general = ctx.steps.generalInfo;
  const capital = ctx.steps.capitalAllocation;

  if (!general || !capital) {
    throw new Error(
      'Required wizard data not available for reserve calculation'
    );
  }

  // Convert portfolio to adapter format
  const adapterCompanies = wizardPortfolioToAdapterFormat(portfolio);

  // Build reserves input
  const reservesInput = {
    companies: adapterCompanies,
    fund_size_cents: dollarsToCents(general.fundSize),
    quarter_index: Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 90)), // Simple quarter calc
  };

  // Build reserves config
  const reservesConfig = {
    reserve_bps: percentToBps(capital.followOnStrategy.reserveRatio * 100),
    remain_passes: 0,
    cap_policy: {
      kind: 'fixed_percent' as const,
      default_percent: 0.5, // 50% max reserve per company
    },
    audit_level: 'basic' as const,
  };

  // Call reserves engine via adapter
  const result = await calculateReserves(reservesInput, reservesConfig);

  // Create company map for adapter result conversion
  const companiesMap = new Map(
    portfolio.map((c) => [
      c.id,
      {
        id: c.id,
        name: c.name,
        investedAmount: c.investedAmount,
      },
    ])
  );

  // Adapter already converts output to dollars
  const adaptedResult = adaptReservesResult(result, companiesMap);

  if (!adaptedResult.success) {
    throw new Error(
      `Reserve calculation failed: ${adaptedResult.errors?.join(', ')}`
    );
  }

  // Transform to wizard format
  return {
    totalPlanned: adaptedResult.totalReserve,
    optimalMOIC: calculateOptimalMOIC(adaptedResult.allocations, portfolio),
    companiesSupported: adaptedResult.companiesFunded,
    avgFollowOnSize:
      adaptedResult.companiesFunded > 0
        ? adaptedResult.totalReserve / adaptedResult.companiesFunded
        : 0,
    allocations: adaptedResult.allocations
      .map((alloc) => {
        const company = companiesMap.get(alloc.companyId);
        const currentValuation =
          portfolio.find((p) => p.id === alloc.companyId)?.currentValuation ||
          0;
        const investedAmount = company?.investedAmount || 0;
        const totalInvested = investedAmount + alloc.plannedReserve;
        const exitMOIC =
          totalInvested > 0 ? currentValuation / totalInvested : 0;

        return {
          companyId: alloc.companyId,
          companyName: alloc.companyName || company?.name || 'Unknown',
          plannedReserve: alloc.plannedReserve,
          exitMOIC,
        };
      })
      .sort((a, b) => b.exitMOIC - a.exitMOIC), // Sort by exit MOIC descending
  };
}

/**
 * Calculate optimal MOIC from allocations
 */
function calculateOptimalMOIC(
  allocations: Array<{ plannedReserve: number; companyId: string }>,
  portfolio: Array<{
    id: string;
    investedAmount: number;
    currentValuation: number;
  }>
): number {
  let totalInvested = 0;
  let totalValue = 0;

  for (const alloc of allocations) {
    const company = portfolio.find((p) => p.id === alloc.companyId);
    if (company) {
      const invested = company.investedAmount + alloc.plannedReserve;
      totalInvested += invested;
      totalValue += company.currentValuation;
    }
  }

  return totalInvested > 0 ? totalValue / totalInvested : 0;
}
```

**Pros**:

- ✅ Zero breaking changes to existing adapter
- ✅ Wizard remains in dollars/decimals (natural format)
- ✅ Adapter remains in cents/bps (precision format)
- ✅ Clear separation of concerns
- ✅ Easy to test (mock bridge, not adapter)

**Cons**:

- ⚠️ One more layer of indirection
- ⚠️ Need to maintain unit conversions

**Effort**: 3-4 hours

---

### **Option B: Direct Adapter Usage (NOT RECOMMENDED)**

**Approach**: Modify `wizard-calculations.ts` to work directly with adapter
format (cents/bps).

**Pros**:

- ✅ No bridge layer

**Cons**:

- ❌ Wizard code becomes harder to read (`fund_size_cents` everywhere)
- ❌ Breaking change if adapter format changes
- ❌ Mixing concerns (wizard shouldn't care about cents)

**Effort**: 2-3 hours

---

### **Option C: Modify Existing Adapter (WORST OPTION)**

**Approach**: Change existing adapter to accept dollars/decimals instead of
cents/bps.

**Cons**:

- ❌ **BREAKING CHANGE** - existing reserve calculations will fail
- ❌ Loss of precision (cents are more precise than dollars for financial
  calculations)
- ❌ Need to update all existing adapter consumers
- ❌ May break reserves v1.1 engine integration

**Effort**: 6-8 hours + extensive testing

**Verdict**: **DO NOT DO THIS**

---

## ✅ **RECOMMENDED ACTION PLAN**

### **Phase 1: Create Bridge** (3-4 hours)

1. **Create `wizard-reserve-bridge.ts`** (2 hours)
   - Location: `client/src/lib/wizard-reserve-bridge.ts`
   - Code: See Option A implementation above
   - Dependencies: Import from existing adapter

2. **Update `wizard-calculations.ts`** (1 hour)
   - Replace direct adapter calls with bridge calls:

     ```typescript
     // OLD (lines 260-298):
     const reserveEngine = new DeterministicReserveEngine();
     const result = await reserveEngine.calculateOptimalReserveAllocation({...});

     // NEW:
     import { calculateReservesForWizard } from '@/lib/wizard-reserve-bridge';

     async function calculateReserves(ctx: ModelingWizardContext): Promise<ReserveAllocation> {
       const generalValidation = GeneralInfoSchema.safeParse(ctx.steps.generalInfo);
       const capitalValidation = CapitalAllocationSchema.safeParse(ctx.steps.capitalAllocation);

       if (!generalValidation.success || !capitalValidation.success) {
         throw new Error('Required data invalid for reserve calculation');
       }

       const general = generalValidation.data;
       const capital = capitalValidation.data;

       const portfolio = generateSyntheticPortfolio({
         fundSize: general.fundSize,
         initialCheckSize: capital.initialCheckSize,
         reserveRatio: capital.followOnStrategy.reserveRatio,
         ctx
       });

       return await calculateReservesForWizard(ctx, portfolio);
     }
     ```

3. **Add Unit Tests** (1 hour)
   - Test unit conversions (dollars ↔ cents, decimals ↔ bps)
   - Test portfolio format transformation
   - Test MOIC calculation
   - Test allocation sorting

### **Phase 2: Integration Testing** (1-2 hours)

1. **Test with Real Wizard Context**
   - Create mock wizard context with realistic data
   - Call `calculateReservesForWizard`
   - Verify output format matches `ReserveAllocation`

2. **Test Edge Cases**
   - Zero reserve ratio
   - Empty portfolio
   - Single company
   - All companies equal

3. **Performance Testing**
   - Benchmark with 10, 50, 100 companies
   - Ensure < 500ms for typical portfolios

### **Validation Checklist**

- [ ] Bridge converts dollars to cents correctly
- [ ] Bridge converts decimals to basis points correctly
- [ ] Bridge converts ownership percentages correctly
- [ ] MOIC calculation matches expectations
- [ ] Allocations sorted by exit MOIC (descending)
- [ ] Existing adapter tests still pass
- [ ] No breaking changes to adapter
- [ ] TypeScript compilation passes
- [ ] Unit tests for bridge pass (>90% coverage)

---

## 📊 **UNIT CONVERSION REFERENCE**

### **Quick Reference Table**

| Value         | Wizard Format     | Adapter Format    | Conversion Formula            |
| ------------- | ----------------- | ----------------- | ----------------------------- |
| $500,000      | 500000.0 (float)  | 50000000 (int)    | `Math.floor(dollars * 100)`   |
| 35% reserve   | 0.35 (decimal)    | 3500 (bps)        | `Math.round(decimal * 10000)` |
| 2.5x MOIC     | 2.5 (decimal)     | 25000 (bps)       | `Math.round(moic * 10000)`    |
| 15% ownership | 0.15 (decimal)    | 0.15 (decimal)    | No conversion                 |
| $1.2M reserve | N/A (output only) | 1200000.0 (float) | Adapter already converts      |

### **Precision Notes**

**Why Cents?**

- ✅ Avoids floating-point errors
- ✅ Precise to the penny
- ✅ Standard in financial systems

**Why Basis Points?**

- ✅ Precise to 0.01%
- ✅ No rounding errors
- ✅ Standard in finance (yield curves, spreads)

**Example of Floating-Point Error**:

```typescript
// BAD (floating-point error):
const fee = 0.1 + 0.2; // 0.30000000000000004 ❌

// GOOD (integer math):
const feeCents = 10 + 20; // 30 ✅
const fee = feeCents / 100; // 0.30 ✅
```

---

## 🧪 **TESTING STRATEGY**

### **Unit Tests** (wizard-reserve-bridge.test.ts)

```typescript
import { describe, it, expect } from 'vitest';
import { calculateReservesForWizard } from '../wizard-reserve-bridge';

describe('wizard-reserve-bridge', () => {
  describe('unit conversions', () => {
    it('should convert dollars to cents correctly', () => {
      // Test with mock that intercepts adapter call
      // Verify dollars → cents conversion
    });

    it('should convert reserve ratio to basis points', () => {
      // Test 0.35 → 3500 bps
    });

    it('should convert MOIC to basis points', () => {
      // Test 2.5x → 25000 bps
    });
  });

  describe('portfolio transformation', () => {
    it('should transform wizard portfolio to adapter format', () => {
      const wizardPortfolio = [
        {
          id: 'test-1',
          name: 'Test Co',
          investedAmount: 500000, // dollars
          currentValuation: 1250000, // dollars
          currentStage: 'seed',
          ownershipPercent: 15, // percentage (0-100)
          sector: 'fintech',
        },
      ];

      // Call calculateReservesForWizard
      // Verify adapter receives:
      // - invested_cents: 50000000
      // - exit_moic_bps: 25000 (2.5x)
      // - ownership_pct: 0.15
    });
  });

  describe('output transformation', () => {
    it('should return correct ReserveAllocation format', async () => {
      const result = await calculateReservesForWizard(mockCtx, mockPortfolio);

      expect(result).toEqual({
        totalPlanned: expect.any(Number),
        optimalMOIC: expect.any(Number),
        companiesSupported: expect.any(Number),
        avgFollowOnSize: expect.any(Number),
        allocations: expect.arrayContaining([
          expect.objectContaining({
            companyId: expect.any(String),
            companyName: expect.any(String),
            plannedReserve: expect.any(Number),
            exitMOIC: expect.any(Number),
          }),
        ]),
      });
    });

    it('should sort allocations by exitMOIC descending', async () => {
      const result = await calculateReservesForWizard(mockCtx, mockPortfolio);

      for (let i = 1; i < result.allocations.length; i++) {
        expect(result.allocations[i - 1].exitMOIC).toBeGreaterThanOrEqual(
          result.allocations[i].exitMOIC
        );
      }
    });
  });
});
```

---

## 📋 **NEXT STEPS**

1. ✅ **Create bridge file** (`wizard-reserve-bridge.ts`)
2. ✅ **Update wizard-calculations.ts** to use bridge
3. ✅ **Add unit tests** for bridge
4. ✅ **Run integration tests** with real wizard context
5. ✅ **Verify existing adapter tests still pass**

---

**Status**: ✅ Complete **Recommendation**: **Use Option A (Thin Wrapper)**
**Effort**: 3-4 hours **Risk**: LOW (zero breaking changes)
