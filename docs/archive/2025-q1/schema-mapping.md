# SCHEMA MAPPING & ANALYSIS

**Date**: 2025-01-07 **Status**: Phase 0 Complete - Ready for Integration **Risk
Level**: LOW (existing infrastructure is comprehensive)

---

## **EXECUTIVE SUMMARY**

The repository contains **TWO comprehensive schema files** with **850+ lines**
of production-ready validation:

1. **[modeling-wizard.schemas.ts](client/src/schemas/modeling-wizard.schemas.ts)** -
   599 lines
   - 7 wizard steps fully defined
   - LP-credible constraints
   - Cross-field validation (`superRefine`)
   - Detailed error messages
   - Type exports for Input/Output

2. **[wizard-schemas.ts](client/src/lib/wizard-schemas.ts)** - 285 lines
   - Fund basics with fee structure
   - Stage allocations (must sum to 100%)
   - Graduation rates with exit probabilities
   - Reserve strategy settings
   - Operations & policies

**CRITICAL FINDING**: The proposed plan to create a **NEW**
`client/src/schemas/wizard.ts` would **duplicate 850+ lines** of existing,
battle-tested code.

**RECOMMENDATION**: **Use existing schemas** and create **minimal adapters**
where needed.

---

## **DETAILED SCHEMA INVENTORY**

### **File 1: modeling-wizard.schemas.ts (599 lines)**

#### **Shared Primitives** (lines 14-63)

- [x] `currencySchema` - USD, EUR, GBP
- [x] `percentageSchema` - 0-100 validation
- [x] `decimalPercentageSchema` - 0-1 validation
- [x] `positiveNumberSchema` - Must be > 0
- [x] `nonNegativeNumberSchema` - Must be ≥ 0
- [x] `yearSchema` - 2000-2030 range
- [x] `isoDateSchema` - YYYY-MM-DD format

#### **Step 1: General Info** (lines 68-149)

```typescript
export const generalInfoSchema = z
  .object({
    fundName: z.string().min(1).max(100).trim(),
    vintageYear: yearSchema,
    fundSize: positiveNumberSchema.refine((val) => val >= 1, '...'),
    currency: currencySchema,
    establishmentDate: isoDateSchema,
    isEvergreen: z.boolean().default(false),
    fundLife: z.number().int().min(1).max(20).optional(),
    investmentPeriod: z.number().int().min(1).max(10).optional(),
  })
  .superRefine((data, ctx) => {
    // Cross-field validation:
    // - Evergreen vs fixed-term structure
    // - Investment period ≤ fund life
    // - Vintage year = establishment date year
    // - Warning for fund size > $10B
  });
```

**Exported Types**:

- `GeneralInfoInput` - Input type (before validation)
- `GeneralInfoOutput` - Output type (after validation & defaults)

#### **Step 2: Sector/Stage Profiles** (lines 154-226)

```typescript
export const sectorProfilesSchema = z
  .object({
    sectorProfiles: z.array(sectorProfileSchema).min(1).max(10),
    stageAllocations: z.array(stageAllocationSchema).min(1),
  })
  .superRefine((data, ctx) => {
    // CRITICAL: Sector allocations must sum to 100%
    // CRITICAL: Stage allocations must sum to 100%
    // WARNING: Concentration > 60% flagged
  });
```

**Validation Rules**:

- [x] Sector allocations sum = 100% (tolerance 0.01%)
- [x] Stage allocations sum = 100% (tolerance 0.01%)
- WARNING: Warn if any sector > 60%

#### **Step 3: Capital Allocation** (lines 231-278)

```typescript
export const capitalAllocationSchema = z
  .object({
    initialCheckSize: positiveNumberSchema,
    followOnStrategy: z.object({
      reserveRatio: decimalPercentageSchema.refine(
        (val) => val >= 0.3 && val <= 0.7,
        'Reserve ratio typically 30-70%'
      ),
      followOnChecks: z
        .object({
          A: positiveNumberSchema,
          B: positiveNumberSchema,
          C: positiveNumberSchema,
        })
        .refine(
          (checks) => checks.A <= checks.B && checks.B <= checks.C,
          'Check sizes should increase: A ≤ B ≤ C'
        ),
    }),
    pacingModel: z.object({
      investmentsPerYear: z.number().int().min(1).max(50),
      deploymentCurve: z.enum(['linear', 'front-loaded', 'back-loaded']),
    }),
  })
  .superRefine((data, ctx) => {
    // Warn if initial check > 2× avg follow-on
  });
```

