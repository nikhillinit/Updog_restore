# Foundation Hardening Strategy Improvements

**Status**: SUPPLEMENT to FOUNDATION-HARDENING-EXECUTION-PLAN.md
**Created**: 2025-12-23
**Based On**: Skills analysis (inversion-thinking, pattern-recognition, task-decomposition, systematic-debugging, root-cause-tracing)

---

## Executive Summary

This document enhances the existing Foundation Hardening Sprint plan with:
1. **Failure Mode Triage Flowchart** - Pattern-specific diagnostics
2. **Confidence Scoring** - Risk-adjusted cluster prioritization
3. **Flakiness Detection Protocol** - Before repair, detect intermittent failures
4. **Rollback Strategy** - Per-phase tags and recovery procedures
5. **Test Repair Debugging Enhancements** - Context-specific systematic debugging

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
| 3+ failed fix attempts | Architecture escalation | 3-fix rule |
| No recovery checkpoints | Per-phase tags | Rollback protocol |

### Do-Not Checklist (Pre-Commit Verification)

Before each cluster completion:

- [ ] Did NOT skip root cause investigation (Phase 1 of systematic-debugging)
- [ ] Did NOT modify shared seams without owner coordination
- [ ] Did NOT skip batch gates
- [ ] Did NOT ignore schema-drift warnings
- [ ] Did NOT exceed 3 fix attempts without escalation
- [ ] Did NOT merge without rollback tag

---

## 2. Pattern Recognition: Failure Mode Classification

### Identified Patterns (from commit history analysis)

| Pattern | Frequency | Signature | Diagnostic |
|---------|-----------|-----------|------------|
| **A: Async Race** | ~30% | "undefined", "timeout", flaky results | Missing `await`, non-deterministic setup |
| **B: Mock Drift** | ~25% | Type mismatch, wrong field names | Schema evolved, mocks static |
| **C: Import Resolution** | ~15% | "Cannot find module", wrong extension | ESM/CJS confusion, missing .ts |
| **D: Type Confusion** | ~10% | Boundary conversion errors | cents vs dollars, different error types |

### Failure Mode Triage Flowchart

```
TEST FAILS
    |
    v
+-------------------+
| Error message?    |
+-------------------+
    |
    +---> "undefined" or "null"
    |         |
    |         v
    |     Check async: grep "await" in setup
    |         |
    |         +---> Missing await? --> PATTERN A FIX
    |         |
    |         +---> Await present? --> Check mock data --> PATTERN B
    |
    +---> "type mismatch" or "unexpected type"
    |         |
    |         v
    |     npm run validate:schema-drift
    |         |
    |         +---> Drift detected? --> PATTERN B FIX
    |         |
    |         +---> No drift? --> Check imports --> PATTERN C
    |
    +---> "Cannot find module"
    |         |
    |         v
    |     Check import path + extension
    |         |
    |         +---> Missing .ts? --> PATTERN C FIX
    |         |
    |         +---> Path wrong? --> Check vite aliases
    |
    +---> Timeout or hangs
              |
              v
          Run with --inspect-brk
              |
              +---> Infinite loop? --> Fix algorithm
              |
              +---> Unresolved promise? --> PATTERN A FIX
```

### Pattern-Specific Diagnostic Commands

```bash
# Pattern A: Async Race Detection
# Check for missing awaits in test file
grep -n "beforeEach\|afterEach\|beforeAll\|afterAll" <test-file> | \
  xargs -I {} sh -c 'grep -A5 "{}" <test-file> | grep -v "await"'

# Pattern B: Mock Drift Detection
npm run validate:schema-drift -- --verbose <test-file>

# Pattern C: Import Resolution Check
# Verify all imports resolve
npx tsc --noEmit <test-file> 2>&1 | grep "Cannot find"

# Pattern D: Type Boundary Check
# Check for numeric conversions at boundaries
grep -n "parseFloat\|parseInt\|Number\|\.toFixed" <test-file>
```

---

