# Test Quarantine Protocol

This document defines the formal protocol for managing quarantined tests in the Updog platform.

## Overview

Quarantined tests are tests that cannot run in the standard CI environment due to infrastructure dependencies, flakiness, or incomplete features. All quarantined tests must be properly documented and reviewed monthly for potential reactivation.

## Requirements

### 1. JSDoc Documentation

Every quarantined test file MUST include a `@quarantine` JSDoc block with the following fields:

```typescript
/**
 * @quarantine
 * @owner @github-username
 * @reason Brief explanation of why this test is quarantined
 * @exitCriteria Specific conditions that must be met to enable this test
 * @addedDate YYYY-MM-DD
 */
describe.skip('Test Suite Name', () => {
  // ...
});
```

### 2. Required Fields

| Field | Description | Example |
|-------|-------------|---------|
| `@quarantine` | Tag marking test as quarantined | `@quarantine` |
| `@owner` | GitHub username responsible for review | `@devops-team` |
| `@reason` | Clear explanation of quarantine reason | `Requires Docker infrastructure` |
| `@exitCriteria` | Measurable conditions for reactivation | `Self-hosted runners with Docker` |
| `@addedDate` | Date quarantine was added | `2026-01-20` |

### 3. File Location

Quarantined tests should be placed in `tests/quarantine/` directory with the naming convention:
- `<original-name>.quarantine.test.ts`

## Quarantine Categories

### Infrastructure Dependencies
Tests requiring external services not available in CI:
- Docker/Testcontainers
- Real database connections
- External APIs
- Self-hosted runners

### Stochastic/Flaky Tests
Tests with non-deterministic behavior:
- Monte Carlo simulations (without seeded PRNG)
- Time-sensitive tests
- Race condition tests

### Incomplete Features
Tests for features not yet implemented:
- Phase 2 features
- API endpoints in development
- TDD red-phase tests

## Monthly Review Process

1. **First Monday of each month**: Run `npm run quarantine:report`
2. **Review each quarantined test**:
   - Check if exit criteria have been met
   - Verify owner is still responsible
   - Update reason if circumstances changed
3. **Reactivation checklist**:
   - [ ] Exit criteria met
   - [ ] Test passes locally
   - [ ] Test passes in CI
   - [ ] Remove from quarantine directory
   - [ ] Update REPORT.md

## Skip Count Threshold

- **Maximum allowed static skips**: 20
- **Current count**: 14 (as of 2026-01-20)
- **Enforcement**: CI workflow fails if threshold exceeded

## Adding New Quarantined Tests

1. Create JSDoc block with all required fields
2. Use `describe.skip()` or move to `tests/quarantine/`
3. Update `tests/quarantine/REPORT.md`
4. Get approval from test owner or tech lead

## Example

```typescript
/**
 * @quarantine
 * @owner @devops-team
 * @reason Requires Docker which is not available in GitHub Actions free tier
 * @exitCriteria Migrate to self-hosted runners OR GitHub adds Docker support
 * @addedDate 2026-01-20
 */
describe.skip('Testcontainers Infrastructure', () => {
  it('should spin up PostgreSQL container', async () => {
    // Test implementation
  });
});
```

## Related Documentation

- [findings.md](../../.taskmaster/docs/findings.md) - Test remediation findings
- [progress.md](../../.taskmaster/docs/progress.md) - Remediation progress log
- [REPORT.md](./REPORT.md) - Auto-generated quarantine report
