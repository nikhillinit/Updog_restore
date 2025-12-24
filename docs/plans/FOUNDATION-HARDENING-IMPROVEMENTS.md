# Foundation Hardening Strategy Improvements v5.1

**Status**: SUPPLEMENT to FOUNDATION-HARDENING-EXECUTION-PLAN.md
**Created**: 2025-12-23
**Revised**: 2025-12-24 (v5.1 - exit code consistency, safe --test-cmd parsing, JSON escaping)
**Based On**: Skills analysis + multiple external reviews + inversion thinking
**See Also**: [TRIAGE_CARD.md](../../TRIAGE_CARD.md) - Single-page reference

---

## Executive Summary

This document enhances the existing Foundation Hardening Sprint plan with:
1. **Unified Triage Flowchart** - Starts with flakiness detection, then pattern classification
2. **Six Failure Patterns** - A through F, covering all common test failure modes
3. **Priority Scoring** - Impact, confidence, effort, and blast radius
4. **Sharpened 3-Fix Rule** - Falsified hypotheses, not just attempts
5. **Failure Evidence Template** - Standard format for fix documentation
6. **Rollback Strategy** - Per-phase tags and recovery procedures

---

## 1. Inversion-Derived Do-Not Checklist

**What would make this sprint fail?** Apply these guards:

### Critical Failure Modes and Prevention

| Failure Mode | Prevention | Gate |
|--------------|------------|------|
| Symptom fixes without root cause | MANDATORY Phase 1 investigation | systematic-debugging skill |
| Shared seam contamination | Owner assignment for Redis/webhook | Hotspot ownership rule |
| Skipped batch gates | Run after EVERY cluster | Batch gate enforcement |
| Mock drift undetected | Schema-drift validation | `npm run validate:schema-drift` |
| 3+ falsified hypotheses | Architecture escalation | Sharpened 3-fix rule |
| No recovery checkpoints | Per-phase tags | Rollback protocol |

### Do-Not Checklist (Pre-Commit Verification)

Before each cluster completion:

- [ ] Did NOT skip root cause investigation (Phase 1 of systematic-debugging)
- [ ] Did NOT modify shared seams without owner coordination
- [ ] Did NOT skip batch gates
- [ ] Did NOT ignore schema-drift warnings
- [ ] Did NOT exceed 3 falsified hypotheses without escalation
- [ ] Did NOT merge without rollback tag

---

## 2. Pattern Recognition: Six Failure Modes

### Complete Pattern Taxonomy

| Pattern | Frequency | Signature | Primary Cause | Quick Checks |
|---------|-----------|-----------|---------------|--------------|
| **A: Async Race** | ~25% | "undefined", timeout, flaky | Missing `await`, floating promises | Static analysis, trace async chain |
| **B: Mock Drift** | ~20% | Type mismatch, wrong fields | Schema evolved, mocks static | `validate:schema-drift` |
| **C: Import Resolution** | ~15% | "Cannot find module" | ESM/CJS confusion, missing .ts | `tsc --noEmit` |
| **D: Type Confusion** | ~10% | Boundary conversion errors | cents vs dollars, error types | Review layer boundaries |
| **E: Shared State / Order** | ~20% | Passes alone, fails in suite | Globals, singletons, mock leakage | Run isolated, run shuffled |
| **F: Time/Timer Dependency** | ~10% | DST/locale oddities, timer hangs | Date.now, fake timers not restored | Force TZ=UTC, check pending timers |

### Pattern E: Shared State / Order Dependence (CRITICAL - Often Missed)

**Signature**:
- Passes when run alone, fails in suite
- Fails after specific other tests
- "already mocked", "already initialized", "cannot redefine property"

**Primary Causes**:
- Module-level singletons cached across tests
- Mutated globals (`process.env`, `Date`, `Math.random`, `fetch`, `localStorage`)
- Fake timers enabled in one test and not restored
- Test order dependence (file A sets something file B assumes)

**Diagnostics**:
```bash
# Run isolated (single test, fresh process)
npm test -- <test-file> --isolate

# Run with shuffled order (surface order dependence)
npm test -- <test-file> --sequence=shuffle

# Add teardown assertions
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);  // No pending timers
  vi.restoreAllMocks();                 // All mocks restored
});
```

