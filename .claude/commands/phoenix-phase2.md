---
description: "Phase 2 workflow: validate Expectation Mode, run seeded Monte Carlo, summarize distributions"
argument-hint: "[goal] seed=<int> iters=<int> scenario=<name> focus=<graduation|moic|reserves|monte-carlo>"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(git status:*), Bash(git diff:*), Bash(git branch:*), Bash(npm test:*), Bash(npm run phoenix:*)
---

# Phoenix Phase 2: Probabilistic Workflow

Execute Phoenix Phase 2 probabilistic layers on top of a validated deterministic core.

## Prime Directives

1. Do NOT modify deterministic Phase 1 math to add randomness. Wrap it.
2. Expectation Mode first (deterministic, testable).
3. Seeded stochastic runs only (reproducible).
4. If deterministic truth-case failures are discovered, STOP and route to specialists.

## Context Gathering

- Current branch: !`git branch --show-current`
- Working tree status: !`git status --porcelain=v1`

## Step 0: Parse Arguments

From `$ARGUMENTS`, extract:

- **goal**: Free text (default: "implement/modify probabilistic layer as requested")
- **seed**: Default 42
- **iters**: Default 2000 (use 200 for quick tests)
- **scenario**: Default "base"
- **focus**: Optional {graduation|moic|reserves|monte-carlo}

If ambiguous, use safe defaults and state them explicitly.

## Step 1: Gate Check (HARD REQUIREMENT)

Run deterministic truth cases first:

```bash
npm run phoenix:truth
```

**Gate condition**: All P0 modules must pass at baseline rate.

If failures exist:
1. Output: "GATE FAILED: Deterministic suite has failures"
2. Summarize which modules failed
3. Route to: phoenix-truth-case-runner, phoenix-precision-guardian, or waterfall-specialist
4. STOP execution - do not proceed to Step 2

## Step 2: Implement/Verify Expectation Mode

For the requested focus, ensure a deterministic mode exists:

| Focus       | Expectation Mode Requirement                           |
| ----------- | ------------------------------------------------------ |
| graduation  | `expectedTransition(...)` uses expected values only    |
| moic        | Pure functions, no sampling                            |
| reserves    | Deterministic allocation under constraints             |
| monte-carlo | Must support `expectationMode: true` (sampling off)    |

Add or verify tests proving Expectation Mode correctness.

## Step 3: Implement/Verify Seeded Monte Carlo

Only after Expectation Mode passes:

1. Implement/review orchestrator that:
   - Accepts `seed` and `iters` parameters
   - Uses injected seeded RNG (not Math.random)
   - Calls deterministic core per iteration via wrapper
   - Aggregates metrics per run (TVPI/DPI/MOIC/IRR as available)

2. Add fast CI sanity run:
   ```bash
   npm run phoenix:monte-carlo -- --seed=42 --iters=200
   ```

## Step 4: Validate Probabilistic Outputs

At minimum, verify:

### Distribution Sanity
- No impossible negatives where not meaningful
- Percentiles monotonic: P10 <= P50 <= P90

### Expectation Alignment
- Monte Carlo mean should be close to Expectation Mode result
- Define tolerance per metric (e.g., 5% for TVPI)

### Reproducibility
- Same seed + inputs -> same summary stats
- Run twice with seed=42, confirm identical results

## Step 5: Produce Operator Summary

Return structured summary:

```
## Phoenix Phase 2 Results

### Configuration
- Seed: {seed}
- Iterations: {iters}
- Scenario: {scenario}
- Focus: {focus}

### Files Changed
- {list of modified files}

### Expectation Mode Status
- Tests: {pass/fail count}
- Parity with deterministic core: {verified/unverified}

### Monte Carlo Summary

| Metric | Mean   | P10    | P50    | P90    |
| ------ | ------ | ------ | ------ | ------ |
| TVPI   | X.XX   | X.XX   | X.XX   | X.XX   |
| DPI    | X.XX   | X.XX   | X.XX   | X.XX   |
| MOIC   | X.XX   | X.XX   | X.XX   | X.XX   |
| IRR    | X.X%   | X.X%   | X.X%   | X.X%   |

### Next Steps
- {recommended follow-up actions}

### Commands Run
{exact commands executed}
```

## Error Handling

- If test runner crashes (not fails): Check SIDECAR_GUIDE.md for environment issues
- If Monte Carlo times out: Reduce iters, check for infinite loops
- If distribution is degenerate: Verify RNG seeding, check input variance

## Related Commands

- `/phoenix-truth` - Run deterministic suite (prerequisite)
- `/phoenix-prob-report` - Format distribution table for PR comments
