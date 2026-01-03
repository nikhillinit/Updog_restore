---
status: ACTIVE
audience: agents
last_updated: 2025-12-29
owner: 'Platform Team'
review_cadence: P30D
categories: [testing, agents, routing]
keywords: [test-strategy, test-agents, test-selection]
---

# Test Agent Selection Guide

This document provides routing guidance for the 6 test-related agents in the
project. Use this to select the right agent for your testing task.

---

## Quick Decision Tree

```
Is the test failing?
    |
    +-- YES --> test-repair agent
    |           (Autonomous diagnosis and fix)
    |
    +-- NO --> Continue
    |
Need new test infrastructure?
    |
    +-- YES --> test-scaffolder agent
    |           (Creates test setup, fixtures, utilities)
    |
    +-- NO --> Continue
    |
Reviewing a PR for test coverage?
    |
    +-- YES --> pr-test-analyzer agent
    |           (Gap analysis, edge case detection)
    |
    +-- NO --> Continue
    |
Browser-specific behavior?
    |
    +-- YES --> playwright-test-author agent
    |           (E2E tests, jsdom insufficient)
    |
    +-- NO --> Continue
    |
Financial calculation changes?
    |
    +-- YES --> parity-auditor agent
    |           (Excel parity, truth case impact)
    |
    +-- NO --> test-automator agent
                (Comprehensive TDD, coverage analysis)
```

---

## Agent Selection Matrix

| Situation | Agent | Why | Invocation |
|-----------|-------|-----|------------|
| Tests failing after code change | **test-repair** | Autonomous fix with pattern memory | `Task("test-repair", "Fix failing tests")` |
| New module needs tests | **test-scaffolder** | Creates infrastructure, fixtures | `Task("test-scaffolder", "Create tests for new PaymentService")` |
| PR test coverage review | **pr-test-analyzer** | Identifies gaps, missing edge cases | `Task("pr-test-analyzer", "Review PR #123 test coverage")` |
| Browser-only behavior | **playwright-test-author** | E2E tests when jsdom insufficient | `Task("playwright-test-author", "Test drag-drop in Dashboard")` |
| Waterfall/XIRR changes | **parity-auditor** | Excel parity, truth case impact | `Task("parity-auditor", "Check impact of fee calc change")` |
| Comprehensive test strategy | **test-automator** | TDD, coverage analysis, strategy | `Task("test-automator", "Create test plan for new feature")` |

---

## Agent Details

### test-repair (Primary - Most Common)

**Use When**:
- Tests are failing after code changes
- Need autonomous diagnosis and fix
- Want pattern-based learning from past failures

**Model**: sonnet (memory-enabled)

**Skills**: Learns test failure patterns and successful repairs

**Example**:
```
Task("test-repair", "Fix the 8 failing waterfall tests after refactoring")
```

**Delegates To**: playwright-test-author (if jsdom is insufficient)

---

### test-scaffolder (New Module Setup)

**Use When**:
- Creating a new module, package, or feature
- Need test infrastructure from scratch
- Setting up fixtures, factories, utilities

**Model**: sonnet

**Creates**:
- Test file structure
- Fixture factories
- Mock utilities
- Integration test setup

**Example**:
```
Task("test-scaffolder", "Scaffold tests for new packages/analytics-engine")
```

---

### pr-test-analyzer (PR Reviews)

**Use When**:
- Reviewing a PR for test completeness
- Want to identify coverage gaps
- Need edge case suggestions

**Model**: inherit (memory-only)

**Checks**:
- Test coverage for new code
- Missing edge cases
- Critical path coverage
- Regression potential

**Example**:
```
Task("pr-test-analyzer", "Analyze test coverage for PR #456 adding user auth")
```

---

### playwright-test-author (E2E/Browser)

**Use When**:
- Testing browser-specific behavior
- jsdom tests are insufficient
- Need real DOM interactions (drag-drop, canvas, etc.)

**Model**: sonnet

**Skills**: test-pyramid, react-hook-form-stability

**Creates**:
- Playwright test files
- Page objects
- Test fixtures for browser state

**Example**:
```
Task("playwright-test-author", "Create E2E test for portfolio chart interactions")
```

---

### parity-auditor (Financial Calculations)

**Use When**:
- Changes touch financial calculation logic
- Need Excel parity verification
- Truth case impact assessment

**Model**: sonnet

**Skills**: financial-calc-correctness, systematic-debugging

**Checks**:
- Excel parity maintenance
- Truth case pass rates
- Tolerance changes justified

**Example**:
```
Task("parity-auditor", "Assess impact of XIRR algorithm change on truth cases")
```

---

### test-automator (Comprehensive Strategy)

**Use When**:
- Need full test strategy for a feature
- Want TDD guidance
- Comprehensive coverage analysis

**Model**: inherit (memory-only)

**Provides**:
- Test plan creation
- TDD workflow guidance
- Coverage gap analysis
- Test organization recommendations

**Example**:
```
Task("test-automator", "Create comprehensive test strategy for Monte Carlo engine")
```

---

## Related Commands

| Command | Uses Agent | Purpose |
|---------|------------|---------|
| `/test-smart` | - | Run affected tests only |
| `/fix-auto` | test-repair (if needed) | Auto-fix lint/type/test issues |
| `/phoenix-truth` | phoenix-truth-case-runner | Run Phoenix truth cases |

---

## Test Pyramid Context

The project follows a test pyramid structure:

```
        /\
       /  \     E2E (playwright-test-author)
      /----\    - Browser interactions
     /      \   - Critical user flows
    /--------\  Integration (pr-test-analyzer reviews)
   /          \ - API tests
  /------------\- Component tests
 /              \
/----------------\ Unit (test-scaffolder creates)
                  - Function tests
                  - Truth cases
```

**Phoenix Truth Cases**: Special category - deterministic validation tests for
financial calculations. Use `/phoenix-truth` command or `phoenix-truth-case-runner`
agent.

---

## Memory and Learning

These test agents have memory capabilities:

| Agent | Memory Type | What They Remember |
|-------|-------------|-------------------|
| test-repair | HybridMemory | Failure patterns, successful fixes |
| pr-test-analyzer | Project memory | Coverage gaps, edge case patterns |
| parity-auditor | Project memory | Tolerance changes, truth case history |

---

## See Also

- [AGENT-DIRECTORY.md](../AGENT-DIRECTORY.md) - Full agent catalog
- [test-pyramid skill](.claude/skills/test-pyramid/SKILL.md) - Test level guidance
- [cheatsheets/pr-merge-verification.md](../../cheatsheets/pr-merge-verification.md) - PR testing
- [statistical-testing skill](.claude/skills/statistical-testing/SKILL.md) - Monte Carlo tests
