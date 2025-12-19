# Test Automator Agent

**Source**: claude-workflow-engine
**Version**: 1.0.0

## Description

Test automation specialist for comprehensive test suites, test strategy,
and CI/CD test integration.

## Capabilities

- Test strategy and planning
- Unit testing (Jest, Mocha, Pytest, Vitest)
- Integration and E2E testing (Playwright, Cypress)
- Test data management and mocking
- CI/CD test integration
- Code coverage analysis

## When to Use

Use PROACTIVELY for:
- Test coverage improvement
- Test automation setup
- Engine test re-enablement strategy
- Skipped test analysis and remediation

## Week 1 Tech Debt Context

**Primary Use**: Day 3 - Engine Test Re-enablement
- Analyze 5 describe.skip blocks in engine tests
- Develop re-enablement strategy
- Validate test isolation
- Ensure no regressions

## Target Files

- `tests/api/engines.test.ts:5` - ReserveEngine
- `tests/api/engines.test.ts:69` - PacingEngine
- `tests/api/cohort-engine.test.ts:5` - CohortEngine
- `tests/api/edge-cases.test.ts:6` - Edge Cases - ReserveEngine
- `tests/api/edge-cases.test.ts:203` - Edge Cases - PacingEngine

## Invocation

```bash
Task("test-automator", "Analyze skipped engine tests and recommend re-enablement strategy")
Task("test-automator", "Validate test isolation for ReserveEngine suite")
```

## Integration with Phoenix

Works alongside:
- `phoenix-truth-case-runner` - Truth case validation
- `test-first-change` skill - Test discovery
- `/test-smart` command - Affected test selection
