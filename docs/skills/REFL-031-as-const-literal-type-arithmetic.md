---
id: REFL-031
title: as-const Literal Types Prevent Arithmetic Reassignment
severity: medium
category: Infrastructure
discovered: 2026-03-23
tags: [typescript, type-safety, as-const]
---

# REFL-031: `as const` Literal Types Prevent Arithmetic Reassignment

## Anti-Pattern

Initializing a mutable variable from an `as const` object property, then
performing arithmetic on it. TypeScript infers the literal type, and arithmetic
results (`number`) cannot be assigned back.

## What Went Wrong

```typescript
export const ConfidenceLevel = {
  COLD_START: 0.3,
  MEDIUM: 0.7,
} as const;

let confidence = ConfidenceLevel.COLD_START; // type: 0.3
confidence += 0.2; // type widens to number (OK)
confidence = Math.min(confidence, ConfidenceLevel.MEDIUM);
//         ^ TS2322: Type 'number' is not assignable to type '0.3'
```

`let` widens literal types for simple assignments, but `Math.min()` returns
`number` which the compiler cannot narrow back to `0.3`.

## Root Cause

TypeScript's `as const` assertion makes all properties readonly with literal
types. When a `let` variable is initialized from such a property, the compiler
infers the literal type `0.3`, not `number`. Subsequent arithmetic produces
`number`, creating a type mismatch on reassignment.

This error was invisible in the original `client/` file because the client
tsconfig compilation may have been less strict or the file was excluded from the
server compilation boundary.

## Fix

Explicitly annotate the variable type as `number`:

```typescript
let confidence: number = ConfidenceLevel.COLD_START;
```

## Detection

The pre-push baseline check (`npm run baseline:check`) compiles
client/server/shared separately and catches this. Local `npx tsc --noEmit` may
not, depending on tsconfig includes.

## Prevention

When extracting code from `client/` to `shared/`, watch for variables
initialized from `as const` objects that are later mutated. Add explicit
`: number` annotations to any mutable variable initialized from a const enum or
`as const` object.