### Pattern F: Time/Timer Dependency

**Signature**:
- Fails around clock boundaries (midnight, DST)
- Locale/timezone oddities
- Timer hangs or "timeout exceeded"

**Primary Causes**:
- `Date.now()` or `new Date()` in assertions
- `setTimeout`/`setInterval` without fake timers
- Fake timers enabled but not advanced or restored

**Diagnostics**:
```bash
# Force stable timezone
TZ=UTC npm test -- <test-file>

# Check for pending timers in teardown
afterEach(() => {
  const pending = vi.getTimerCount();
  if (pending > 0) {
    console.error(`[LEAK] ${pending} pending timers`);
    vi.runOnlyPendingTimers();
  }
});
```

---

## 3. Unified Triage Flowchart

**Key Change**: The flowchart now STARTS with flakiness detection, preventing the "read stack trace first" habit that wastes time.

```
TEST MARKED AS FAILING
         |
         v
+------------------------+
| Run detect-flaky (N=10)|
+------------------------+
         |
         +---> Mixed pass/fail (FLAKY)
         |         |
         |         v
         |     FLAKY PATH: Investigate E, A, F first
         |     1. Shared state (E): Run isolated, run shuffled
         |     2. Async race (A): Check floating promises
         |     3. Timer issues (F): Check pending timers, TZ
         |
         +---> All fail (DETERMINISTIC)
         |         |
         |         v
         |     DETERMINISTIC PATH: Classify by signature
         |         |
         |         +---> "undefined"/"null" --> Pattern A or E
         |         |
         |         +---> "type mismatch" --> Pattern B or D
         |         |
         |         +---> "Cannot find module" --> Pattern C
         |         |
         |         +---> Timeout/hang --> Pattern A or F
         |
         +---> All pass (CANNOT REPRODUCE)
                   |
                   v
               ENVIRONMENT PATH:
               - Check CI vs local differences
               - Check TZ/locale settings
               - Check parallelism/ordering
```

### First Response Actions by Path

**FLAKY PATH**:
1. Run `npm test -- <test> --isolate` (Pattern E check)
2. Run `npm test -- <test> --sequence=shuffle` (order dependence)
3. Check for floating promises with ESLint rule (Pattern A)
4. Add teardown assertions for timers/mocks (Pattern F)

**DETERMINISTIC PATH**:
1. Read full error message (not summary)
2. Match signature to pattern A/B/C/D/E/F
3. Apply pattern-specific diagnostic
4. Fix with single variable change

**ENVIRONMENT PATH**:
1. Compare CI logs with local output
2. Check `TZ`, `CI`, `NODE_ENV` settings
3. Check test parallelism settings
4. Consider CI-only test infrastructure differences

---

## 4. Priority Scoring (Enhanced)

### From Confidence-Only to Multi-Factor Scoring

**Previous**: Order clusters by confidence (expected success rate)

**Problem**: HIGH-confidence cluster might be low-impact, while MEDIUM cluster blocks everything

**New Formula**:
```
Priority Score = (Impact x Confidence) / Effort

Then apply: Blast Radius Penalty
- Shared seam (Redis/webhook/DB): -20% priority
- Independent cluster: No penalty
```

### Scoring Dimensions

| Dimension | HIGH | MEDIUM | LOW |
|-----------|------|--------|-----|
| **Impact** | >15 failing tests, blocks other clusters | 5-15 tests, some dependencies | <5 tests, independent |
| **Confidence** | Pattern match >70%, similar fix worked | Pattern match 40-70%, some unknowns | Pattern unclear, many deferred |
| **Effort** | S (<1 day) | M (1-2 days) | L (>2 days) |
| **Blast Radius** | Independent, no shared seams | Uses shared seams (follower) | Owns shared seams (owner) |

### Revised Cluster Assessment