## 3. Confidence-Based Cluster Prioritization

### Enhanced Cluster Assessment

| Cluster | Failures | Pattern Match | Confidence | Risk | Recommended Order |
|---------|----------|---------------|------------|------|-------------------|
| ops-webhook | 17 | 80% Pattern A | HIGH | LOW | 1st (independent seam) |
| stage-validation | 11 | 60% B, 40% A | MEDIUM | MEDIUM | 2nd (depends on webhook patterns) |
| modeling-wizard | 10 | Mixed (7 deferred) | LOW | HIGH | 3rd (architecture questions) |

### Confidence Scoring Criteria

**HIGH Confidence** (>70% expected success):
- Pattern clearly matches known fix
- Similar fix succeeded in recent PR
- Independent of other clusters
- Well-documented in existing tests

**MEDIUM Confidence** (40-70% expected success):
- Pattern partially matches
- Depends on other cluster's interface
- Some architectural uncertainty
- May require coordination

**LOW Confidence** (<40% expected success):
- Mixed or unclear patterns
- Significant architectural questions
- Many deferred tests
- High risk of regression

### Prioritization Rule

**Execute clusters in confidence order** (HIGH -> MEDIUM -> LOW):
- HIGH confidence builds momentum and patterns
- MEDIUM confidence benefits from established patterns
- LOW confidence gets maximum context from previous work

---

## 4. Flakiness Detection Protocol

### Before Repair: 5-Run Flakiness Check

```bash
#!/bin/bash
# scripts/detect-flaky.sh <test-file>

TEST_FILE=$1
PASS_COUNT=0
FAIL_COUNT=0

echo "Running flakiness detection for $TEST_FILE (5 runs)..."

for i in {1..5}; do
  if npm test -- "$TEST_FILE" --reporter=silent 2>/dev/null; then
    ((PASS_COUNT++))
    echo "Run $i: PASS"
  else
    ((FAIL_COUNT++))
    echo "Run $i: FAIL"
  fi
done

echo ""
echo "Results: $PASS_COUNT passes, $FAIL_COUNT failures"

if [ $PASS_COUNT -gt 0 ] && [ $FAIL_COUNT -gt 0 ]; then
  echo "VERDICT: FLAKY - Investigate Pattern A (async race) first"
  exit 1
elif [ $FAIL_COUNT -eq 5 ]; then
  echo "VERDICT: DETERMINISTIC - Proceed with standard repair"
  exit 0
else
  echo "VERDICT: PASSING - Test is not failing"
  exit 0
fi
```

### Flakiness Triage Path

```
Test marked as failing
    |
    v
Run detect-flaky.sh
    |
    +---> FLAKY (some passes, some fails)
    |         |
    |         v
    |     Pattern A investigation FIRST
    |     - Check for missing awaits
    |     - Check for shared state
    |     - Check for timing dependencies
    |     - Add test isolation
    |
    +---> DETERMINISTIC (all fail)
              |
              v
          Standard triage flowchart
```

---

## 5. Rollback Strategy

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

# Step 3: Restore dependencies (in case of lockfile changes)
npm ci

# Step 4: Verify rollback success
npm test -- --reporter=dot
./scripts/baseline-check.sh

# Step 5: Document rollback reason
git commit --allow-empty -m "rollback: Phase 2.X reverted due to <reason>"
```

### Rollback Triggers

**Automatic rollback** if any of:
- Phase gate fails 3 consecutive times
- Baseline regression >5% (unexpected)
- Schema drift detected post-merge

**Manual rollback decision** if:
- Cluster taking >2x estimated time
- Discovery of architectural issue
- Team morale/velocity concern

---

## 6. Test Repair-Specific Debugging Enhancements

### Enhanced systematic-debugging for Test Repair

#### Phase 1: Root Cause Investigation (Test Context)

**Standard steps** plus:

```bash
# Test isolation check
npm test -- <failing-test> --isolate

