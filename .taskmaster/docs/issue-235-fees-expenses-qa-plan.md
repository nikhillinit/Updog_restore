# Issue #235: FeesExpensesStep Integration QA Plan

## Overview
Execute remaining 11 test cases for FeesExpensesStep in full wizard context.

**Status:** 3/14 tests PASSED (core component tests)
**Goal:** 14/14 tests PASSED

## Test Environment Analysis

### Already Passing (3 tests)
- Test 1.1: Rapid Input Debouncing
- Test 1.2: Multiple Field Changes
- Test 1.3: Invalid Data Rejection

These test the component in isolation using useDebounceDeep hook.

### Blocked Tests - Categorized by Environment

#### Category A: XState Machine Tests (7 tests)
Best approach: Extend `tests/unit/modeling-wizard-persistence.test.tsx`

| # | Test | Implementation |
|---|------|----------------|
| 1 | Wizard completion flow | Send NEXT through all steps, verify feesExpenses data persisted |
| 2 | Wizard-level reset trigger | Send RESET event, verify form cleared |
| 3 | Step skip/jump scenarios | Send JUMP_TO_STEP, verify state preserved |
| 4 | Error recovery paths | Simulate persistence error, send RETRY |
| 5 | Concurrent step changes | Multiple SAVE_STEP events in rapid succession |
| 6 | Multiple wizard instances | Create multiple actors, verify isolation |
| 7 | Rapid step navigation | Send NEXT/BACK rapidly, verify no race conditions |

#### Category B: Playwright E2E Tests (4 tests)
Best approach: New file `tests/e2e/wizard-navigation.e2e.spec.ts`

| # | Test | Implementation |
|---|------|----------------|
| 8 | Navigate away (unmount save) | Click nav link, verify save triggered |
| 9 | Browser back button | Use page.goBack(), verify data preserved |
| 10 | Direct URL navigation | Navigate to different route, verify cleanup |
| 11 | Browser refresh/reload | page.reload(), verify resume from storage |

## Implementation Plan

### Phase 1: XState Machine Tests
File: `tests/unit/modeling-wizard-persistence.test.tsx`

```typescript
describe('FeesExpensesStep - Wizard Integration (Issue #235)', () => {
  // Test fixtures
  const validFeesData = {
    managementFee: { rate: 2.0, basis: 'committed', stepDown: { enabled: false } },
    adminExpenses: { annualAmount: 50000, growthRate: 3 },
  };

  it('preserves feesExpenses data through wizard completion flow', async () => {
    const actor = createActor(modelingWizardMachine, { input: { ... } });
    actor.start();
    // Navigate to feesExpenses step
    // Save data
    // Complete wizard
    // Verify data in final context
  });

  it('clears feesExpenses data on wizard-level reset', async () => { ... });
  it('preserves feesExpenses when jumping between steps', async () => { ... });
  it('recovers feesExpenses data after persistence error retry', async () => { ... });
  it('handles concurrent SAVE_STEP events without data loss', async () => { ... });
  it('isolates feesExpenses data between multiple wizard instances', async () => { ... });
  it('handles rapid NEXT/BACK navigation without race conditions', async () => { ... });
});
```

### Phase 2: Playwright E2E Tests
File: `tests/e2e/wizard-navigation.e2e.spec.ts`

```typescript
test.describe('Wizard Navigation - FeesExpenses (Issue #235)', () => {
  test('triggers final save when navigating away', async ({ page }) => {
    await page.goto('/fund-setup?step=4');
    // Fill fees form
    // Click navigation link
    // Verify localStorage or API call
  });

  test('preserves data on browser back button', async ({ page }) => { ... });
  test('handles direct URL navigation away', async ({ page }) => { ... });
  test('resumes from localStorage after browser refresh', async ({ page }) => { ... });
});
```

## Acceptance Criteria
- [ ] All 14 test cases executed
- [ ] 100% pass rate
- [ ] No data loss scenarios
- [ ] Tests run in CI

## Risks
- Playwright tests require running app (may need test server setup)
- XState machine may need minor changes if tests reveal issues

## Estimated Effort
- Phase 1 (XState tests): 1-2 hours
- Phase 2 (Playwright tests): 1-2 hours
- Verification: 30 minutes
