---
name: fix-eslint
description:
  'Automatically fix ESLint errors at scale. Dynamically handles small (≤20),
  medium (20-500), and large (500+) error counts using strategic batching and
  parallel sub-agents. Enforces strict type safety—no suppressions, no `any`
  casts.'
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Task, TodoWrite
---

# Fix ESLint Errors at Scale

Automatically fix ESLint errors by modifying code to comply with configured
linting rules. Designed to handle large codebases without breaking the build or
introducing technical debt.

## Core Principles

1. **Compliance over Suppression** — Never use `eslint-disable`, `@ts-ignore`,
   or `any` casts.
2. **Fix Code, Not Config** — Do not modify `.eslintrc.*` or `tsconfig.json`.
3. **Atomic Functionality** — Fixes must not change business logic.
4. **Verify Continuously** — Run `tsc` after each batch to catch regressions.
5. **Idempotent** — Running the skill twice should produce zero changes the
   second time.

---

## Step 0: Environment Setup

### 0.1: Detect Package Manager

Run this first. Store `$PKG` for all subsequent commands.

```bash
if [ -f "pnpm-lock.yaml" ]; then
  PKG="pnpm"
elif [ -f "yarn.lock" ]; then
  PKG="yarn"
elif [ -f "bun.lockb" ]; then
  PKG="bun"
else
  PKG="npx"
fi
echo "Using: $PKG"
```

### 0.2: Create Safety Checkpoint

```bash
git checkout -b fix/eslint-cleanup-$(date +%Y%m%d-%H%M%S)
```

### 0.3: Run Auto-Fix First

Clear low-hanging fruit before analysis. This typically resolves 40-70% of
issues.

```bash
# Run auto-fix with cache
$PKG eslint --fix --cache --cache-location .eslintcache "src/**/*.{ts,tsx,js,jsx}"

# Commit auto-fixes separately
git add -A && git commit -m "fix(lint): auto-fix eslint errors" || echo "No auto-fixes applied"

# Verify build is not broken
$PKG tsc --noEmit --pretty false
```

---

## Step 1: Analyze Errors

**Do not parse ESLint JSON manually.** Create and run this Node.js script to
generate a conflict-free execution plan.

### 1.1: Create `analyze-lint.js`