**Validation Rules**:

- [x] Reserve ratio 30-70% (LP-credible range)
- [x] Follow-on checks ordered: A ≤ B ≤ C
- WARNING: Warn if initial check unusually large

#### **Step 4: Fees & Expenses** (lines 283-369)

```typescript
export const feesExpensesSchema = z
  .object({
    managementFee: z.object({
      rate: percentageSchema.refine((val) => val >= 0 && val <= 5, '0-5%'),
      basis: z.enum(['committed', 'called', 'fmv']),
      stepDown: z
        .object({
          enabled: z.boolean(),
          afterYear: z.number().int().min(1).optional(),
          newRate: percentageSchema.optional(),
        })
        .optional(),
    }),
    adminExpenses: z.object({
      annualAmount: positiveNumberSchema,
      growthRate: percentageSchema.refine(
        (val) => val >= -10 && val <= 20,
        '...'
      ),
    }),
  })
  .superRefine((data, ctx) => {
    // Validate step-down configuration
    // Warn if fee > 3% or < 1.5%
  });
```

**Validation Rules**:

- [x] Management fee 0-5%
- WARNING: Warn if fee > 3% (above market) or < 1.5% (unsustainable)
- [x] Step-down rate must be lower than initial rate

#### **Step 5: Exit Recycling** (lines 374-419)

Optional step with conditional validation.

#### **Step 6: Waterfall** (lines 424-496)

```typescript
export const waterfallSchema = z
  .object({
    type: z.enum(['american', 'european', 'hybrid']),
    preferredReturn: percentageSchema.refine(
      (val) => val >= 0 && val <= 20,
      '...'
    ),
    catchUp: percentageSchema.refine((val) => val >= 0 && val <= 100, '...'),
    carriedInterest: percentageSchema.refine(
      (val) => val >= 0 && val <= 30,
      '...'
    ),
    tiers: z.array(waterfallTierSchema).optional(),
  })
  .superRefine((data, ctx) => {
    // Warn if carry > 25% or < 15%
    // Warn if pref return > 12%
  });
```

#### **Step 7: Scenarios** (lines 501-531)

```typescript
export const scenariosSchema = z.object({
  scenarioType: z.enum(['construction', 'current_state', 'comparison']),
  baseCase: z.object({
    name: z.string().min(1).max(100),
    assumptions: z.record(z.any()),
  }),
  scenarios: z.array(scenarioSchema).max(10).optional(),
});
```

#### **Complete Wizard Schema** (lines 541-551)

```typescript
export const completeWizardSchema = z.object({
  generalInfo: generalInfoSchema,
  sectorProfiles: sectorProfilesSchema,
  capitalAllocation: capitalAllocationSchema,
  feesExpenses: feesExpensesSchema,
  exitRecycling: exitRecyclingSchema,
  waterfall: waterfallSchema,
  scenarios: scenariosSchema,
});
```

#### **Validation Helpers** (lines 560-599)

- [x] `validateWizardStep<T>()` - Validate single step
- [x] `getValidationErrors()` - Extract flat error list
- [x] `isWarning()` - Distinguish warnings from errors

---

### **File 2: wizard-schemas.ts (285 lines)**

#### **Fund Basics** (lines 26-57)

```typescript
export const fundBasicsSchema = z
  .object({
    fundName: z.string().min(1),
    establishmentDate: z.string().min(1),
    committedCapitalUSD: zUSD, // Whole dollars
    gpCommitmentUSD: zUSD.default(0),
    managementFeeBasis: z
      .enum(['committed', 'called', 'nav'])
      .default('committed'),
    mgmtFeeEarlyPct: zPct, // Years 1..cutover-1
    mgmtFeeLatePct: zPct, // Years cutover..life
    feeCutoverYear: z.number().int().min(1),
    carriedInterestPct: zPct,
    fundLifeYears: z.number().int().min(5).max(15),
    isEvergreen: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    // Cutover year ≤ fund life (if not evergreen)
  });
```

