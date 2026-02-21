---
type: reflection
id: REFL-023
title: Math.random in Production Identifiers
status: DRAFT
date: 2026-02-18
version: 1
severity: medium
wizard_steps: []
error_codes: []
components: [client, security, feature-flags, rollout]
keywords:
  [Math.random, crypto, randomUUID, security, predictable-ids, feature-flags]
test_file: tests/regressions/REFL-023.test.ts
superseded_by: null
---

# Reflection: Math.random in Production Identifiers

## 1. The Anti-Pattern (The Trap)

**Context:** Feature-flag rollout runtime code used `Math.random().toString(36)`
as a fallback for generating session/runtime identifiers. `Math.random()` is not
cryptographically secure -- its output is predictable given enough samples,
making rollout bucketing gameable and introducing a subtle security weakness.

**How to Recognize This Trap:**

1.  **Error Signal:** Security scanners or dependency audit tools flag
    `Math.random` usage in non-test code. Manual review finds it in ID
    generation, token creation, or bucketing logic.
2.  **Code Pattern:** Fallback to `Math.random` when `crypto` is "unavailable":
    ```typescript
    // ANTI-PATTERN
    function getRuntimeId(): string {
      try {
        return crypto.randomUUID();
      } catch {
        // "Safe" fallback -- actually predictable!
        return Math.random().toString(36).slice(2);
      }
    }
    ```
3.  **Mental Model:** "The fallback rarely fires, so it doesn't matter." In
    reality: (a) the fallback may fire more than expected on older runtimes or
    SSR, (b) even rare predictable IDs create exploitable windows, (c) security
    audits flag it regardless of frequency.

**Financial Impact:** Low direct financial risk in this specific case (rollout
bucketing), but the pattern propagates. If copied to session tokens, API keys,
or nonce generation, it becomes a real vulnerability.

> **DANGER:** Do NOT use `Math.random()` for any identifier, token, or bucketing
> key in production code.

## 2. The Verified Fix (The Principle)

**Principle:** Use `crypto.randomUUID()` or `crypto.getRandomValues()`
exclusively. If the crypto API is truly unavailable, fail loudly rather than
falling back to a predictable source.

**Implementation Pattern:**

1.  Remove `Math.random` fallbacks entirely
2.  Use `crypto.randomUUID()` (available in all modern browsers and Node >= 19)
3.  For environments without `crypto`, throw an error or use a polyfill -- never
    silently degrade

```typescript
// VERIFIED IMPLEMENTATION

// Option 1: Direct usage (preferred -- no fallback needed)
function getRuntimeId(): string {
  return crypto.randomUUID();
}

// Option 2: If you truly need a fallback (e.g., very old Node)
function getRuntimeIdSafe(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fail loudly -- do NOT fall back to Math.random
  throw new Error(
    'crypto.randomUUID is required but unavailable in this runtime'
  );
}

// Option 3: Shorter random strings via getRandomValues
function getShortId(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
```

**Key Learnings:**

1. `crypto.randomUUID()` is available in all target environments for this
   project (modern browsers + Node 20+)
2. The fallback pattern itself is the bug -- it exists "just in case" but
   creates a real vulnerability
3. Found in 2 files in one audit: `rollout-runtime.ts` (runtime IDs) and a
   rollout config fallback
4. `grep -r "Math.random" --include="*.ts" --exclude-dir=node_modules` is a
   useful audit command

## 3. Evidence

- **Source Session:** 2026-02-17 -- commits 1f973ad4, cc29d9a1
- **Files Affected:** `client/src/lib/rollout-runtime.ts`
- **Related:** OWASP A02:2021 - Cryptographic Failures