```javascript
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Detect package manager
const pkg = fs.existsSync('pnpm-lock.yaml')
  ? 'pnpm'
  : fs.existsSync('yarn.lock')
    ? 'yarn'
    : fs.existsSync('bun.lockb')
      ? 'bun'
      : 'npx';

const pattern = process.argv[2] || 'src/**/*.{ts,tsx,js,jsx}';
console.log(
  `\n═══════════════════════════════════════════════════════════════`
);
console.log(`  ESLint Analysis (${pkg})`);
console.log(
  `═══════════════════════════════════════════════════════════════\n`
);
console.log(`Pattern: ${pattern}\n`);

let results;
try {
  const cmd = `${pkg} eslint --format json "${pattern}"`;
  const output = execSync(cmd, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  results = JSON.parse(output);
} catch (e) {
  // ESLint exits non-zero when errors exist - that's expected
  if (e.stdout) {
    try {
      results = JSON.parse(e.stdout);
    } catch {
      console.error('Failed to parse ESLint output.');
      console.error('stderr:', e.stderr?.toString());
      process.exit(2);
    }
  } else {
    console.error('ESLint failed:', e.message);
    process.exit(2);
  }
}

// Aggregate using ESLint's built-in counts (more reliable than inspecting messages[].fix)
let totalErrors = 0,
  totalWarnings = 0,
  totalFixable = 0,
  totalFatal = 0;
const dirBatches = {};
const ruleCounts = {};
const fileProblems = [];

results.forEach((file) => {
  totalErrors += file.errorCount || 0;
  totalWarnings += file.warningCount || 0;
  totalFixable +=
    (file.fixableErrorCount || 0) + (file.fixableWarningCount || 0);
  totalFatal += file.fatalErrorCount || 0;

  const problemCount = (file.errorCount || 0) + (file.warningCount || 0);
  if (problemCount === 0) return;

  // Track files for "top files" list
  fileProblems.push({ file: file.filePath, count: problemCount });

  // Group by directory (prevents git conflicts in parallel mode)
  const dir = path.dirname(file.filePath);
  dirBatches[dir] = (dirBatches[dir] || 0) + problemCount;

  // Count by rule
  file.messages.forEach((msg) => {
    const rule = msg.ruleId || 'FATAL/PARSE_ERROR';
    ruleCounts[rule] = (ruleCounts[rule] || 0) + 1;
  });
});

const totalProblems = totalErrors + totalWarnings;
const filesWithProblems = fileProblems.length;

// ─── SUMMARY ───
console.log(`───────────────────────────────────────────────────────────────`);
console.log(`  SUMMARY`);
console.log(
  `───────────────────────────────────────────────────────────────\n`
);
console.log(`  Errors:              ${totalErrors}`);
console.log(`  Warnings:            ${totalWarnings}`);
console.log(`  Total problems:      ${totalProblems}`);
console.log(`  Files with problems: ${filesWithProblems}`);
console.log(`  Fatal/parse errors:  ${totalFatal}`);
console.log(`  Auto-fixable:        ${totalFixable}`);
console.log(`  Manual fixes needed: ${totalProblems - totalFixable}\n`);

if (totalProblems === 0) {
  console.log('[PASS] No ESLint problems found!\n');
  process.exit(0);
}

// ─── STRATEGY RECOMMENDATION ───
console.log(`───────────────────────────────────────────────────────────────`);
console.log(`  RECOMMENDED STRATEGY`);
console.log(
  `───────────────────────────────────────────────────────────────\n`
);

let strategy;
const sortedRules = Object.entries(ruleCounts).sort((a, b) => b[1] - a[1]);
const topRuleCount = sortedRules[0]?.[1] || 0;
const topRuleConcentration =
  totalProblems > 0 ? Math.round((topRuleCount * 100) / totalProblems) : 0;

if (totalProblems <= 20) {
  strategy = 'direct_fix';
  console.log('  [DIRECT] Direct Fix (Step 3A)');
  console.log('     Problem count (≤20) is manageable for serial fixing.\n');
} else if (totalProblems <= 500) {
  if (topRuleConcentration >= 80) {
    strategy = 'parallel_rule';
    console.log('  [TARGET] Parallel by Rule Type (Step 3C)');
    console.log(
      `     Top rule "${sortedRules[0][0]}" accounts for ${topRuleConcentration}% of problems.`
    );
    console.log('     Fix by rule type for consistency.\n');
  } else {
    strategy = 'parallel_dir';
    console.log('  [PARALLEL] Parallel by Directory (Step 3B)');
    console.log(
      '     Problems spread across rules. Use directory-based batching.\n'
    );
  }
} else {
  strategy = 'batched_prs';
  console.log('  [BATCH] Batched PRs (Step 3D)');
  console.log(
    '     500+ problems detected. Split into multiple PRs by category.\n'
  );
}

// ─── TOP RULES ───
console.log(`───────────────────────────────────────────────────────────────`);
console.log(`  PROBLEMS BY RULE (Top 10)`);
console.log(
  `───────────────────────────────────────────────────────────────\n`
);
sortedRules.slice(0, 10).forEach(([rule, count]) => {
  const pct = Math.round((count * 100) / totalProblems);
  console.log(
    `  ${String(count).padStart(6)} (${String(pct).padStart(2)}%)  ${rule}`
  );
});
console.log('');

// ─── TOP DIRECTORIES ───
console.log(`───────────────────────────────────────────────────────────────`);
console.log(`  PROBLEMS BY DIRECTORY (Top 10)`);
console.log(
  `───────────────────────────────────────────────────────────────\n`
);
const sortedDirs = Object.entries(dirBatches).sort((a, b) => b[1] - a[1]);
sortedDirs.slice(0, 10).forEach(([dir, count]) => {
  console.log(`  ${String(count).padStart(6)}  ${dir}`);
});
console.log('');

// ─── TOP FILES ───
console.log(`───────────────────────────────────────────────────────────────`);
console.log(`  FILES WITH MOST PROBLEMS (Top 10)`);
console.log(
  `───────────────────────────────────────────────────────────────\n`
);
fileProblems
  .sort((a, b) => b.count - a.count)
  .slice(0, 10)
  .forEach(({ file, count }) => {
    const display = file.length > 70 ? '...' + file.slice(-67) : file;
    console.log(`  ${String(count).padStart(6)}  ${display}`);
  });
console.log('');

// ─── EXECUTION PLAN (machine-readable) ───
console.log(`───────────────────────────────────────────────────────────────`);
console.log(`  EXECUTION PLAN (JSON)`);
console.log(
  `───────────────────────────────────────────────────────────────\n`
);
const plan = {
  totalProblems,
  totalErrors,
  totalWarnings,
  totalFixable,
  strategy,
  topRules: sortedRules.slice(0, 5).map(([rule, count]) => ({ rule, count })),
  batches: sortedDirs.map(([dir, count]) => ({ dir, count })),
};
console.log(JSON.stringify(plan, null, 2));
console.log(
  '\n═══════════════════════════════════════════════════════════════\n'
);
```

