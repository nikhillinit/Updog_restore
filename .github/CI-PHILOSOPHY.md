# CI Merge Philosophy

This project uses **baseline comparison** rather than absolute perfection as its
merge criteria.

## Core Principle

**Incremental improvement with baseline ratcheting** - We document and accept
existing technical debt while preventing new regressions.

## Merge Criteria

PRs are evaluated based on **delta from baseline**, not absolute quality:

### TypeScript Errors

- **Current baseline:** 482 errors (documented in `.tsc-baseline.json`)
- **Merge requirement:** Zero NEW TypeScript errors
- **CI check:** `npm run baseline:check`
- **Regenerate baseline:** `npm run baseline:save` (requires justification)

### ESLint Violations

- **Current baseline:** 22,390 violations
- **Merge requirement:** Zero NEW lint violations
- **Strategy:** Baseline tolerance with trend tracking
- **CI behavior:** Advisory warnings, not blocking

### Test Pass Rate

- **Current baseline:** 74.7% (998/1,337 tests passing)
- **Known failures:** 300 tests (documented categories)
- **Merge requirement:** Pass rate >= 73.7% (baseline - 1%)
- **CI behavior:** Baseline comparison on affected tests

### Known Test Failure Categories

1. **Variance tracking schema** (27 tests) - DB constraint enforcement issues
2. **Integration test infrastructure** (31 tests) - Environment setup issues
3. **Client test globals** (9+ files) - jsdom/browser environment mismatch

## Why This Approach?

### Context

This is a **large codebase with documented technical debt** that evolved from
Excel proof-of-concept to production system. The technical debt is:

- **Well-documented** (CHANGELOG.md, DECISIONS.md, cheatsheets/)
- **Categorized** by severity and impact
- **Tracked** with improvement plans

### Benefits

1. **Unblocks valuable features** - Don't let infrastructure debt block quality
   code
2. **Prevents regressions** - Baseline ensures we don't make things worse
3. **Enables incremental cleanup** - Technical debt addressed systematically
4. **Clear expectations** - Contributors know exact merge requirements

### Risks We Accept

- Existing technical debt remains until explicitly addressed
- Some workflows may show "yellow" status (warnings) even on clean PRs
- Baseline must be maintained and justified when updated

## Baseline Management

### When to Update Baselines

**TypeScript Baseline (.tsc-baseline.json):**

- After major refactoring that legitimately introduces temporary errors
- When upgrading TypeScript version
- When adding new strict compiler options
- **Requires:** Justification in PR description + approval from maintainer

**Test Baseline:**

- When removing obsolete tests
- When fixing flaky tests permanently
- When test infrastructure improvements reduce false positives
- **Requires:** Verification that failures are truly resolved, not masked

### Baseline Verification Commands

```bash
# Check TypeScript baseline (CI command)
npm run baseline:check

# Show TypeScript baseline progress
npm run baseline:progress

# Run smart test selection (PR-affected tests only)
npm run test:smart

# Run full test suite with baseline comparison
npm test -- --reporter=json > test-results.json
```

## Workflow Architecture

### Required Checks (Blocking)

- **CI Gate Status** - Unified gate that evaluates all critical checks
- **TypeScript compilation** - Via baseline check, not raw `tsc`
- **Core unit tests** - Non-integration tests must pass
- **Security scans** - CodeQL, Trivy for vulnerabilities

### Advisory Checks (Non-Blocking)

- **ESLint** - Warnings tracked, not blocking
- **Documentation freshness** - Staleness warnings
- **Code coverage** - Trend monitoring only

### Environment-Dependent Checks (Conditional)

- **Testcontainers integration tests** - Require Docker (label-triggered:
  `test:docker` or `test:integration`)
- **Other integration tests** - May require Docker/Redis, gracefully skip when
  unavailable
- **Performance benchmarks** - Baseline tracking, enforced on main only
- **E2E tests** - Full environment required

## Quality Improvement Strategy

### Short-Term (Per PR)

- Zero new TypeScript errors
- Zero new lint violations
- Test pass rate maintains or improves baseline

### Medium-Term (Monthly)

- Reduce TypeScript error baseline by 10%
- Address one test failure category completely
- Auto-fix ESLint rules incrementally

### Long-Term (Quarterly)

- TypeScript strict mode compliance
- 85%+ test pass rate
- Zero baseline exceptions

## References

- **PR Merge Verification:**
  [cheatsheets/pr-merge-verification.md](../cheatsheets/pr-merge-verification.md)
- **Anti-Pattern Prevention:**
  [cheatsheets/anti-pattern-prevention.md](../cheatsheets/anti-pattern-prevention.md)
- **TypeScript Baseline Script:**
  [scripts/typescript-baseline.cjs](../scripts/typescript-baseline.cjs)
- **Baseline Data:** [.tsc-baseline.json](../.tsc-baseline.json)

## Historical Context

This approach was formalized after recognizing that:

1. The codebase evolved from Excel POC → production system (documented in
   CHANGELOG.md)
2. Blocking all PRs on absolute perfection would halt Phase 3 development
3. Systematic baseline ratcheting is more effective than sporadic cleanup
4. Clear merge criteria reduce contributor confusion and review cycles

**Last Updated:** 2026-01-06 (Session: Phase 3 CI infrastructure improvement)