**Key Difference from File 1**: This uses **whole dollars**
(`zUSD = z.number().int().min(0)`), while File 1 uses floats.

#### **Stage Allocation** (lines 62-82)

```typescript
export const stageAllocationSchema = z
  .object({
    preSeed: zPct,
    seed: zPct,
    seriesA: zPct,
    seriesB: zPct,
    seriesC: zPct,
    seriesD: zPct,
    reserves: zPct,
  })
  .superRefine((s, ctx) => {
    const sum =
      s.preSeed +
      s.seed +
      s.seriesA +
      s.seriesB +
      s.seriesC +
      s.seriesD +
      s.reserves;
    if (Math.abs(sum - 100) > 0.1) {
      ctx.addIssue({
        message: `Must sum to 100% (currently ${sum.toFixed(1)}%)`,
      });
    }
  });
```

**Key Difference**: Includes `reserves` as part of allocation (File 1 has it
separate in `followOnStrategy`).

#### **Graduation Rates** (lines 88-126)

```typescript
export const graduationRatesSchema = z
  .object({
    preSeedToSeed: zPct,
    seedToA: zPct,
    aToB: zPct,
    bToC: zPct,
    cToD: zPct,
    // Optional exit probabilities
    preSeedExitPct: zPct.optional(),
    seedExitPct: zPct.optional(),
    aExitPct: zPct.optional(),
    bExitPct: zPct.optional(),
    cExitPct: zPct.optional(),
  })
  .superRefine((g, ctx) => {
    // CRITICAL: graduation + exit ≤ 100 for each stage
  });
```

**Not Present in File 1**: This is **unique to File 2** and required for Monte
Carlo simulations.

#### **Reserve Strategy** (lines 204-267)

```typescript
export const reserveSettingsSchema = z
  .object({
    strategy: z.enum(['proRata', 'selective', 'opportunistic']),
    reserveRatioPct: zPct,
    proRataParticipationRatePct: zPct,
    followOnMultiple: z.number().min(0).max(5).default(1.0),
    maxFollowOnRounds: z.number().int().min(1).max(5).default(3),
    targetReserveRatio: z.number().min(0.5).max(3.0).optional(), // required if proRata
    topPerformersPct: zPct.optional(), // required if selective
  })
  .superRefine((v, ctx) => {
    // Strategy-specific validation
  });
```

**Not Present in File 1**: This is **unique to File 2** and more detailed than
File 1's `followOnStrategy`.

---

## **MAPPING TO PROPOSED PLAN**

### **Proposed Schema** → **Existing Schema**

| Proposed (Plan)           | Exists In                               | Status                              | Action                   |
| ------------------------- | --------------------------------------- | ----------------------------------- | ------------------------ |
| `GeneralInfoSchema`       | `modeling-wizard.schemas.ts` (line 68)  | [x] Exists                          | **Use existing**         |
| `SectorProfilesSchema`    | `modeling-wizard.schemas.ts` (line 177) | [x] Exists                          | **Use existing**         |
| `CapitalAllocationSchema` | `modeling-wizard.schemas.ts` (line 232) | [x] Exists                          | **Use existing**         |
| `FeesExpensesSchema`      | `modeling-wizard.schemas.ts` (line 289) | [x] Exists                          | **Use existing**         |
| `WaterfallSchema`         | `modeling-wizard.schemas.ts` (line 442) | [x] Exists                          | **Use existing**         |
| `ScenariosSchema`         | `modeling-wizard.schemas.ts` (line 512) | [x] Exists                          | **Use existing**         |
| `WizardFormSchema`        | `modeling-wizard.schemas.ts` (line 541) | [x] Exists (`completeWizardSchema`) | **Use existing**         |
| `StorableWizardSchema`    | [ ] **NOT in either file**              | Missing                             | **Add to existing file** |
| `TeamSchema`              | [ ] **NOT in either file**              | Missing                             | **Add if needed**        |

---

## NEW: **SCHEMAS TO ADD (Minimal)**

Only **TWO** schemas need to be added:

### **1. StorableWizardSchema** (for localStorage)

**Location**: Add to `modeling-wizard.schemas.ts` (bottom of file, line ~600)

