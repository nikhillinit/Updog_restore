# Baseline Governance

## Overview

This skill defines the policy for baseline-based merge criteria. Baselines provide a "ratchet" mechanism: quality metrics can improve but cannot regress without explicit approval.

**Philosophy**: Compare to baseline, not perfection. This allows incremental improvement while preventing backsliding.

## What Baselines We Track

| Metric | Baseline File | CI Check | Regression Policy |
|--------|---------------|----------|-------------------|
| Test pass rate | .baselines/tests.json | npm test | Must not decrease |
| TypeScript errors | .baselines/typescript.json | npm run check | Must not increase |
| ESLint warnings | .baselines/eslint.json | npm run lint | Must not increase |
| Bundle size | .baselines/bundle.json | npm run build | Must not increase >5% |

### Baseline File Format

```json
{
  "updated_at": "2024-01-15T10:30:00Z",
  "reason": "Initial baseline after test suite stabilization",
  "passed": 823,
  "total": 847,
  "pass_rate_bp": 9717
}
```

## When Baseline Changes Are Acceptable

### Acceptable Reasons (require documentation)

| Reason | Example | Approval Level |
|--------|---------|----------------|
| Intentional scope expansion | Adding strict lint rules | Self-approve with docs |
| Major dependency upgrade | React 18 -> 19 with known breakage | PR review required |
| Architectural refactor | Temporary regression with plan | Tech lead approval |
| Test infrastructure change | New test runner with different counting | Self-approve with docs |
| Bug fix reveals hidden issues | Fixing mock exposed 10 real failures | Document in PR |

### Unacceptable Reasons (block merge)

| Reason | Why Blocked | Alternative |
|--------|-------------|-------------|
| "Tests are flaky" | Fix flakiness, don't hide it | Quarantine flaky tests |
| "TypeScript is too strict" | Strictness prevents bugs | Fix types or add targeted ignores |
| "Lint rule is annoying" | Rules exist for reasons | Disable rule repo-wide with justification |
| "No time to fix" | Tech debt compounds | Create ticket, don't merge regression |

## How to Approve Baseline Changes

### Step 1: Document the Change

In your PR description:

```markdown
## Baseline Change

**Metric**: TypeScript errors
**Previous**: 47
**New**: 52
**Delta**: +5

**Reason**: Upgraded drizzle-orm to v0.30 which requires explicit type
annotations in migration files.

**Plan**: Will fix in follow-up PR #234 (linked)

**Temporary?**: Yes, expect to resolve within 1 week
```

### Step 2: Update Baseline File

Update the baseline file with reason and timestamp.

### Step 3: Add Label

Add `baseline-change` label to PR for visibility in reviews.

### Step 4: Get Approval (if required)

- Self-service: Scope expansion, infrastructure changes
- PR review: Dependency upgrades, bug-reveal scenarios
- Tech lead: Architectural refactors with regression plans

## Baseline Check Implementation

The CI script (`scripts/baseline-check.sh`) enforces these policies automatically.

### Green (No Regression)
Merge eligible (pending other checks).

### Yellow (Improvement)
Optionally update baseline to lock in improvement.

### Red (Regression)
Fix errors OR document and update baseline per process above.

## Ratcheting Strategy

### Aggressive Ratchet (Recommended for stable areas)
Update baseline immediately when metrics improve. Prevents accidental regression.

```bash
# After PR improves test pass rate
./scripts/baseline-check.sh --update tests "Ratchet after test fixes"
```

### Relaxed Ratchet (For areas under active development)
Only update baseline at milestones. Allows fluctuation during development.

### Per-Area Ratcheting
Different areas can have different policies based on stability.

## Integration with Other Skills

- **systematic-debugging**: Use when baseline check fails unexpectedly
- **verification-before-completion**: Include baseline check in verification steps
- **continuous-improvement**: Use baseline trends to identify improvement opportunities

## Agent Behavior

### When code-reviewer Sees Baseline Changes

1. Check if .baselines/ files are modified
2. Verify `baseline-change` label is present
3. Verify PR description contains baseline change documentation
4. Verify reason is in "acceptable" category
5. If temporary, verify follow-up issue is linked

### When Evaluating "Is This PR Ready to Merge?"

```
Baseline Status:
- [ ] CI baseline check passes OR
- [ ] Baseline change documented and approved
- [ ] If temporary regression, follow-up issue linked
```
