---
type: reflection
id: REFL-025
title: CI Compilation Boundary Mismatch
status: DRAFT
date: 2026-02-18
version: 1
severity: medium
wizard_steps: []
error_codes: [TS4111, TS2307, TS2339]
components: [typescript, ci, baseline, client, server, shared]
keywords:
  [
    tsc,
    baseline-check,
    ci-mismatch,
    ts4111,
    index-signature,
    noUncheckedIndexedAccess,
    separate-compilation,
    pre-push-hook,
  ]
test_file: tests/regressions/REFL-025.test.ts
superseded_by: null
---

# Reflection: CI Compilation Boundary Mismatch

## 1. The Anti-Pattern (The Trap)

**Context:** The project uses a monorepo with three TypeScript compilation
zones: `client/`, `server/`, and `shared/`. Running `npx tsc --noEmit` from the
project root compiles everything as a single unified program. But the CI
baseline check (`npm run baseline:check`) and the pre-push hook compile each
zone separately with its own `tsconfig.json`. The separate compilation is
stricter -- it catches errors that the unified check misses.

**How to Recognize This Trap:**

1. **Error Signal:** `npx tsc --noEmit` passes locally. You push. CI or pre-push
   hook fails with:
   - `TS4111: Property 'X' comes from an index signature, so it must be accessed with ['X']`
     -- triggered by `noUncheckedIndexedAccess` in a zone's tsconfig
   - `TS2307: Cannot find module '@shared/...'` -- path alias resolution differs
     between unified and per-zone compilation
   - `TS2339: Property does not exist on type` -- type narrowing works
     differently when shared types are compiled separately

2. **Code Pattern:** Any of these trigger the mismatch:

   ```typescript
   // ANTI-PATTERN: Direct property access on index-signature types
   // Passes unified tsc, fails per-zone with TS4111
   const flags = getFeatureFlags(); // Returns Record<string, boolean>
   if (flags.myFeature) { ... }

   // FIX: Bracket notation
   if (flags['myFeature']) { ... }

   // ANTI-PATTERN: Relying on cross-zone type inference
   // server/ imports from shared/ -- works in unified, may fail in per-zone
   // if shared/'s tsconfig has different strictness settings
   import { FundConfig } from '@shared/types';
   const x: FundConfig = { ... }; // Type shape may differ per compilation
   ```

3. **Mental Model:** Assuming `tsc --noEmit` from root is the source of truth.
   In reality, Vite (client) and ts-node (server) each compile their zone
   independently in production. The per-zone check mirrors actual build
   behavior.

**Financial Impact:** Every push that passes local tsc but fails CI wastes a CI
cycle (2-5 minutes) and blocks the developer from merging. Across the P4/P5
cycle, this caused 6+ failed pushes requiring local fixup and re-push.

> **DANGER:** `npx tsc --noEmit` is a necessary but NOT sufficient check. Always
> run `npm run baseline:check` before pushing.

## 2. The Verified Fix (The Principle)

**Principle:** Always validate with the same compilation boundaries that CI
uses. The local shortcut (`tsc --noEmit`) exists for fast iteration, but the
pre-push gate must match CI exactly.

### Pre-Push Workflow

```bash
# Fast iteration (catches ~90% of errors):
npx tsc --noEmit

# Before pushing (catches the remaining ~10%):
npm run baseline:check
```

### Common TS4111 Fix Pattern

```typescript
// BEFORE -- passes unified tsc, fails per-zone
interface FeatureFlags {
  [key: string]: boolean;
}
const flags: FeatureFlags = loadFlags();
if (flags.enableDarkMode) { ... }  // TS4111 in per-zone

// AFTER -- passes both unified and per-zone
if (flags['enableDarkMode']) { ... }

// Or use a typed accessor that returns the correct type
function getFlag(flags: FeatureFlags, key: string): boolean {
  return flags[key] ?? false;
}
if (getFlag(flags, 'enableDarkMode')) { ... }
```

### Common TS2307 Fix Pattern

```typescript
// BEFORE -- path alias resolves in unified but not per-zone
import { Thing } from '@shared/deep/nested/thing';

// AFTER -- verify the path exists in shared/tsconfig.json paths
// and that shared/tsconfig.json exports the module
// Check: does shared/tsconfig.json include this file in its compilation?
```

### Diagnostic Commands

```bash
# Check which tsconfig a file belongs to:
npx tsc --showConfig -p client/tsconfig.json | findstr "include"
npx tsc --showConfig -p server/tsconfig.json | findstr "include"

# Run per-zone checks individually to isolate which zone fails:
npx tsc --noEmit -p client/tsconfig.json
npx tsc --noEmit -p server/tsconfig.json
npx tsc --noEmit -p shared/tsconfig.json
```

**Key Learnings:**

1. `noUncheckedIndexedAccess` is the most common source of TS4111 -- it's
   enabled per-zone but may be relaxed in the unified root tsconfig
2. Path alias resolution (`@shared/`, `@/`) depends on which tsconfig is active;
   per-zone compilation uses that zone's `paths` mapping, not the root
3. The pre-push hook runs `npm run baseline:check` automatically -- if it fails,
   the push is blocked (this is the safety net)
4. Shared types that use `Record<string, T>` or `{ [key: string]: T }` are the
   highest-risk patterns for TS4111 across zone boundaries

## 3. Evidence

- **Source Sessions:** P4 (2026-02-08), P5 (2026-02-17), every push cycle
- **Commits:** `d1f903f7` (CI baseline regression fix), multiple pre-push
  failures across P4/P5
- **Files Commonly Affected:** `shared/types.ts`, `shared/core/*/index.ts`, any
  file using `Record<string, T>` types from shared
- **Related:** MEMORY.md auto-memory note (terse version of this reflection)
- **Frequency:** Recurs on nearly every push that touches shared type
  definitions
