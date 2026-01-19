---
status: ACTIVE
last_updated: 2026-01-19
---

# Week 2: Foundation Hardening - Tool Routing Execution Plan

**Created**: 2025-12-19
**Status**: READY FOR EXECUTION
**Branch**: `claude/review-tech-debt-b2hJS`
**Baseline**: 72.3% pass rate (1275/1762 tests), 453 TypeScript errors
**Target**: >=90% pass rate (>=1586/1762), zero net regressions

---

## Tool Suite Overview

### Available Tools by Source

| Source | Tools | Invocation |
|--------|-------|------------|
| **Phoenix Agents** | phoenix-precision-guardian, phoenix-truth-case-runner, waterfall-specialist, xirr-fees-validator, schema-drift-checker | `Task(subagent_type="...")` |
| **Workflow Engine Skills** | tech-debt-tracker, security-scanner, dependency-guardian, test-first-change, code-formatter | Python scripts in `.claude/skills/` |
| **Workflow Engine Agents** | typescript-pro, security-engineer, test-automator, code-reviewer | `Task(subagent_type="...")` |
| **wshobson Agents** | typescript-pro, legacy-modernizer, code-reviewer, test-automator | `Task(subagent_type="...")` |
| **Repo Commands** | /phoenix-truth, /fix-auto, /test-smart, /deploy-check | Slash commands |

---

## Phase 2.1: Integration Seams (+100 tests, 1.5 days)

**Target**: 1275 -> 1375 passing (72.3% -> 78.0%)

### Cluster A: ops-webhook (17 failures) - OWNS Redis/webhook seam

**Tool Routing:**
```
PRIMARY:   systematic-debugging skill (root cause mandatory)
SECONDARY: test-automator agent (test repair strategy)
VALIDATE:  /test-smart (run affected tests)
GATE:      npm test -- ops-webhook.test.ts && baseline-check && schema-drift
```

**Execution Sequence:**
1. `test-first-change` skill - establish baseline
2. Read `tests/integration/ops-webhook.test.ts`
3. Identify Redis mock issues (missing await, timeout)
4. Fix with root cause documentation in commit
5. Run batch gate

### Cluster B: stage-validation-mode (11 failures) - USES Redis interface

**Tool Routing:**
```
PRIMARY:   test-automator agent (follows Cluster A patterns)
SECONDARY: schema-drift-checker agent (if mocks touched)
VALIDATE:  /test-smart
GATE:      npm test -- stage-validation-mode.test.ts && baseline-check
```

**Execution Sequence:**
1. Wait for Cluster A interface contract
2. Apply established Redis mocking patterns
3. Fix validation store issues
4. Run batch gate

### Cluster C: modeling-wizard (10 failures, 4 fixable)

**Tool Routing:**
```
PRIMARY:   legacy-modernizer agent (XState migration patterns)
SECONDARY: typescript-pro agent (type fixes)
VALIDATE:  npm test -- modeling-wizard-persistence.test.tsx
GATE:      baseline-check (expect 4 pass, 6 still RED)
```

**Execution Sequence:**
1. Apply Patch 1: Remove redundant dynamic imports (Tests 9-11)
2. Apply Patch 2: Fix field name `'intent'` -> `'navigationIntent'` (Test 8)
3. Document remaining 6 as RED-phase (deferred to ADR-016)
4. Run batch gate

### Wave 2: Fill to +100 Target

**Tool Routing:**
```
PRIMARY:   tech-debt-tracker skill (identify next clusters)
SECONDARY: test-automator agent (batch repair)
VALIDATE:  /test-smart
```

**Discovery Command:**
```bash
npm test 2>&1 | grep "FAIL" > current-failures.txt
# Group by test file -> pick highest failure count
```

### Phase 2.1 Completion Gate

```bash
npm run validate:schema-drift
./scripts/baseline-check.sh
# Verify: ~1375/1762 passing (78.0%)
```

---

## Phase 2.2: Truth Case Validation (+50 tests, 1.5 days)

**Target**: 1375 -> 1425 passing (78.0% -> 80.9%)

### Waterfall CA Cases (CA-009, CA-010, CA-012)

**Tool Routing:**
```
PRIMARY:   waterfall-specialist agent (clawback semantics)
SECONDARY: phoenix-precision-guardian agent (numeric drift)
TERTIARY:  parity-auditor agent (Excel parity assessment)
VALIDATE:  /phoenix-truth focus=capital
GATE:      npm test -- capital-allocation.test.ts && baseline-check
```

