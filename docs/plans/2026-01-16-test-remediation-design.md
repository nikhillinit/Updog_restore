---
status: HISTORICAL
last_updated: 2026-01-19
---

# Test Remediation Design

**Author**: Claude
**Date**: 2026-01-16
**Status**: Approved

## Problem Statement

The test suite has 113 skipped tests across 51 files. Of these, 54 files (90 skips) are undocumented - no owner, no exit criteria, no clear path to resolution. This creates:
- False confidence in test coverage
- Hidden technical debt
- No enforcement mechanism to prevent skip accumulation

## Goals

- Reduce skipped tests from 113 to <20
- Establish sustainable quarantine protocol
- Enable CI enforcement of skip thresholds

## Non-Goals

- Achieving 100% test coverage (out of scope)
- Rewriting test infrastructure from scratch
- Fixing tests for features not yet implemented

## Architecture

### Overview

Risk-based prioritization across 5 tiers, attacking highest-impact tests first:

| Tier | Focus | Tests | Timeline |
|------|-------|-------|----------|
| 1 | Blocking CI | ~12 | Day 1-2 |
| 2 | Critical Path (XIRR, security) | ~10 | Day 3-5 |
| 3 | Quick Wins | ~40 | Week 2 |
| 4 | Technical Debt (DI refactors) | ~30 | Week 3 |
| 5 | Long-Term Quarantine | ~20 | Week 4 |

### Components

#### 1. Triage Dashboard (`.taskmaster/docs/findings.md`)

Central tracking with tier assignment, owner, root cause, exit criteria, and status.

#### 2. Fix Patterns Library (`cheatsheets/test-fix-patterns.md`)

Reusable solutions:
- Redis mocking with ioredis-mock
- E2E auth fixtures
- Condition-based waiting for flaky tests
- DI refactor templates

#### 3. CI Skip Counter (GitHub Actions)

```yaml
# .github/workflows/skip-counter.yml
- name: Count skipped tests
  run: |
    SKIP_COUNT=$(grep -r "\.skip\|describe\.skip\|it\.skip\|test\.skip" tests/ --include="*.ts" --include="*.tsx" | wc -l)
    echo "skip_count=$SKIP_COUNT" >> $GITHUB_OUTPUT
    if [ $SKIP_COUNT -gt ${{ vars.SKIP_THRESHOLD }} ]; then
      echo "::error::Skip count $SKIP_COUNT exceeds threshold ${{ vars.SKIP_THRESHOLD }}"
      exit 1
    fi
```

#### 4. Quarantine Protocol (`tests/quarantine/PROTOCOL.md`)

Formal process requiring `@quarantine` JSDoc:
```typescript
/**
 * @quarantine
 * @owner @username
 * @reason Requires Docker/testcontainers not available in CI
 * @exitCriteria Enable when GitHub Actions supports Docker-in-Docker
 * @addedDate 2026-01-16
 */
describe.skip('Testcontainers Integration', () => { ... });
```

### Data Flow

```
Discovery → Triage (assign tier) → Fix (apply pattern) → Verify (run tests) → Ratchet (lower threshold)
```

### Error Handling

| Failure Mode | Response |
|--------------|----------|
| Fix breaks other tests | Revert, analyze dependency, fix root cause |
| Flaky in CI | Use condition-based waiting, not setTimeout |
| Requires breaking change | Evaluate; if warranted → Tier 4; if not → Tier 5 |
| Skip count increases | Block PR, require @quarantine docs |
| False positive (legitimate skip) | Move to Tier 5 with proper docs |

## Testing Strategy

1. **Per-Fix**: Run specific test, then full suite
2. **Metrics**: Daily skip count, documented %, tier progress
3. **CI**: Skip counter must not increase on PR
4. **Regression**: Threshold enforcement post-remediation

## Rollout Plan

1. **Week 1**: Tier 1-2 (blocking CI, critical path)
2. **Week 2**: Tier 3 (quick wins)
3. **Week 3**: Tier 4 (technical debt)
4. **Week 4**: Tier 5 (document legitimate quarantines)
5. **Post**: Enable CI threshold, monthly quarantine review

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Fixes cause regressions | Medium | High | Full suite run after each fix |
| Scope creep into production code | Medium | Medium | Prefer mocks over production changes |
| Underestimated complexity | Low | High | Tier 4/5 buffer for hard problems |
| New skips added faster than fixed | Low | Medium | CI enforcement from day 1 |

## Alternatives Considered

1. **Category-First**: Deep focus per category, 4-6 weeks. Rejected: slow visible progress.
2. **Quick-Wins Only**: Rapid progress, 2-3 weeks for 80%. Rejected: hard problems deferred indefinitely.

## Open Questions

- [x] Primary goal? → <20 skipped tests
- [x] Constraint? → Full remediation
- [x] Approach? → Risk-based prioritization
- [ ] Skip threshold for CI? → Suggest: start at 113, ratchet down
- [ ] Quarantine review cadence? → Suggest: monthly

## References

- Exploration findings: `.taskmaster/docs/findings.md`
- Progress tracking: `.taskmaster/docs/progress.md`
- Task plan: `.taskmaster/docs/task_plan.md`
