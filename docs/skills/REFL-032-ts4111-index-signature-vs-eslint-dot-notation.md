---
id: REFL-032
title: TS4111 Index Signature Access Conflicts with ESLint Dot Notation
severity: medium
category: Infrastructure
discovered: 2026-03-23
tags:
  [
    typescript,
    eslint,
    lint-staged,
    index-signature,
    noPropertyAccessFromIndexSignature,
  ]
error_codes: [TS4111]
---

# REFL-032: TS4111 Index Signature Access Conflicts with ESLint Dot Notation

## Anti-Pattern

When a function parameter uses an index signature type
(`{ [key: string]: unknown }`), TypeScript with
`noPropertyAccessFromIndexSignature` requires bracket notation:
`section['reasonCode']`. But ESLint's `dot-notation` rule (applied by
lint-staged on commit) rewrites it to `section.reasonCode`, causing TS4111 on
the next compilation.

This creates a cycle: fix for TS -> lint reverts -> TS breaks again.

## Trigger

Any time you use an index signature type AND access named properties on it:

```ts
// This type triggers the conflict
function process(obj: { [key: string]: unknown }): string {
  // TS4111 requires bracket notation:
  const value = obj['myKey']; // TypeScript happy, ESLint unhappy
  const value2 = obj.myKey; // ESLint happy, TypeScript unhappy
}
```

## Root Cause

- `noPropertyAccessFromIndexSignature: true` in tsconfig forces bracket access
  for index signatures (prevents accidentally treating arbitrary keys as known
  properties)
- ESLint `dot-notation` rule prefers `obj.key` over `obj['key']` when the key is
  a valid identifier
- lint-staged runs ESLint --fix on commit, silently reverting bracket notation

## Fix

### Option A: More Specific Type (Preferred)

Avoid the index signature entirely by using a concrete type:

```ts
// Instead of { [key: string]: unknown }
interface SectionInput {
  reason?: string | undefined;
  reasonCode?: string | undefined;
  // ... named properties
}
```

### Option B: ESLint Override for Index Signature Functions

Disable dot-notation for the specific function or file:

```ts
/* eslint-disable dot-notation */
function reasonCopyFor(section: { [key: string]: unknown }): string {
  const code = section['reasonCode'];
  // ...
}
/* eslint-enable dot-notation */
```

### Option C: Protective Comment (Workaround)

Add a comment explaining why bracket notation is required. This doesn't prevent
ESLint from rewriting, but signals to developers not to "fix" it:

```ts
// Bracket notation required: TS4111 with noPropertyAccessFromIndexSignature
const code = section['reasonCode'];
```

## Detection

- TS4111 errors appearing after a clean lint-staged commit
- Errors only on properties of `{ [key: string]: T }` typed parameters
- Pattern: code passes `tsc` locally, fails after commit because lint-staged
  modified it

## Related

- REFL-021: exactOptionalPropertyTypes spread pattern (adjacent TS strictness
  issue)
- tsconfig `noPropertyAccessFromIndexSignature` documentation
