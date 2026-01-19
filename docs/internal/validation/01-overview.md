---
status: ACTIVE
last_updated: 2026-01-19
---

# Data Validation Overview

**Purpose:** Architectural overview of validation strategy, integration points,
and design rationale for the VC fund modeling platform's validation layer.

**Audience:** Internal reference for developers implementing or maintaining
validation logic across frontend/backend boundaries.

---

## Table of Contents

1. [Overview](#overview)
2. [Integration Points](#integration-points)
3. [Design Rationale](#design-rationale)
4. [Schema Organization](#schema-organization)
5. [Error Handling](#error-handling)
6. [End-to-End Example](#end-to-end-example)
7. [Common Gotchas](#common-gotchas)

---

## Overview

### Validation Architecture

The platform uses **Zod** as the primary validation library, providing runtime
type checking with TypeScript type inference across three layers:

```
┌─────────────────┐
│  Frontend Form  │ ← Zod validation (client/src/lib/validation.ts)
└────────┬────────┘
         │ HTTP POST
         ▼
┌─────────────────┐
│   API Route     │ ← Zod validation (server/routes/*.ts)
└────────┬────────┘
         │ .parse()
         ▼
┌─────────────────┐
│   Database      │ ← Drizzle schema enforcement (shared/schema/*.ts)
└─────────────────┘
```

**Key characteristics:**

- **Shared schemas:** 70+ Zod schemas in `shared/schemas/` used by frontend +
  backend
- **Type inference:** TypeScript types auto-generated from schemas
  (`z.infer<typeof Schema>`)
- **Strict mode:** TypeScript strict mode enabled, catches type mismatches at
  compile time
- **Runtime validation:** Zod validates at API boundaries, prevents invalid data
  from reaching database
- **Coercion:** Form inputs automatically coerced (strings → numbers, ISO
  strings → dates)

### Why Validation Matters

**Without validation:**

```typescript
// User submits "100" (string) for fund size
const fundSize = req.body.fundSize; // "100"
const calculations = fundSize * 0.02; // "1000.02" (string concat!)
// Bug: calculations are now strings, breaks downstream math
```

**With Zod validation:**

```typescript
const CreateFundSchema = z.object({
  fundSize: z.coerce.number().positive(),
});
const parsed = CreateFundSchema.parse(req.body);
// parsed.fundSize is guaranteed to be number > 0
```

---

## Integration Points

### 1. Frontend Form Validation

**Location:** `client/src/lib/validation.ts`, `client/src/schemas/*.ts`

Forms validate before submission to provide immediate feedback:

```typescript
// client/src/components/modeling-wizard/steps/GeneralInfoStep.tsx
import { WizardStepSchema } from '@/schemas/modeling-wizard.schemas';

const result = WizardStepSchema.safeParse(formData);
if (!result.success) {
  const errors = zodErrorsToMap(result.error);
  // Display errors to user
}
```

**Features:**

- `safeParse()` returns `{ success: boolean, data?, error? }`
- Errors mapped to field paths:
  `{ "stageAllocation.reserves": ["Must sum to 100%"] }`
- Focus management: `focusFirstError()` scrolls to invalid field
- Coercion enabled by default: `z.coerce.number()` converts form strings

### 2. API Route Validation

**Location:** `server/routes/*.ts`, `server/validators/*.ts`

API routes validate request bodies before processing:

```typescript
// server/routes/funds.ts
import { z } from 'zod';

const CreateFundSchema = z.object({
  basics: z.object({
    name: z.string().min(1),
    size: z.number().positive(),
  }),
});

router.post('/funds', async (req, res) => {
  const parsed = CreateFundSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }
  // parsed.data is type-safe
});
```

**Error handling:**

- `safeParse()` prevents exceptions, returns structured errors
- HTTP 400 (Bad Request) for validation failures
- Error format: `{ error: { fieldName: { _errors: ["message"] } } }`

### 3. Database Write Validation

**Location:** `server/storage.ts`, `shared/schema/*.ts`

Drizzle ORM enforces schema constraints at database layer:

```typescript
// shared/schema/index.ts (Drizzle schema)
export const funds = pgTable('funds', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  size: numeric('size').notNull(),
});

// server/storage.ts
await db.insert(funds).values({
  name: validated.name,
  size: validated.size.toString(), // Convert number to numeric string
});
```

**Schema enforcement:**

- Drizzle validates types at insert/update
- NOT NULL constraints enforced
- Type mismatches caught before SQL execution

### 4. Cross-Boundary Type Sync

**Location:** `shared/types.ts`, `shared/api-types.gen.ts`

Shared types ensure frontend and backend speak the same language:

```typescript
// shared/types.ts
export const ReserveInputSchema = z.object({
  id: z.number().int().positive(),
  invested: z.number().min(0),
  stage: z.string().min(1),
});
export type ReserveInput = z.infer<typeof ReserveInputSchema>;

// client/src/services/funds.ts (frontend)
import type { ReserveInput } from '@shared/types';

// server/routes/reserves-api.ts (backend)
import { ReserveInputSchema } from '@shared/types';
```

---

## Design Rationale

### Why Zod over Yup/Joi/io-ts?

**Decision:** Standardize on Zod for all validation (2024-10-03)

| Library | Pros                                                                                                                           | Cons                                                     | Decision      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------- |
| **Zod** | • First-class TypeScript<br>• Type inference from schemas<br>• Composable with `.extend()`, `.merge()`<br>• Active maintenance | • Larger bundle (~14KB gzipped)                          | ✅ **CHOSEN** |
| Yup     | • Smaller bundle (~8KB)<br>• React ecosystem integration                                                                       | • Weaker TypeScript support<br>• Manual type definitions | ❌            |
| Joi     | • Mature, battle-tested<br>• Backend-focused                                                                                   | • No native TypeScript types<br>• Verbose API            | ❌            |
| io-ts   | • Functional programming style<br>• Runtime type checking                                                                      | • Steep learning curve<br>• Complex error types          | ❌            |

**Alternatives considered:**

1. **Manual validation functions**
   - ❌ Rejected: No type inference, error-prone, hard to maintain
   - Would require duplicate type definitions for TypeScript

2. **TypeScript only (no runtime validation)**
   - ❌ Rejected: Compile-time types don't protect against runtime data
   - User inputs, API responses, database queries all need runtime checks

3. **GraphQL schema validation**
   - ⚠️ Considered: Would require GraphQL migration (large effort)
   - Current REST API works well with Zod

**Trade-offs accepted:**

- **Bundle size** (+14KB) vs **Developer Experience** → DX wins
  - Type safety prevents bugs worth the bundle cost
  - Modern bundlers tree-shake unused schemas

- **Learning curve** (Zod API) vs **Type safety** → Type safety wins
  - Zod API is intuitive: `z.string()`, `z.number()`
  - Type inference eliminates manual type maintenance

- **Runtime cost** (validation overhead) vs **Correctness** → Correctness wins
  - Validation typically <1ms per request
  - Prevents expensive debugging of type-related bugs

**When to revisit this decision:**

1. **Bundle size becomes critical** (e.g., mobile-first app)
   - Consider code splitting by route, lazy-load schemas
   - Evaluate lighter alternatives (Yup, custom validators)

2. **GraphQL migration** (if API paradigm shifts)
   - GraphQL has built-in validation
   - Could replace Zod at API boundary

3. **Performance bottlenecks in validation** (unlikely)
   - Profile validation overhead in production
   - Consider caching validated schemas

### Why Shared Schemas?

**Decision:** Centralize schemas in `shared/schemas/` (2024-10-03)

**Rationale:**

1. **Single Source of Truth:** One schema definition → frontend + backend
2. **Type Consistency:** Prevents frontend/backend type drift
3. **Refactoring Safety:** Schema changes propagate automatically via TypeScript
   errors
4. **DRY Principle:** No duplicate validation logic

**Example:**

```typescript
// ❌ BAD: Duplicate schemas
// client/src/validation/fund.ts
const ClientFundSchema = z.object({ size: z.number() });

// server/validators/fund.ts
const ServerFundSchema = z.object({ size: z.string() }); // Drift!

// ✅ GOOD: Shared schema
// shared/schemas/fund-model.ts
export const FundSchema = z.object({ size: z.number() });

// Both import from same source
import { FundSchema } from '@shared/schemas/fund-model';
```

**Trade-offs:**

- **Coupling** (shared dependency) vs **Consistency** → Consistency wins
- **Monorepo structure** required (already in place)
- **Build complexity** slightly increased (path aliases configured)

---

## Schema Organization

### Current Structure (70+ Schemas)

**Centralized schemas:** `shared/schemas/`

```
shared/schemas/
├── fund-model.ts              # Core fund schemas (FundModelInputsSchema, FundModelOutputsSchema)
├── waterfall-policy.ts        # Waterfall distribution (AmericanWaterfallSchema)
├── reserves-schemas.ts        # Reserve allocation (ReserveAllocationInputSchema)
├── fee-profile.ts             # Fee structures (FeeProfileSchema)
├── capital-call-policy.ts     # Capital call rules
├── recycling-policy.ts        # Exit proceeds recycling
├── stage-profile.ts           # Investment stage definitions
├── unit-schemas.ts            # Unit of measurement validation
├── decimal-zod.ts             # Decimal.js integration
└── index.ts                   # Re-exports
```

**Domain-specific schemas:** `server/validators/`, `client/src/schemas/`

```
server/validators/
└── fundSchema.ts              # Cross-field validation (allocation sum, graduation rates)

client/src/schemas/
├── reserves-schema.ts         # Frontend-specific reserve UI schemas
└── modeling-wizard.schemas.ts # Wizard step validation
```

**Helpers:** `shared/schema-helpers.ts`

```typescript
// Reusable validation patterns
export const nonNegative = () => z.coerce.number().min(0);
export const bounded01 = () => z.coerce.number().min(0).max(1);
export const percent100 = () => z.coerce.number().min(0).max(100);
export const positiveInt = () => z.coerce.number().int().min(1);
```

### Schema Naming Conventions

**Pattern:** `{Domain}{Purpose}Schema`

Examples:

- `FundModelInputsSchema` (fund calculation inputs)
- `AmericanWaterfallSchema` (waterfall policy)
- `ReserveAllocationInputSchema` (reserve engine inputs)
- `PortfolioCompanySchema` (portfolio company data)

**Type inference:** Remove "Schema" suffix

```typescript
export const FundModelInputsSchema = z.object({...});
export type FundModelInputs = z.infer<typeof FundModelInputsSchema>;
```

### Scattered vs Centralized Trade-offs

**Current approach:** Mix of centralized (shared/) and scattered
(domain-specific)

**Pros:**

- ✅ Core business logic centralized in `shared/schemas/`
- ✅ UI-specific validation stays in `client/src/schemas/`
- ✅ Backend-specific rules in `server/validators/`

**Cons:**

- ⚠️ No schema catalog (developers must search codebase)
- ⚠️ Potential duplication between layers
- ⚠️ Hard to enforce "use shared schema" convention

**Future improvement:** Schema registry

```typescript
// Proposed: shared/schemas/registry.ts
export const SCHEMA_REGISTRY = {
  fund: {
    input: FundModelInputsSchema,
    output: FundModelOutputsSchema,
  },
  waterfall: {
    american: AmericanWaterfallSchema,
  },
  // ... all schemas cataloged
};
```

---

## Error Handling

### ValidationError → ApiError Propagation

**Flow:**

```
1. Zod validation fails → ZodError thrown
2. Error handler catches ZodError
3. Convert to ApiError with HTTP status
4. Return user-friendly message to client
```

**Implementation:**

```typescript
// server/lib/errorHandling.ts
export class UnifiedErrorHandler {
  private createErrorResponse(error: Error, context: ErrorContext) {
    if (isValidationError(error)) {
      return {
        statusCode: 400,
        body: createErrorBody(
          'Validation Error',
          context.requestId,
          'VALIDATION_ERROR'
        ),
      };
    }
    // ... other error types
  }
}

// server/types/errors.ts
export function isValidationError(error: Error): boolean {
  return error.name === 'ZodError';
}
```

**Express middleware:**

```typescript
// server/routes/funds.ts
router.post('/funds', async (req, res, next) => {
  try {
    const parsed = CreateFundSchema.parse(req.body);
    // ... process request
  } catch (err) {
    next(err); // Passes to error handler
  }
});

// Error handler converts ZodError → HTTP 400
app.use(globalErrorHandler.middleware());
```

### User-Friendly Messages

**Default Zod errors are technical:**

```json
{
  "code": "too_small",
  "minimum": 1,
  "type": "number",
  "message": "Number must be greater than or equal to 1"
}
```

**Custom messages for business context:**

```typescript
// server/validators/fundSchema.ts
const fundSchema = CompleteFundSetupSchema.refine(
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

**Frontend error display:**

```typescript
// client/src/lib/validation.ts
export function zodErrorsToMap(err: ZodError): FieldErrors {
  const out: FieldErrors = {};
  err.issues.forEach((issue) => {
    const key = issue.path.join('.') || '_root';
    (out[key] ??= []).push(issue.message);
  });
  return out;
}

// Usage in UI
const errors = zodErrorsToMap(result.error);
{errors['fundSize'] && (
  <span className="text-red-500">{errors['fundSize'][0]}</span>
)}
```

---

## End-to-End Example

### Scenario: Create Fund with Stage Allocations

**1. Frontend form validation**

```typescript
// client/src/components/modeling-wizard/steps/GeneralInfoStep.tsx
import { z } from 'zod';

const GeneralInfoSchema = z.object({
  fundName: z.string().min(1, 'Fund name required'),
  fundSize: z.coerce.number().positive('Fund size must be positive'),
  stageAllocations: z.array(
    z.object({
      stage: z.string(),
      percentage: z.number().min(0).max(100),
    })
  ),
});

const handleSubmit = (data) => {
  const result = GeneralInfoSchema.safeParse(data);
  if (!result.success) {
    // Show errors in UI
    const errors = zodErrorsToMap(result.error);
    setFieldErrors(errors);
    return;
  }
  // Submit to API
  await createFund(result.data);
};
```

**2. API route validation**

```typescript
// server/routes/funds.ts
const CreateFundSchema = z.object({
  basics: z.object({
    name: z.string().min(1),
    size: z.number().positive(),
  }),
  strategy: z.object({
    stages: z.array(
      z.object({
        name: z.string().min(1),
        graduate: percent100(),
        exit: percent100(),
      })
    ),
  }),
});

router.post('/funds', async (req, res) => {
  const parsed = CreateFundSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  // Cross-field validation
  const totalAllocation = parsed.data.strategy.stages.reduce(
    (sum, s) => sum + s.graduate + s.exit,
    0
  );
  if (totalAllocation > 100) {
    return res.status(400).json({
      error: 'Total stage allocation exceeds 100%',
    });
  }

  // Data is validated, proceed to database
  const fund = await storage.createFund(parsed.data);
  res.status(201).json({ id: fund.id });
});
```

**3. Database write**

```typescript
// server/storage.ts
import { db } from './db';
import { funds } from '@shared/schema';

export class DbStorage {
  async createFund(data) {
    // Drizzle schema enforces types
    const [fund] = await db
      .insert(funds)
      .values({
        name: data.basics.name,
        size: data.basics.size.toString(), // numeric type in DB
      })
      .returning();

    return fund;
  }
}
```

**4. Type safety verification**

```typescript
// TypeScript catches type mismatches at compile time
const fundData: z.infer<typeof CreateFundSchema> = {
  basics: {
    name: 'My Fund',
    size: '100000000', // ❌ Type error: Expected number, got string
  },
};

// Fix: Use correct type
const fundData: z.infer<typeof CreateFundSchema> = {
  basics: {
    name: 'My Fund',
    size: 100_000_000, // ✅ Correct
  },
};
```

---

## Common Gotchas

### 1. Schema Drift Between Frontend/Backend

**Problem:** Frontend and backend schemas diverge over time

```typescript
// client/src/schemas/fund.ts (frontend)
const FundSchema = z.object({
  size: z.number(),
  fees: z.number(), // Added field
});

// server/validators/fund.ts (backend - forgot to update)
const FundSchema = z.object({
  size: z.number(),
  // Missing 'fees' field
});

// Result: Frontend sends 'fees', backend rejects it
```

**Solution:** Use shared schemas from `shared/schemas/`

```typescript
// ✅ Both import from same source
import { FundSchema } from '@shared/schemas/fund-model';
```

**When schema drift is acceptable:**

- UI-specific validation (e.g., password strength, form state)
- Backend-specific rules (e.g., database constraints, auth checks)

### 2. Circular Dependencies

**Problem:** Schema A imports Schema B, Schema B imports Schema A

```typescript
// shared/schemas/fund.ts
import { CompanySchema } from './company';
export const FundSchema = z.object({
  companies: z.array(CompanySchema),
});

// shared/schemas/company.ts
import { FundSchema } from './fund'; // ❌ Circular!
export const CompanySchema = z.object({
  fund: FundSchema,
});
```

**Solution 1:** Inline nested schema

```typescript
// shared/schemas/company.ts
export const CompanySchema = z.object({
  fund: z.object({ id: z.number() }), // Reference, not full schema
});
```

**Solution 2:** Use `.lazy()` for recursive schemas

```typescript
export const CompanySchema: z.ZodType<Company> = z.lazy(() =>
  z.object({
    fund: FundSchema, // Evaluated lazily
  })
);
```

### 3. Optional vs Nullable Confusion

**Problem:** `optional()` and `nullable()` have different semantics

```typescript
const Schema1 = z.object({
  value: z.string().optional(), // Can be undefined or string
});
Schema1.parse({ value: undefined }); // ✅ Valid
Schema1.parse({ value: null }); // ❌ Invalid

const Schema2 = z.object({
  value: z.string().nullable(), // Can be null or string
});
Schema2.parse({ value: undefined }); // ❌ Invalid
Schema2.parse({ value: null }); // ✅ Valid

const Schema3 = z.object({
  value: z.string().nullable().optional(), // Can be null, undefined, or string
});
Schema3.parse({ value: undefined }); // ✅ Valid
Schema3.parse({ value: null }); // ✅ Valid
Schema3.parse({}); // ✅ Valid (field omitted)
```

**Rule of thumb:**

- **Database nullable columns** → `.nullable()` (SQL NULL)
- **Optional form fields** → `.optional()` (field may not exist)
- **API responses with null** → `.nullable().optional()` (belt-and-suspenders)

### 4. Coercion Side Effects

**Problem:** Coercion can hide bugs

```typescript
const Schema = z.object({
  percentage: z.coerce.number(),
});

Schema.parse({ percentage: 'abc' }); // NaN (coercion succeeds!)
```

**Solution:** Add validation after coercion

```typescript
const Schema = z.object({
  percentage: z.coerce
    .number()
    .refine((n) => !Number.isNaN(n), 'Must be a valid number')
    .min(0)
    .max(100),
});
```

**Helper:** Use `shared/schema-helpers.ts`

```typescript
import { percent100 } from '@shared/schema-helpers';

const Schema = z.object({
  percentage: percent100(), // Coercion + bounds + NaN check
});
```

### 5. Refinement Execution Order

**Problem:** Refinements run **after** base validation

```typescript
const Schema = z
  .string()
  .min(1, 'Required')
  .refine((s) => s.includes('@'), 'Must be email'); // ❌ Runs after min check

Schema.parse(''); // Error: "Required" (refinement never runs)
```

**Solution:** Order matters, use `.email()` for built-in validation

```typescript
const Schema = z.string().email('Must be email'); // ✅ Built-in validator
```

**Complex cross-field validation:** Use `.superRefine()`

```typescript
const Schema = z
  .object({
    password: z.string(),
    confirm: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords must match',
        path: ['confirm'],
      });
    }
  });
```

### 6. Default Values vs Required Fields

**Problem:** Defaults hide missing required data

```typescript
const Schema = z.object({
  fundSize: z.number().default(100_000_000), // Default hides missing input
});

Schema.parse({}); // ✅ Valid, fundSize = 100000000
// But user never entered fund size!
```

**Solution:** Only use defaults for truly optional fields

```typescript
const Schema = z.object({
  fundSize: z.number(), // Required, no default
  managementFee: z.number().default(0.02), // Optional with sensible default
});
```

**Frontend forms:** Separate UI defaults from validation

```typescript
// UI layer provides defaults
const formDefaults = { managementFee: 0.02 };

// Validation requires explicit input
const Schema = z.object({
  managementFee: z.number(), // No default in schema
});
```

---

## Definition of Done

**Security/Reliability:** Input validation at API boundaries; Zod schemas
timeout N/A; validation retries N/A (fail-fast) **Observability:** Log
`{validation_errors, field_path, error_type}`; metric:
`validation.failure_rate`; span: `validate.schema` **Performance:** Target p95 <
5ms per schema validation; cache: N/A (schemas are cheap to validate)
**Example:** `CreateFundSchema.parse(data)` → throws ZodError on invalid input,
returns typed data on success **Ownership:** DRI=validation layer maintainer;
next review: 2026-05-06

---

**Related Documentation:**

- [02-zod-patterns.md](./02-zod-patterns.md) - Schema composition techniques
- [03-type-system.md](./03-type-system.md) - TypeScript integration patterns
- [04-integration.md](./04-integration.md) - Cross-boundary validation flows