**Execution Sequence:**
1. Run `/phoenix-truth focus=capital` - establish baseline
2. Invoke `waterfall-specialist` for clawback logic review
3. Apply `financial-calc-correctness` skill
4. Invoke `parity-auditor` to confirm Excel parity
5. Run batch gate

**Numeric Tolerance Reference:**
| Domain | Tolerance | Rationale |
|--------|-----------|-----------|
| XIRR | 1e-7 | Excel parity |
| Dollar amounts | 0.01 | Penny precision |
| Percentages | 1e-6 | Basis point precision |

### XIRR Edge Cases (2 failures)

**Tool Routing:**
```
PRIMARY:   xirr-fees-validator agent (XIRR-specific expertise)
SECONDARY: phoenix-precision-guardian agent (precision validation)
VALIDATE:  /phoenix-truth focus=xirr
GATE:      npm test -- xirr-golden-set.test.ts && baseline-check
```

**Execution Sequence:**
1. Run `/phoenix-truth focus=xirr` - baseline
2. Invoke `xirr-fees-validator` for edge case analysis
3. Apply tolerance 1e-7 (Excel XIRR parity)
4. Run batch gate

### Phase 2.2 Completion Gate

```bash
npm run validate:schema-drift
./scripts/baseline-check.sh
/phoenix-truth  # All truth cases must pass
# Verify: ~1425/1762 passing (80.9%)
```

---

## Phase 2.3: UI/Wizard Tests (+80 tests, 1.5 days)

**Target**: 1425 -> 1505 passing (80.9% -> 85.4%)

### Pre-Implementation: Test Pyramid Classification

**Tool Routing:**
```
PRIMARY:   test-pyramid skill (level classification)
DECISION:  Unit (jsdom) vs Integration (API+DB) vs E2E (browser-only)
```

**E2E Admission Criteria (ALL must be true):**
- Browser-only behavior (beforeunload, focus/blur, clipboard)
- Cannot be tested with jsdom
- Part of critical user journey

### Cluster A: wizard-reserve-bridge

**Tool Routing:**
```
PRIMARY:   react-hook-form-stability skill
SECONDARY: test-automator agent
ESCALATE:  playwright-test-author agent (if jsdom insufficient)
GATE:      npm test -- wizard-reserve-bridge.test.ts && baseline-check
```

### Cluster B: waterfall-step component

**Tool Routing:**
```
PRIMARY:   test-pyramid skill (classify test level)
SECONDARY: code-reviewer agent (component quality)
VALIDATE:  /test-smart
GATE:      npm test -- waterfall-step.test.tsx && baseline-check
```

### Cluster C: portfolio-intelligence API routes

**Tool Routing:**
```
PRIMARY:   test-automator agent (API test patterns)
SECONDARY: schema-drift-checker agent (contract validation)
GATE:      npm test -- portfolio-intelligence.test.ts && baseline-check
```

### Phase 2.3 Completion Gate

```bash
./scripts/baseline-check.sh
./scripts/bench-check.sh  # Bundle size validation
# If bundle regressed -> perf-regression-triager agent
# Verify: ~1505/1762 passing (85.4%)
```

---

## Phase 2.4: Regression Prevention (+81 tests, 1 day)

**Target**: 1505 -> >=1586 passing (85.4% -> >=90.0%)

### Investigation Path Routing

| Symptom | Tool Routing |
|---------|--------------|
| Hanging test | systematic-debugging skill -> trace async chain |
| Stale state | code-reviewer agent -> check React deps |
| Mock drift | schema-drift-checker agent -> validate contracts |
| Race condition | test-automator agent -> add deterministic ordering |

### Categorize Remaining Failures

**Tool Routing:**
```
PRIMARY:   tech-debt-tracker skill (categorization)
SECONDARY: baseline-regression-explainer agent (if regression detected)
VALIDATE:  npm run validate:schema-drift
```

**Discovery Command:**
```bash
npm test 2>&1 | grep "FAIL" > remaining-failures.txt
npm run validate:schema-drift
```

### Defense-in-Depth (SCOPED)

**Apply ONLY for observed failures with root cause:**
```
IDEMPOTENCY:  Add if test failed from duplicate operations
LOCKING:      Add if test failed from race condition
TIMEOUT:      Add if test failed from hanging job
```

