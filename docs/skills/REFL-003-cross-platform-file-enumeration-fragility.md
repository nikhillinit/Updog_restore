---
type: reflection
id: REFL-003
title: Cross-Platform File Enumeration Fragility
status: VERIFIED
date: 2026-01-18
version: 1
severity: medium
wizard_steps: []
error_codes: []
components: [ci, scripts, filesystem]
keywords: [cross-platform, windows, linux, git-ls-files, file-enumeration, deterministic]
test_file: tests/regressions/REFL-003.test.ts
superseded_by: null
---

# Reflection: Cross-Platform File Enumeration Fragility

## 1. The Anti-Pattern (The Trap)

**Context:** Scripts that walk the filesystem to enumerate files produce different results on Windows vs Linux due to untracked directories, gitignore behavior, and path separators.

**How to Recognize This Trap:**
1.  **Error Signal:** CI fails with "file count mismatch" or "comparison failed" when local tests pass
2.  **Code Pattern:** Using `fs.readdirSync` or `glob` for deterministic comparisons:
    ```typescript
    // ANTI-PATTERN
    const files = glob.sync('docs/**/*.md');
    const count = files.length; // Different on Windows vs Linux!
    ```
3.  **Mental Model:** Assuming filesystem state is consistent across environments. Untracked directories like `_archive/` exist locally but not in CI.

**Financial Impact:** Flaky CI creates "works on my machine" debugging cycles. Engineers waste hours on environment-specific issues instead of building features.

> **DANGER:** Do NOT use filesystem walking for deterministic comparisons in CI.

## 2. The Verified Fix (The Principle)

**Principle:** Use `git ls-files` for deterministic file enumeration across platforms.

**Implementation Pattern:**
1.  Replace filesystem walking with `git ls-files`
2.  Add explicit excludes for known variable directories
3.  Normalize paths to forward slashes

```typescript
// VERIFIED IMPLEMENTATION
import { execSync } from 'child_process';

function getTrackedFiles(pattern: string): string[] {
  // Use git ls-files for deterministic enumeration
  const output = execSync(`git ls-files '${pattern}'`, { encoding: 'utf-8' });
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(f => f.replace(/\\/g, '/')); // Normalize path separators
}

// Usage
const docs = getTrackedFiles('docs/**/*.md');
// Returns same count on Windows, Linux, and CI
```

**For comparison scripts:**
```typescript
// Strip variable arrays from comparison
const compareRouting = (local: RoutingConfig, ci: RoutingConfig) => {
  // Only compare structural elements, not file lists
  const { docs: _localDocs, ...localStructure } = local;
  const { docs: _ciDocs, ...ciStructure } = ci;

  return deepEqual(localStructure, ciStructure);
};
```

**Key Learnings:**
1. Windows and Linux see different file sets due to untracked directories
2. `git ls-files` returns only tracked files - consistent across platforms
3. Add `_archive/**` and similar to exclude lists for generators

## 3. Evidence

*   **Test Coverage:** `tests/regressions/REFL-003.test.ts` validates cross-platform enumeration
*   **Source Session:** `docs/plans/2026-01-15-ci-routing-bundle-fix/findings.md` - Discovery 1
*   **Example:** Local showed 751 docs, CI showed 743 docs (8 file difference from `_archive/`)