### 1.2: Run Analysis

```bash
node analyze-lint.js "src/**/*.{ts,tsx}"
```

Parse the JSON output under "EXECUTION PLAN" to determine batches.

---

## Step 2: Anti-Patterns (The "Lazy Fix" Firewall)

**CRITICAL:** When fixing code, you are **FORBIDDEN** from using these patterns.

| Pattern                 | [FAIL] Forbidden              | [PASS] Required                                           |
| ----------------------- | ----------------------------- | --------------------------------------------------------- |
| **Any Escape**          | `arg: any`                    | `arg: unknown` + type guard, or specific type             |
| **Any Cast**            | `data as any`                 | `data as unknown as TargetType` (only if truly necessary) |
| **Type Lying**          | `{} as User`                  | `const u: Partial<User> = {}`                             |
| **Bang Operator**       | `user!.name`                  | `if (!user) throw ...; user.name`                         |
| **Comment Suppression** | `// eslint-disable-next-line` | Fix the actual code                                       |
| **TS Ignore**           | `// @ts-ignore`               | Fix the type error properly                               |

**If a fix seems impossible without these patterns:**

1. Skip the file
2. Log it as "Requires Human Review"
3. Continue with remaining files

---

## Step 3: Execution Modes

### Strategy Matrix

| Total Problems | Rule Concentration | Strategy                      |
| -------------- | ------------------ | ----------------------------- |
| ≤ 20           | Any                | **3A: Direct Serial Fix**     |
| 20-500         | < 80% in one rule  | **3B: Parallel by Directory** |
| 20-500         | ≥ 80% in one rule  | **3C: Parallel by Rule**      |
| 500+           | Any                | **3D: Batched PRs**           |

---

### 3A: Direct Serial Fix (≤ 20 Problems)

For small counts, fix without spawning agents.

#### Process

1. **Get errors for each file:**

   ```bash
   $PKG eslint "src/path/to/file.ts"
   ```

2. **For each file:**
   - Read the file
   - Apply fix (see **Guidelines** section)
   - Verify: `$PKG eslint "src/path/to/file.ts"`

3. **After each batch of ~5 files, verify TypeScript:**

   ```bash
   $PKG tsc --noEmit --pretty false
   ```

4. **Commit atomically:**
   ```bash
   git add -A && git commit -m "fix(lint): resolve errors in <file-or-directory>"
   ```

---

### 3B: Parallel by Directory (20-500 Problems, Distributed)

**Goal:** Prevent Git conflicts by isolating agents to specific directories.

