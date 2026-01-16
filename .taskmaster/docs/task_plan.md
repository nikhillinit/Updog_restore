# Test Remediation Task Plan

## Overview
Remediate 113 skipped tests across 51 files, with focus on the 54 undocumented quarantines.

## Phase 1: Documentation & Triage [CURRENT]
- [ ] Document all 54 undocumented quarantines with owners and exit criteria
- [ ] Categorize skips by root cause (infra, implementation, flaky, feature-flag)
- [ ] Prioritize by business impact and dependency chain

## Phase 2: Quick Wins (No Code Changes)
- [ ] Enable feature-flagged tests where features are complete
- [ ] Fix E2E precondition failures (auth/fund setup)
- [ ] Add proper `@quarantine` JSDoc to undocumented skips

## Phase 3: Infrastructure Fixes
- [ ] Mock Redis properly for CI environment tests (12 tests)
- [ ] Implement dependency injection for time-travel middleware (13 tests)
- [ ] Setup testcontainers for DB-dependent tests

## Phase 4: Implementation Gaps
- [ ] Complete snapshot-service implementation (TDD RED phase)
- [ ] Finish portfolio-intelligence route handlers
- [ ] Apply security middleware to portfolio-intelligence routes

## Phase 5: Numeric/Algorithm Fixes
- [ ] Fix XIRR Newton-Raphson solver for extreme returns (4 tests)
- [ ] Improve prediction model accuracy
- [ ] Stabilize Monte Carlo stochastic tests (13 tests)

## Phase 6: Verification
- [ ] Run full test suite, confirm skip count reduced
- [ ] Update quarantine/REPORT.md
- [ ] Enforce coverage thresholds in CI

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-16 | Start with documentation | Can't fix what isn't tracked |

## Errors Encountered
| Date | Error | Resolution |
|------|-------|------------|
| - | - | - |
