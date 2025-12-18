# Phase 4B Governance Rules

## Composite Score Formula

Score = failed + skipped + (suiteFailures × 15)

Current baseline (v7.4):

- failed: 240 (buffer policy)
- skipped: 91
- suiteFailures: 17
- minTotalTests: 1781

Starting metrics (Phase 4B):

- failed: 227
- skipped: 91
- suiteFailures: 17
- Score: 227 + 91 + (17 × 15) = 573

Target (90% pass rate):

- NonPassing ≤ 178 (failed + skipped)
- suiteFailures ≤ 5
- Score ≤ 253 (approximate, depends on distribution)

## Commit Rules

### Rule A: Normal Commits (no suiteFailures decrease)

- Score MUST decrease
- No exceptions

### Rule B: Suite-Unlock Commits (suiteFailures decreases by ΔS ≥ 1)

- Score may increase, but only up to:
  - AllowedScoreIncrease ≤ (ΔS × 10)
- AND NonPassing guardrail:
  - (failed + skipped) may increase by at most (ΔS × 10)
- Payback rule:
  - Within the next 2 commits after a suite-unlock commit, Score must be net
    lower than before the unlock commit

**Rationale**: Unlocking a suite can reveal many failing tests; we reward unlock
progress without letting regressions hide behind suite weight.

### Exception Logging (Required for Rule B)

Any commit using Rule B must include in commit message:

- ΔS (suiteFailures change)
- Score before/after
- NonPassing before/after
- Justification ("suite unlock reveal")

Example:

```
fix(test): unlock KpiCard suite + fix 3 import failures

- suiteFailures: 17 → 14 (ΔS=-3)
- NonPassing: 300 → 310 (+10, within allowance: 3×10=30)
- Score: 573 → 565 (-8, net decrease)
- Rule used: Suite-unlock allowance

Justification: Suite unlock revealed 10 additional failing tests
that were previously hidden. Net score decrease validates progress.
```

## Baseline Update Ban

**CRITICAL**: Do NOT run `npm run baseline:test:update` until Phase 4B is
complete (Session 3/PR-ready).

This prevents accidental normalization during suite unlock volatility.

Allowed baseline operations:

- ✓ `npm run baseline:test:check` (read-only validation)
- ✗ `npm run baseline:test:update` (write operation)

## Ratchet Policy

Prefer composite governance over raising ratchets.

Only consider raising maxFailed to 270 if ALL of:

- suiteFailures drops by ≥3 in the same batch
- AND Score decreases
- AND failed >235
- AND you document it as Phase 4B temporary buffer

If raising maxFailed=270:

1. Document in commit message with justification
2. Add note that it's temporary for Phase 4B
3. Plan to lower it back to 240 or lower in final PR

## Commit Cadence

Commit when ONE of:

- suiteFailures decreases, OR
- a grouped inventory key (same root cause) is fully cleared, OR
- a top bucket count materially drops (≥3 files)

Avoid time-based commits; optimize for rollback + clarity.

Each commit message MUST include:

```
- suiteFailures: A → B
- NonPassing: A → B
- Score: A → B
- Rule used: Normal / Suite-unlock allowance
```

## Validation Checkpoints

### Checkpoint 0: Inventory Validation

- Inventory size must match summary.suiteFailures (17)
- Enforced via exit code in Task 0

### Checkpoint 1: Session 1 Target

- NonPassing ≤ 220 (failed + skipped)
- suiteFailures ≤ 10

### Checkpoint 2: Phase 4B Complete

- NonPassing ≤ 178 (90% pass rate)
- suiteFailures ≤ 5
- Score validates per governance rules