#### Filesystem Safety (CRITICAL)

Parallel agents in the same working tree cause:

- Overlapping edits
- `index.lock` collisions
- Non-deterministic merges

**Choose ONE isolation approach:**

**Option A: Git Worktrees (Recommended)**

```bash
# Create isolated worktree per directory batch
git worktree add ../wt-auth -b fix/eslint-auth
git worktree add ../wt-api -b fix/eslint-api

# Each agent works in its own worktree
# After completion, merge branches back
git merge fix/eslint-auth
git merge fix/eslint-api
```

**Option B: Sequential Execution** Run agents sequentially (not truly parallel)
if worktrees aren't feasible.

#### Spawning Agents

Use the `batches` array from `analyze-lint.js` output. Create one `Task` per
directory.

**Task Prompt Template:**

```
You are assigned to fix ESLint errors in `{DIRECTORY}`.

Files in this batch:
{FILE_LIST}

Instructions:
1. Run: $PKG eslint "{DIRECTORY}/**/*.{ts,tsx}"
2. Fix each file using the guidelines in ./guidelines.md
3. FORBIDDEN: any, as any, eslint-disable, @ts-ignore, !. assertions
4. After fixing all files: $PKG tsc --noEmit --pretty false
5. If tsc fails, revert the breaking change and try a different approach
6. Commit: git add -A && git commit -m "fix(lint): {DIRECTORY}"

Report back:
- Files processed
- Errors fixed (count)
- Any skipped files (with reason)
- Any TypeScript errors encountered
```

#### Conflict Prevention Checklist

- [ ] Each directory assigned to exactly ONE agent
- [ ] No file appears in multiple batches
- [ ] All Task calls in ONE message (for true parallelism)
- [ ] Isolation method chosen (worktrees or sequential)

---

### 3C: Parallel by Rule (20-500 Problems, Concentrated)

When ≥80% of errors share the same rule, fix by rule type for consistency.

#### Process

1. **Get files for the dominant rule:**

   ```bash
   $PKG eslint --format json "src/**/*.{ts,tsx}" > eslint.json
   node -e "
     const data = require('./eslint.json');
     const rule = '$RULE_NAME';
     const files = data
       .filter(f => f.messages.some(m => m.ruleId === rule))
       .map(f => f.filePath);
     console.log(files.join('\n'));
   "
   ```

2. **Split files into batches of ~20**

3. **Spawn one agent per batch with rule-specific instructions**

**Task Prompt Template:**

```
Fix all `{RULE_NAME}` errors in these files:
{FILE_LIST}

Fix ONLY this rule. Ignore other ESLint errors.

Pattern for {RULE_NAME}:
{RULE_SPECIFIC_GUIDANCE}

FORBIDDEN: any, as any, eslint-disable, @ts-ignore

After all files: $PKG tsc --noEmit
Commit: git add -A && git commit -m "fix(lint): {RULE_NAME} batch N"
```

---

### 3D: Batched PRs (500+ Problems)

Do not attempt to fix everything at once.

#### Process

1. **Report to user:**

   ```
   Analysis complete: 847 problems across 156 files.

   Distribution:
   - @typescript-eslint/no-unused-vars: 412 (49%)
   - @typescript-eslint/explicit-function-return-type: 234 (28%)
   - react-hooks/exhaustive-deps: 89 (10%)
   - Other: 112 (13%)

   Recommended approach: 4 separate PRs
   1. PR 1: no-unused-vars (~412 fixes)
   2. PR 2: Return type annotations (~234 fixes)
   3. PR 3: React hooks deps (~89 fixes)
   4. PR 4: Remaining rules (~112 fixes)

   Shall I start with PR 1?
   ```

2. **Execute one PR at a time using Step 3C**

3. **Merge each PR before starting the next**

---

## Step 4: Final Verification

Run after all fixes complete.

### 4.1: Verify No Lazy Fixes Slipped Through

