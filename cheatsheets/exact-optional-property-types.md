---
status: ACTIVE
last_updated: 2026-01-19
---

# Exact Optional Property Types Pattern

**Last Updated**: 2025-11-30
**Status**: Active (enforced via tsconfig.json)
**Affected Files**: 41+ files across codebase

---

## Table of Contents

1. [What is exactOptionalPropertyTypes](#what-is-exactoptionalpropertytypes)
2. [Why We Enable It](#why-we-enable-it)
3. [The Problem](#the-problem)
4. [Solution Patterns](#solution-patterns)
5. [Real Example](#real-example)
6. [When to Use Each Approach](#when-to-use-each-approach)
7. [Migration Guide](#migration-guide)
8. [Common Pitfalls](#common-pitfalls)
9. [References](#references)

---

## What is exactOptionalPropertyTypes

`exactOptionalPropertyTypes` is a TypeScript compiler flag (enabled in `tsconfig.json` line 34) that enforces strict handling of optional properties.

**Configuration:**
```json
{
  "compilerOptions": {
    "exactOptionalPropertyTypes": true
  }
}
```

**What it does:**

- Changes the semantics of optional properties from `T | undefined` to **"property may be missing"**
- Prevents explicitly passing `undefined` to optional properties
- Forces developers to **omit** properties rather than set them to `undefined`

**Type Difference:**

```typescript
// Without exactOptionalPropertyTypes
type User = { name?: string };
// Equivalent to: { name: string | undefined }

// With exactOptionalPropertyTypes
type User = { name?: string };
// Means: Property may be present OR absent (but NOT explicitly undefined)
```

---

## Why We Enable It

### Type Safety Benefits

1. **Prevents ambiguous state**: Distinguishes between "property not set" vs "property explicitly set to undefined"
2. **Catches API mismatches**: Surfaces issues where APIs expect missing properties, not `undefined` values
3. **Aligns with runtime behavior**: Matches how JavaScript handles missing properties vs undefined values
4. **Stricter object spreads**: Prevents accidentally spreading `undefined` into objects

### Real-World Problems It Solves

**Problem 1: API serialization inconsistencies**
```typescript
// Without exactOptionalPropertyTypes - both produce different JSON
const user1 = { name: "Alice" };              // {"name":"Alice"}
const user2 = { name: "Alice", age: undefined }; // {"name":"Alice","age":null}

// With exactOptionalPropertyTypes - enforces consistency
const user1 = { name: "Alice" };              // OK
const user2 = { name: "Alice", age: undefined }; // ERROR - must omit age
```

**Problem 2: React component props confusion**
```typescript
// Component expects optional error prop
<Input error="Invalid email" />  // Shows error
<Input />                        // No error (clean state)
<Input error={undefined} />      // Ambiguous - error prop exists but is undefined

// With exactOptionalPropertyTypes, the third case is prevented
```

**Problem 3: Database update operations**
```typescript
// Partial update - which fields to update?
updateUser({ id: 123, email: undefined }); // Does this delete email or ignore it?

// With exactOptionalPropertyTypes, you must be explicit
updateUser({ id: 123 }); // Ignore email (property omitted)
updateUser({ id: 123, email: null }); // Clear email (if schema allows null)
```

---

## The Problem

When `exactOptionalPropertyTypes` is enabled, the following anti-patterns **fail type checking**:

### Anti-Pattern 1: Direct undefined assignment

```typescript
// FAILS - Cannot assign undefined to optional property
type Profile = { description?: string };
const profile: Profile = { description: undefined }; // ERROR

// FAILS - Spreading variables that might be undefined
const maybeDescription: string | undefined = getDescription();
const profile: Profile = {
  description: maybeDescription // ERROR if maybeDescription is undefined
};
```

### Anti-Pattern 2: Conditional property spreading

```typescript
// FAILS - Spread might include undefined
const updates = {
  name: newName,
  description: newDescription // ERROR if newDescription is string | undefined
};
updateProfile(currentProfile.id, updates);
```

### Anti-Pattern 3: React component props

```typescript
// FAILS - Passing undefined to optional prop
interface InputProps {
  error?: string;
  placeholder?: string;
}

const errorMessage: string | undefined = validate();
<Input error={errorMessage} /> // ERROR if errorMessage is undefined
```

### Anti-Pattern 4: Object merging

```typescript
// FAILS - Merged object contains undefined values
const defaults = { retries: 3, timeout: 5000 };
const userConfig = { retries: 5, timeout: undefined }; // ERROR
const config = { ...defaults, ...userConfig };
```

---

## Solution Patterns

We have **three approved patterns** for handling optional properties with `exactOptionalPropertyTypes`. Choose based on context and readability.

### Pattern 1: Inline Conditional Spreading (Preferred for Simple Cases)

**When to use**: Single property, inline usage, maximum clarity

```typescript
// Single optional property
const profile = {
  id: "123",
  name: "Alice",
  ...(description !== undefined ? { description } : {})
};

// Multiple optional properties
const config = {
  retries: 3,
  ...(timeout !== undefined ? { timeout } : {}),
  ...(maxRetries !== undefined ? { maxRetries } : {})
};
```

**Advantages:**
- No imports required
- Self-documenting (clearly shows conditional logic)
- Works with any object structure
- Zero runtime overhead (compiled away)

**Disadvantages:**
- Verbose for many optional properties
- Can reduce readability in complex objects

---

### Pattern 2: `spreadIfDefined` Helper (Preferred for React Props)

**When to use**: React component props, single properties with clear keys

**Location**: `client/src/lib/ts/spreadIfDefined.ts`

```typescript
import { spreadIfDefined } from '@/lib/ts/spreadIfDefined';

// React component props
<Input
  value={username}
  {...spreadIfDefined("error", errorMessage)}
  {...spreadIfDefined("placeholder", placeholderText)}
/>

// Object construction
const options = {
  enabled: true,
  ...spreadIfDefined("cache", cacheConfig),
  ...spreadIfDefined("retries", retryCount)
};
```

**Type signature:**
```typescript
function spreadIfDefined<K extends string, V>(
  key: K,
  val: V | undefined
): {} | { [P in K]: V }
```

**How it works:**
```typescript
spreadIfDefined("error", "Invalid")  // Returns { error: "Invalid" }
spreadIfDefined("error", undefined)  // Returns {}
```

**Advantages:**
- Explicit property names (easier to grep/search)
- Type-safe (preserves exact types)
- Self-documenting API (clear intent)
- Handles single properties elegantly

**Disadvantages:**
- Requires import
- Verbose for many properties on same object
- Creates intermediate objects (negligible performance impact)

---

### Pattern 3: `optionalProps` Helper (Preferred for Multiple Properties)

**When to use**: Multiple optional properties from same source object

**Location**: `shared/utils/type-safety.ts`

```typescript
import { optionalProps } from '@shared/utils/type-safety';

// Multiple optional properties
const updates = optionalProps({
  name: newName,
  email: newEmail,
  phoneNumber: newPhoneNumber,
  bio: newBio
});

// Type-safe partial updates
type UserUpdate = {
  name?: string;
  email?: string;
  phoneNumber?: string;
};

const safeUpdate: Partial<UserUpdate> = optionalProps({
  name: formData.name,
  email: formData.email,
  phoneNumber: formData.phoneNumber
});
```

**Type signature:**
```typescript
function optionalProps<T extends Record<string, unknown>>(
  props: { [K in keyof T]: T[K] | undefined }
): Partial<T>
```

**How it works:**
```typescript
optionalProps({
  name: "Alice",
  age: undefined,
  email: "alice@example.com"
})
// Returns { name: "Alice", email: "alice@example.com" }
// (age is omitted, not set to undefined)
```

**Advantages:**
- Handles many properties efficiently
- Returns properly typed `Partial<T>`
- Single function call for entire object
- Filters out all undefined values in one pass

**Disadvantages:**
- Requires import from shared module
- Less explicit than inline spreading (harder to grep for specific properties)
- Iterates over object entries (minor runtime cost)

---

## Real Example

### Production Code: SectorProfilesStep.tsx (lines 114-152)

This is the **canonical example** of Pattern 1 (inline conditional spreading) handling complex nested objects.

**Scenario**: Updating a sector profile with optional properties at multiple levels

```typescript
const updateSectorProfile = (id: string, updates: Partial<SectorProfile>) => {
  setValue(
    'sectorProfiles',
    sectorProfiles.map(profile => {
      if (profile.id !== id) return profile;

      // Step 1: Handle nested array with optional properties
      const stagesArray = updates.stages !== undefined ? updates.stages : profile.stages;
      const normalizedStages = stagesArray.map(stage => ({
        // Required properties (always present)
        id: stage.id,
        stage: stage.stage,
        roundSize: stage.roundSize,
        valuation: stage.valuation,
        esopPercentage: stage.esopPercentage,
        graduationRate: stage.graduationRate,
        exitRate: stage.exitRate,
        exitValuation: stage.exitValuation,
        monthsToGraduate: stage.monthsToGraduate,
        monthsToExit: stage.monthsToExit,

        // Optional property - conditionally spread
        ...(stage.failureRate !== undefined ? { failureRate: stage.failureRate } : {})
      }));

      // Step 2: Build updated profile with conditional spreading
      const updated: SectorProfile = {
        id: profile.id,

        // Required properties with fallback
        name: updates.name !== undefined ? updates.name : profile.name,
        allocation: updates.allocation !== undefined ? updates.allocation : profile.allocation,
        stages: normalizedStages,

        // Optional property - preserve existing or apply update
        ...(updates.description !== undefined
          ? { description: updates.description }
          : profile.description !== undefined
          ? { description: profile.description }
          : {})
      };

      return updated;
    })
  );
};
```

**Why this pattern was chosen:**

1. **Nested complexity**: Multiple levels (profile > stages > failureRate)
2. **Conditional preservation**: Need to check both `updates.description` AND `profile.description`
3. **Type safety**: `SectorProfile` type explicitly checked at line 137
4. **Readability**: Each optional property clearly shows its conditional logic
5. **No dependencies**: Self-contained without helper imports

**Alternative using helpers** (not used in production, but valid):

```typescript
// Using spreadIfDefined (more verbose for this case)
const updated: SectorProfile = {
  id: profile.id,
  name: updates.name !== undefined ? updates.name : profile.name,
  allocation: updates.allocation !== undefined ? updates.allocation : profile.allocation,
  stages: normalizedStages,
  ...spreadIfDefined(
    "description",
    updates.description !== undefined ? updates.description : profile.description
  )
};
```

**Key Learning**: For complex nested updates with fallback logic, **inline conditional spreading** provides maximum clarity and control.

---

## When to Use Each Approach

### Decision Matrix

| Scenario | Recommended Pattern | Rationale |
|----------|---------------------|-----------|
| Single optional property in React component | `spreadIfDefined` | Explicit prop names, clean JSX |
| 1-2 optional properties in object | Inline spreading | No import needed, self-documenting |
| 3+ optional properties from same source | `optionalProps` | Single function call, efficient |
| Nested objects with fallback logic | Inline spreading | Full control over conditional logic |
| Updating partial state | `optionalProps` | Type-safe `Partial<T>` handling |
| API request payloads | `optionalProps` | Ensures clean JSON serialization |
| Form data submission | Inline spreading or `optionalProps` | Depends on number of fields |
| Database update operations | `optionalProps` | Clear distinction: omitted vs null |

### Pattern Comparison

```typescript
// Scenario: Update user profile with 5 optional fields

// Option 1: Inline spreading (verbose but explicit)
const update1 = {
  id: userId,
  ...(name !== undefined ? { name } : {}),
  ...(email !== undefined ? { email } : {}),
  ...(phone !== undefined ? { phone } : {}),
  ...(bio !== undefined ? { bio } : {}),
  ...(avatar !== undefined ? { avatar } : {})
};

// Option 2: spreadIfDefined (more readable, but still verbose)
const update2 = {
  id: userId,
  ...spreadIfDefined("name", name),
  ...spreadIfDefined("email", email),
  ...spreadIfDefined("phone", phone),
  ...spreadIfDefined("bio", bio),
  ...spreadIfDefined("avatar", avatar)
};

// Option 3: optionalProps (WINNER for this case)
const update3 = {
  id: userId,
  ...optionalProps({ name, email, phone, bio, avatar })
};
```

**Verdict**: Use `optionalProps` when dealing with 3+ fields from the same object.

---

## Migration Guide

### Step 1: Identify Violations

TypeScript will report errors when `exactOptionalPropertyTypes` is enabled:

```bash
# Check for type errors
npm run check

# Look for common patterns
grep -r "undefined ?" client/src --include="*.tsx" --include="*.ts"
```

### Step 2: Categorize Violations

**Type A: Direct undefined assignment**
```typescript
// BEFORE
const config: Config = { timeout: undefined };

// AFTER
const config: Config = {};
```

**Type B: Variable spreading**
```typescript
// BEFORE
const error: string | undefined = validate();
<Input error={error} />

// AFTER
<Input {...spreadIfDefined("error", error)} />
```

**Type C: Partial updates**
```typescript
// BEFORE
updateUser({ name: newName, email: newEmail }); // fails if either is undefined

// AFTER
updateUser(optionalProps({ name: newName, email: newEmail }));
```

### Step 3: Apply Fixes Systematically

**Priority order:**
1. Fix React component props (user-facing, high visibility)
2. Fix API calls (prevent bad requests)
3. Fix internal state updates (correctness)
4. Fix utility functions (reusability)

**Example migration - CompanyDialog.tsx:**

```typescript
// BEFORE (fails with exactOptionalPropertyTypes)
const handleSubmit = (data: FormData) => {
  onSave({
    name: data.name,
    sector: data.sector,
    initialCheck: data.initialCheck,
    followOnReserves: data.followOnReserves,
    notes: data.notes // ERROR if notes is string | undefined
  });
};

// AFTER (compliant)
const handleSubmit = (data: FormData) => {
  onSave({
    name: data.name,
    sector: data.sector,
    initialCheck: data.initialCheck,
    followOnReserves: data.followOnReserves,
    ...optionalProps({ notes: data.notes })
  });
};
```

### Step 4: Verify Build

```bash
# Full type check
npm run check

# Run tests to catch runtime issues
npm test

# Check specific file
npx tsc --noEmit client/src/components/MyComponent.tsx
```

### Step 5: Update Tests

Tests may need updates if they were explicitly passing `undefined`:

```typescript
// BEFORE
const result = render(<Input error={undefined} />);

// AFTER (omit the prop entirely)
const result = render(<Input />);

// OR (if testing undefined behavior is critical)
const result = render(<Input {...(undefined ? { error: "test" } : {})} />);
```

---

## Common Pitfalls

### Pitfall 1: Confusing `null` with `undefined`

```typescript
// WRONG - null is NOT the same as omitting the property
type User = { age?: number };
const user1: User = { age: null }; // ERROR - null is not assignable to number

// CORRECT - omit the property
const user2: User = {};

// CORRECT - use null only if type explicitly allows it
type UserNullable = { age?: number | null };
const user3: UserNullable = { age: null }; // OK
```

**KEY POINT:** `exactOptionalPropertyTypes` is about **presence/absence**, not `null` vs `undefined`.

---

### Pitfall 2: Forgetting nested optionals

```typescript
// WRONG - nested optional not handled
const profile = {
  name: "Alice",
  address: {
    street: "123 Main St",
    apartment: apartmentNumber // ERROR if apartmentNumber is string | undefined
  }
};

// CORRECT - handle nested optionals too
const profile = {
  name: "Alice",
  address: {
    street: "123 Main St",
    ...(apartmentNumber !== undefined ? { apartment: apartmentNumber } : {})
  }
};
```

---

### Pitfall 3: Using `||` or `??` incorrectly

```typescript
// WRONG - coalescing doesn't fix optional property issue
const config: Config = {
  timeout: timeoutValue ?? 5000 // Still ERROR if timeoutValue is undefined
};

// CORRECT - conditionally include property
const config: Config = {
  ...(timeoutValue !== undefined ? { timeout: timeoutValue } : { timeout: 5000 })
};

// OR BETTER - use default at source
const finalTimeout = timeoutValue ?? 5000;
const config: Config = { timeout: finalTimeout };
```

**KEY POINT:** Coalescing (`??`) provides a **value**, but doesn't solve the optional property problem.

---

### Pitfall 4: Spreading wrong object type

```typescript
// WRONG - spreading Partial<T> can include undefined values
type Config = { timeout: number; retries?: number };
const partial: Partial<Config> = { timeout: 5000, retries: undefined };

const config: Config = { ...partial }; // ERROR - retries is explicitly undefined

// CORRECT - filter undefined values
const config: Config = {
  timeout: 5000,
  ...optionalProps(partial)
};
```

---

### Pitfall 5: TypeScript inference hiding issues

```typescript
// DANGEROUS - TypeScript infers wrong type
const data = {
  name: "Alice",
  age: maybeAge // TypeScript infers { name: string; age: number | undefined }
};

// Later usage fails
const user: User = data; // ERROR if User has age?: number

// CORRECT - be explicit about optional properties
const data: Partial<User> = {
  name: "Alice",
  ...optionalProps({ age: maybeAge })
};
```

**KEY POINT:** Don't rely on inference when dealing with optional properties. Be explicit.

---

### Pitfall 6: Over-using `as` type assertions

```typescript
// WRONG - type assertion bypasses safety
const config = {
  timeout: timeoutValue
} as Config; // Dangerous - might have undefined at runtime

// CORRECT - handle properly
const config: Config = {
  timeout: timeoutValue ?? DEFAULT_TIMEOUT
};

// OR
const config: Config = {
  ...(timeoutValue !== undefined ? { timeout: timeoutValue } : {})
};
```

**KEY POINT:** Type assertions (`as`) defeat the purpose of `exactOptionalPropertyTypes`. Avoid them.

---

## References

### Helper Utilities

1. **`spreadIfDefined`**
   - **Location**: `client/src/lib/ts/spreadIfDefined.ts`
   - **Use case**: Single optional property
   - **Exports**: `spreadIfDefined<K, V>(key: K, val: V | undefined)`

2. **`optionalProps`**
   - **Location**: `shared/utils/type-safety.ts`
   - **Use case**: Multiple optional properties
   - **Exports**: `optionalProps<T>(props: { [K in keyof T]: T[K] | undefined })`

3. **Additional helpers in `type-safety.ts`**:
   - `optionalProp<K, V>(key: K, value: V | undefined)` - Single property (similar to `spreadIfDefined`)
   - `safeString(value: string | undefined | null): string` - Coalesce to empty string
   - `withDefault<T>(value: T | undefined, defaultValue: T): T` - Provide default value
   - `filterDefined<T>(array: (T | undefined)[]): T[]` - Remove undefined from arrays
   - `isDefined<T>(value: T | undefined): value is T` - Type guard

### Example Files

**Primary Examples (Production Usage):**
- `client/src/components/modeling-wizard/steps/SectorProfilesStep.tsx` (lines 114-152) - Complex nested objects
- `client/src/components/modeling-wizard/steps/CapitalAllocationStep.tsx` - Multiple optional properties
- `client/src/components/ui/dropdown-menu.tsx` (line 110) - React component with `spreadIfDefined`

**Helper Usage Examples:**
- `client/src/pages/DistributionsStep.tsx` - `spreadIfDefined` in multiple places
- `client/src/pages/FundBasicsStep.tsx` - `spreadIfDefined` for form inputs
- `client/src/components/wizard/cards/StageAllocationCard.tsx` - Mixed patterns

### TypeScript Configuration

- **File**: `tsconfig.json`
- **Line**: 34
- **Setting**: `"exactOptionalPropertyTypes": true`
- **Related flags**:
  - `"strict": true` (line 32) - Enables all strict checks
  - `"noUncheckedIndexedAccess": true` (line 33) - Forces undefined checks on array access

### Git History

Key commits introducing/refining this pattern:

```bash
# Search for related commits
git log --all --oneline --grep="exactOptionalPropertyTypes"

# Key commit
6fcf3321 - fix(types): Phase 2B - exactOptionalPropertyTypes delete pattern
```

### Related Documentation

- **TypeScript Handbook**: [exactOptionalPropertyTypes](https://www.typescriptlang.org/tsconfig#exactOptionalPropertyTypes)
- **ADR (if exists)**: Check `DECISIONS.md` for architectural decision record on strict TypeScript mode
- **CHANGELOG.md**: Search for "exactOptionalPropertyTypes" or "strict mode" entries

### Files Using This Pattern (41+ total)

**High-traffic files:**
- `client/src/components/modeling-wizard/steps/*.tsx` (7 files)
- `client/src/components/wizard/cards/*.tsx` (5 files)
- `client/src/pages/*.tsx` (8 files)
- `client/src/components/portfolio/*.tsx` (4 files)
- `client/src/components/ui/*.tsx` (6 files)

**Search for usage:**
```bash
# Find inline spreading pattern
grep -r "\.\.\.(.*!== undefined.*{.*}.*{})" client/src --include="*.tsx" --include="*.ts"

# Find spreadIfDefined usage
grep -r "spreadIfDefined" client/src --include="*.tsx" --include="*.ts"

# Count affected files
grep -r "?:" client/src --include="*.tsx" --include="*.ts" | wc -l
```

---

## Summary

**KEY POINT:** `exactOptionalPropertyTypes` enforces a fundamental distinction in TypeScript:
- **Optional property (`name?: string`)**: Property may be **absent** (not in object)
- **Union type (`name: string | undefined`)**: Property is **present** but value might be `undefined`

**BEST PRACTICES:**

1. **Default to inline spreading** for 1-2 properties (no dependencies, maximum clarity)
2. **Use `spreadIfDefined`** for React component props (explicit, searchable)
3. **Use `optionalProps`** for 3+ properties from same object (efficient, clean)
4. **Never use type assertions** to bypass the check (defeats the safety mechanism)
5. **Prefer omission over `null`** unless schema explicitly requires `null` (cleaner API contracts)

**MIGRATION CHECKLIST:**

- [ ] Enable `exactOptionalPropertyTypes` in `tsconfig.json`
- [ ] Run `npm run check` to find violations
- [ ] Import helpers: `spreadIfDefined` or `optionalProps`
- [ ] Fix React component props first (highest impact)
- [ ] Update API calls and state updates
- [ ] Verify with tests: `npm test`
- [ ] Document any complex patterns in code comments

**REMEMBER:** This pattern exists to **prevent bugs**, not to make code harder to write. The upfront investment in handling optionals correctly pays dividends in runtime reliability and API contract clarity.

---

**Document Version**: 1.0
**Author**: System Documentation
**Reviewed**: 2025-11-30
**Next Review**: When TypeScript version upgrades or new patterns emerge