| Cluster | Failures | Impact | Confidence | Effort | Blast | Priority |
|---------|----------|--------|------------|--------|-------|----------|
| ops-webhook | 17 | HIGH | HIGH | M | Owner (-20%) | **1st** (owns seam, do first) |
| stage-validation | 11 | MEDIUM | MEDIUM | M | Follower | 2nd (after webhook seam stable) |
| modeling-wizard | 10 (7 deferred) | LOW | LOW | L | None | 3rd (deferred tests reduce urgency) |

### Prioritization Rules

1. **Seam owners first**: Clusters that own shared infrastructure must go first
2. **Followers wait**: Clusters that depend on seams wait for owner to land interface
3. **Quick wins second**: HIGH confidence + LOW effort after seam stability
4. **Defer architectural questions**: LOW confidence clusters go last

---

## 5. Sharpened 3-Fix Rule

### Previous Definition (Vague)
> "3 failed fix attempts" -> escalate

**Problems**:
- Gameable ("I only tried 2 things")
- Penalizes healthy iteration
- Doesn't distinguish learning from spinning

### New Definition

**Escalate when ANY of**:
- **3 falsified hypotheses**: You formed 3 clear hypotheses, tested each, all were wrong
- **90 minutes without increased understanding**: Clock is ticking, no new insights
- **2 regressions introduced**: Your fixes broke other things twice

### Escalation Output Requirements

When escalating, provide:

```markdown
## Escalation: <test-name>

**Failing test**: tests/unit/example.test.ts
**Observed behavior**: Expected X, got Y
**Suspected seam**: Redis mock / DB mock / Shared utility

### Falsified Hypotheses
1. Hypothesis: Missing await in setup
   Test: Added await, still fails
   Learning: Async chain is correct

2. Hypothesis: Mock data stale
   Test: Updated mock to match schema
   Learning: Schema is current, issue elsewhere

3. Hypothesis: Import resolution
   Test: Checked tsc --noEmit
   Learning: Imports resolve correctly

### Architecture Question
Why does <seam> behave differently in test vs production?
```

---

## 6. Improved Diagnostic Commands

### Pattern A: Replace Brittle Grep with Static Analysis

**Previous** (unreliable):
```bash
grep -n "beforeEach\|afterEach..." <test-file> | xargs ...
```

**Improved** (use static analysis):
```bash
# Option 1: Run no-floating-promises rule on changed files
npx eslint --rule '@typescript-eslint/no-floating-promises: error' <test-file>

# Option 2: Search for likely floating promises
rg -n "it\(|test\(|beforeEach\(|afterEach\(" tests/** | rg "async|Promise"

# Option 3: Add to .eslintrc.cjs temporarily
# "@typescript-eslint/no-floating-promises": "error"
```

### Pattern C: Fix Import Gate Grep Exit Code

**Previous** (fails incorrectly):
```bash
npx tsc --noEmit <cluster-tests> 2>&1 | grep -c "Cannot find"  # Should be 0
```

**Problem**: `grep -c` returns exit code 1 when count is 0, failing the gate even when "0 is good"

**Fixed**:
```bash
# Use if/then pattern
if npx tsc --noEmit <cluster-tests> 2>&1 | grep -q "Cannot find module"; then
  echo "Import resolution failures detected"
  exit 1
fi
echo "Import resolution: OK"
```

---

## 7. Pattern-Specific Batch Gates (Corrected)

### Pre-Fix vs Post-Fix Gate Modes

| Phase | Command | Expected Result |
|-------|---------|-----------------|
| **Pre-fix** (classify) | `./scripts/detect-flaky.sh <test> 10` | DETERMINISTIC or FLAKY |
| **Post-fix** (verify) | `./scripts/detect-flaky.sh <test> 10 --expect-pass` | PASSING (all 10 runs) |

### Enhanced Gate Stack

```bash
# 1. Standard batch gate
npm test -- <cluster-tests>
./scripts/baseline-check.sh

# 2. Post-fix stability gate (require N consecutive passes)
./scripts/detect-flaky.sh <cluster-tests> 10 --expect-pass

# 3. Pattern-specific gates

# Pattern B: Mock drift (zero warnings required)
npm run validate:schema-drift -- --strict

# Pattern C: Import resolution (corrected grep)
if npx tsc --noEmit <cluster-tests> 2>&1 | grep -q "Cannot find module"; then
  echo "GATE FAILED: Import resolution errors"
  exit 1
fi

# Pattern E: Order independence
npm test -- <cluster-tests> --sequence=shuffle
```