```bash
echo "Checking for forbidden patterns..."

# These should all return empty
grep -r "eslint-disable" src/ --include="*.ts" --include="*.tsx" && echo "[FAIL] Found eslint-disable" || echo "[PASS] No eslint-disable"
grep -r "@ts-ignore" src/ --include="*.ts" --include="*.tsx" && echo "[FAIL] Found @ts-ignore" || echo "[PASS] No @ts-ignore"
grep -rE ": any\b|as any\b" src/ --include="*.ts" --include="*.tsx" && echo "[WARN]  Found 'any' usage (review manually)" || echo "[PASS] No obvious 'any' additions"
```

### 4.2: Full Verification Suite

```bash
# Lint (should pass)
$PKG eslint "src/**/*.{ts,tsx}"

# TypeScript (should pass)
$PKG tsc --noEmit --pretty false

# Tests (if available)
$PKG test 2>/dev/null || echo "No test script found"
```

### 4.3: Cleanup

```bash
rm -f analyze-lint.js eslint.json
```

### 4.4: Generate Summary

```markdown
## ESLint Fix Summary

**Before:** {X} problems across {Y} files **After:** 0 problems

### Changes by Category

- Removed unused imports: N
- Added return type annotations: N
- Fixed exhaustive-deps: N
- Converted var to const: N
- Other: N

### Verification

- [PASS] ESLint: 0 errors, 0 warnings
- [PASS] TypeScript: Compiles clean
- [PASS] Tests: All passing
- [PASS] No forbidden patterns found

### Files Skipped (Human Review Needed)

- src/legacy/complex.ts — Could not fix without `any`
```

---

## Guidelines: Common Fix Patterns

### `@typescript-eslint/no-unused-vars`

| Scenario                 | Fix                                                   |
| ------------------------ | ----------------------------------------------------- |
| Unused import            | Remove the import line                                |
| Unused named import      | Remove just that name: `import { used } from 'x'`     |
| Unused parameter         | Prefix with `_`: `(_event, response) => {}`           |
| Unused variable          | Remove declaration, or prefix with `_` if intentional |
| Type-only import flagged | Use `import type { X }`                               |

### `@typescript-eslint/explicit-function-return-type`

| Scenario          | Fix                                        |
| ----------------- | ------------------------------------------ |
| Returns primitive | Add `: string`, `: number`, `: boolean`    |
| Returns object    | Add explicit interface or inline type      |
| Returns void      | Add `: void`                               |
| Returns Promise   | Add `: Promise<T>`                         |
| React component   | Add `: JSX.Element` or `: React.ReactNode` |

### `@typescript-eslint/no-explicit-any`

| Scenario             | Fix                                                          |
| -------------------- | ------------------------------------------------------------ |
| Unknown API response | Use `unknown` + type guard                                   |
| Generic function     | Use generics: `<T>(arg: T): T`                               |
| Event handler        | Use proper event type: `React.MouseEvent<HTMLButtonElement>` |
| Third-party lib      | Check for `@types/` package                                  |

**NEVER** fix by changing to `as any` elsewhere or using `@ts-ignore`.

### `react-hooks/exhaustive-deps`

| Scenario              | Fix                                             |
| --------------------- | ----------------------------------------------- |
| Missing primitive dep | Add to dependency array                         |
| Missing function dep  | Wrap function in `useCallback`, then add        |
| Missing object dep    | Wrap in `useMemo`, or destructure to primitives |
| Intentional omission  | Restructure logic to not need the dep           |

**NEVER** add `// eslint-disable-next-line react-hooks/exhaustive-deps`.

### `prefer-const`

Change `let` to `const` when variable is never reassigned.

```typescript
// [FAIL] let name = user.name;
// [PASS] const name = user.name;
```

### `no-console`

| Scenario         | Fix                                                                 |
| ---------------- | ------------------------------------------------------------------- |
| Debug logging    | Remove the line                                                     |
| Error logging    | Use project's existing logger (search codebase for logging utility) |
| No logger exists | Remove, or wrap in `if (process.env.NODE_ENV === 'development')`    |

