# REFL-026: Drizzle ORM Mock Chain Overwrite

**Created:** 2026-02-24 **Severity:** High **Category:** Infrastructure /
Testing **Occurrences:** 1 (caused 15 test failures in
monte-carlo-power-law-integration)

## Anti-Pattern

A Vitest mock for Drizzle's `db.insert` is set up with the correct chain mock,
then a later line overwrites it with `mockResolvedValue`, destroying the chain:

```typescript
// Line 31: CORRECT chain mock
const db = {
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  }),
};

// Line 91: OVERWRITES the chain -- insert() now returns a Promise, not { values }
db.insert.mockResolvedValue({ insertId: 1 });
```

After the overwrite, `db.insert(table).values(data)` throws
`values is not a function` because `insert()` returns a Promise instead of the
`{ values: fn }` object that Drizzle expects synchronously.

## Root Cause

Drizzle ORM uses a builder pattern: `db.insert(table)` returns a query builder
synchronously, and `.values(data)` is called on that builder. The mock must
return a sync object with a `values` method. `mockResolvedValue` makes the mock
return a Promise, breaking the chain.

This is easy to introduce when copy-pasting mock setup from non-Drizzle tests
(e.g., Knex or raw SQL mocks where `insert` returns a Promise directly).

## Fix

Never use `mockResolvedValue` on a Drizzle chain mock. Keep the builder pattern:

```typescript
// CORRECT: chain mock preserves Drizzle builder pattern
const db = {
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  }),
};

// If you need to verify insert was called:
expect(db.insert).toHaveBeenCalledWith(expectedTable);
const valuesMock = db.insert.mock.results[0]?.value.values;
expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ ... }));
```

For multi-step chains (e.g., `db.insert(t).values(d).onConflictDoNothing()`),
extend the mock:

```typescript
const db = {
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  }),
};
```

## Detection

- Error: `values is not a function` or
  `Cannot read properties of undefined (reading 'values')`
- Grep: `rg "db\.insert\.mock(Resolved|Rejected)Value" --type ts`
- Any `mockResolvedValue` on a Drizzle method that should return a builder

## Evidence

- **Source:** `tests/unit/services/monte-carlo-power-law-integration.test.ts:91`
- **Impact:** 15 test failures from a single line overwrite
- **Session:** 2026-02-24 (Phoenix validation closure)

## Related

- REFL-007: Global vi.mock pollutes all tests
- Drizzle docs: insert builder pattern
