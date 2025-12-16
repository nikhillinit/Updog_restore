# Test Pyramid Guide

**Purpose**: Guidance on test level selection and E2E scope control
**Audience**: Developers, Agents
**Last Updated**: 2025-12-16

---

## The Test Pyramid

```
         /\
        /  \        E2E Tests (expensive, slow)
       /----\       ~5% of tests
      /      \
     /--------\     Integration Tests (moderate)
    /          \    ~15% of tests
   /------------\
  /              \  Unit Tests (fast, cheap)
 /----------------\ ~80% of tests
```

**Key Principle**: Test at the lowest level that catches the bug.

---

## Test Levels Defined

### Unit Tests (80%)

**Scope**: Single function, class, or module in isolation

**Characteristics**:
- No external dependencies (mocked)
- Sub-millisecond execution
- Deterministic (no flakiness)
- Test file co-located with source

**Example**:
```typescript
// calculateIRR.test.ts
describe('calculateIRR', () => {
  it('returns correct IRR for simple cash flows', () => {
    const result = calculateIRR([-100, 50, 50, 50]);
    expect(result).toBeCloseTo(0.2339, 4);
  });
});
```

**When to Use**:
- Pure functions
- Business logic
- Utility functions
- State transformations

---

### Integration Tests (15%)

**Scope**: Multiple components working together

**Characteristics**:
- Real dependencies (database, API)
- Seconds to execute
- May require setup/teardown
- Test file in `tests/integration/`

**Example**:
```typescript
// fund-creation.integration.test.ts
describe('Fund Creation Flow', () => {
  it('creates fund with all required entities', async () => {
    const result = await createFund(testData);
    expect(result.fund).toBeDefined();
    expect(result.investors).toHaveLength(3);
    expect(result.commitments).toHaveLength(3);
  });
});
```

**When to Use**:
- API endpoints
- Database operations
- Multi-component workflows
- External service integration

---

### E2E Tests (5%)

**Scope**: Full user journey through the application

**Characteristics**:
- Real browser (Playwright)
- Seconds to minutes
- Complex setup
- Test file in `tests/e2e/`

**Example**:
```typescript
// fund-wizard.e2e.test.ts
test('user can create fund through wizard', async ({ page }) => {
  await page.goto('/funds/new');
  await page.fill('[data-testid="fund-name"]', 'Test Fund');
  await page.click('[data-testid="submit"]');
  await expect(page.locator('[data-testid="success"]')).toBeVisible();
});
```

**When to Use**:
- Critical user journeys
- Cross-browser behaviors
- Complex UI interactions
- Behaviors that can't be tested in jsdom

---

## E2E Scope Control

### The E2E Trap

E2E tests are:
- **10-100x slower** than unit tests
- **More flaky** (network, timing, browser state)
- **Harder to debug** (no clear failure point)
- **Expensive to maintain** (UI changes break them)

### When E2E is Justified

1. **Browser-only behavior**: beforeunload, ResizeObserver, real focus
2. **Critical business flow**: Checkout, authentication, payment
3. **Cross-browser validation**: Safari-specific bugs
4. **Visual regression**: Layout, styling, responsive design

### When E2E is NOT Justified

1. **Logic testing**: Use unit tests
2. **API testing**: Use integration tests
3. **Component rendering**: Use React Testing Library
4. **Data validation**: Use schema tests

---

## Decision Tree: Which Test Level?

```
Does the bug require a real browser?
    |
    +-- YES --> E2E Test (delegate to playwright-test-author)
    |
    +-- NO --> Does it involve multiple systems?
                   |
                   +-- YES --> Integration Test
                   |
                   +-- NO --> Unit Test
```

### Detailed Decision Flow

```
START
  |
  v
Can jsdom simulate this behavior?
  |
  +-- NO (beforeunload, ResizeObserver, etc.)
  |     |
  |     v
  |   E2E TEST (playwright-test-author)
  |
  +-- YES --> Does it need real database?
                |
                +-- YES --> Does it test a full workflow?
                |             |
                |             +-- YES --> Integration Test
                |             |
                |             +-- NO --> Unit Test with DB mock
                |
                +-- NO --> Unit Test
```

---

## Delegation to playwright-test-author

When `test-repair` agent identifies a browser-only bug:

```
test-repair detects browser-only behavior
    |
    v
jsdom limitation identified
    |
    v
Delegate to playwright-test-author with:
- Bug description
- Expected behavior
- Which browser API involved
    |
    v
playwright-test-author returns E2E test
    |
    v
test-repair adds data-testid if needed
```

---

## Test File Conventions

| Test Level | Location | Naming | Runner |
|------------|----------|--------|--------|
| Unit | Adjacent to source | `*.test.ts` | Vitest |
| Integration | `tests/integration/` | `*.integration.test.ts` | Vitest |
| E2E | `tests/e2e/` | `*.e2e.test.ts` | Playwright |

---

## Best Practices

1. **Default to unit tests**: When in doubt, unit test
2. **Mock boundaries, not internals**: Mock external services, not internal modules
3. **One assertion per test**: Clear failure messages
4. **Descriptive names**: `it('returns empty array when no funds match filter')`
5. **Avoid test duplication**: If a unit test covers it, don't add integration test

---

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| E2E for logic | Slow, flaky | Unit test the logic |
| Testing implementation | Brittle | Test behavior, not internals |
| Shared state between tests | Flaky | Isolate each test |
| Magic numbers | Unclear | Use named constants |
| Testing third-party code | Wasteful | Trust the library |

---

## Related Documentation

- [ci-validator-guide.md](ci-validator-guide.md)
- [pr-merge-verification.md](pr-merge-verification.md)
- [../tests/README.md](../tests/README.md)