---

## 8. Failure Evidence Template

**Add to every fix commit message body**:

```markdown
## Fix Evidence

**Failing test(s)**: tests/unit/example.test.ts (lines 45-67)
**Repro classification**: [flaky|deterministic|CI-only]
**Pattern**: [A|B|C|D|E|F] - <pattern name>

**Root cause** (1-2 sentences):
Missing await on Redis client.get() call in beforeEach caused
promise to hang, leaving shared state from previous test.

**Fix** (1-2 sentences):
Added await to Redis mock setup, verified mock resets between tests.

**Regression risk**: [low|medium|high]
Low - change is isolated to test setup, no production code modified.

**Gates run**:
- [x] npm test -- tests/unit/example.test.ts
- [x] ./scripts/detect-flaky.sh tests/unit/example.test.ts 10 --expect-pass
- [x] ./scripts/baseline-check.sh
- [x] npm run validate:schema-drift
```

---

## 9. Rollback Strategy

### Per-Phase Tagging Protocol

```bash
# Before starting any phase
git tag "hardening-phase2.X-start-$(date +%Y%m%d-%H%M)"

# After phase completion (gates passed)
git tag "hardening-phase2.X-complete-$(date +%Y%m%d-%H%M)"

# Push tags to remote for team visibility
git push origin --tags
```

### Rollback Procedure

```bash
# Step 1: Identify rollback target
git tag --list "hardening-*" --sort=-creatordate | head -10

# Step 2: Reset to checkpoint
git reset --hard <target-tag>

# Step 3: Restore dependencies
npm ci

# Step 4: Verify rollback success
npm test -- --reporter=dot
./scripts/baseline-check.sh

# Step 5: Document rollback reason
git commit --allow-empty -m "rollback: Phase 2.X reverted - <reason>"
```

### Rollback Triggers

**Automatic rollback** if any of:
- Phase gate fails 3 consecutive times
- Baseline regression >5% (unexpected)
- Schema drift detected post-merge

**Manual rollback decision** if:
- Cluster taking >2x estimated time
- Discovery of architectural issue
- 3 falsified hypotheses without progress

---

## 10. Integration with Existing Plan

### How to Use This Document

1. **Before Phase 2.1 starts**: Review Do-Not Checklist, set up rollback tags
2. **Before each cluster**: Run `detect-flaky` (10 runs), assess priority score
3. **During repair**: Use unified triage flowchart (flakiness first)
4. **After each fix**: Run post-fix gate (`--expect-pass`), fill evidence template
5. **After each phase**: Create completion tag, verify rollback capability

### Cross-References

- **Operating Rules** (main plan): Enhanced with Do-Not Checklist, sharpened 3-fix rule
- **Quality Gate Stack** (main plan): Enhanced with post-fix gate mode
- **Phase 2.1-2.4** (main plan): Enhanced with priority scoring
- **systematic-debugging skill**: Enhanced with test-specific adaptations, Pattern E/F

---

## Appendix A: Quick Reference Card

```
UNIFIED TRIAGE PROCESS (v5)
===========================
1. Run flakiness check: ./scripts/detect-flaky.sh <test> 10 --timeout=120
2. FLAKY?     -> Pattern E (shared state), A (async), F (timer) first
3. DETERMINISTIC? -> Classify by signature (A/B/C/D/E/F)
4. TIMEOUT?  -> Pattern F (timers/hanging) - check open handles
5. Match to pattern, apply specific diagnostic
6. Fix with single variable change
7. Run post-fix gate: ./scripts/detect-flaky.sh <test> 10 --expect-pass --fail-fast
8. Fill evidence template in commit message
9. Tag checkpoint if phase complete

FAIL-FAST SEMANTICS (v5)
========================
--expect-pass --fail-fast: stops on first FAILURE
--expect-fail --fail-fast: stops on first PASS
auto --fail-fast: stops when flakiness PROVEN (seen pass AND fail)

NEW IN v5
=========
--timeout=<s>: per-run timeout (default 300s)
--test-cmd=<c>: custom test command (yarn, pnpm)
--json: machine-readable output for CI

DO-NOT REMINDERS
================
- NO fixes without root cause
- NO shared seam edits without owner
- NO skipping batch gates
- NO ignoring schema-drift
- NO 4th falsified hypothesis (escalate!)
- NO merge without rollback tag

PATTERN SIGNATURES
==================
A (Async):    "undefined", timeout, floating promise
B (Mock):     type mismatch, wrong field names
C (Import):   "Cannot find module"
D (Type):     boundary conversion errors
E (State):    passes alone, fails in suite
F (Timer):    DST/locale, timer hangs

ESCALATION TRIGGERS
===================
- 3 falsified hypotheses
- 90 min without new understanding
- 2 regressions introduced
```

