---
description: "Single command for full pre-PR validation workflow"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# PR Ready - Pre-Pull Request Validation

Comprehensive validation workflow before creating a pull request. Chains
multiple validation steps and produces a PR-ready summary.

## Workflow Overview

```
/pr-ready
    |
    v
1. Git Status Check
   - Verify clean staging area
   - Check branch is ahead of main
    |
    v
2. /test-smart
   - Run only affected tests
   - Fast feedback on changes
    |
    v
3. /fix-auto
   - Auto-fix lint errors
   - Auto-fix type issues
   - Auto-fix simple test failures
    |
    v
4. /pre-commit-check
   - Final lint verification
   - Final type verification
   - All tests pass
    |
    v
5. Generate PR Summary
   - Files changed
   - Test coverage
   - Suggested PR title/body
```

## Execution Steps

### Step 1: Git Status Check

```bash
# Verify we have changes to validate
git status --porcelain

# Get current branch
git branch --show-current

# Check commits ahead of main
git rev-list --count main..HEAD
```

**Decision Points:**
- No changes? Exit with "Nothing to validate"
- Not on feature branch? Warn user
- No commits ahead? Suggest committing first

### Step 2: Run Affected Tests

Invoke `/test-smart` command or equivalent:

```bash
# Identify changed files
git diff --name-only main...HEAD

# Run tests for affected modules only
npm run test:smart
```

**If tests fail:**
- Proceed to Step 3 (fix-auto may resolve)
- Track failures for summary

### Step 3: Auto-Fix Issues

Invoke `/fix-auto` workflow:

```bash
# Lint and auto-fix
npm run lint:fix

# Type check
npm run check

# If simple test failures, attempt repair
# Delegate to test-repair agent if needed
```

**Track:**
- Issues auto-fixed
- Issues requiring manual attention

### Step 4: Pre-Commit Validation

Invoke `/pre-commit-check`:

```bash
# Final validation
npm run lint
npm run check
npm test
```

**Gate:** All must pass to proceed

### Step 5: Generate PR Summary

Produce structured output:

```markdown
## PR Ready Summary

**Branch:** feature/my-feature
**Commits:** 3 ahead of main
**Files Changed:** 12

### Validation Results

[PASS] Tests: 142 passed (8 affected by changes)
[PASS] Lint: Clean (3 auto-fixed)
[PASS] Types: Clean
[PASS] Build: Verified

### Changed Files by Category

**Components (4):**
- client/src/components/Dashboard.tsx
- client/src/components/FundTable.tsx
- ...

**API Routes (2):**
- server/routes/funds.ts
- ...

**Tests (3):**
- tests/unit/dashboard.test.ts
- ...

### Suggested PR Title

feat(dashboard): add fund filtering and sorting

### Suggested PR Body

## Summary
- Added filtering by fund status
- Added sorting by vintage year and TVPI
- Updated FundTable component

## Test Plan
- [x] Unit tests for filter logic
- [x] Unit tests for sort logic
- [ ] Manual testing of UI interactions

## Checklist
- [x] Tests pass
- [x] Lint clean
- [x] Types check
- [ ] Documentation updated (if applicable)
```

## Quick Mode

For faster validation (skip full test suite):

```
/pr-ready --quick
```

Quick mode:
- Runs lint only
- Runs type check only
- Skips full test suite
- Faster feedback (~30 seconds)

## Integration with Other Commands

| Step | Command Used | Purpose |
|------|--------------|---------|
| 2 | /test-smart | Affected tests only |
| 3 | /fix-auto | Auto-remediation |
| 4 | /pre-commit-check | Final validation |

## Failure Handling

**If Step 2 fails (tests):**
- Continue to Step 3 (may auto-fix)
- If still failing after Step 3, report and stop

**If Step 3 fails (unfixable issues):**
- Report issues requiring manual attention
- Provide file:line references
- Stop workflow

**If Step 4 fails:**
- Should not happen if Step 3 passed
- Indicates regression or race condition
- Full diagnostic output

## Output Format

Always end with a clear status:

```
+--------------------------------------------------+
|              PR READY CHECK COMPLETE              |
+--------------------------------------------------+
|                                                  |
| [PASS] All validations passed                    |
|                                                  |
| Ready to create PR!                              |
|                                                  |
| Next steps:                                      |
| 1. Review suggested PR title/body above          |
| 2. Run: gh pr create                             |
| 3. Or use GitHub UI                              |
|                                                  |
+--------------------------------------------------+
```

Or on failure:

```
+--------------------------------------------------+
|              PR READY CHECK FAILED                |
+--------------------------------------------------+
|                                                  |
| [FAIL] 3 issues require manual attention         |
|                                                  |
| Issues:                                          |
| - client/src/lib/utils.ts:45 - Type error        |
| - server/routes/api.ts:12 - Lint violation       |
| - tests/unit/calc.test.ts - Assertion failure    |
|                                                  |
| Fix these issues and run /pr-ready again         |
|                                                  |
+--------------------------------------------------+
```

## Performance

- **Target time:** <5 minutes for full validation
- **Quick mode:** <30 seconds
- **Parallel execution:** Steps 2-4 run some checks in parallel

## Related Commands

- `/test-smart` - Test selection
- `/fix-auto` - Auto-remediation
- `/pre-commit-check` - Final validation
- `/deploy-check` - Post-merge validation
