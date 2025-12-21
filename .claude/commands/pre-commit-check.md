---
description: Validate code quality before committing (lint, typecheck, tests)
---

# Pre-Commit Quality Check

Comprehensive validation of code quality before any commit.

## Purpose

Ensures all code changes meet project quality standards:

- ESLint compliance (0 errors, 0 warnings)
- TypeScript type safety (0 type errors)
- Test coverage (all tests passing)
- Anti-pattern prevention

## Execution Steps

### Step 1: Run ESLint

```bash
npm run lint
```

**Expected Output**: `PASS: 0 errors, 0 warnings`

**If violations found**:

1. Review error/warning messages carefully
2. Fix violations inline (do NOT use eslint-disable)
3. Re-run `npm run lint` to verify
4. Never proceed to commit with violations

**Common Violations**:

- `@typescript-eslint/no-explicit-any` - Use `unknown` instead of `any`
- `@typescript-eslint/no-unsafe-*` - Add proper type guards
- See `eslint.config.js` lines 132-138 for full ruleset

### Step 2: Run TypeScript Check

```bash
npm run check
```

**Expected Output**: No type errors reported

**If errors found**:

1. Review type mismatches
2. Add proper type annotations (no `any`)
3. Use types from `@shared/schema` for Drizzle tables
4. Re-run `npm run check` to verify

**Type Safety Reminders**:

- TypeScript strict mode is ENABLED (tsconfig.json:32)
- `noUncheckedIndexedAccess` is ENABLED (tsconfig.json:33)
- All dynamic data must have explicit types or guards

### Step 3: Run Tests

```bash
npm test -- --run --reporter=verbose
```

**Expected Output**: All tests pass

**If failures found**:

1. Review stack traces for root cause
2. Fix implementation or test logic
3. Re-run specific test file first: `npm test <file> -- --run`
4. Then run full suite to check for regressions

**Test Guidelines**:

- Maintain baseline: variance-tracking (32/32), snapshot-service (19/19),
  lot-service (20/20)
- No new TypeScript errors (387 baseline)
- No skipped tests without justification

### Step 4: Anti-Pattern Scan

Review recent changes against known anti-patterns:

```bash
# Read the anti-pattern catalog
cat cheatsheets/anti-pattern-prevention.md
```

**Check for**:

1. Idempotency violations (mutations without unique constraints)
2. Missing optimistic locking (updates without version checks)
3. Unsafe queue operations (jobs without timeouts)
4. Type safety violations (`any`, `@ts-ignore`)

**24 cataloged patterns** - Review relevant sections before committing.

### Step 5: Final Approval Gate

Only proceed to commit if **ALL** gates pass:

- [x] ESLint: 0 errors, 0 warnings
- [x] TypeScript: 0 type errors
- [x] Tests: All passing, no regressions
- [x] Anti-patterns: None detected

## Commit Protocol

### Allowed

```bash
git add <files>
git commit -m "your message"
```

Pre-commit hooks will run automatically and validate.

### NEVER ALLOWED

```bash
git commit --no-verify   # Bypasses quality gates - FORBIDDEN
git commit -n            # Same as above - FORBIDDEN
```

### If Pre-Commit Hook Fails

1. **Do NOT bypass with --no-verify**
2. Review hook output for specific violations
3. Fix violations using this checklist
4. Re-run commit (hooks will validate again)

## Usage Examples

### Standard Workflow

```bash
# Make code changes
vim server/services/my-service.ts

# Run pre-commit check
/pre-commit-check

# If all gates pass, commit
git add server/services/my-service.ts
git commit -m "feat(services): implement my-service"
```

### After Agent Changes

```bash
# Agent made changes, verify quality
/pre-commit-check

# If violations found, fix them
npm run lint           # Identify specific issues
# ... fix issues ...
npm run lint           # Verify fixed

# Then commit
git add .
git commit -m "fix: agent changes with quality gates passing"
```

### Debugging Violations

```bash
# Check ESLint config
cat eslint.config.js | grep -A 20 "Type safety rules"

# Check TypeScript config
cat tsconfig.json | grep -A 10 "compilerOptions"

# Check anti-patterns
cat cheatsheets/anti-pattern-prevention.md | grep -A 5 "Pattern:"
```

## Quality Metrics

Target thresholds (enforced by this check):

| Metric            | Threshold | Current          |
| ----------------- | --------- | ---------------- |
| ESLint Errors     | 0         | Must maintain    |
| ESLint Warnings   | 0         | Must maintain    |
| TypeScript Errors | 387       | Baseline (0 new) |
| Test Failures     | 0         | In changed files |
| Anti-Patterns     | 0         | In new code      |

## Integration with Workflows

This command should be invoked:

1. **Before any commit** - Manual or agent-driven
2. **After bugfix sessions** - Before committing fixes
3. **During PR preparation** - Before pushing branch
4. **In agent instructions** - As mandatory step

See `.claude/WORKFLOW.md` for integration details.

---

**Last Updated**: 2025-12-20 **Maintained By**: Quality Gate Protocol **Related
Docs**:

- `.claude/WORKFLOW.md` - Quality Gate Protocol
- `cheatsheets/anti-pattern-prevention.md` - Anti-pattern catalog
- `eslint.config.js` - Linting rules
- `tsconfig.json` - TypeScript configuration