---

## Appendix B: detect-flaky.sh Usage (v5.1)

```bash
# Pre-fix: detect if test is flaky or deterministic
./scripts/detect-flaky.sh tests/unit/foo.test.ts

# Post-fix gate: require 10 consecutive passes, abort on first fail
./scripts/detect-flaky.sh tests/unit/foo.test.ts 10 --expect-pass --fail-fast

# With timeout (2 minutes per run) - prevents CI hangs
./scripts/detect-flaky.sh tests/unit/foo.test.ts 10 --timeout=120

# Custom test command (for yarn, pnpm, or custom runners)
# NOTE: Use quotes for multi-word commands
./scripts/detect-flaky.sh tests/foo.test.ts 5 --test-cmd="yarn test --"

# JSON output for CI integration (stdout is pure JSON)
./scripts/detect-flaky.sh tests/foo.test.ts 10 --json

# Classification only (always exits 0, for scripting)
./scripts/detect-flaky.sh tests/unit/foo.test.ts 10 --report-only

# Check version
./scripts/detect-flaky.sh --version
```

### Exit Code Semantics (v5.1)

| Mode | PASSING | FLAKY | DETERMINISTIC | TIMEOUT |
|------|---------|-------|---------------|---------|
| Auto (default) | exit 0 | exit 1 | exit 1 | exit 1 |
| --expect-pass | exit 0 | exit 1 | exit 1 | exit 1 |
| --expect-fail | exit 1 | exit 1 | exit 0 | exit 0 |
| --report-only | exit 0 | exit 0 | exit 0 | exit 0 |

**NOTE**: Timeouts are treated as failures (exit 1), not exit 124.
The timeout count is available in JSON output as `"timed_out": N`.

### Fail-Fast Semantics - Mode-Aware

| Mode | --fail-fast Stops When |
|------|------------------------|
| --expect-pass | First FAILURE (gate violated) |
| --expect-fail | First PASS (reproducibility violated) |
| auto | Flakiness PROVEN (seen pass AND fail) |

### v5.1 Changes (Review-Driven)

**Exit code consistency**:
- Timeouts now exit 1 (not 124) - consistent with other failures
- `--expect-fail` with timeouts exits 0 (timeouts satisfy failure requirement)
- `--report-only` always exits 0, even with timeouts

**Safe --test-cmd parsing**:
- Command string properly parsed into array
- Handles `--test-cmd="yarn test --"` correctly
- Error on invalid syntax with helpful message

**JSON output improvements**:
- `--json` implies `--no-color` automatically
- Added `"timed_out"` field separate from `"failed"`
- Added `"report_only"` to config in output
- Special characters in test target/command are escaped

### JSON Output Example (v5.1)

```json
{
  "version": "5.1.0",
  "target": "tests/unit/foo.test.ts",
  "verdict": "FLAKY",
  "runs": { "requested": 10, "completed": 5, "passed": 3, "failed": 2, "timed_out": 0 },
  "config": { "expect_mode": "auto", "fail_fast": 1, "report_only": 0, "timeout_seconds": 300, "test_cmd": "npm test --" },
  "duration_seconds": 45,
  "exit_code": 1,
  "logs_dir": "/tmp/detect-flaky.abc123"
}
```
