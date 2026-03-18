---
type: reflection
id: REFL-027
title: Redundant any on Inferred Callback Parameters
status: DRAFT
date: 2026-03-17
version: 1
severity: medium
wizard_steps: []
error_codes: []
components: [client, typescript, eslint]
keywords:
  [
    no-unsafe-member-access,
    no-unsafe-argument,
    no-unsafe-assignment,
    no-explicit-any,
    reduce,
    map,
    filter,
    callback,
    type-inference,
    eslint,
  ]
test_file: tests/regressions/REFL-027.test.ts
superseded_by: null
---

# Reflection: Redundant `: any` on Inferred Callback Parameters

## 1. The Anti-Pattern (The Trap)

**Context:** When writing `.map()`, `.reduce()`, `.filter()`, and `Array.from()`
callbacks, developers add explicit `: any` type annotations to parameters that
TypeScript already infers from the collection's element type and the
accumulator's initial value. This triggers three ESLint rules simultaneously:
`no-unsafe-member-access`, `no-unsafe-argument`, and `no-explicit-any`.

**How to Recognize This Trap:**

1. **Error Signal:** ESLint warnings for
   `@typescript-eslint/no-unsafe-member-access` on property access inside
   `.map()` or `.reduce()` callbacks.

2. **Code Pattern:**

   ```typescript
   // ANTI-PATTERN: Explicit any on parameters TypeScript already infers
   const total = companies.reduce((sum: any, company: any) => {
     return sum + company.valuation;
   }, 0);

   const names = items.map((item: any) => item.name);

   Array.from({ length: 10 }, (_: any, i: any) => i + 1);
   ```

3. **Mental Model:** Assuming callbacks need explicit parameter types. In
   reality, TypeScript infers element types from the array's declared type, and
   accumulator types from the initial value.

**Scale:** This pattern was found in 20+ files across the codebase, accounting
for ~548 ESLint warnings in a single tech debt reduction pass.

> **DANGER:** Adding `: any` doesn't just suppress type checking -- it actively
> introduces `unsafe` warnings that cascade through every property access on the
> annotated parameter.

## 2. The Verified Fix (The Principle)

**Principle:** Let TypeScript infer callback parameter types. Remove `: any`
annotations from `.map()`, `.reduce()`, `.filter()`, and `Array.from()`
callbacks when the source collection is already typed.

**Implementation Pattern:**

```typescript
// VERIFIED: Remove any, let inference work

// .reduce() -- TypeScript infers `sum: number` from initial value `0`
// and `company: Company` from the array element type
const total = companies.reduce((sum, company) => {
  return sum + company.valuation;
}, 0);

// .map() -- TypeScript infers `item: Item` from the array
const names = items.map((item) => item.name);

// Array.from() -- second param is (value: undefined, index: number)
Array.from({ length: 10 }, (_, i) => i + 1);

// .reduce() with object accumulator -- type comes from initial value
const grouped = items.reduce(
  (acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1;
    return acc;
  },
  {} as Record<string, number>
);
```

**When you DO need explicit types:**

```typescript
// When the initial value doesn't fully describe the accumulator shape
const result = items.reduce<Map<string, Item[]>>((acc, item) => {
  const list = acc.get(item.key) ?? [];
  list.push(item);
  acc.set(item.key, list);
  return acc;
}, new Map());
```

**Side effect:** Removing
`/* eslint-disable @typescript-eslint/no-explicit-any */` file-level comments.
When all `: any` annotations in a file are removed, the ESLint auto-fix hook
strips the now-unnecessary disable comment automatically.

## 3. Evidence

- **Source Session:** 2026-03-17 tech debt reduction (babysitter-orchestrated)
- **Files Fixed:** 20 files across 8 iterations
- **Warnings Reduced:** 4134 to 3586 (-548, 13.3%)
- **Target Rules:** `no-unsafe-member-access`, `no-unsafe-argument`,
  `no-unsafe-assignment`
- **Key Files:**
  - `client/src/core/cohorts/CohortEngine.ts` -- 6 reduce callbacks
  - `client/src/components/wizard/GraduationPresets.tsx` -- map callbacks
  - `client/src/components/portfolio/tag-performance-analysis.tsx` -- map +
    formatter
  - `client/src/features/scenario/summary.ts` -- context duck-typing
  - `client/src/components/scenario/scenario-manager.tsx` -- select handlers
  - `client/src/components/shared-dashboard.tsx` -- fetch response typing
