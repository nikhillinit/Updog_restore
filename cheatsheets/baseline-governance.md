---
status: ACTIVE
last_updated: 2026-01-19
---

# Baseline Governance Guide

**Purpose**: How to manage quality metric baselines and request changes
**Audience**: Developers, Agents
**Last Updated**: 2025-12-16

---

## What Are Baselines?

Baselines are quality metric thresholds that enforce the "ratchet" principle:
metrics can improve but cannot regress without explicit approval.

**Tracked Metrics**:
| Metric | Location | Ratchet Direction |
|--------|----------|-------------------|
| Test pass count | .baselines/tests.json | Can only increase |
| TypeScript errors | .baselines/typescript.json | Can only decrease |
| ESLint violations | .baselines/eslint.json | Can only decrease |
| Bundle size (KB) | .baselines/bundle.json | Can only decrease |

---

## Baseline Ratchet Principle

```
Initial State: 100 tests passing
    |
    +-- PR adds 5 tests, 3 pass --> FAIL (regression from 100 to 103-3=100)
    |
    +-- PR adds 5 tests, all pass --> PASS (improvement from 100 to 105)
    |
    +-- PR removes 10 tests --> FAIL (regression from 100 to 90)
```

**Key Rule**: The baseline is a floor, not a target.

---

## When Baselines Can Change

### Acceptable Increases (loosening)

1. **Intentional refactor**: Removing deprecated code that had tests
2. **Scope reduction**: Deleting a feature entirely
3. **Infrastructure change**: Moving tests to different project

### Unacceptable Increases

1. **Skipping flaky tests**: Fix the test, don't skip it
2. **Removing coverage**: Tests exist for a reason
3. **Convenience**: "I don't want to fix this test"

---

## Requesting Baseline Changes

### Step 1: Justify the Change

Create a comment block in your PR description:

```markdown
## Baseline Change Request

**Metric**: Test pass count
**Current**: 998
**Proposed**: 990
**Direction**: Decrease (loosening)

### Justification

[Explain why this change is necessary]

### Affected Tests

- tests/foo.test.ts (removed: feature X deleted)
- tests/bar.test.ts (removed: deprecated API)

### Verification

- [ ] Feature removal is intentional (link to ticket)
- [ ] No functionality lost (or documented)
- [ ] Stakeholder approval obtained
```

### Step 2: Add Label

Add the `baseline-change` label to your PR.

### Step 3: Get Approval

Baseline changes require explicit approval from:
- Code owner for affected area
- Quality gate maintainer

### Step 4: Update Baseline

After approval, update with:

```bash
./scripts/baseline-check.sh --update
```

This regenerates `.baselines/` files with new thresholds.

---

## Baseline File Format

```json
{
  "metric": "test_pass_count",
  "value": 998,
  "updated_at": "2025-12-16T10:00:00Z",
  "updated_by": "PR #123",
  "history": [
    { "value": 990, "date": "2025-12-01", "pr": "#100" },
    { "value": 998, "date": "2025-12-15", "pr": "#120" }
  ]
}
```

---

## Handling Baseline Failures

### CI Failure Message

```
--- VALIDATION FAILURE ---
validator: baseline-check
metric: test_pass_count
expected: >= 998
actual: 995
delta: -3
---
```

### Resolution Options

1. **Fix the regression**: Get tests passing again
2. **Request baseline change**: Follow approval process above
3. **Investigate root cause**: Delegate to `baseline-regression-explainer`

---

## Agent Delegation

When `baseline-check.sh` fails, `code-reviewer` delegates to `baseline-regression-explainer`:

```
code-reviewer sees baseline-check failure
    |
    v
Delegate to baseline-regression-explainer
    |
    v
Agent diagnoses:
- Which tests regressed?
- What code change caused it?
- Is this a real regression or test flake?
    |
    v
Returns report with recommendations
```

---

## PR Checklist for Baseline Changes

- [ ] Baseline change documented in PR description
- [ ] `baseline-change` label added
- [ ] Justification is acceptable (not convenience)
- [ ] Feature removal is intentional (if applicable)
- [ ] Code owner approved
- [ ] Quality gate maintainer approved
- [ ] `.baselines/` files updated correctly

---

## Best Practices

1. **Never bypass**: Don't skip the baseline check in CI
2. **Document always**: Every baseline change needs justification
3. **Review history**: Check `.baselines/` history before proposing changes
4. **Prefer improvement**: If possible, fix the regression instead

---

## Related Documentation

- [ci-validator-guide.md](ci-validator-guide.md)
- [pr-merge-verification.md](pr-merge-verification.md)
- [CLAUDE-INFRA-V4-INTEGRATION-PLAN.md](../docs/CLAUDE-INFRA-V4-INTEGRATION-PLAN.md)
