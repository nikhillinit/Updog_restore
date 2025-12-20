# Test Pyramid and E2E Scope Control

## Overview

This skill defines the test pyramid strategy for this repository, establishing clear boundaries for what belongs at each testing level. Its primary purpose is to prevent E2E test sprawl while ensuring critical paths have appropriate coverage.

**Core principle**: Test at the lowest level that can catch the bug. E2E tests are expensive; use them only when lower levels cannot.

## Test Pyramid Distribution

```
                    +----------+
                    |   E2E    |  5% of tests
                    | Playwright|  <30s each
                    +----------+
                    |          |
                | Integration  |  15% of tests
                |   API/DB     |  <100ms each
                +--------------+
                |              |
            |      Unit        |  80% of tests
            |  Functions/      |  <10ms each
            |  Components      |
            +------------------+
```

### Target Metrics

| Level | Coverage Target | Speed Target | Max Count |
|-------|-----------------|--------------|-----------|
| Unit | 80%+ line coverage | <10ms each | No limit |
| Integration | API contracts, DB queries | <100ms each | ~100-200 |
| E2E (Playwright) | Critical flows only | <30s each | <50 total |

## What Belongs at Each Level

### Unit Tests

**Test these at unit level:**
- Pure functions (calculations, transformers, validators)
- React component rendering (with React Testing Library)
- State management logic (reducers, selectors)
- Utility functions
- Schema validation (Zod parsing)
- Error handling branches

**Characteristics:**
- No network calls (mock everything external)
- No database (mock repositories)
- No browser APIs (jsdom sufficient)
- Fast, deterministic, isolated

### Integration Tests

**Test these at integration level:**
- API endpoint behavior (request -> response)
- Database queries (actual DB, not mocks)
- Service-to-service communication
- Authentication/authorization flows
- Queue/worker processing
- Cache behavior

**Characteristics:**
- Real database (test instance)
- Real HTTP (supertest or similar)
- May involve multiple modules
- Slower than unit, faster than E2E

### E2E Tests (Playwright)

**Test these at E2E level:**
- Critical user journeys (wizard completion, checkout)
- Browser-only behavior (beforeunload, focus management)
- Cross-page state persistence
- Real authentication flows
- Behaviors that only manifest with real browser event loop

**Characteristics:**
- Real browser (Chromium/Firefox/WebKit)
- Full stack running
- Slowest, most expensive
- Most likely to flake

## E2E Admission Criteria

Before creating an E2E test, ALL of these must be true:

### 1. Browser-Only Behavior

The behavior cannot be tested with jsdom:

| Requires E2E | Can Use jsdom |
|--------------|---------------|
| beforeunload dialog | Click handlers |
| Real focus/blur across iframes | Basic focus events |
| ResizeObserver callbacks | Most CSS behavior |
| Clipboard API | Form validation |
| File download triggers | File input handling |
| Complex drag-and-drop | Basic drag events |
| Service worker behavior | Most async behavior |

### 2. Critical User Flow

The flow has significant business impact:

| E2E Candidate | Unit/Integration Instead |
|---------------|-------------------------|
| Wizard completion | Individual step validation |
| Payment processing | Payment API integration test |
| User authentication | Auth endpoint integration test |
| Data export/download | Export function unit test |
| Onboarding flow | Individual screen rendering |

### 3. High Regression Risk

The area has a history of breaking or high business cost.

### 4. Cannot Be Tested at Lower Level

You've genuinely tried and it's not possible.

## What Does NOT Qualify for E2E

### Validation Logic
Unit test the validator instead of E2E testing form error display.

### API Error Handling
Integration test the API, unit test the UI error display.

### Component Rendering
Unit test component rendering instead of E2E navigating to check visibility.

### Data Transformations
Unit test the formatter instead of E2E checking display.

## Selector Strategy

### Priority Order

1. **data-testid** - Preferred, explicit test contract
2. **Accessibility role** - Acceptable, tests real a11y
3. **Label text** - Acceptable for form fields
4. **Text content** - Avoid, fragile to copy changes
5. **CSS selectors** - Forbidden, fragile to refactoring

## E2E Budget Enforcement

### Hard Limits

| Metric | Limit | Enforcement |
|--------|-------|-------------|
| Total E2E tests | <50 | CI fails if exceeded |
| Single test duration | <30s | Test timeout |
| Total E2E suite time | <10min | CI budget |
| Flake rate | <2% | Quarantine trigger |

## Flake Management

### Triage Protocol

When E2E test flakes:

1. **First flake**: Add to watchlist, don't skip
2. **Second flake within 1 week**: Investigate root cause
3. **Third flake**: Either fix or quarantine

## Integration with Agents

### playwright-test-author Subagent
Must follow this skill's rules for admission criteria, selectors, and budget.

### test-repair Agent
Uses this skill to decide if test should be at E2E level or demoted.
Also handles flakiness detection and quarantine per the Flake Management section.

### test-scaffolder Agent
Uses this skill when scaffolding test infrastructure to determine appropriate
test levels and ensure proper project structure (server vs client).

### test-automator Agent
References this skill for coverage strategy and test generation at correct levels.

### pr-test-analyzer Agent
References this skill to evaluate E2E test justification in PRs.

### code-reviewer Agent
References this skill to check if new E2E tests are justified.

## Related Skills

### test-fixture-generator Skill
Provides fixture patterns (factory functions, golden datasets) that work with
all test levels. Use for creating test data infrastructure.