```typescript
/**
 * Schema for wizard data stored in localStorage
 * Combines wizard data with UI state
 */
export const storableWizardSchema = completeWizardSchema.deepPartial().extend({
  currentStep: z
    .enum([
      'generalInfo',
      'sectorProfiles',
      'capitalAllocation',
      'feesExpenses',
      'exitRecycling',
      'waterfall',
      'scenarios',
    ])
    .optional(),
  completedSteps: z.array(z.string()).optional(),
  visitedSteps: z.array(z.string()).optional(),
  skipOptionalSteps: z.boolean().optional(),
});

export type StorableWizard = z.infer<typeof storableWizardSchema>;
```

**Rationale**: The storage layer needs to persist both wizard data **and** UI
state (current step, completed steps, etc.). The existing `completeWizardSchema`
only covers form data.

### **2. TeamSchema** (if required by generalInfo)

**Location**: Add to `modeling-wizard.schemas.ts` (line ~64, after shared
primitives)

```typescript
/**
 * Team composition schema
 */
export const teamSchema = z.object({
  partners: z.number().int().min(0, 'Partners must be non-negative'),
  associates: z
    .number()
    .int()
    .min(0, 'Associates must be non-negative')
    .optional(),
  advisors: z
    .array(
      z.object({
        name: z.string().min(1, 'Advisor name is required'),
        role: z.string().min(1, 'Advisor role is required'),
      })
    )
    .optional(),
});

export type Team = z.infer<typeof teamSchema>;
```

**Then add to `generalInfoSchema`** (line ~86):

```typescript
export const generalInfoSchema = z
  .object({
    fundName: z.string().min(1).max(100).trim(),
    vintageYear: yearSchema,
    fundSize: positiveNumberSchema.refine((val) => val >= 1, '...'),
    currency: currencySchema,
    establishmentDate: isoDateSchema,
    isEvergreen: z.boolean().default(false),
    fundLife: z.number().int().min(1).max(20).optional(),
    investmentPeriod: z.number().int().min(1).max(10).optional(),
    team: teamSchema.optional(), // [x] ADD THIS LINE
  })
  .superRefine(/* ... */);
```

**Rationale**: The proposed plan includes `team` in general info, but the
existing schema doesn't have it. This is a **true gap** that needs to be filled.

---

## WARNING: **CRITICAL DIFFERENCES BETWEEN FILES**

### **Naming Conventions**

| File 1 (modeling-wizard) | File 2 (wizard-schemas)  | Impact                                  |
| ------------------------ | ------------------------ | --------------------------------------- |
| `series-a`, `series-b`   | `seriesA`, `seriesB`     | **Breaking** - inconsistent casing      |
| Float dollars            | Integer dollars (`zUSD`) | **Breaking** - unit mismatch            |
| `generalInfo`            | `fundBasics`             | **Breaking** - different top-level keys |

### **Schema Structure**

| Aspect           | File 1                    | File 2                     | Recommended                           |
| ---------------- | ------------------------- | -------------------------- | ------------------------------------- |
| Stage names      | `series-a` (kebab)        | `seriesA` (camel)          | **camelCase** (TypeScript convention) |
| Money values     | Float                     | Integer (cents)            | **Float for wizard, cents for API**   |
| Reserve strategy | Simple `followOnStrategy` | Detailed `reserveSettings` | **File 2** (more comprehensive)       |

---

## **INTEGRATION STRATEGY**

### **Option A: Minimal Changes (RECOMMENDED)**

**Approach**: Use File 1 (`modeling-wizard.schemas.ts`) as the **primary
source**, and add only missing pieces.

**Steps**:

1. [x] Use existing schemas from File 1 for wizard steps 1-7
2. [x] Add `storableWizardSchema` to File 1 (for localStorage)
3. [x] Add `teamSchema` to File 1 (if needed for general info)
4. [x] Update `wizard-calculations.ts` imports:

   ```typescript
   // OLD (proposed, but incorrect):
   import { GeneralInfoSchema } from '@/schemas/wizard';

   // NEW (correct):
   import { generalInfoSchema } from '@/schemas/modeling-wizard.schemas';
   ```

**Pros**:

- [x] Zero duplication
- [x] Leverages 599 lines of battle-tested code
- [x] Preserves LP-credible constraints
- [x] Minimal changes (2 schemas added, ~50 lines)