# Test ordering check
npm test -- <failing-test> --sequence=first
npm test -- <all-tests-in-file>  # Compare results

# Find regression commit (if recently passing)
git bisect start HEAD <last-green-commit>
git bisect run npm test -- <failing-test>
```

**Debug logging pattern for tests**:

```typescript
// Add to test file temporarily
beforeEach(() => {
  console.error('[TEST-DEBUG] Setup:', {
    testName: expect.getState().currentTestName,
    mocks: Object.keys(vi.mocked || {}),
    timestamp: Date.now(),
  });
});

afterEach(() => {
  console.error('[TEST-DEBUG] Teardown:', {
    pendingTimers: vi.getTimerCount?.() || 'N/A',
  });
});
```

#### Phase 2: Pattern Analysis (Test Context)

**Compare with PASSING tests**:
```bash
# Find similar passing tests in same file
grep -l "describe.*$(basename <failing-test> .test.ts)" tests/**/*.test.ts
```

**Match against failure patterns**:
- If async-related error -> Pattern A
- If type/schema error -> Pattern B
- If import error -> Pattern C
- If conversion error -> Pattern D

#### Phase 3: Hypothesis Testing (Test Context)

**Single variable rule** - modify ONE of:
- Mock data
- Setup/teardown timing
- Import path
- Type assertion

**Shared seam rule**:
If hypothesis involves shared infrastructure (Redis mocks, DB mocks, webhook handlers):
1. STOP direct modification
2. Coordinate with seam owner
3. Document interface contract needed
4. Wait for owner's change to land

#### Phase 4: Implementation (Test Context)

**Verification sequence**:
```bash
# 1. Fix applied
# 2. Single test passes
npm test -- <fixed-test>

# 3. All tests in file pass (no regression)
npm test -- <test-file>

# 4. Batch gate passes
./scripts/baseline-check.sh
npm run validate:schema-drift
```

---

## 7. Pattern-Specific Batch Gates

### Enhanced Gate Stack

After standard batch gate, add pattern-specific validation:

```bash
# Standard batch gate
npm test -- <cluster-tests>
./scripts/baseline-check.sh

# Pattern A suspected (async issues)
npm run detect-flaky -- <cluster-tests>  # Should return "DETERMINISTIC"

# Pattern B suspected (mock drift)
npm run validate:schema-drift -- --strict  # Zero warnings required

# Pattern C suspected (import issues)
npx tsc --noEmit <cluster-tests> 2>&1 | grep -c "Cannot find"  # Should be 0

# Pattern D suspected (type boundaries)
# Manual review of numeric conversions at layer boundaries
```

---

## 8. Integration with Existing Plan

### How to Use This Document

1. **Before Phase 2.1 starts**: Review Do-Not Checklist, set up rollback tags
2. **Before each cluster**: Run flakiness detection, assess confidence
3. **During repair**: Use triage flowchart for first response
4. **After each fix**: Run pattern-specific batch gates
5. **After each phase**: Create completion tag, verify rollback capability

### Cross-References

- **Operating Rules** (main plan): Enhanced with Do-Not Checklist
- **Quality Gate Stack** (main plan): Enhanced with pattern-specific gates
- **Phase 2.1-2.4** (main plan): Enhanced with confidence scoring
- **systematic-debugging skill**: Enhanced with test-specific adaptations

---

## Appendix: Quick Reference Card

```
TRIAGE QUICK START
==================
1. Run flakiness check: ./scripts/detect-flaky.sh <test>
2. If FLAKY: Pattern A (async) first
3. If DETERMINISTIC: Use triage flowchart
4. Match to Pattern A/B/C/D
5. Apply pattern-specific diagnostic
6. Fix with single variable change
7. Run batch gate + pattern gate
8. Tag checkpoint if phase complete

DO-NOT REMINDERS
================
- NO fixes without root cause
- NO shared seam edits without owner
- NO skipping batch gates
- NO ignoring schema-drift
- NO 4th fix attempt (escalate)
- NO merge without rollback tag
```
