---
type: reflection
id: REFL-021
title: exactOptionalPropertyTypes Requires Spread Pattern
status: DRAFT
last_updated: 2026-04-03
date: 2026-02-16
version: 2
severity: medium
wizard_steps: []
error_codes: [TS2375, TS2412, TS2769]
components: [typescript, state, client, server, drizzle]
keywords:
  [
    exactOptionalPropertyTypes,
    spread-pattern,
    optional-properties,
    undefined,
    TS2375,
    TS2412,
  ]
test_file: tests/regressions/REFL-021.test.ts
superseded_by: null
---

# REFL-021: exactOptionalPropertyTypes Requires Spread Pattern

**Created:** 2026-02-16 **Severity:** Medium **Category:** TypeScript / State
**Occurrences:** 6+ (P3 complexity refactor, P4 pipeline implementation)

## Anti-Pattern

When `exactOptionalPropertyTypes: true` is enabled in tsconfig, passing
`undefined` explicitly to an optional property is a type error:

```typescript
// FAILS: Type 'number | undefined' is not assignable to type 'number'
<Modal fundId={fundId ?? undefined} />

// FAILS: same issue with object literals
buildUrl({ search: filters.search || undefined })
```

TypeScript distinguishes between "property is missing" and "property is
`undefined`". With this flag, optional properties only accept their declared
type OR being omitted entirely -- not `undefined`.

## Root Cause

`exactOptionalPropertyTypes` (strict family) makes `{ prop?: T }` mean "prop can
be missing or T" rather than "prop can be missing, T, or undefined". This is
correct behavior but breaks common JavaScript patterns like
`prop={value ?? undefined}`.

## Fix

Use the conditional spread pattern to omit the property entirely when no value:

```typescript
// JSX props
<Modal {...(fundId != null && { fundId })} />

// Object literals
buildUrl({
  ...(filters.search && { search: filters.search }),
  ...(filters.status && { status: filters.status }),
})
```

For function parameters, use overloads or conditional spreading into the options
object.

## Detection

- TS error codes: TS2375, TS2412, or the general assignability error when
  `undefined` appears in the diagnostic
- Pattern: `?? undefined` or `|| undefined` in assignments to optional props
- Grep: `rg "\?\? undefined|\|\| undefined" --type ts`

## Files Affected (P4)

- `client/src/pages/pipeline.tsx` (buildDealsUrl params, modal props)
- `client/src/components/pipeline/AddDealModal.tsx` (fundId prop)
- `client/src/components/pipeline/ImportDealsModal.tsx` (fundId prop)

## Class Fields Variant (TS2412)

The same rule applies to class fields. `private field?: T` means the property
can be absent on the instance, but you cannot assign `undefined` to it:

```typescript
// ANTI-PATTERN: TS2412 under exactOptionalPropertyTypes
class MyService {
  private dataSource?: MonteCarloDataSource; // "absent" not "undefined"

  constructor(dataSource?: MonteCarloDataSource) {
    this.dataSource = dataSource; // TS2412: undefined not assignable
  }
}

// FIX: use explicit union type
class MyService {
  private dataSource: MonteCarloDataSource | undefined;

  constructor(dataSource?: MonteCarloDataSource) {
    this.dataSource = dataSource; // OK: undefined is in the union
  }
}
```

**Detection note:** Local `npx tsc --noEmit` may PASS because it compiles the
full project as one unit. The pre-push baseline hook compiles
client/server/shared separately and catches TS2412. Always trust the baseline
over local tsc.

**Source:** `server/services/monte-carlo-orchestrator.ts:85`, fixed 2026-02-24.

## Service-Layer Type Mismatch Variant (TS2769)

When a service interface uses `Record<string, unknown>` for a field that maps to
a Drizzle schema column typed with `$type<SpecificType>()`, the spread pattern
alone doesn't help -- the type itself is wrong:

```typescript
// ANTI-PATTERN: service interface uses generic Record
export interface CreateFundInput {
  engineResults?: Record<string, unknown> | null; // too broad
}

// Drizzle column is typed:
engineResults: jsonb('engine_results').$type<EngineResults>();

// TS2769 on insert even with spread:
await tx.insert(funds).values({
  ...(input.engineResults != null && { engineResults: input.engineResults }),
  //                                   ^^ Record<string, unknown> != EngineResults
});
```

```typescript
// FIX: match the service interface type to the schema column type
import type { EngineResults } from '@shared/schemas/engine-results-schema';

export interface CreateFundInput {
  engineResults?: EngineResults | null; // matches schema column type
}
```

**Key insight:** The spread pattern handles the `undefined` vs absent
distinction. But when the _value type itself_ doesn't match the column type, you
need to fix the interface -- not add more spreading.

**Source:** `server/services/fund-persistence-service.ts:66`, fixed 2026-03-21.

## Related

- REFL-008: TypeScript type inference from database schemas
- tsconfig.json `exactOptionalPropertyTypes: true`