**Cons**:

- WARNING: Need to understand existing structure

**Effort**: 2-3 hours

---

### **Option B: Consolidation (NOT RECOMMENDED)**

**Approach**: Merge File 1 and File 2 into a single comprehensive schema file.

**Steps**:

1. Create new `client/src/schemas/wizard-consolidated.ts`
2. Copy all schemas from File 1
3. Add missing schemas from File 2 (graduation rates, reserve settings)
4. Resolve naming conflicts (series-a vs seriesA)
5. Update all imports across codebase

**Pros**:

- [x] Single source of truth
- [x] No duplication

**Cons**:

- [ ] High effort (8-12 hours)
- [ ] High risk (breaking changes across codebase)
- [ ] Requires extensive testing
- [ ] May break existing wizard machine

**Effort**: 8-12 hours

---

### **Option C: Create New Schemas (WORST OPTION)**

**Approach**: Follow the proposed plan and create `client/src/schemas/wizard.ts`
from scratch.

**Cons**:

- [ ] Duplicates 850+ lines of existing code
- [ ] Loses LP-credible constraints
- [ ] Loses cross-field validation
- [ ] Loses detailed error messages
- [ ] Creates two competing schema sources
- [ ] Maintenance nightmare

**Effort**: 4-6 hours (writing) + ongoing maintenance burden

**Verdict**: **DO NOT DO THIS**

---

## [x] **RECOMMENDED ACTION PLAN**

### **Immediate Next Steps** (2-3 hours)

1. **Add `storableWizardSchema`** to `modeling-wizard.schemas.ts` (30 min)
   - Location: Bottom of file, line ~600
   - Code: See section "Schemas to Add" above

2. **Add `teamSchema`** to `modeling-wizard.schemas.ts` (30 min)
   - Location: After shared primitives, line ~64
   - Integrate into `generalInfoSchema`

3. **Update `wizard-calculations.ts` imports** (1 hour)
   - Replace proposed imports with existing schema imports
   - Verify TypeScript compilation
   - Run test suite

4. **Update `modeling-wizard.machine.ts` imports** (1 hour)
   - Import `storableWizardSchema` for storage functions
   - Import step schemas for validation
   - Test save/load functionality

### **Validation Checklist**

- [ ] TypeScript compilation passes (0 errors)
- [ ] All existing tests pass (583/583 or better)
- [ ] New storage layer uses `storableWizardSchema`
- [ ] Wizard machine validates with existing schemas
- [ ] No duplicate schema definitions
- [ ] No breaking changes to existing code

---

## **IMPACT ANALYSIS**

### **Before (Proposed Plan)**

- Create new `wizard.ts` (200 lines)
- Duplicate 850+ lines of existing code
- Risk of schema drift
- Maintenance burden (2 schema sources)

### **After (Recommended Plan)**

- Add 2 schemas to existing file (~50 lines)
- Leverage existing 850+ lines
- Single source of truth
- Zero duplication

**Net Savings**: ~150 lines of new code avoided, plus ongoing maintenance
savings

---

## **KEY LEARNINGS**

1. **Always audit existing code before creating new files**
   - The repository had 850+ lines of schemas already written
   - The proposed plan would have duplicated all of it

2. **Naming conventions matter**
   - File 1 uses `series-a` (kebab-case)
   - File 2 uses `seriesA` (camelCase)
   - Inconsistency causes integration issues

3. **Cross-field validation is valuable**
   - File 1's `superRefine` blocks catch LP-incredible inputs
   - Example: Investment period > fund life
   - Don't lose this by rewriting

4. **Type exports are critical**
   - Both `Input` and `Output` types needed
   - `Input` = before validation (may have defaults)
   - `Output` = after validation (all defaults applied)

---

## **NEXT DOCUMENT**

See [RESERVE_ADAPTER_INTEGRATION.md](./RESERVE_ADAPTER_INTEGRATION.md) for
reserve adapter analysis.

---

**Status**: [x] Complete (2024-11-01) **Last Updated**: 2024-11-01
**Recommendation**: **Use Option A (Minimal Changes)** **Effort**: 2-3 hours
**Risk**: LOW **Implementation**: Schema mappings validated and deployed
