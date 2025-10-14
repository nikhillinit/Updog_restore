# Drizzle Type-Safe Patterns

This document provides proven patterns for type-safe Drizzle ORM usage that satisfy TypeScript's strict compiler flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`).

## Pattern 1: Use Schema-Exported Types

The `shared/schema.ts` file already exports properly inferred types for all tables:

```typescript
// shared/schema.ts exports:
export type Scenario = typeof scenarios.$inferSelect;
export type InsertScenario = typeof scenarios.$inferInsert;
export type Fund = typeof funds.$inferSelect;
export type InsertFund = typeof funds.$inferInsert;
// ... 20+ more tables

// ✅ Usage in route/service files:
import type { Scenario, InsertScenario } from '@shared/schema';
import { scenarios } from '@shared/schema';

const row: Scenario = await db.query.scenarios.findFirst({
  where: eq(scenarios.id, id)
});

const newRow: InsertScenario = {
  fundId: "123",
  scenarioName: "Test Scenario"
  // notes omitted - optional in schema
};
```

**Why this works:** Drizzle's `$inferSelect` and `$inferInsert` provide exact types including optionality rules.

---

## Pattern 2: Object-Map Column Subsets

For select queries with column subsets, use object-map syntax (NOT array syntax):

```typescript
// ✅ CORRECT: Object-map preserves Drizzle's type inference
const cols = {
  id: scenarios.id,
  fundId: scenarios.fundId,
  scenarioName: scenarios.scenarioName
} as const;

const rows = await db.select(cols).from(scenarios);
// Type: Array<{ id: number; fundId: string; scenarioName: string }>
// Drizzle infers types automatically - no manual typing needed!

// ❌ WRONG: Array syntax loses type metadata
const colsArray = [scenarios.id, scenarios.fundId]; // Don't do this
```

**Why this works:** Object-map syntax preserves Drizzle's column metadata, enabling proper type inference.

---

## Pattern 3: Local Clean Utility for Optional Fields

For insert operations with optional fields, use a local utility (NOT a shared framework):

```typescript
// In your route/service file (local, not shared):

/**
 * Removes undefined values for exactOptionalPropertyTypes compliance
 * Local utility - copy to each file that needs it
 */
const clean = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as {
    [K in keyof T as undefined extends T[K] ? never : K]: T[K]
  } & {
    [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>
  };

// ✅ Usage:
import type { InsertScenario } from '@shared/schema';

const maybeNotes: string | undefined = req.body.notes;

await db.insert(scenarios).values(
  clean<InsertScenario>({
    fundId: "123",
    scenarioName: "Test",
    notes: maybeNotes // Will be omitted if undefined
  })
);

// ❌ WRONG: Passing undefined directly
await db.insert(scenarios).values({
  fundId: "123",
  scenarioName: "Test",
  notes: undefined // ← exactOptionalPropertyTypes error!
});
```

**Why local utility:**
- Type-safe (preserves exact Insert types)
- No framework overhead
- Copy-paste where needed
- No `any` casts

---

## Pattern 4: Where Clause Guards

For where clauses with potentially undefined values, use explicit guards:

```typescript
import { eq, and } from 'drizzle-orm';

// ✅ Guard before usage
const fundId: string | undefined = req.query.fundId;

if (fundId === undefined) {
  throw new Error('fundId is required');
}

const rows = await db.select().from(scenarios).where(
  eq(scenarios.fundId, fundId) // Now type-safe - fundId is string
);

// ❌ WRONG: Passing undefined to eq()
const rows = await db.select().from(scenarios).where(
  eq(scenarios.fundId, fundId) // TS error: string | undefined
);
```

---

## Pattern 5: Conditional Where Clauses

For optional where clauses (e.g., filtering), use conditional arrays:

```typescript
import { eq, and } from 'drizzle-orm';

const fundId: string | undefined = req.query.fundId;
const status: string | undefined = req.query.status;

const conditions = [
  fundId !== undefined ? eq(scenarios.fundId, fundId) : undefined,
  status !== undefined ? eq(scenarios.status, status) : undefined
].filter((c): c is NonNullable<typeof c> => c !== undefined);

const rows = await db.select().from(scenarios).where(
  conditions.length > 0 ? and(...conditions) : undefined
);
```

**Why this works:** Filters out undefined conditions, applies `and()` only if conditions exist.

---

## Anti-Patterns (Avoid)

### ❌ Don't Create Generic Helper Frameworks

```typescript
// ❌ BAD: Generic selectMap that fights Drizzle's type system
export function selectMap<T>(table: T, columns: string[]): Pick<T, ...> {
  return Object.fromEntries(...) as Pick<T, ...>; // Type assertion = lie
}
```

**Why bad:** Loses Drizzle's column metadata, requires type assertions.

### ❌ Don't Use Type Assertions

```typescript
// ❌ BAD: Type assertion bypasses compiler checks
const data = { fundId, scenarioName, notes: undefined };
await db.insert(scenarios).values(data as InsertScenario);
```

**Why bad:** `as` casts hide errors, defeat purpose of strict types.

### ❌ Don't Use `any`

```typescript
// ❌ BAD: any escapes type system
const clean = (obj: any): any => { /* ... */ };
```

**Why bad:** Propagates `any`, loses all type safety.

---

## Summary

**DO:**
- ✅ Use schema-exported `$inferSelect`/`$inferInsert` types
- ✅ Use object-map column subsets `{ id: table.id }`
- ✅ Use local `clean()` utility for optional inserts
- ✅ Guard undefined before passing to `eq()`/`and()`
- ✅ Filter undefined conditions in where arrays

**DON'T:**
- ❌ Create generic helper frameworks
- ❌ Use type assertions (`as`)
- ❌ Use `any` types
- ❌ Pass undefined to Drizzle functions
- ❌ Use array syntax for column subsets

---

**Last Updated:** Session 6 (October 14, 2025)
**Related Files:** `shared/schema.ts`, `server/routes/*.ts`
