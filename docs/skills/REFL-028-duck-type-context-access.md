---
type: reflection
id: REFL-028
title: Duck-Type Context Access with Typed Bracket Notation
status: DRAFT
date: 2026-03-17
version: 1
severity: medium
wizard_steps: []
error_codes: []
components: [client, typescript, react-context]
keywords:
  [
    duck-typing,
    context,
    unsafe-member-access,
    bracket-notation,
    Record,
    FundContextType,
    type-assertion,
  ]
test_file: tests/regressions/REFL-028.test.ts
superseded_by: null
---

# Reflection: Duck-Type Context Access with Typed Bracket Notation

## 1. The Anti-Pattern (The Trap)

**Context:** React context objects sometimes carry properties at runtime that
are not declared on the official TypeScript interface. Components that need
these undeclared properties cast the entire context to `any`, which silences
type checking for ALL property access on that object.

**How to Recognize This Trap:**

1. **Error Signal:** `@typescript-eslint/no-unsafe-member-access` on context
   property access, or `no-unsafe-assignment` when destructuring from `any`.

2. **Code Pattern:**

   ```typescript
   // ANTI-PATTERN: Cast entire context to any
   const ctx: any = useFundContext?.() ?? {};
   const tvpi = ctx.kpis?.tvpi; // no-unsafe-member-access
   const select = ctx.selectFundKpis; // no-unsafe-member-access
   ```

3. **Mental Model:** "The interface doesn't have this property, so I need
   `any`." The real issue is that the interface is incomplete, but modifying the
   shared interface may not be appropriate (duck-typed extensions, optional
   plugins, feature-flagged properties).

> **DANGER:** Casting to `any` disables type checking for EVERY subsequent
> property access, not just the undeclared ones.

## 2. The Verified Fix (The Principle)

**Principle:** Use typed bracket notation via `Record<string, unknown>` to
access undeclared properties, then assert the expected shape with a local
interface. This preserves type safety for all other property access.

**Implementation Pattern:**

```typescript
// VERIFIED: Typed bracket access with local interface

// Step 1: Define the expected shape of the duck-typed property
interface KpiBlock {
  tvpi?: number;
  dpi?: number;
  nav?: number;
  irr?: number;
}

// Step 2: Access via Record<string, unknown> bracket notation
const ctx = useFundContext?.() ?? {};
const kpis = (ctx as Record<string, unknown>)['kpis'] as KpiBlock | undefined;
const selectFn = (ctx as Record<string, unknown>)['selectFundKpis'] as
  | (() => KpiBlock | undefined)
  | undefined;

// Step 3: Use with null safety
const tvpi = kpis?.tvpi ?? 0;
const selected = selectFn?.();
```

**Why this works:**

- `Record<string, unknown>` allows bracket access to any property name
- The `as KpiBlock | undefined` assertion narrows the type for subsequent access
- All other properties on `ctx` retain their original typed interface
- The local `KpiBlock` interface documents the expected runtime shape

**When to use the shared interface instead:**

If the property is stable and used in 3+ files, add it to the official interface
with `?:` optional syntax rather than duck-typing everywhere.

## 3. Evidence

- **Source Session:** 2026-03-17 tech debt reduction
- **File Fixed:** `client/src/features/scenario/summary.ts`
- **Commit:** `01f506e4`
- **Context:** `FundContextType` doesn't declare `kpis` or `selectFundKpis` --
  these are injected by a higher-order provider and vary by page context
- **Warnings Eliminated:** 14 (all `no-unsafe-member-access` in summary.ts)
