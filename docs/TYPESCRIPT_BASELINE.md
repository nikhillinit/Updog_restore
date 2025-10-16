# TypeScript Baseline System

**Version:** 2.0.0
**Status:** Active
**Last Updated:** 2025-10-16

---

## Table of Contents

- [Overview](#overview)
- [For Developers](#for-developers)
- [Technical Details](#technical-details)
- [Commands Reference](#commands-reference)
- [Troubleshooting](#troubleshooting)
- [Progress Tracking](#progress-tracking)
- [CI/CD Integration](#cicd-integration)

---

## Overview

### What is the TypeScript Baseline System?

The TypeScript Baseline System is a "ratchet" mechanism that prevents new TypeScript errors from being introduced while allowing gradual fixing of existing errors. It works by:

1. **Capturing** a baseline snapshot of existing TypeScript errors
2. **Blocking** any new errors from being committed
3. **Allowing** (and celebrating) reduction of existing errors
4. **Tracking** progress toward zero errors across multiple projects

### Why We Need It: The TypeScript Debt Paradox

When a codebase has existing TypeScript errors, developers face a dilemma:

- **Fix all errors at once?** Too risky and time-consuming (hundreds of errors)
- **Ignore TypeScript checks?** Technical debt accumulates, type safety deteriorates
- **Block all commits?** Development grinds to a halt

The baseline system solves this by:

- Preventing the problem from getting worse (no new errors)
- Making incremental progress visible and rewarding
- Maintaining development velocity while improving type safety

### How It Works: Context-Aware Hashing

The system generates stable, content-based hashes for each TypeScript error:

```
Hash format: file:TScode:contentHash
Example: client/src/components/Card.tsx:TS2322:a1b2c3d4
```

**Why content-based hashing?**

Traditional approaches (file + line number) break when:
- Adding/removing imports changes line numbers
- Refactoring moves code around
- Multiple developers work on the same file

Content-based hashing uses the actual error line content (SHA1 hash), making it stable across:
- Line number changes
- File reorganizations
- Git rebases and merges

---

## For Developers

### Normal Workflow (No TypeScript Errors)

If your code has no TypeScript errors, the baseline system is invisible:

```bash
# Write code
vim client/src/components/NewFeature.tsx

# Commit (baseline check runs automatically via pre-commit hook)
git add .
git commit -m "feat: Add new feature"

# Output:
# 📊 TypeScript Baseline Check
# ────────────────────────────────────────────────────────────────────
# Baseline errors:  0
# Current errors:   0
# Fixed errors:     0 ✅
# New errors:       0 ✅
# ────────────────────────────────────────────────────────────────────
# ✅ No new TypeScript errors introduced
```

### Fixing Existing Errors Workflow

When you fix TypeScript errors, the system celebrates your progress:

```bash
# Fix some errors
vim client/src/components/ProblemsCard.tsx

# Run type check to verify fixes
npm run check

# Commit
git add .
git commit -m "fix: Resolve type errors in ProblemsCard"

# Output:
# 📊 TypeScript Baseline Check
# ────────────────────────────────────────────────────────────────────
# Baseline errors:  88
# Current errors:   85
# Fixed errors:     3 ✅
# New errors:       0 ✅
# ────────────────────────────────────────────────────────────────────
#
# ✅ GREAT WORK! You fixed 3 error(s)
#
# 💡 Update the baseline to lock in your improvements:
#    npm run baseline:save
#    git add .tsc-baseline.json
#    git commit --amend --no-edit
```

**Follow the instructions** to update the baseline and lock in your progress:

```bash
npm run baseline:save
git add .tsc-baseline.json
git commit --amend --no-edit
git push
```

### What to Do When Baseline Check Fails

If you introduce new TypeScript errors, the commit is blocked:

```bash
git commit -m "feat: Add feature"

# Output:
# ❌ NEW ERRORS DETECTED (not in baseline):
#
# client/src/components/NewFeature.tsx(42,10): error TS2322: Type 'string' is not assignable to type 'number'.
# client/src/utils/helpers.ts(15,5): error TS2345: Argument of type 'undefined' is not assignable to parameter of type 'string'.
#
# 💡 Options:
#    1. Fix the errors before pushing
#    2. If these errors are acceptable:
#       npm run baseline:save
#       git add .tsc-baseline.json
#       git commit --amend --no-edit
#
# ⚠️  Emergency bypass: git push --no-verify
#    (Document in commit message why bypass was necessary)
```

**Recommended approach:**

1. **Fix the errors** (preferred)
   ```bash
   npm run check  # See all errors
   # Fix the issues
   git add .
   git commit --amend --no-edit
   ```

2. **Accept the errors** (if fixing would delay critical work)
   ```bash
   npm run baseline:save
   git add .tsc-baseline.json
   git commit --amend --no-edit
   # Document why in commit message
   ```

3. **Emergency bypass** (last resort, requires justification)
   ```bash
   git commit --no-verify -m "feat: Critical hotfix (bypass: deadline pressure, will fix in follow-up PR)"
   ```

### Performance Expectations

The baseline system is optimized for speed:

- **Pre-commit check:** ~2-5 seconds (incremental build)
- **Pre-push check:** ~5-10 seconds (full build)
- **Baseline save:** ~5-10 seconds (full build + hash generation)
- **Progress report:** ~5-10 seconds (full build + comparison)

**Optimization features:**
- Incremental TypeScript builds (caches unchanged files)
- File content caching (reads each file only once)
- Parallel processing where possible

---

## Technical Details

### Hash Format Explanation

Each TypeScript error is hashed using three components:

```typescript
// Hash format: file:TScode:contentHash
const hash = `${normalizedPath}:TS${errorCode}:${contentHash}`;

// Example:
"client/src/components/Card.tsx:TS2322:a1b2c3d4"
```

**Components:**

1. **Normalized path** (`client/src/components/Card.tsx`)
   - Always uses forward slashes (cross-platform compatible)
   - Repo-relative (not absolute)
   - Normalized via `path.relative()` and `.replace(/\\/g, '/')`

2. **Error code** (`TS2322`)
   - TypeScript error code
   - Identifies the type of error
   - Example codes:
     - `TS2322` - Type assignment mismatch
     - `TS2345` - Argument type mismatch
     - `TS2531` - Object possibly null/undefined

3. **Content hash** (`a1b2c3d4`)
   - SHA1 hash of the error line content (first 8 characters)
   - Makes hash stable across line number changes
   - Trimmed whitespace before hashing (ignores indentation changes)

**Fallback behavior:**

If file reading fails (deleted file, permission issue), falls back to:
```typescript
`${normalizedPath}(${line},${col}):TS${errorCode}`
```

This line-based hash is less stable but ensures the system doesn't crash.

### Cross-Platform Compatibility

The system works identically on Windows, macOS, and Linux:

- **Path normalization:** All paths use forward slashes internally
- **Git integration:** Uses `git rev-parse --show-toplevel` to find repo root
- **Hash generation:** Uses Node.js `crypto` module (platform-independent)
- **File encoding:** Assumes UTF-8 (standard for TypeScript projects)

**Windows-specific considerations:**
- Input paths may have backslashes (`C:\dev\project\file.ts`)
- Normalized to forward slashes before hashing (`dev/project/file.ts`)
- Baseline file is cross-platform compatible (safe to commit)

### Multi-Project Support

The baseline tracks errors per project:

```json
{
  "version": "2.0.0",
  "totalErrors": 88,
  "timestamp": "2025-10-16T10:30:00.000Z",
  "buildMode": "incremental",
  "elapsedMs": 3421,
  "projects": {
    "client": {
      "errors": [
        "client/src/components/Card.tsx:TS2322:a1b2c3d4",
        "client/src/utils/format.ts:TS2345:e5f6g7h8"
      ],
      "total": 2,
      "lastUpdated": "2025-10-16T10:30:00.000Z"
    },
    "server": {
      "errors": [
        "server/routes/api.ts:TS2531:i9j0k1l2"
      ],
      "total": 1,
      "lastUpdated": "2025-10-16T10:30:00.000Z"
    },
    "shared": {
      "errors": [],
      "total": 0,
      "lastUpdated": "2025-10-16T10:30:00.000Z"
    }
  }
}
```

**Project inference rules:**
- `client/` → `client` project
- `server/` → `server` project
- `shared/` → `shared` project
- Everything else → `unknown` project

### Incremental Builds

The system uses TypeScript's incremental build feature for speed:

```javascript
// Pre-commit: Fast incremental check
execSync('npx tsc --build --incremental --noEmit --pretty false');

// Pre-push: Full build (no incremental cache)
execSync('npx tsc --build --noEmit --pretty false');
```

**Incremental build benefits:**
- Reuses previous compilation results (.tsbuildinfo cache)
- Only re-checks changed files and their dependencies
- 3-5x faster on subsequent runs

**Build info location:**
- `.tsbuildinfo` (gitignored)
- Automatically managed by TypeScript compiler
- Safe to delete (will regenerate on next build)

**When incremental builds are disabled:**
- First run (no cache exists)
- After `npm install` (dependencies changed)
- After switching branches (file changes detected)
- Explicitly disabled via `npm run baseline:save` (ensures accuracy)

---

## Commands Reference

### `npm run baseline:save`

**Purpose:** Save or update the TypeScript error baseline

**When to use:**
- Initial setup (creating baseline for first time)
- After fixing errors (lock in progress)
- After accepting new errors (update baseline)

**Example:**
```bash
$ npm run baseline:save

🔍 Running TypeScript compilation...
Found 88 TypeScript errors

✅ Baseline saved successfully
📝 File: C:\dev\Updog_restore\.tsc-baseline.json
📊 Total errors: 88
⏱️  Build time: 3421ms

📋 Errors by project:
   client        85 errors
   server         3 errors
   shared         0 errors
```

**Output:**
- Creates/updates `.tsc-baseline.json` in repo root
- Shows total error count and per-project breakdown
- Reports build time for performance monitoring

**Important:**
- Always commit `.tsc-baseline.json` after saving
- Include in the same commit as the code changes
- Document in commit message if accepting new errors

### `npm run baseline:check`

**Purpose:** Check current errors against baseline (blocks if new errors found)

**When to use:**
- Automatically runs in pre-commit hook
- Manually verify before committing: `npm run baseline:check`
- CI/CD pipelines (pre-push, pull request checks)

**Example (success):**
```bash
$ npm run baseline:check

📊 TypeScript Baseline Check
──────────────────────────────────────────────────────────────────────
Baseline errors:  88
Current errors:   85
Fixed errors:     3 ✅
New errors:       0 ✅
──────────────────────────────────────────────────────────────────────

✅ GREAT WORK! You fixed 3 error(s)

💡 Update the baseline to lock in your improvements:
   npm run baseline:save
   git add .tsc-baseline.json
   git commit --amend --no-edit

✅ No new TypeScript errors introduced
```

**Example (failure):**
```bash
$ npm run baseline:check

📊 TypeScript Baseline Check
──────────────────────────────────────────────────────────────────────
Baseline errors:  88
Current errors:   90
Fixed errors:     0 ✅
New errors:       2 ❌
──────────────────────────────────────────────────────────────────────

❌ NEW ERRORS DETECTED (not in baseline):

client/src/components/NewFeature.tsx(42,10): error TS2322: Type 'string' is not assignable to type 'number'.
server/routes/api.ts(15,5): error TS2345: Argument of type 'undefined' is not assignable to parameter of type 'string'.

💡 Options:
   1. Fix the errors before pushing
   2. If these errors are acceptable:
      npm run baseline:save
      git add .tsc-baseline.json
      git commit --amend --no-edit

⚠️  Emergency bypass: git push --no-verify
   (Document in commit message why bypass was necessary)

# Exit code 1 (failure)
```

**Exit codes:**
- `0` - Success (no new errors)
- `1` - Failure (new errors detected)

### `npm run baseline:progress`

**Purpose:** Show progress metrics toward zero errors

**When to use:**
- Track team progress over time
- Demonstrate type safety improvements
- Identify which projects need attention

**Example:**
```bash
$ npm run baseline:progress

📊 TypeScript Error Progress

──────────────────────────────────────────────────────────────────────
Project    │ Baseline │ Current  │ Fixed    │ Progress
──────────────────────────────────────────────────────────────────────
client     │       85 │       82 │        3 │    3.5%
server     │        3 │        3 │        0 │    0.0%
──────────────────────────────────────────────────────────────────────
TOTAL      │       88 │       85 │        3 │    3.4%
──────────────────────────────────────────────────────────────────────

📅 Baseline last updated: 10/16/2025, 10:30:00 AM
⏱️  Check completed in: 3152ms
```

**Metrics explained:**
- **Baseline:** Error count when baseline was last saved
- **Current:** Error count right now
- **Fixed:** Errors eliminated since baseline (baseline - current)
- **Progress:** Percentage of errors fixed (fixed / baseline * 100)

**Usage tips:**
- Run weekly to track team progress
- Include in sprint reviews to demonstrate improvements
- Celebrate when projects reach 0 errors

---

## Troubleshooting

### Slow Checks (>30 seconds)

**Symptoms:**
- `npm run baseline:check` takes over 30 seconds
- Pre-commit hook times out
- CI builds are slow

**Causes:**
1. `.tsbuildinfo` cache is missing or corrupted
2. Large number of files changed (incremental build ineffective)
3. Running on slow hardware or shared CI runner

**Solutions:**

1. **Clear TypeScript cache:**
   ```bash
   rm -f .tsbuildinfo tsconfig*.tsbuildinfo
   npm run baseline:check  # Will regenerate cache
   ```

2. **Use faster TypeScript config for pre-commit:**
   ```bash
   # The pre-commit hook already uses this optimization
   npm run check:incremental  # Fast incremental check
   ```

3. **Profile the build:**
   ```bash
   npx tsc --build --incremental --noEmit --extendedDiagnostics
   # Look for slow files/projects in output
   ```

4. **Upgrade TypeScript:**
   ```bash
   npm install --save-dev typescript@latest
   ```

### False Positives (Errors Shown That Don't Exist)

**Symptoms:**
- Baseline check fails with errors you already fixed
- Hashes in baseline don't match current code
- Errors appear on different lines than expected

**Causes:**
1. Baseline was generated with different code than current HEAD
2. File was modified but not committed (stale baseline)
3. Cross-platform line ending issues (CRLF vs LF)

**Solutions:**

1. **Regenerate baseline from current code:**
   ```bash
   npm run baseline:save
   git diff .tsc-baseline.json  # Verify changes
   git add .tsc-baseline.json
   git commit -m "chore: Update TypeScript baseline"
   ```

2. **Ensure line endings are consistent:**
   ```bash
   # Check Git's line ending settings
   git config core.autocrlf

   # Should be 'false' or 'input' (not 'true')
   git config core.autocrlf input
   ```

3. **Verify no uncommitted changes:**
   ```bash
   git status  # Should show "nothing to commit, working tree clean"
   ```

### Emergency Bypass (--no-verify)

**When to use:**
- Production hotfix that can't wait for error fixes
- Temporary workaround needed (with follow-up PR planned)
- Build pipeline is broken (baseline system bug)

**How to use:**

```bash
# Commit bypass
git commit --no-verify -m "feat: Critical feature (bypass: production incident, will fix types in PR #123)"

# Push bypass
git push --no-verify
```

**IMPORTANT: Always document why!**

Good commit message examples:
```
feat: Add emergency rate limiting (bypass: DDoS attack, type fixes in PR #456)
fix: Hotfix payment bug (bypass: customer-impacting, type cleanup in PR #457)
chore: Update baseline (bypass: baseline system bug reported in #458)
```

Bad commit message examples:
```
feat: Add feature (bypass)  ❌ No explanation
fix: Stuff (--no-verify)    ❌ Vague
```

**After using bypass:**
1. Create immediate follow-up PR to fix errors
2. Reference the bypass commit in the follow-up PR
3. Update baseline once errors are fixed

---

## Progress Tracking

### How to See Progress

**Quick check:**
```bash
npm run baseline:progress
```

**Detailed check:**
```bash
# See all current errors
npm run check

# Compare with baseline
cat .tsc-baseline.json | jq '.totalErrors'
```

**Historical progress:**
```bash
# See baseline changes over time
git log -p --all -- .tsc-baseline.json

# See when baseline was last updated
git log -1 --format="%ai %s" .tsc-baseline.json
```

### Per-Project Metrics

**Check individual project status:**

```bash
# Client project errors
cat .tsc-baseline.json | jq '.projects.client.total'

# Server project errors
cat .tsc-baseline.json | jq '.projects.server.total'

# Shared project errors
cat .tsc-baseline.json | jq '.projects.shared.total'
```

**Focus areas (prioritize by error count):**
```bash
# Show projects sorted by error count
cat .tsc-baseline.json | jq -r '.projects | to_entries | sort_by(.value.total) | reverse | .[] | "\(.key): \(.value.total) errors"'
```

**Example output:**
```
client: 85 errors
server: 3 errors
shared: 0 errors
```

**Strategy:**
- Start with low-error projects (quick wins)
- Dedicate sprints to high-error projects
- Prevent new errors from being introduced anywhere

### Goal: Zero Errors

**Why zero errors matters:**

1. **Type Safety:** Full TypeScript protection across entire codebase
2. **Refactoring Confidence:** Safe to rename, move, and restructure code
3. **IDE Support:** Better autocomplete, go-to-definition, and refactoring tools
4. **Bug Prevention:** Catch errors at compile time instead of runtime
5. **Onboarding:** New developers can trust the types

**Tracking toward zero:**

```bash
# Set a target date
echo "Target: Zero errors by 2025-12-31" >> .tsc-baseline-goal.txt

# Track weekly progress
npm run baseline:progress >> weekly-progress.log

# Calculate weekly velocity
cat .tsc-baseline.json | jq '.totalErrors'
# (Compare with previous week to see trend)
```

**Celebrating milestones:**

- First project reaches zero errors
- Total error count below 50
- Total error count below 10
- ZERO ERRORS ACHIEVED

**Example milestone commit:**
```bash
git commit -m "feat: Client project now has zero TypeScript errors! 🎉"
```

---

## CI/CD Integration

### How Baseline Check Runs in CI

The baseline check is integrated into the Git workflow via Husky hooks:

**Pre-commit hook** (`.husky/pre-commit`):
```bash
# Fast incremental check on staged files
npm run check:incremental || {
  echo "❌ TypeScript type errors detected"
  exit 1
}
```

**Pre-push hook** (`.husky/pre-push`):
```bash
# Full baseline check before pushing
npm run check || {
  echo "❌ Type check failed. Fix errors before pushing."
  exit 1
}
```

**GitHub Actions** (`.github/workflows/ci-unified.yml`):
```yaml
- name: TypeScript Type Check
  run: npm run baseline:check
```

### What Happens on PR Failure

If a pull request introduces new TypeScript errors:

1. **GitHub Actions fails** with clear error message
2. **Status check blocks merge** (if branch protection enabled)
3. **Developer is notified** via GitHub notifications
4. **PR shows red X** with "TypeScript Baseline Check Failed"

**Developer's next steps:**

1. **View the CI logs** to see which errors were introduced
2. **Fix the errors locally:**
   ```bash
   npm run check  # See all errors
   # Fix the issues
   git add .
   git commit -m "fix: Resolve TypeScript errors"
   git push
   ```
3. **Or update baseline** (if errors are acceptable):
   ```bash
   npm run baseline:save
   git add .tsc-baseline.json
   git commit -m "chore: Update TypeScript baseline (new feature requires type updates)"
   git push
   ```

### Merge Requirements

**For projects with zero errors:**
- No new errors allowed (strict enforcement)
- Baseline file should not change (unless fixing errors)

**For projects with existing errors:**
- No new errors allowed
- Fixing errors is encouraged (reduces baseline)
- Baseline updates must be committed with code changes

**Branch protection settings (recommended):**

```yaml
branches:
  main:
    protection:
      required_status_checks:
        - TypeScript Baseline Check
      required_reviews: 1
      enforce_admins: false  # Allow emergency hotfixes
```

**Emergency override process:**

1. Merge PR with `--admin-override` (GitHub) or push with `--no-verify` (Git)
2. Create immediate follow-up issue to fix errors
3. Document in PR description why override was necessary
4. Tag with `tech-debt` label

---

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Project overview and commands
- [DECISIONS.md](../DECISIONS.md) - Why we chose this approach
- [CHANGELOG.md](../CHANGELOG.md) - History of TypeScript improvements
- [cheatsheets/typescript.md](../cheatsheets/typescript.md) - TypeScript best practices

---

## Maintenance

### Updating the Baseline System

If the baseline system needs updates (new features, bug fixes):

1. **Update script:** `scripts/typescript-baseline.js`
2. **Test locally:**
   ```bash
   npm run baseline:save
   npm run baseline:check
   npm run baseline:progress
   ```
3. **Update version:** Increment `version` in generated baseline JSON
4. **Update docs:** Update this file with any behavior changes
5. **Commit:**
   ```bash
   git add scripts/typescript-baseline.js docs/TYPESCRIPT_BASELINE.md
   git commit -m "chore: Update TypeScript baseline system"
   ```

### Baseline File Format

If you need to manually inspect or modify `.tsc-baseline.json`:

```json
{
  "version": "2.0.0",           // Baseline schema version
  "totalErrors": 88,            // Total unique errors across all projects
  "timestamp": "2025-10-16...", // ISO 8601 timestamp of last save
  "buildMode": "incremental",   // Build type (incremental/full)
  "elapsedMs": 3421,           // Build time in milliseconds
  "projects": {
    "client": {
      "errors": ["..."],       // Array of error hashes
      "total": 85,             // Error count (length of array)
      "lastUpdated": "..."     // ISO 8601 timestamp
    }
  }
}
```

**Warning:** Manually editing `.tsc-baseline.json` can cause false positives/negatives. Always use `npm run baseline:save` to regenerate.

---

## Support

**Issues with the baseline system?**

1. **Check this documentation** first
2. **Search existing issues:** [GitHub Issues](https://github.com/your-repo/issues?q=typescript+baseline)
3. **Create new issue:** Include:
   - Output of `npm run baseline:check`
   - Output of `npm run check`
   - Your `.tsc-baseline.json` (if safe to share)
   - Steps to reproduce

**Questions or suggestions?**

- Open a discussion in GitHub Discussions
- Tag with `typescript` or `developer-experience`
- Include use case and expected behavior

---

*Last updated: 2025-10-16*
*Baseline script version: 2.0.0*
*Maintained by: Development Team*