---

## Warnings vs Errors Policy

- **If CI uses `--max-warnings 0`:** Treat warnings as required fixes
- **Otherwise:** Fix errors first, report warnings separately

Check the project's CI config or `package.json` lint script to determine policy.

---

## Edge Cases

### Only 1 File With Errors

Skip parallelization. Use Step 3A.

### Monorepo With Multiple Packages

Treat each package as independent. Run analysis per package.

### ESLint Config Changes Needed

If errors require config changes (missing parser, wrong env):

1. **Stop**
2. Report to user
3. Do NOT modify config without approval

### Parse/Fatal Errors

These indicate broken files (syntax errors, missing dependencies). Fix these
manually first before running bulk fixes.

---

# ESLint Fix Guidelines (Reference)

Detailed patterns for fixing common ESLint errors. **Always fix code to
comply—never suppress.**

## The Golden Rules

1. **No `any`** — Use `unknown` with type guards, or specific types
2. **No `!` assertions** — Use proper null checks
3. **No `eslint-disable`** — Fix the code
4. **No `@ts-ignore`** — Fix the type error
5. **No `as Type` lies** — Use `Partial<T>` or proper initialization

If you can't fix without violating these rules, **skip the file** and mark for
human review.

---

## Rule-Specific Patterns (Detailed)

### `@typescript-eslint/no-unused-vars`

```typescript
// [FAIL] Unused import
import { useState, useEffect, useCallback } from 'react'; // useCallback unused

// [PASS] Remove unused
import { useState, useEffect } from 'react';
```

```typescript
// [FAIL] Unused parameter
function handler(event, context) {
  // event unused
  return context.proceed();
}

// [PASS] Prefix with underscore
function handler(_event, context) {
  return context.proceed();
}
```

```typescript
// [FAIL] Type import flagged as unused (but used in annotation)
import { UserService } from './services';
const svc: UserService = getService();

// [PASS] Use type-only import
import type { UserService } from './services';
const svc: UserService = getService();
```

---

### `@typescript-eslint/explicit-function-return-type`

```typescript
// [FAIL] Missing return type
function getName(user) {
  return user.name;
}

// [PASS] Add return type
function getName(user: User): string {
  return user.name;
}
```

```typescript
// [FAIL] Async function
const fetchData = async () => {
  const res = await api.get('/data');
  return res.json();
};

// [PASS] Promise return type
const fetchData = async (): Promise<DataResponse> => {
  const res = await api.get('/data');
  return res.json();
};
```

```typescript
// [FAIL] React component
const Button = ({ label }) => {
  return <button>{label}</button>;
};

// [PASS] JSX.Element return
const Button = ({ label }: ButtonProps): JSX.Element => {
  return <button>{label}</button>;
};
```

---

### `@typescript-eslint/no-explicit-any`

```typescript
// [FAIL] any parameter
function process(data: any) {
  return data.items.map((x) => x.name);
}

// [PASS] Proper typing
interface DataPayload {
  items: Array<{ name: string }>;
}

function process(data: DataPayload): string[] {
  return data.items.map((x) => x.name);
}
```

```typescript
// [FAIL] any for API response
const response: any = await fetch('/api').then((r) => r.json());

// [PASS] unknown + validation
interface ApiResponse {
  users: User[];
}

const response: unknown = await fetch('/api').then((r) => r.json());
if (isApiResponse(response)) {
  // response is typed
}

// Type guard
function isApiResponse(data: unknown): data is ApiResponse {
  return typeof data === 'object' && data !== null && 'users' in data;
}
```

**FORBIDDEN alternatives:**

```typescript
// [FAIL] NEVER do this
const response = (await fetch('/api').then((r) => r.json())) as any;
const response: unknown = data;
(data as any).foo; // [FAIL]
// @ts-ignore  // [FAIL]
const response = data;
```

---

