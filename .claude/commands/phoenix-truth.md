---
description: 'Run deterministic Phoenix truth cases and update baseline reports'
argument-hint: '[focus=xirr|waterfall|fees|capital|recycling|all]'
allowed-tools: Read, Write, Grep, Glob, Bash
status: PARTIAL
last_updated: 2025-12-12
automation_status: manual_only
---

# Phoenix: Deterministic Truth Suite

Run the unified truth-case validation suite (119 scenarios, 6 modules) and
update Phoenix reports.

**NOTE:** This command references `npm run phoenix:truth` which is not yet
implemented. Current workflow requires manual test execution:
`npx vitest run tests/unit/truth-cases/runner.test.ts`

## Context Gathering

- Current branch: !`git branch --show-current`
- Working tree status: !`git status --porcelain=v1`

## Step 1: Run Deterministic Suite

Default (all modules):

```bash
npm run phoenix:truth
```

If focus argument provided, run targeted subset:

- `focus=xirr` - XIRR scenarios only
- `focus=waterfall` - Waterfall tier + ledger scenarios
- `focus=fees` - Fee calculation scenarios
- `focus=capital` - Capital allocation scenarios
- `focus=recycling` - Exit recycling scenarios

## Step 2: Compute Pass Rates

For each module, calculate:

- Passed / Total scenarios
- Pass rate percentage
- Failure classification breakdown

## Step 3: Classify Failures

Every failure must be categorized:

| Bucket           | Definition                                 |
| ---------------- | ------------------------------------------ |
| CODE BUG         | Implementation violates intended semantics |
| TRUTH CASE ERROR | Expected output is wrong or inconsistent   |
| MISSING FEATURE  | Truth case expects behavior not yet built  |

## Step 4: Route to Specialists

Based on failure patterns, route to appropriate agent:

| Failure Pattern      | Route To                           |
| -------------------- | ---------------------------------- |
| Precision drift      | phoenix-precision-guardian         |
| Waterfall semantics  | waterfall-specialist               |
| XIRR/fees parity     | xirr-fees-validator                |
| Allocation/recycling | phoenix-capital-allocation-analyst |

## Step 5: Update Reports

Update these files with results:

1. `docs/phase0-validation-report.md`
   - Module pass-rate table
   - Baseline run metadata (branch, commit, timestamp)
   - Phase gate decision

2. `docs/failure-triage.md`
   - Per-scenario failure list
   - Classification per failure
   - Agent ownership assignments

## Output Format

Always include in your response:

```
## Phoenix Truth Suite Results

**Branch**: {branch}
**Commit**: {short_sha}
**Timestamp**: {ISO timestamp}

### Module Pass Rates

| Module            | Passed | Total | Rate   |
| ----------------- | ------ | ----- | ------ |
| XIRR              | X      | Y     | Z%     |
| Waterfall (tier)  | X      | Y     | Z%     |
| Waterfall (ledger)| X      | Y     | Z%     |
| Fees              | X      | Y     | Z%     |
| Capital Allocation| X      | Y     | Z%     |
| Exit Recycling    | X      | Y     | Z%     |
| **Total**         | X      | Y     | Z%     |

### Triage Summary

- CODE BUG: N
- TRUTH CASE ERROR: N
- MISSING FEATURE: N

### Recommended Phase

Based on failure patterns: Phase {1A|1B|1C}

### Commands Run

{exact commands executed}
```

## Phase Gate Logic

- Precision drift dominant (parseFloat, tolerance) -> Phase 1A
- Waterfall semantics dominant (clawback, tier/ledger parity) -> Phase 1B
- Allocation/recycling provenance issues -> Phase 1C
