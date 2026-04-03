---
name: regression-checker
description:
  Run full test suite to catch regressions after implementation changes.
  Auto-detects framework, reports pass/fail with counts. Use after code changes
  to verify nothing broke.
last_updated: 2026-04-03
---

# Regression Checker

Runs the existing test suite to ensure no regressions after implementation
changes.

## Purpose & Scope

- Detect test framework (vitest in this project) and run full suite
- Capture results for quality gates
- Return PASS/FAIL with counts and failing test details
- Never modifies tests -- only reports

## When to Use

- After any implementation change to verify no regressions
- Before committing refactored code
- As part of quality review workflow
- After dependency updates

## Workflow

### Step 1: Detect Test Configuration

This project uses Vitest with two projects:

- `server` - Node.js environment
- `client` - jsdom environment

Configuration: `vitest.config.ts` at project root.

### Step 2: Run Full Test Suite

```bash
npm test
```

**Do NOT run selective tests.** Always run the full suite for regression
checking.

**Timeout:** 5 minutes maximum. If tests hang, kill and report FAIL.

### Step 3: Parse Results

Extract from Vitest output:

- **Total tests**: from `Tests X passed | Y failed (Z)`
- **Test files**: from `Test Files X passed | Y failed (Z)`
- **Failed tests**: lines with FAIL status, including file and test name
- **Duration**: total execution time

### Step 4: Report Verdict

**Format:**

```
REGRESSION CHECK: [PASS|FAIL]
- Test files: X passed, Y failed (Z total)
- Tests: X passed, Y failed (Z total)
- Duration: Xs
```

**If FAIL, include:**

```
FAILING TESTS:
- [file path]: [test name] - [error summary]
- [file path]: [test name] - [error summary]
```

## Critical Rules

- **No selective test runs** - run full suite always
- **Do not fix tests** - only report results
- **Do not modify code** - only observe and report
- **Report ALL failures** - not just the first one
- **Include error context** - first line of error message for each failure

## Project-Specific Notes

- Server tests: `npm test -- --project=server`
- Client tests: `npm test -- --project=client`
- Quick mode (skip API tests): `npm run test:quick`
- Full suite is preferred for regression checking

## Integration

This skill feeds into:

- `baseline-governance` skill (baseline comparison)
- `pre-commit-check` command (quality gate)
- `deploy-check` command (deployment validation)

## Definition of Done

- [ ] Full test suite executed (not selective)
- [ ] Results parsed with pass/fail counts
- [ ] Verdict produced (PASS or FAIL)
- [ ] Failing tests listed with error context (if any)

_Based on ln-514-regression-checker from levnikolaevich/claude-code-skills_