**Track deferred opportunities in ARCHITECTURAL-DEBT.md**

### Phase 2.4 / Sprint Completion Gate

```bash
# Run in order (sequential dependencies):
npm run validate:claude-infra    # 1. Infrastructure
npm run validate:schema-drift    # 2. Schema alignment
./scripts/baseline-check.sh      # 3. Quality metrics
npm run bench:check              # 4. Performance
/phoenix-truth                   # 5. Domain correctness
npm test                         # 6. Full test suite
npm run check                    # 7. TypeScript (<=453 errors)

# Verify: >=1586/1762 passing (>=90.0%)
```

---

## Tool Invocation Reference

### Phoenix Agents
```
Task(subagent_type="phoenix-precision-guardian", prompt="Validate numeric precision in CA engine")
Task(subagent_type="waterfall-specialist", prompt="Review clawback logic in waterfall tests")
Task(subagent_type="xirr-fees-validator", prompt="Analyze XIRR edge case failures")
Task(subagent_type="schema-drift-checker", prompt="Check mock/contract alignment")
```

### Workflow Engine Skills
```bash
python3 .claude/skills/workflow-engine/tech-debt-tracker/scripts/main.py --operation scan
python3 .claude/skills/workflow-engine/security-scanner/scripts/main.py --operation scan-all
```

### Repo Slash Commands
```
/phoenix-truth focus=xirr       # XIRR truth cases
/phoenix-truth focus=waterfall  # Waterfall truth cases
/phoenix-truth focus=capital    # Capital allocation cases
/phoenix-truth focus=all        # All truth cases
/test-smart                     # Affected tests only
/fix-auto                       # Auto-fix lint/format
/deploy-check                   # Full validation suite
```

### Batch Gate Template
```bash
npm test -- <test-file>
./scripts/baseline-check.sh
npm run validate:schema-drift  # If mocks/contracts touched
```

---

## Routing Decision Tree

```
START: Test failure identified
  |
  v
Is it a SEAM issue (Redis, webhook, shared mock)?
  |-- YES --> Cluster A owns seam, others wait
  |-- NO  --> Continue
  |
  v
Is it a TRUTH CASE failure?
  |-- YES --> Use domain-specific agent:
  |           - XIRR: xirr-fees-validator
  |           - Waterfall: waterfall-specialist
  |           - CA: parity-auditor + phoenix-precision-guardian
  |-- NO  --> Continue
  |
  v
Is it a UI/COMPONENT test?
  |-- YES --> Apply test-pyramid skill first
  |           - Unit: jsdom sufficient
  |           - E2E: playwright-test-author
  |-- NO  --> Continue
  |
  v
Is it a REGRESSION (was passing, now failing)?
  |-- YES --> baseline-regression-explainer agent
  |-- NO  --> systematic-debugging skill
  |
  v
Fix with root cause documentation
  |
  v
Run batch gate
  |
  v
DONE
```

---

## Progress Tracking

| Phase | Target | Tool Combination | Status |
|-------|--------|------------------|--------|
| 2.1 Cluster A | +17 | systematic-debugging + test-automator | PENDING |
| 2.1 Cluster B | +11 | test-automator + schema-drift-checker | PENDING |
| 2.1 Cluster C | +4 | legacy-modernizer + typescript-pro | PENDING |
| 2.1 Wave 2 | +68 | tech-debt-tracker + test-automator | PENDING |
| 2.2 Waterfall | +25 | waterfall-specialist + parity-auditor | PENDING |
| 2.2 XIRR | +25 | xirr-fees-validator + phoenix-precision-guardian | PENDING |
| 2.3 UI Tests | +80 | test-pyramid + playwright-test-author | PENDING |
| 2.4 Remaining | +81 | systematic-debugging + schema-drift-checker | PENDING |
| **TOTAL** | **+311** | | |

---

## Execution Authorization

Ready to execute with full tool routing. Proceed with:

- [ ] Phase 2.1 Cluster A (ops-webhook)
- [ ] Phase 2.1 Cluster B (stage-validation-mode)
- [ ] Phase 2.1 Cluster C (modeling-wizard)
- [ ] Phase 2.1 Wave 2 (fill to +100)
- [ ] Phase 2.2 (truth cases)
- [ ] Phase 2.3 (UI/wizard)
- [ ] Phase 2.4 (regression prevention)
- [ ] Sprint Gate (final validation)
