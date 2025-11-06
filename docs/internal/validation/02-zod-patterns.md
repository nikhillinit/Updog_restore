# Zod Patterns: Schema Composition & Refinements

**Purpose:** Copy-paste ready Zod patterns for common validation scenarios in VC
fund modeling. Learn schema composition, refinements, discriminated unions, and
advanced validation techniques.

**Audience:** Developers implementing new validation logic or refactoring
existing schemas.

---

## Table of Contents

1. [Basic Schemas](#basic-schemas)
2. [Schema Composition](#schema-composition)
3. [Refinements](#refinements)
4. [Discriminated Unions](#discriminated-unions)
5. [Coercion](#coercion)
6. [Conditional Validation](#conditional-validation)
7. [Real-World Examples](#real-world-examples)
8. [Anti-Patterns](#anti-patterns)

---

## Basic Schemas

### Primitives

```typescript
import { z } from 'zod';

// Strings
const nameSchema = z.string();
const emailSchema = z.string().email();
const urlSchema = z.string().url();
const uuidSchema = z.string().uuid();

// Numbers
const ageSchema = z.number();
const positiveSchema = z.number().positive();
const integerSchema = z.number().int();
const boundedSchema = z.number().min(0).max(100);

// Booleans
const flagSchema = z.boolean();

// Dates
const dateSchema = z.date();
const coercedDateSchema = z.coerce.date(); // Parses ISO strings

// Enums
const stageSchema = z.enum(['seed', 'series_a', 'series_b']);
const marketSchema = z.enum(['bull', 'bear', 'neutral']);

// Literals
const versionSchema = z.literal('v1');
const modeSchema = z.literal('upfront');
```

### Objects

```typescript
// Basic object
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

// Nested object
const FundSchema = z.object({
  id: z.number(),
  name: z.string(),
  owner: z.object({
    id: z.number(),
    name: z.string(),
  }),
});

// Strict mode (reject extra keys)
const StrictSchema = z
  .object({
    name: z.string(),
  })
  .strict(); // Extra keys cause validation error

// Passthrough mode (allow extra keys)
const PassthroughSchema = z
  .object({
    name: z.string(),
  })
  .passthrough(); // Extra keys preserved
```

### Arrays

```typescript
// Array of primitives
const tagsSchema = z.array(z.string());

// Array of objects
const CompaniesSchema = z.array(
  z.object({
    id: z.number(),
    name: z.string(),
  })
);

// Array with length constraints
const StageAllocationsSchema = z
  .array(
    z.object({
      stage: z.string(),
      percentage: z.number(),
    })
  )
  .min(1, 'At least one stage required')
  .max(10, 'Maximum 10 stages allowed');

// Non-empty array
const NonEmptySchema = z.array(z.string()).nonempty();
```

### Tuples

```typescript
// Fixed-length tuple
const CoordinateSchema = z.tuple([
  z.number(), // latitude
  z.number(), // longitude
]);

// Mixed types
const ResponseSchema = z.tuple([
  z.number(), // status code
  z.string(), // message
  z.object({}), // data
]);
```

---

## Schema Composition

### Extend (Add Fields)

```typescript
// Base schema
const BaseUserSchema = z.object({
  id: z.number(),
  name: z.string(),
});

// Extend with additional fields
const AdminUserSchema = BaseUserSchema.extend({
  role: z.literal('admin'),
  permissions: z.array(z.string()),
});

// Result: { id, name, role, permissions }
```

**Real example from codebase:**

```typescript
// shared/schemas/waterfall-policy.ts
const BaseWaterfallPolicySchemaCore = z.object({
  id: z.string(),
  name: z.string(),
  tiers: z.array(WaterfallTierSchema),
});

const AmericanWaterfallSchemaCore = BaseWaterfallPolicySchemaCore.extend({
  type: z.literal('american'),
});
```

### Merge (Combine Schemas)

```typescript
// Schema A
const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
});

// Schema B
const ContactSchema = z.object({
  email: z.string(),
  phone: z.string(),
});

// Merge
const PersonWithContactSchema = PersonSchema.merge(ContactSchema);
// Result: { name, age, email, phone }
```

**Use case:** Combining independent concerns (user info + contact info)

### Pick (Select Fields)

```typescript
const FundSchema = z.object({
  id: z.number(),
  name: z.string(),
  size: z.number(),
  managementFee: z.number(),
  carryPercentage: z.number(),
});

// Pick only ID and name
const FundSummarySchema = FundSchema.pick({
  id: true,
  name: true,
});
// Result: { id, name }
```

**Use case:** Creating DTOs (Data Transfer Objects) with subset of fields

### Omit (Remove Fields)

```typescript
const FundSchema = z.object({
  id: z.number(),
  name: z.string(),
  size: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Omit timestamps for create payload
const CreateFundSchema = FundSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
// Result: { name, size }
```

**Use case:** Excluding auto-generated fields (IDs, timestamps)

### Partial (All Fields Optional)

```typescript
const FundSchema = z.object({
  name: z.string(),
  size: z.number(),
  managementFee: z.number(),
});

// All fields optional for updates
const UpdateFundSchema = FundSchema.partial();
// Result: { name?, size?, managementFee? }
```

**Use case:** PATCH endpoints (partial updates)

### Deep Partial

```typescript
const FundSchema = z.object({
  name: z.string(),
  settings: z.object({
    notifications: z.boolean(),
    timezone: z.string(),
  }),
});

// Nested fields also optional
const DeepPartialSchema = FundSchema.deepPartial();
// Result: { name?, settings?: { notifications?, timezone? } }
```

---

## Refinements

### Basic Refine

```typescript
// Custom validation logic
const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine(
    (val) => /[A-Z]/.test(val),
    'Password must contain at least one uppercase letter'
  )
  .refine(
    (val) => /[0-9]/.test(val),
    'Password must contain at least one number'
  );
```

**Real example from codebase:**

```typescript
// server/validators/fundSchema.ts
export const fundSchema = CompleteFundSetupSchema.refine(
  (data) => {
    const totalAllocation = data.investmentStrategy.allocations.reduce(
      (sum, alloc) => sum + alloc.percentage,
      0
    );
    return totalAllocation <= 100;
  },
  {
    message: 'Total allocation percentages cannot exceed 100%',
    path: ['investmentStrategy', 'allocations'],
  }
);
```

### Transform (Modify Data)

```typescript
// Trim whitespace
const TrimmedStringSchema = z.string().transform((val) => val.trim());

// Convert to lowercase
const LowercaseEmailSchema = z
  .string()
  .email()
  .transform((val) => val.toLowerCase());

// Parse JSON string
const JsonSchema = z.string().transform((val) => JSON.parse(val));

// Custom transformation
const PercentageSchema = z.number().transform((val) => val / 100);
// Input: 50 → Output: 0.5
```

**Real example:** Decimal.js conversion

```typescript
// shared/schemas/decimal-zod.ts
export const ZodPercentage = z
  .union([z.string(), z.number(), z.instanceof(Decimal)])
  .transform((val) => {
    if (val instanceof Decimal) return val;
    return new Decimal(val);
  });
```

### SuperRefine (Multiple Issues)

```typescript
const RegistrationSchema = z
  .object({
    password: z.string(),
    confirmPassword: z.string(),
    email: z.string(),
    confirmEmail: z.string(),
  })
  .superRefine((data, ctx) => {
    // Check password match
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords must match',
        path: ['confirmPassword'],
      });
    }

    // Check email match
    if (data.email !== data.confirmEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Emails must match',
        path: ['confirmEmail'],
      });
    }
  });
```

**Real example:** Fund feasibility constraints

```typescript
// shared/schemas/fund-model.ts
export const FundModelInputsSchema = z
  .object({
    fundSize: z.number().positive(),
    stageAllocations: z.array(StageAllocationSchema),
    averageCheckSizes: z.record(StageSchema, z.number().positive()),
  })
  .superRefine((inputs, ctx) => {
    // Constraint 1: Stage allocations sum to 100%
    const allocSum = inputs.stageAllocations.reduce(
      (s, a) => s + a.allocationPct,
      0
    );
    if (Math.abs(allocSum - 1.0) > 1e-6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Stage allocations must sum to 100%. Current: ${(allocSum * 100).toFixed(2)}%`,
        path: ['stageAllocations'],
      });
    }

    // Constraint 2: Check sizes ≤ stage allocations
    inputs.stageAllocations.forEach((stage, idx) => {
      const stageCapital = inputs.fundSize * stage.allocationPct;
      const avgCheck = inputs.averageCheckSizes[stage.stage];

      if (avgCheck && avgCheck > stageCapital) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Check size ($${avgCheck}M) exceeds stage allocation ($${stageCapital}M)`,
          path: ['averageCheckSizes', stage.stage],
        });
      }
    });
  });
```

### Preprocessing

```typescript
// Preprocess before validation
const DateFromStringSchema = z.preprocess((val) => {
  if (typeof val === 'string') {
    return new Date(val);
  }
  return val;
}, z.date());

// Use case: Accept both Date objects and ISO strings
DateFromStringSchema.parse('2024-01-01'); // ✅ Valid
DateFromStringSchema.parse(new Date()); // ✅ Valid
```

---

## Discriminated Unions

### Basic Discriminated Union

```typescript
// Define discriminator field
const AnimalSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('dog'),
    breed: z.string(),
  }),
  z.object({
    type: z.literal('cat'),
    indoor: z.boolean(),
  }),
]);

// Type-safe narrowing
type Animal = z.infer<typeof AnimalSchema>;

function handleAnimal(animal: Animal) {
  if (animal.type === 'dog') {
    console.log(animal.breed); // ✅ TypeScript knows this exists
  } else {
    console.log(animal.indoor); // ✅ TypeScript knows this exists
  }
}
```

### Waterfall Types (Real Example)

```typescript
// shared/schemas/waterfall-policy.ts

// Base schema (shared fields)
const BaseWaterfallPolicySchemaCore = z.object({
  id: z.string(),
  name: z.string(),
  tiers: z.array(WaterfallTierSchema),
  preferredReturnRate: ZodPercentage,
});

// American waterfall (deal-by-deal carry)
const AmericanWaterfallSchemaCore = BaseWaterfallPolicySchemaCore.extend({
  type: z.literal('american'),
});

export type AmericanWaterfall = z.infer<typeof AmericanWaterfallSchemaCore>;

// Type guard
export const isAmerican = (w: Waterfall): w is AmericanWaterfall =>
  w.type === 'AMERICAN';

// Validation with discriminator
export const WaterfallPolicySchema = AmericanWaterfallSchemaCore;
```

**Usage:**

```typescript
// client/src/lib/waterfall.ts
export function applyWaterfallChange(
  w: Waterfall,
  field: string,
  value: unknown
): Waterfall {
  if (field === 'carryVesting') {
    // Type-safe access to American-specific fields
    return {
      ...w,
      carryVesting: {
        /* ... */
      },
    };
  }
  return { ...w, [field]: value } as Waterfall;
}
```

### Complex Discriminated Union

```typescript
// Investment event types
const EventSchema = z.discriminatedUnion('eventType', [
  // Initial investment
  z.object({
    eventType: z.literal('initial_investment'),
    date: z.date(),
    amount: z.number(),
    stage: z.enum(['seed', 'series_a', 'series_b']),
  }),

  // Follow-on round
  z.object({
    eventType: z.literal('follow_on'),
    date: z.date(),
    amount: z.number(),
    preMoney: z.number(),
    postMoney: z.number(),
  }),

  // Exit
  z.object({
    eventType: z.literal('exit'),
    date: z.date(),
    exitValue: z.number(),
    exitType: z.enum(['acquisition', 'ipo', 'secondary']),
  }),

  // Write-off
  z.object({
    eventType: z.literal('write_off'),
    date: z.date(),
    reason: z.string(),
  }),
]);

type InvestmentEvent = z.infer<typeof EventSchema>;
```

---

## Coercion

### String to Number

```typescript
// Basic coercion
const AgeSchema = z.coerce.number();
AgeSchema.parse('25'); // ✅ Returns 25 (number)
AgeSchema.parse(25); // ✅ Returns 25 (number)

// With validation
const PositiveNumberSchema = z.coerce.number().positive();
PositiveNumberSchema.parse('100'); // ✅ Returns 100
PositiveNumberSchema.parse('-10'); // ❌ Error: must be positive
```

**Real example from codebase:**

```typescript
// shared/schema-helpers.ts
export const num = (opts: NumOpts = {}) => {
  const { min, max, int, coerce = true } = opts;
  let schema = coerce ? z.coerce.number() : z.number();

  if (int) schema = schema.int();
  if (min !== undefined) schema = schema.min(min);
  if (max !== undefined) schema = schema.max(max);

  return schema;
};

// Usage
export const nonNegative = () => num({ min: 0 });
export const bounded01 = () => num({ min: 0, max: 1 });
export const percent100 = () => num({ min: 0, max: 100 });
```

### String to Date

```typescript
// Coerce ISO strings to Date
const DateSchema = z.coerce.date();

DateSchema.parse('2024-01-01T00:00:00Z'); // ✅ Date object
DateSchema.parse('2024-01-01'); // ✅ Date object
DateSchema.parse(new Date()); // ✅ Date object
DateSchema.parse('invalid'); // ❌ Error: Invalid date
```

**Real example:**

```typescript
// shared/schemas/reserves-schemas.ts
export const PortfolioCompanySchema = z.object({
  id: z.string().uuid(),
  investmentDate: z.coerce.date(), // Accepts ISO strings
  lastRoundDate: z.coerce.date().optional(),
  exitDate: z.coerce.date().optional(),
});
```

### Boolean Coercion

```typescript
// String to boolean
const BooleanSchema = z.coerce.boolean();

BooleanSchema.parse('true'); // ✅ true
BooleanSchema.parse('false'); // ✅ false
BooleanSchema.parse(1); // ✅ true
BooleanSchema.parse(0); // ✅ false
BooleanSchema.parse(''); // ✅ false (empty string)
```

### Enum Coercion

```typescript
// String to enum (case-insensitive)
const StageSchema = z
  .enum(['seed', 'series_a', 'series_b'])
  .transform((val) => val.toLowerCase());

// Or use nativeEnum for TypeScript enums
enum Stage {
  SEED = 'seed',
  SERIES_A = 'series_a',
  SERIES_B = 'series_b',
}

const EnumSchema = z.nativeEnum(Stage);
```

### NaN Handling

```typescript
// Problem: Coercion can produce NaN
const NaiveSchema = z.coerce.number();
NaiveSchema.parse('abc'); // ✅ Returns NaN (invalid!)

// Solution: Validate against NaN
const SafeNumberSchema = z.coerce
  .number()
  .refine((n) => !Number.isNaN(n), 'Must be a valid number');

SafeNumberSchema.parse('abc'); // ❌ Error: Must be a valid number
```

**Helper from codebase:**

```typescript
// client/src/lib/coerce.ts
export const clampPct = (n: unknown): number => {
  const v = Number(n);
  if (Number.isNaN(v)) return 0; // Default for NaN
  if (v === Infinity) return 100;
  if (v === -Infinity) return 0;
  return Math.min(100, Math.max(0, Math.round(v)));
};
```

---

## Conditional Validation

### Dependent Fields

```typescript
// Validate field B based on field A
const ShippingSchema = z
  .object({
    shippingMethod: z.enum(['standard', 'express']),
    trackingNumber: z.string().optional(),
  })
  .refine(
    (data) => {
      // If express shipping, tracking number required
      if (data.shippingMethod === 'express') {
        return !!data.trackingNumber;
      }
      return true;
    },
    {
      message: 'Tracking number required for express shipping',
      path: ['trackingNumber'],
    }
  );
```

**Real example:**

```typescript
// server/validators/fundSchema.ts
export const fundSchema = CompleteFundSetupSchema.refine(
  (data) => {
    // If exit recycling enabled, percentage must be > 0
    if (data.exitRecycling.enabled) {
      return data.exitRecycling.recyclePercentage > 0;
    }
    return true;
  },
  {
    message: 'When exit recycling is enabled, recycle percentage must be > 0',
    path: ['exitRecycling', 'recyclePercentage'],
  }
);
```

### Business Rules

```typescript
// Graduation + exit rate ≤ 100%
const StageSchema = z
  .object({
    name: z.string(),
    graduationRate: z.number().min(0).max(100),
    exitRate: z.number().min(0).max(100),
  })
  .refine((data) => data.graduationRate + data.exitRate <= 100, {
    message: 'Graduation rate + exit rate cannot exceed 100%',
    path: ['graduationRate'], // Or ['exitRate']
  });

// Investment horizon ≤ fund life
const FundConstraintSchema = z
  .object({
    lifeYears: z.number().int().positive(),
    investmentHorizonYears: z.number().int().positive(),
  })
  .refine((data) => data.investmentHorizonYears <= data.lifeYears, {
    message: 'Investment horizon cannot exceed fund life',
    path: ['investmentHorizonYears'],
  });
```

### Contextual Validation

```typescript
// Validate based on external context
function createFundSchema(isEvergreen: boolean) {
  return z.object({
    fundName: z.string(),
    fundSize: z.number().positive(),
    lifeYears: isEvergreen
      ? z.number().optional() // Evergreen funds don't need life
      : z.number().int().positive(), // Closed-end funds require life
  });
}

// Usage
const closedEndSchema = createFundSchema(false);
const evergreenSchema = createFundSchema(true);
```

---

## Real-World Examples

### Example 1: Fund Creation

```typescript
// Complete fund creation schema with cross-field validation
const CreateFundSchema = z
  .object({
    basics: z.object({
      name: z.string().min(1, 'Fund name required'),
      size: z.coerce.number().positive('Fund size must be positive'),
      managementFeeRate: z.coerce.number().min(0).max(0.05),
    }),

    strategy: z.object({
      stages: z
        .array(
          z.object({
            name: z.string(),
            allocationPct: z.number().min(0).max(1),
            graduationRate: z.number().min(0).max(100),
            exitRate: z.number().min(0).max(100),
          })
        )
        .min(1),
    }),

    waterfall: z.object({
      type: z.literal('AMERICAN'),
      carryPercentage: z.number().min(0).max(1),
    }),
  })
  .superRefine((data, ctx) => {
    // Stage allocations sum to 100%
    const totalAlloc = data.strategy.stages.reduce(
      (sum, s) => sum + s.allocationPct,
      0
    );

    if (Math.abs(totalAlloc - 1.0) > 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Stage allocations must sum to 100%, got ${(totalAlloc * 100).toFixed(1)}%`,
        path: ['strategy', 'stages'],
      });
    }

    // Each stage: graduation + exit ≤ 100%
    data.strategy.stages.forEach((stage, idx) => {
      if (stage.graduationRate + stage.exitRate > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Stage ${stage.name}: graduation + exit cannot exceed 100%`,
          path: ['strategy', 'stages', idx, 'graduationRate'],
        });
      }
    });
  });

type CreateFundInput = z.infer<typeof CreateFundSchema>;
```

### Example 2: Portfolio Company with Date Validation

```typescript
// shared/schemas/reserves-schemas.ts
export const PortfolioCompanySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    sector: z.string().min(1).max(50),
    currentStage: z.enum(['seed', 'series_a', 'series_b', 'series_c']),

    // Investment amounts
    totalInvested: z.number().positive().finite(),
    currentValuation: z.number().positive().finite(),
    ownershipPercentage: z.number().min(0).max(1),

    // Dates (coerced from ISO strings)
    investmentDate: z.coerce.date(),
    lastRoundDate: z.coerce.date().optional(),
    exitDate: z.coerce.date().optional(),

    // Status
    isActive: z.boolean().default(true),

    // Performance
    currentMOIC: z.number().min(0).optional(),
    confidenceLevel: z.number().min(0).max(1).default(0.5),

    tags: z.array(z.string()).default([]),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Exit date must be after investment date
    if (data.exitDate && data.exitDate <= data.investmentDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Exit date must be after investment date',
        path: ['exitDate'],
      });
    }

    // Inactive companies should have exit date
    if (!data.isActive && !data.exitDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Inactive companies must have an exit date',
        path: ['exitDate'],
      });
    }
  });

type PortfolioCompany = z.infer<typeof PortfolioCompanySchema>;
```

### Example 3: Reserve Allocation Request

```typescript
export const ReserveAllocationInputSchema = z
  .object({
    // Portfolio data
    portfolio: z.array(PortfolioCompanySchema).min(1),
    availableReserves: z.number().positive().finite(),
    totalFundSize: z.number().positive().finite(),

    // Strategy
    graduationMatrix: GraduationMatrixSchema,
    stageStrategies: z.array(StageStrategySchema).min(1),

    // Constraints
    maxSingleAllocation: z.number().positive().optional(),
    minAllocationThreshold: z.number().positive().default(25000),
    maxPortfolioConcentration: z.number().min(0).max(1).default(0.1),

    // Scenario
    scenarioType: z
      .enum(['conservative', 'base', 'optimistic'])
      .default('base'),
    confidenceThreshold: z.number().min(0).max(1).default(0.7),
  })
  .superRefine((data, ctx) => {
    // Available reserves ≤ total fund size
    if (data.availableReserves > data.totalFundSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Available reserves cannot exceed total fund size',
        path: ['availableReserves'],
      });
    }

    // Portfolio companies have valid stages
    const validStages = new Set(data.stageStrategies.map((s) => s.stage));
    data.portfolio.forEach((company, idx) => {
      if (!validStages.has(company.currentStage)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Company ${company.name} has stage ${company.currentStage} not in strategy`,
          path: ['portfolio', idx, 'currentStage'],
        });
      }
    });
  });