### `react-hooks/exhaustive-deps`

```typescript
// [FAIL] Missing dependency
useEffect(() => {
  fetchUser(userId);
}, []); // userId missing

// [PASS] Add dependency
useEffect(() => {
  fetchUser(userId);
}, [userId]);
```

```typescript
// [FAIL] Function dependency causes infinite loop
const handleClick = () => {
  doSomething(value);
};

useEffect(() => {
  element.addEventListener('click', handleClick);
  return () => element.removeEventListener('click', handleClick);
}, []); // handleClick changes every render

// [PASS] Wrap in useCallback
const handleClick = useCallback(() => {
  doSomething(value);
}, [value]);

useEffect(() => {
  element.addEventListener('click', handleClick);
  return () => element.removeEventListener('click', handleClick);
}, [handleClick]);
```

```typescript
// [FAIL] Object dependency causes infinite loop
const options = { page: 1, limit: 10 };

useEffect(() => {
  fetchData(options);
}, [options]); // new object every render

// [PASS] Memoize or destructure
const options = useMemo(() => ({ page, limit }), [page, limit]);

useEffect(() => {
  fetchData(options);
}, [options]);

// Or use primitives directly
useEffect(() => {
  fetchData({ page, limit });
}, [page, limit]);
```

**FORBIDDEN:**

```typescript
// [FAIL] NEVER do this
useEffect(() => {
  fetchUser(userId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

---

### `prefer-const`

```typescript
// [FAIL] let but never reassigned
let name = user.name;
let items = data.filter((x) => x.active);

// [PASS] const
const name = user.name;
const items = data.filter((x) => x.active);
```

Note: Mutating arrays/objects (push, splice, property assignment) is NOT
reassignment.

```typescript
const arr = [];
arr.push(1); // [PASS] This is fine
```

---

### `no-console`

```typescript
// [FAIL] Debug logging
console.log('User data:', userData);

// [PASS] Remove it, OR use project logger
logger.debug('User data:', userData);

// [PASS] If no logger exists and truly needed
if (process.env.NODE_ENV === 'development') {
  console.log('Debug:', data);
}
```

**Find the project's logger first:**

```bash
grep -r "logger\." src/ --include="*.ts" | head -5
```

---

### `@typescript-eslint/no-non-null-assertion`

```typescript
// [FAIL] Bang operator
const name = user!.name;
const first = items[0]!;

// [PASS] Proper null handling
if (!user) {
  throw new Error('User is required');
}
const name = user.name;

const first = items[0];
if (!first) {
  throw new Error('Items cannot be empty');
}
// Or
const first = items[0] ?? defaultValue;
```

---

### `@typescript-eslint/strict-boolean-expressions`

```typescript
// [FAIL] Truthy check on non-boolean
if (value) {
} // value is string
if (count) {
} // count is number
if (user) {
} // user is object | null

// [PASS] Explicit checks
if (value !== '') {
}
if (value != null) {
}
if (count !== 0) {
}
if (count > 0) {
}
if (user !== null) {
}
```

---

## Verification Checklist

After fixing each file:

- [ ] `$PKG eslint <file>` passes
- [ ] No forbidden patterns introduced

After each batch (~5 files):

- [ ] `$PKG tsc --noEmit` passes
- [ ] Commit with descriptive message

After all fixes:

- [ ] Full lint passes
- [ ] Full tsc passes
- [ ] `grep` for forbidden patterns returns empty
- [ ] Tests pass (if available)

---

## When to Skip

Skip a file and mark for human review if:

1. **Fix requires `any`** — Complex third-party types, legacy code
2. **Circular dependency** — Fixing one error creates another
3. **Would change business logic** — Fix isn't purely structural
4. **Unclear intent** — Can't determine correct fix without domain knowledge

Report skipped files in final summary:

```
### Skipped (Human Review Needed)
- src/legacy/adapter.ts — Would require `any` for untyped lib
- src/utils/parser.ts — Unclear if null check would break callers
```
