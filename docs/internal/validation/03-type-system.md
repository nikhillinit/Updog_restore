# Type System Integration: TypeScript + Zod

**Purpose:** Type-safe patterns for integrating Zod validation with TypeScript's
type system. Learn type inference, type guards, discriminated unions, branded
types, and cross-boundary type synchronization.

**Audience:** Developers working on frontend/backend integration or refactoring
type definitions.

---

## Table of Contents

1. [Type Inference](#type-inference)
2. [Type Guards](#type-guards)
3. [Discriminated Unions](#discriminated-unions)
4. [Branded Types](#branded-types)
5. [Schema → Type Generation](#schema--type-generation)
6. [Frontend ↔ Backend Type Sync](#frontend--backend-type-sync)
7. [Examples with Tests](#examples-with-tests)
8. [Edge Cases](#edge-cases)

---

## Type Inference

### Basic Inference with `z.infer`

Zod schemas automatically generate TypeScript types:

```typescript
import { z } from 'zod';

// Define schema
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.date(),
});

// Infer type from schema
type User = z.infer<typeof UserSchema>;

// Equivalent to:
// type User = {
//   id: number;
//   name: string;
//   email: string;
//   createdAt: Date;
// };
```

**Benefits:**

- ✅ Single source of truth (schema defines both validation + types)
- ✅ No type/validation drift
- ✅ Refactor-safe (schema changes propagate to types)

### Inference with Transformations

Transformations change the output type:

```typescript
const InputSchema = z.object({
  dateString: z.string(),
});

const TransformedSchema = InputSchema.transform((data) => ({
  ...data,
  date: new Date(data.dateString), // Add field
}));

// Input type (before transform)
type Input = z.input<typeof TransformedSchema>;
// { dateString: string }

// Output type (after transform)
type Output = z.infer<typeof TransformedSchema>;
// { dateString: string; date: Date }
```

**Real example from codebase:**

```typescript
// shared/schemas/decimal-zod.ts
export const ZodPercentage = z
  .union([z.string(), z.number(), z.instanceof(Decimal)])
  .transform((val) => {
    if (val instanceof Decimal) return val;
    return new Decimal(val);
  });

// Input type: string | number | Decimal
type InputType = z.input<typeof ZodPercentage>;

// Output type: Decimal
type OutputType = z.infer<typeof ZodPercentage>;
```

### Inference with Refinements

Refinements don't change the type, only add runtime constraints:

```typescript
const PositiveNumberSchema = z
  .number()
  .refine((n) => n > 0, 'Must be positive');

// Type is still 'number', but runtime validates > 0
type PositiveNumber = z.infer<typeof PositiveNumberSchema>;
// number
```

**Branded types for stronger compile-time safety:**

```typescript
// Opaque type (nominal typing)
type PositiveNumber = number & { __brand: 'positive' };

const PositiveNumberSchema = z
  .number()
  .refine((n) => n > 0, 'Must be positive')
  .transform((n) => n as PositiveNumber);

type Inferred = z.infer<typeof PositiveNumberSchema>;
// PositiveNumber (branded)
```

### Readonly Inference

Zod schemas infer mutable types by default:

```typescript
const ConfigSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
});

type Config = z.infer<typeof ConfigSchema>;
// { apiUrl: string; timeout: number } ← mutable

// Make readonly
type ReadonlyConfig = Readonly<z.infer<typeof ConfigSchema>>;
// { readonly apiUrl: string; readonly timeout: number }

// Deep readonly
type DeepReadonlyConfig = DeepReadonly<z.infer<typeof ConfigSchema>>;
```

**When to use readonly:**

- Configuration objects (shouldn't be mutated)
- API responses (immutable data)
- Redux state (immutability enforced)

---

## Type Guards

### Runtime Type Checking

Type guards narrow TypeScript types at runtime:

```typescript
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
});

type User = z.infer<typeof UserSchema>;

// Type guard function
function isUser(value: unknown): value is User {
  return UserSchema.safeParse(value).success;
}

// Usage
function processUser(input: unknown) {
  if (isUser(input)) {
    // TypeScript knows input is User
    console.log(input.name); // ✅ Type-safe
  } else {
    console.error('Invalid user data');
  }
}
```

**Benefits:**

- ✅ Single validation + type narrowing
- ✅ Works with `unknown` types (API responses, user input)
- ✅ Type-safe after guard

### Discriminated Union Type Guards

Type guards for discriminated unions:

```typescript
// Waterfall types
type AmericanWaterfall = {
  type: 'AMERICAN';
  carryPercentage: number;
  carryVesting: {
    cliffYears: number;
    vestingYears: number;
  };
};

type EuropeanWaterfall = {
  type: 'EUROPEAN';
  carryPercentage: number;
  wholeOfFund: boolean;
};

type Waterfall = AmericanWaterfall | EuropeanWaterfall;

// Type guard
function isAmerican(w: Waterfall): w is AmericanWaterfall {
  return w.type === 'AMERICAN';
}

function isEuropean(w: Waterfall): w is EuropeanWaterfall {
  return w.type === 'EUROPEAN';
}

// Usage
function processWaterfall(w: Waterfall) {
  if (isAmerican(w)) {
    // TypeScript knows w is AmericanWaterfall
    console.log(w.carryVesting.cliffYears); // ✅ Type-safe
  } else {
    // TypeScript knows w is EuropeanWaterfall
    console.log(w.wholeOfFund); // ✅ Type-safe
  }
}
```

**Real example from codebase:**

```typescript
// client/src/lib/waterfall.ts
export const isAmerican = (
  w: Waterfall
): w is Extract<Waterfall, { type: 'AMERICAN' }> => w.type === 'AMERICAN';

// Usage in UI
export function applyWaterfallChange(
  w: Waterfall,
  field: string,
  value: unknown
): Waterfall {
  if (field === 'carryVesting') {
    // Only American waterfalls have carryVesting
    if (isAmerican(w)) {
      const cv = value as Waterfall['carryVesting'];
      return {
        ...w,
        carryVesting: {
          cliffYears: clampInt(cv.cliffYears, 0, 10),
          vestingYears: clampInt(cv.vestingYears, 1, 10),
        },
      };
    }
  }
  return { ...w, [field]: value } as Waterfall;
}
```

### Schema-Based Type Guards

Generate type guards from Zod schemas:

```typescript
const StageSchema = z.enum(['seed', 'series_a', 'series_b', 'series_c']);
type Stage = z.infer<typeof StageSchema>;

// Type guard from schema
function isValidStage(value: unknown): value is Stage {
  return StageSchema.safeParse(value).success;
}

// Generic type guard factory
function createTypeGuard<T>(schema: z.ZodSchema<T>) {
  return (value: unknown): value is T => {
    return schema.safeParse(value).success;
  };
}

// Usage
const isUser = createTypeGuard(UserSchema);
const isStage = createTypeGuard(StageSchema);
```

### Exhaustive Type Checking

Ensure all union cases are handled:

```typescript
type InvestmentEvent =
  | { type: 'initial'; amount: number }
  | { type: 'followOn'; amount: number; round: string }
  | { type: 'exit'; exitValue: number }
  | { type: 'writeOff'; reason: string };

function processEvent(event: InvestmentEvent): string {
  switch (event.type) {
    case 'initial':
      return `Initial investment: $${event.amount}`;
    case 'followOn':
      return `Follow-on ${event.round}: $${event.amount}`;
    case 'exit':
      return `Exit: $${event.exitValue}`;
    case 'writeOff':
      return `Write-off: ${event.reason}`;
    default:
      // Exhaustiveness check
      const _exhaustive: never = event;
      return _exhaustive; // ❌ Compile error if case missing
  }
}
```

---

## Discriminated Unions

### Type-Safe Union Handling

Discriminated unions provide type-safe pattern matching:

```typescript
// Define union with discriminator field
type Result<T, E> = { success: true; data: T } | { success: false; error: E };

// Type-safe handling
function processResult<T, E>(result: Result<T, E>) {
  if (result.success) {
    // TypeScript knows result.data exists
    console.log(result.data); // ✅ Type-safe
    // console.log(result.error); // ❌ Compile error
  } else {
    // TypeScript knows result.error exists
    console.log(result.error); // ✅ Type-safe
    // console.log(result.data); // ❌ Compile error
  }
}
```

### Waterfall Type Handling (Real Example)

```typescript
// shared/schemas/waterfall-policy.ts

const BaseWaterfallPolicySchemaCore = z.object({
  id: z.string(),
  name: z.string(),
  tiers: z.array(WaterfallTierSchema),
  preferredReturnRate: ZodPercentage,
});

const AmericanWaterfallSchemaCore = BaseWaterfallPolicySchemaCore.extend({
  type: z.literal('american'),
});

export const AmericanWaterfallSchema = AmericanWaterfallSchemaCore.refine(
  validateTierPriorities,
  { message: 'Waterfall tier priorities must be unique', path: ['tiers'] }
);

export type AmericanWaterfall = z.infer<typeof AmericanWaterfallSchemaCore>;

// Type guard
export const isAmerican = (w: Waterfall): w is AmericanWaterfall =>
  w.type === 'AMERICAN';

// Calculation function (type-safe)
export function calculateAmericanWaterfall(
  policy: AmericanWaterfall, // ← Only accepts American type
  exitProceeds: Decimal,
  dealCost: Decimal
): DistributionAllocation {
  // Implementation guaranteed to have American-specific fields
  const sortedTiers = [...policy.tiers].sort((a, b) => a.priority - b.priority);
  // ...
}
```

**Usage:**

```typescript
function calculateDistribution(
  policy: Waterfall,
  proceeds: number,
  cost: number
) {
  if (isAmerican(policy)) {
    // Type-safe: TypeScript knows policy is AmericanWaterfall
    return calculateAmericanWaterfall(
      policy,
      new Decimal(proceeds),
      new Decimal(cost)
    );
  }

  throw new Error(`Unsupported waterfall type: ${policy.type}`);
}
```

### Stage Validation (Real Example)

Investment stages have validation mode:

```typescript
// Type definitions
type ValidationMode = 'enforce' | 'warn' | 'off';

type StageValidationResult =
  | { valid: true; normalized: string }
  | { valid: false; reason: string; suggestion?: string };

// Type guard for valid result
function isValidResult(
  result: StageValidationResult
): result is Extract<StageValidationResult, { valid: true }> {
  return result.valid === true;
}

// Usage
function processStage(stage: string, mode: ValidationMode): string {
  const result = validateStage(stage);

  if (isValidResult(result)) {
    // TypeScript knows result.normalized exists
    return result.normalized;
  } else {
    // TypeScript knows result.reason exists
    if (mode === 'enforce') {
      throw new Error(result.reason);
    } else if (mode === 'warn') {
      console.warn(result.reason, result.suggestion);
    }
    return stage; // Return original
  }
}
```

---

## Branded Types

### Opaque Type IDs

Prevent mixing different ID types:

```typescript
// Define branded types
type FundId = number & { __brand: 'FundId' };
type CompanyId = number & { __brand: 'CompanyId' };
type UserId = number & { __brand: 'UserId' };

// Constructor functions
function createFundId(id: number): FundId {
  return id as FundId;
}

function createCompanyId(id: number): CompanyId {
  return id as CompanyId;
}

// Type-safe functions
function getFund(id: FundId): Fund {
  // Implementation
}

function getCompany(id: CompanyId): Company {
  // Implementation
}

// Usage
const fundId = createFundId(123);
const companyId = createCompanyId(456);

getFund(fundId); // ✅ Correct
getFund(companyId); // ❌ Compile error: Type 'CompanyId' not assignable to 'FundId'
```

### Schema Integration

```typescript
const FundIdSchema = z
  .number()
  .int()
  .positive()
  .transform((n) => n as FundId);

const CompanyIdSchema = z
  .number()
  .int()
  .positive()
  .transform((n) => n as CompanyId);

// API schema
const GetFundRequestSchema = z.object({
  fundId: FundIdSchema,
});

type GetFundRequest = z.infer<typeof GetFundRequestSchema>;
// { fundId: FundId }
```

### When to Use Branded Types

**Use branded types for:**

- ✅ Entity IDs (FundId, CompanyId, UserId)
- ✅ Security tokens (SessionToken, ApiKey)
- ✅ Validated data (Email, PhoneNumber, URL)

**Don't use for:**

- ❌ Simple primitives (string, number) without semantic meaning
- ❌ Over-engineering (adds complexity for little benefit)

---

## Schema → Type Generation

### Manual Type Exports

```typescript
// shared/schemas/fund-model.ts

export const FundModelInputsSchema = z.object({
  fundSize: z.number().positive(),
  periodLengthMonths: z.number().int().positive(),
  managementFeeRate: z.number().min(0).max(0.05),
});

// Export inferred type
export type FundModelInputs = z.infer<typeof FundModelInputsSchema>;

// Usage in other files
import type { FundModelInputs } from '@shared/schemas/fund-model';
```

**Convention:** Always export type alongside schema

```typescript
// ✅ GOOD: Schema + Type
export const UserSchema = z.object({...});
export type User = z.infer<typeof UserSchema>;

// ❌ BAD: Schema only (consumers must infer manually)
export const UserSchema = z.object({...});
```

### Centralized Type Exports

```typescript
// shared/types.ts (re-export hub)

export {
  ReserveInputSchema,
  ReserveOutputSchema,
  ReserveSummarySchema,
} from './schemas/reserves-schemas';

export type {
  ReserveInput,
  ReserveOutput,
  ReserveSummary,
} from './schemas/reserves-schemas';

// Usage
import { ReserveInputSchema, type ReserveInput } from '@shared/types';
```

**Benefits:**

- ✅ Single import location
- ✅ Clear separation: values vs types
- ✅ Tree-shaking friendly (`type` imports removed at runtime)

### Auto-Generated API Types

```typescript
// shared/api-types.gen.ts (generated file)

// DO NOT EDIT - Auto-generated from schemas

export type CreateFundRequest = z.infer<typeof CreateFundSchema>;
export type CreateFundResponse = z.infer<typeof CreateFundResponseSchema>;
export type GetFundRequest = z.infer<typeof GetFundRequestSchema>;
export type GetFundResponse = z.infer<typeof GetFundResponseSchema>;

// ... 50+ types
```

**Generation script:**

```typescript
// scripts/generate-api-types.ts
import { z } from 'zod';
import fs from 'fs';

const schemas = [
  { name: 'CreateFundRequest', schema: CreateFundSchema },
  { name: 'CreateFundResponse', schema: CreateFundResponseSchema },
  // ...
];

let output = '// DO NOT EDIT - Auto-generated from schemas\n\n';

for (const { name, schema } of schemas) {
  output += `export type ${name} = z.infer<typeof ${schema.name}>;\n`;
}

fs.writeFileSync('shared/api-types.gen.ts', output);
```

---

## Frontend ↔ Backend Type Sync

### Shared Schema Pattern

**Problem:** Frontend and backend types drift over time

**Solution:** Single schema in `shared/`, imported by both

```typescript
// shared/schemas/fund-model.ts
export const CreateFundSchema = z.object({
  name: z.string().min(1),
  size: z.coerce.number().positive(),
  managementFee: z.coerce.number().min(0).max(0.05),
});

export type CreateFundInput = z.infer<typeof CreateFundSchema>;

// ============================================
// Frontend (client/src/services/funds.ts)
// ============================================
import {
  CreateFundSchema,
  type CreateFundInput,
} from '@shared/schemas/fund-model';

export async function createFund(input: CreateFundInput): Promise<Fund> {
  // Validate before sending
  const validated = CreateFundSchema.parse(input);

  const response = await fetch('/api/funds', {
    method: 'POST',
    body: JSON.stringify(validated),
  });

  return response.json();
}

// ============================================
// Backend (server/routes/funds.ts)
// ============================================
import {
  CreateFundSchema,
  type CreateFundInput,
} from '@shared/schemas/fund-model';

router.post('/api/funds', async (req, res) => {
  // Validate incoming data
  const parsed = CreateFundSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error });
  }

  const fund = await createFundInDb(parsed.data);
  res.json(fund);
});
```

**Benefits:**

- ✅ Types guaranteed to match (same schema source)
- ✅ Validation rules consistent
- ✅ Refactoring propagates automatically

### Type-Safe API Clients

```typescript
// client/src/services/api-client.ts

type ApiEndpoint<TRequest, TResponse> = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  requestSchema: z.ZodSchema<TRequest>;
  responseSchema: z.ZodSchema<TResponse>;
};

async function apiCall<TRequest, TResponse>(
  endpoint: ApiEndpoint<TRequest, TResponse>,
  request: TRequest
): Promise<TResponse> {
  // Validate request
  const validatedRequest = endpoint.requestSchema.parse(request);

  // Make API call
  const response = await fetch(endpoint.path, {
    method: endpoint.method,
    body: JSON.stringify(validatedRequest),
  });

  const data = await response.json();

  // Validate response
  return endpoint.responseSchema.parse(data);
}

// Define endpoints
const CREATE_FUND: ApiEndpoint<CreateFundInput, Fund> = {
  method: 'POST',
  path: '/api/funds',
  requestSchema: CreateFundSchema,
  responseSchema: FundSchema,
};

// Usage (type-safe)
const fund = await apiCall(CREATE_FUND, {
  name: 'My Fund',
  size: 100_000_000,
  managementFee: 0.02,
});
```

### Schema Versioning

Handle schema evolution across API versions:

```typescript
// shared/schemas/fund-model-v1.ts
export const FundSchemaV1 = z.object({
  name: z.string(),
  size: z.number(),
});

// shared/schemas/fund-model-v2.ts
export const FundSchemaV2 = z.object({
  name: z.string(),
  size: z.number(),
  currency: z.enum(['USD', 'EUR', 'GBP']).default('USD'), // New field
});

// Migration function
export function migrateFundV1toV2(v1: FundV1): FundV2 {
  return {
    ...v1,
    currency: 'USD', // Default for existing funds
  };
}

// Backend handles both versions
router.post('/api/funds', async (req, res) => {
  const version = req.header('API-Version') || 'v2';

  if (version === 'v1') {
    const parsed = FundSchemaV1.parse(req.body);
    const migrated = migrateFundV1toV2(parsed);
    // Process v2 internally
  } else {
    const parsed = FundSchemaV2.parse(req.body);
    // Process v2
  }
});
```

---

## Examples with Tests

### Example 1: Type Guard with Tests

```typescript
// Type definition
const UserSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  email: z.string().email(),
});

type User = z.infer<typeof UserSchema>;

// Type guard
function isUser(value: unknown): value is User {
  return UserSchema.safeParse(value).success;
}

// Tests
describe('isUser type guard', () => {
  it('returns true for valid user', () => {
    const user = { id: 1, name: 'Alice', email: 'alice@example.com' };
    expect(isUser(user)).toBe(true);
  });

  it('returns false for invalid user (missing field)', () => {
    const invalid = { id: 1, name: 'Alice' }; // Missing email
    expect(isUser(invalid)).toBe(false);
  });

  it('returns false for invalid user (wrong type)', () => {
    const invalid = { id: '1', name: 'Alice', email: 'alice@example.com' };
    expect(isUser(invalid)).toBe(false);
  });

  it('narrows TypeScript type', () => {
    const input: unknown = { id: 1, name: 'Alice', email: 'alice@example.com' };

    if (isUser(input)) {
      // TypeScript knows input is User here
      const name: string = input.name; // ✅ Type-safe
      expect(name).toBe('Alice');
    }
  });
});
```

### Example 2: Discriminated Union Tests

```typescript
// Types
type Result<T> = { success: true; data: T } | { success: false; error: string };

// Type guards
function isSuccess<T>(
  result: Result<T>
): result is Extract<Result<T>, { success: true }> {
  return result.success === true;
}

function isError<T>(
  result: Result<T>
): result is Extract<Result<T>, { success: false }> {
  return result.success === false;
}

// Tests
describe('Result type guards', () => {
  it('isSuccess narrows to success type', () => {
    const result: Result<number> = { success: true, data: 42 };

    if (isSuccess(result)) {
      expect(result.data).toBe(42); // ✅ Type-safe access
    }
  });

  it('isError narrows to error type', () => {
    const result: Result<number> = { success: false, error: 'Failed' };

    if (isError(result)) {
      expect(result.error).toBe('Failed'); // ✅ Type-safe access
    }
  });

  it('exhaustive handling compiles', () => {
    const result: Result<number> = { success: true, data: 42 };

    const output = isSuccess(result)
      ? `Data: ${result.data}`
      : `Error: ${result.error}`;

    expect(output).toBe('Data: 42');
  });
});
```

### Example 3: Branded Type Tests

```typescript
// Branded types
type FundId = number & { __brand: 'FundId' };
type CompanyId = number & { __brand: 'CompanyId' };

function createFundId(id: number): FundId {
  if (id <= 0) throw new Error('Invalid FundId');
  return id as FundId;
}

function createCompanyId(id: number): CompanyId {
  if (id <= 0) throw new Error('Invalid CompanyId');
  return id as CompanyId;
}

// Tests
describe('Branded type IDs', () => {
  it('creates valid FundId', () => {
    const id = createFundId(123);
    expect(id).toBe(123);
  });

  it('throws on invalid FundId', () => {
    expect(() => createFundId(0)).toThrow('Invalid FundId');
    expect(() => createFundId(-1)).toThrow('Invalid FundId');
  });

  it('prevents mixing ID types at compile time', () => {
    const fundId = createFundId(123);
    const companyId = createCompanyId(456);

    // This would fail type checking:
    // function getFund(id: FundId) { ... }
    // getFund(companyId); // ❌ Type error

    // Runtime check for test
    expect(typeof fundId).toBe('number');
    expect(typeof companyId).toBe('number');
  });
});
```

---

## Edge Cases

### 1. NaN Handling

**Problem:** `z.number()` accepts NaN

```typescript
const NumberSchema = z.number();

NumberSchema.parse(NaN); // ✅ Valid (NaN is type number!)
```

**Solution:** Validate finiteness

```typescript
const SafeNumberSchema = z
  .number()
  .refine((n) => Number.isFinite(n), 'Must be finite number');

SafeNumberSchema.parse(NaN); // ❌ Error
SafeNumberSchema.parse(Infinity); // ❌ Error
SafeNumberSchema.parse(42); // ✅ Valid
```

**Helper from codebase:**

```typescript
// client/src/lib/coerce.ts
export const clampInt = (
  n: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER
): number => {
  const v = Number(n);
  if (Number.isNaN(v)) return min; // Handle NaN
  if (v === Infinity) return max; // Handle Infinity
  if (v === -Infinity) return min; // Handle -Infinity
  return Math.min(max, Math.max(min, Math.round(v)));
};
```

### 2. Undefined vs Null

**Problem:** `optional()` and `nullable()` behave differently

```typescript
const OptionalSchema = z.object({
  value: z.string().optional(),
});

const NullableSchema = z.object({
  value: z.string().nullable(),
});

// Optional: accepts undefined or missing field
OptionalSchema.parse({ value: undefined }); // ✅ Valid
OptionalSchema.parse({}); // ✅ Valid
OptionalSchema.parse({ value: null }); // ❌ Invalid

// Nullable: accepts null, but field must exist
NullableSchema.parse({ value: null }); // ✅ Valid
NullableSchema.parse({ value: undefined }); // ❌ Invalid
NullableSchema.parse({}); // ❌ Invalid (missing field)
```

**Solution:** Use both for maximum flexibility

```typescript
const FlexibleSchema = z.object({
  value: z.string().nullable().optional(),
});

FlexibleSchema.parse({ value: 'hello' }); // ✅ Valid
FlexibleSchema.parse({ value: null }); // ✅ Valid
FlexibleSchema.parse({ value: undefined }); // ✅ Valid
FlexibleSchema.parse({}); // ✅ Valid
```

### 3. Empty Arrays

**Problem:** Arrays may be empty when not expected

```typescript
const CompaniesSchema = z.array(z.object({ id: z.number(), name: z.string() }));

CompaniesSchema.parse([]); // ✅ Valid (empty array)
```

**Solution:** Enforce non-empty

```typescript
const NonEmptyCompaniesSchema = z
  .array(z.object({ id: z.number(), name: z.string() }))
  .nonempty('At least one company required');

NonEmptyCompaniesSchema.parse([]); // ❌ Error
```

### 4. Extra Keys in Objects

**Problem:** Unexpected fields cause issues

```typescript
const StrictSchema = z
  .object({
    name: z.string(),
  })
  .strict();

StrictSchema.parse({ name: 'Alice', age: 30 }); // ❌ Error: Unrecognized key 'age'
```

**Solutions:**

```typescript
// Passthrough (allow extra keys)
const PassthroughSchema = z
  .object({
    name: z.string(),
  })
  .passthrough();

PassthroughSchema.parse({ name: 'Alice', age: 30 }); // ✅ Valid

// Strip (remove extra keys)
const StripSchema = z
  .object({
    name: z.string(),
  })
  .strip();

const result = StripSchema.parse({ name: 'Alice', age: 30 });
// result = { name: "Alice" } (age removed)
```

### 5. Date Parsing Edge Cases

**Problem:** Invalid date strings parse to Invalid Date

```typescript
const DateSchema = z.coerce.date();

const result = DateSchema.parse('not a date');
// result = Invalid Date (still type Date!)
```

**Solution:** Validate date validity

```typescript
const SafeDateSchema = z.coerce
  .date()
  .refine((d) => !isNaN(d.getTime()), 'Must be valid date');

SafeDateSchema.parse('not a date'); // ❌ Error
SafeDateSchema.parse('2024-01-01'); // ✅ Valid
```

### 6. Union Type Narrowing

**Problem:** TypeScript can't always narrow unions correctly

```typescript
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; size: number };

function getArea(shape: Shape): number {
  if (shape.kind === 'circle') {
    return Math.PI * shape.radius ** 2; // ✅ Narrowed
  } else if (shape.kind === 'square') {
    return shape.size ** 2; // ✅ Narrowed
  }

  // ❌ Implicit return undefined (if new kind added)
}
```

**Solution:** Exhaustive checking

```typescript
function getArea(shape: Shape): number {
  if (shape.kind === 'circle') {
    return Math.PI * shape.radius ** 2;
  } else if (shape.kind === 'square') {
    return shape.size ** 2;
  } else {
    const _exhaustive: never = shape;
    throw new Error(`Unhandled shape: ${JSON.stringify(_exhaustive)}`);
  }
}
```

---

## Definition of Done

**Security/Reliability:** Type guards validate at runtime boundaries; type
inference guarantees compile-time safety; no timeout/retry for type operations
**Observability:** Log `{type_guard_name, validation_result, input_type}`;
metric: `type_guard.success_rate`; span: `validate.type_guard` **Performance:**
Target p95 < 1ms per type guard check; type inference has zero runtime cost
**Example:** `isUser(data)` → narrows `unknown` to `User` type if valid
**Ownership:** DRI=type system maintainer; next review: 2025-05-06

---

**Related Documentation:**

- [01-overview.md](./01-overview.md) - Validation architecture overview
- [02-zod-patterns.md](./02-zod-patterns.md) - Schema composition patterns
- [04-integration.md](./04-integration.md) - Cross-boundary type synchronization