```

### Example 4: Waterfall Calculation Input

```typescript
// Waterfall tier definition
export const WaterfallTierSchema = z.object({
  tierType: z.enum([
    'return_of_capital',
    'preferred_return',
    'gp_catch_up',
    'carry',
  ]),
  priority: z.number().int().positive(),
  rate: z.number().min(0).max(1).optional(),
  basis: z.enum(['committed', 'contributed', 'preferred_basis']).optional(),
  catchUpRate: z.number().min(0).max(1).optional(),
});

// American waterfall policy
const BaseWaterfallSchema = z.object({
  id: z.string(),
  name: z.string(),
  tiers: z.array(WaterfallTierSchema).min(1),
  preferredReturnRate: z.number().min(0).max(1),
  hurdleRateBasis: z.enum(['committed', 'contributed']).default('committed'),
});

const validateTierPriorities = (data: {
  tiers: Array<{ priority: number }>;
}) => {
  const priorities = data.tiers.map((t) => t.priority);
  const uniquePriorities = new Set(priorities);
  return priorities.length === uniquePriorities.size;
};

export const AmericanWaterfallSchema = BaseWaterfallSchema.extend({
  type: z.literal('american'),
}).refine(validateTierPriorities, {
  message: 'Waterfall tier priorities must be unique',
  path: ['tiers'],
});
```

### Example 5: Monte Carlo Simulation Config

```typescript
const MonteCarloConfigSchema = z
  .object({
    // Portfolio size
    portfolioSize: z.coerce
      .number()
      .int('Portfolio size must be integer')
      .positive('Portfolio size must be positive')
      .refine((n) => !Number.isNaN(n), 'Portfolio size must be valid number'),

    // Simulation parameters
    scenarios: z.coerce
      .number()
      .int('Scenarios must be integer')
      .positive('Scenarios must be positive')
      .min(100, 'At least 100 scenarios required for statistical significance')
      .max(100000, 'Maximum 100,000 scenarios to prevent timeout'),

    // Stage distribution
    stageDistribution: z.object({
      seed: z.object({
        companies: z.number().int().nonnegative(),
        successRate: z.number().min(0).max(1),
      }),
      seriesA: z.object({
        companies: z.number().int().nonnegative(),
        successRate: z.number().min(0).max(1),
      }),
      seriesB: z.object({
        companies: z.number().int().nonnegative(),
        successRate: z.number().min(0).max(1),
      }),
    }),

    // Random seed
    seed: z.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    // Total companies = portfolioSize
    const totalCompanies =
      data.stageDistribution.seed.companies +
      data.stageDistribution.seriesA.companies +
      data.stageDistribution.seriesB.companies;

    if (totalCompanies !== data.portfolioSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Stage companies (${totalCompanies}) must equal portfolio size (${data.portfolioSize})`,
        path: ['stageDistribution'],
      });
    }
  });
```

---

## Anti-Patterns

### 1. Over-Validation

**Problem:** Validating too strictly prevents valid edge cases

```typescript
// ❌ BAD: Rejects valid business scenarios
const FundNameSchema = z
  .string()
  .min(5, 'Fund name too short')
  .max(20, 'Fund name too long')
  .regex(/^Fund /, "Must start with 'Fund'");

// Valid names rejected: "VC I", "ABC Capital"
```

**Solution:** Be pragmatic, validate only what matters

```typescript
// ✅ GOOD: Flexible validation
const FundNameSchema = z
  .string()
  .min(1, 'Fund name required')
  .max(200, 'Fund name too long');
```

### 2. Brittle Schemas

**Problem:** Schemas break with minor API changes

```typescript
// ❌ BAD: Strict schema rejects extra fields
const StrictUserSchema = z
  .object({
    id: z.number(),
    name: z.string(),
  })
  .strict(); // Breaks if API adds 'email' field

// API response: { id: 1, name: "Alice", email: "alice@example.com" }
StrictUserSchema.parse(response); // ❌ Error: Unrecognized key 'email'
```

**Solution:** Use `.passthrough()` for external APIs

```typescript
// ✅ GOOD: Tolerant of extra fields
const UserSchema = z
  .object({
    id: z.number(),
    name: z.string(),
  })
  .passthrough(); // Ignores extra fields
```

**When to use strict:** Internal schemas, security-sensitive data

### 3. Mutation During Validation

**Problem:** Transforming data has side effects

```typescript
// ❌ BAD: Mutates input object
const BadSchema = z
  .object({
    tags: z.array(z.string()),
  })
  .transform((data) => {
    data.tags.push('validated'); // Mutates original!
    return data;
  });

const input = { tags: ['a', 'b'] };
BadSchema.parse(input);
console.log(input.tags); // ['a', 'b', 'validated'] ← Unexpected!
```

**Solution:** Return new objects, don't mutate

```typescript
// ✅ GOOD: Immutable transformation
const GoodSchema = z
  .object({
    tags: z.array(z.string()),
  })
  .transform((data) => ({
    ...data,
    tags: [...data.tags, 'validated'], // New array
  }));
```

### 4. Ignoring Error Paths

**Problem:** Generic error messages without field context

```typescript
// ❌ BAD: No path information
const Schema = z
  .object({
    stages: z.array(
      z.object({
        name: z.string(),
      })
    ),
  })
  .refine(
    (data) => data.stages.length > 0,
    'At least one stage required' // Which field is invalid?
  );
```

**Solution:** Always specify error path

```typescript
// ✅ GOOD: Error path specified
const Schema = z
  .object({
    stages: z.array(
      z.object({
        name: z.string(),
      })
    ),
  })
  .refine((data) => data.stages.length > 0, {
    message: 'At least one stage required',
    path: ['stages'], // Frontend can highlight this field
  });
```

### 5. Coercion Without Bounds

**Problem:** Coercion accepts invalid values

```typescript
// ❌ BAD: Accepts NaN, Infinity
const BadPercentageSchema = z.coerce.number();

BadPercentageSchema.parse('abc'); // NaN (invalid!)
BadPercentageSchema.parse(Infinity); // Infinity (invalid!)
```

**Solution:** Validate after coercion

```typescript
// ✅ GOOD: Validates coerced value
const GoodPercentageSchema = z.coerce
  .number()
  .refine((n) => Number.isFinite(n), 'Must be finite')
  .min(0, 'Must be non-negative')
  .max(100, 'Cannot exceed 100');
```

### 6. Circular Schema Imports

**Problem:** File A imports B, B imports A

```typescript
// ❌ BAD: Circular dependency
// schemas/fund.ts
import { CompanySchema } from './company';
export const FundSchema = z.object({
  companies: z.array(CompanySchema),
});

// schemas/company.ts
import { FundSchema } from './fund'; // ← Circular!
export const CompanySchema = z.object({
  fundId: FundSchema.shape.id, // Breaks!
});
```

**Solution:** Use lazy evaluation or inline references

```typescript
// ✅ GOOD: Reference by ID, not full schema
// schemas/company.ts
export const CompanySchema = z.object({
  fundId: z.number(), // Reference, not full FundSchema
});
```

### 7. Default Values Hiding Missing Data

**Problem:** Defaults mask user errors

```typescript
// ❌ BAD: Default hides missing input
const RegistrationSchema = z.object({
  username: z.string().default('user'), // User never entered username!
  password: z.string().default('password123'), // Dangerous!
});

RegistrationSchema.parse({}); // ✅ Valid, but shouldn't be
```

**Solution:** Only default truly optional fields

```typescript
// ✅ GOOD: Required fields have no defaults
const RegistrationSchema = z.object({
  username: z.string().min(1, 'Username required'),
  password: z.string().min(8, 'Password required'),
  newsletter: z.boolean().default(false), // Truly optional
});
```

---

## Definition of Done

**Security/Reliability:** Schema validation at API boundaries; validation errors
fail-fast (no timeout); no retry logic (validation is deterministic)
**Observability:** Log `{schema_name, validation_error_count, failed_fields}`;
metric: `validation.parse_duration_ms`; span: `validate.{schema}`
**Performance:** Target p95 < 5ms per schema parse; cache: N/A (Zod is fast
enough) **Example:** `FundSchema.parse(data)` → returns typed data or throws
ZodError **Ownership:** DRI=validation layer maintainer; next review: 2025-05-06

---

**Related Documentation:**

- [01-overview.md](./01-overview.md) - Validation architecture overview
- [03-type-system.md](./03-type-system.md) - TypeScript type inference from
  schemas
- [04-integration.md](./04-integration.md) - Cross-boundary validation flows
