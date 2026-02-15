---
type: reflection
id: REFL-020
title: Large-Iteration Tests Need Explicit Timeouts
status: DRAFT
date: 2026-02-15
version: 1
severity: medium
components:
  - vitest
  - power-law-distribution
  - test infrastructure
keywords:
  - test timeout
  - flaky test
  - monte carlo
  - pre-push hook
  - CI
---

# REFL-020: Large-Iteration Tests Need Explicit Timeouts

## Anti-Pattern

A test generates a large number of items and runs assertions on each (e.g.,
25,000 items with 5 assertions each via forEach). Under load -- CI runners,
pre-push hooks running builds + tests concurrently -- the test exceeds Vitest's
default 5000ms timeout and fails intermittently.

```ts
// Anti-pattern: 25k iterations with assertions, no timeout override
it('should generate returns for Monte Carlo integration', () => {
  const returns = generatePowerLawReturns(
    25,
    stageDistribution,
    5,
    1000,
    12345
  );
  // 25,000 items x 5 assertions = flaky under load
  returns.forEach((ret) => {
    expect(ret.multiple).toBeGreaterThanOrEqual(0);
    expect(ret.irr).toBeDefined();
    expect(['failure', 'modest', 'good', 'homeRun', 'unicorn']).toContain(
      ret.category
    );
    expect(ret.exitTiming).toBeGreaterThan(0);
    expect(['seed', 'series-a']).toContain(ret.stage);
  });
});
```

## Root Cause

Vitest default timeout is 5000ms. Tests that loop over large datasets with
per-item assertions can run 2-4s in isolation but 5-8s when the machine is
concurrently building, linting, or running other test files. Pre-push hooks are
particularly vulnerable because they run build + full test suite together.

## Fix

Add an explicit timeout to any test with > 1000 iterations or > 5000 assertion
calls:

```ts
it(
  'should generate returns for Monte Carlo integration',
  { timeout: 15000 },
  () => {
    // ... same test body ...
  }
);
```

Rule of thumb: if `iterations x assertions > 5000`, set timeout to
`max(15000, estimatedMs * 3)`.

## Detection

Search for tests with large iteration counts:

```bash
# Find forEach/map loops inside test bodies with >100 iterations
rg 'forEach|\.map\(' tests/ --glob '*.test.ts' -l
```

Then check if any generate > 1000 items. Common patterns:

- `generatePowerLawReturns(N, ..., scenarios)` where N \* scenarios > 1000
- Monte Carlo simulation results
- Combinatorial test data generators

## Impact

- Pre-push hook failure blocked 2 consecutive pushes (wasted ~5 minutes each)
- Flaky CI failures erode trust in the test suite
- Developers may reach for `--no-verify` to bypass, skipping all safety checks

## Related

- Vitest docs: https://vitest.dev/api/#test-timeout
- Default timeout configurable in vitest.config.ts `test.testTimeout`
