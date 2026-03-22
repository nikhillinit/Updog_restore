---
status: ACTIVE
audience: agents
last_updated: 2025-12-16
categories: [testing, quality, sprint-planning]
keywords: [foundation-hardening, test-repair, quality-gates, v4-infrastructure]
source_of_truth: true
agent_routing:
  priority: 1
  route_hint: 'Execution-ready plan for Foundation Hardening Sprint'
  use_cases: [test_repair, quality_improvement, sprint_execution]
maintenance:
  owner: 'Core Team'
  review_cadence: 'Post-sprint'
supersedes: FOUNDATION-HARDENING-PLAN.md
related_prs: [282]
---

# Foundation Hardening Sprint - FINAL Execution Plan v4

**Status**: READY FOR EXECUTION **Created**: 2025-12-16 **v4 Infrastructure**:
VERIFIED (PR #282 merged Dec 16, 2025) **Baseline**: 72.3% pass rate (1275/1762
tests), 453 TypeScript errors **Target**: ≥90% pass rate (≥1586/1762), zero net
regressions

---

## Progress Tracking

### Pass-Rate Milestones

| Phase        | Target Passing Tests | Delta vs Baseline | Cumulative Gain |
| ------------ | -------------------- | ----------------- | --------------- |
| Start        | 1275/1762 (72.3%)    | —                 | —               |
| 2.1 Complete | 1375/1762 (78.0%)    | +100              | +100            |
| 2.2 Complete | 1425/1762 (80.9%)    | +50               | +150            |
| 2.3 Complete | 1505/1762 (85.4%)    | +80               | +230            |
| 2.4 Complete | ≥1586/1762 (≥90.0%)  | +81               | +311            |

Use this table to track progress and identify if strategy adjustments are
needed.

---

## Related Documents

- [Implementation Parity Integration Strategy](docs/plans/IMPLEMENTATION-PARITY-INTEGRATION-STRATEGY.md) -
  How divergence assessment integrates with this sprint
- [Architectural Debt Registry](docs/ARCHITECTURAL-DEBT.md) - Deferred
  refactoring opportunities discovered during sprint
- [Comprehensive Divergence Assessment](docs/plans/COMPREHENSIVE-DIVERGENCE-ASSESSMENT.md) -
  Analysis of 22 recent PRs
- [Fee Alignment Review](docs/plans/FOUNDATION-HARDENING-FEE-ALIGNMENT-REVIEW.md) -
  Fee-specific divergence analysis

---

## Operating Rules

### Execution Mode Clarification

This sprint is primarily **Test Repair** (fixing ~487 existing failures), not
net-new feature TDD.

**IMPORTANT:** Implementation divergence issues (XIRR, Capital Allocation,
Waterfall, Fees) are documented in
[ARCHITECTURAL-DEBT.md](docs/ARCHITECTURAL-DEBT.md) but **DEFERRED** to
post-hardening Implementation Parity Sprint unless they **BLOCK** test repair.
See
[Integration Strategy](docs/plans/IMPLEMENTATION-PARITY-INTEGRATION-STRATEGY.md)
for triage decision tree.

- **Test Repair (default):** Reproduce → Root cause → Fix logic/mocks → Existing
  tests pass → Prove with gates
- **TDD (limited use):** Only when a real coverage gap is discovered during
  repair (i.e., bug can't be expressed with existing tests)

**MANDATORY:** Follow systematic-debugging skill. No fixes without root-cause
investigation first.

### Root Cause Documentation (Lightweight)

Use **structured git commit messages** following Conventional Commits pattern:

```
fix(ops-webhook): resolve Redis mock timeout issue

Root cause: Missing await on Redis client.get() call in webhook handler
caused promise to hang indefinitely in test environment.

Investigation: Traced async chain via debug logging, confirmed missing
await at line 142 of webhook-handler.ts.

Fix: Added await, verified with npm test -- ops-webhook.test.ts

Gates: baseline-check ✓, schema-drift ✓
```

This captures root cause in git history (permanent, searchable, tied to code)
without separate artifact management.

### Baseline-Check Policy (Balanced)

**Default:** All metrics must improve or stay same (no regressions)

**Exception:** Regressions allowed ONLY if:

1. Documented in root cause (git commit message)
2. Justified as necessary trade-off (e.g., fixing runtime crash requires type
   unsafety)
3. Reviewed by baseline-regression-explainer agent
4. Explicitly approved in PR

**Examples of acceptable regressions:**

- Fix 100 tests, add 2 TS errors because real types were previously wrong (net
  positive)
- ESLint catches 3 new issues in files we touched (improvement in code quality
  awareness)

**Examples of unacceptable regressions:**

- Add bundle size without justification
- Introduce new TS errors unrelated to the fix

### Hotspot Ownership

If multiple clusters touch a shared seam (Redis mocks, webhook handlers, shared
test harness):

1. **Assign one owner** - Only the owner edits seam files
2. **Followers prepare** - Can write scaffolding/docs/test data but wait to
   integrate until owner lands the seam
3. **Interface contracts** - Owner documents interface contract for followers to
   implement against

---

## Quality Gate Stack

### Batch Gate (After Each Cluster)

Run after completing each cluster (ops-webhook, stage-validation, wizard, etc.):

```bash
# 1. Test the specific cluster
npm test -- <cluster-test-file>

# 2. Run baseline check
./scripts/baseline-check.sh

# 3. If mocks/contracts/schema touched (NEW - Phase 2.1 critical)
npm run validate:schema-drift
```

**Purpose:** Catch issues immediately, prevent drift propagation to dependent
clusters

### Phase Gate (After All Clusters in Phase)

**If ALL batch gates passed cleanly:**

```bash
# Run only NEW validators (skip redundant npm test)
npm run validate:schema-drift
# If truth cases touched:
/phoenix-truth focus=<domain>
# If UI bundles touched:
npm run bench:check
```

**If ANY batch gate required fixes:**

```bash
# Run FULL gate stack to verify fixes didn't introduce cross-cluster issues
npm test -- <phase-relevant-tests>
./scripts/baseline-check.sh
npm run validate:schema-drift
/phoenix-truth focus=<domain>  # if applicable
npm run bench:check  # if applicable
```

**Purpose:** Verify phase completion, run broader integration checks

### Sprint Gate (Before Merge)

Run in order (sequential dependencies):

```bash
# 1. Infrastructure integrity
npm run validate:claude-infra

# 2. Schema alignment
npm run validate:schema-drift

# 3. Quality metrics
./scripts/baseline-check.sh

# 4. Performance (if UI changed)
npm run bench:check

# 5. Domain correctness (all relevant suites)
/phoenix-truth

# 6. Full test suite
npm test

# 7. TypeScript baseline
npm run check  # Must be ≤453 errors (or justified exception)
```

**Purpose:** Final safety net before merge, all validators passing

---

## PHASE 1: Claude Opus 4.5 Migration (1-2 hours)

### Critical Decision Point

**DO NOT add `effort` parameter unless your provider adapter explicitly supports
it.**

This migration focuses on **model string updates only**. The `effort` parameter
is an optional follow-up experiment, not part of this sprint.

### Step 1: Repo-Wide Search

```bash
rg "claude-sonnet-4-5-20250929" --type ts --type js
rg "anthropic\.claude-sonnet" --type ts --type js  # Bedrock variants
```

**Expected result:** List of all files with old model strings

### Step 2: Update Model Strings

**Primary locations (known):**

- [server/routes/interleaved-thinking.ts:274](server/routes/interleaved-thinking.ts#L274)
- [tests/integration/interleaved-thinking.test.ts](tests/integration/interleaved-thinking.test.ts)

**Replace:** `'claude-sonnet-4-5-20250929'` → `'claude-opus-4-5-20251101'`

### Step 3: Verify Complete Migration

```bash
# Re-run search - should return ZERO matches
rg "claude-sonnet-4-5-20250929" --type ts --type js
```

### Step 4: Configuration Check

```bash
grep "CLAUDE_MODEL" .env.local  # Should show opus-4-5-20251101
```

No beta header removal needed (prompt-caching is stable).

### Step 5: Batch Gate

```bash
npm test -- tests/integration/interleaved-thinking.test.ts
./scripts/baseline-check.sh  # TS errors must be ≤453
```

### Completion Criteria

- Zero old model strings in codebase
- All interleaved-thinking tests pass
- TypeScript errors ≤453 (baseline maintained)
- Structured commit message documents migration

---

## PHASE 2: Foundation Hardening Sprint (4-6 days)

### Pre-Flight: Verify v4 Infrastructure (30 minutes)

**v4 was merged via PR #282 on Dec 16, 2025. Verify, don't recreate.**

```bash
# 1. Confirm PR merge
git log --oneline --grep="#282" | head -1

# 2. Verify 4 validator scripts
ls -la scripts/baseline-check.sh scripts/validate-schema-drift.sh \
       scripts/validate-claude-infra.ts scripts/bench-check.sh

# 3. Verify 5 diagnoser agents
ls -la .claude/agents/{baseline-regression-explainer,schema-drift-checker,\
perf-regression-triager,parity-auditor,playwright-test-author}.md

# 4. Verify 6 quality gate skills
ls -la .claude/skills/{test-pyramid,statistical-testing,\
react-hook-form-stability,baseline-governance,\
financial-calc-correctness,claude-infra-integrity}/

# 5. Install missing deps (if needed)
npm i -D js-yaml @types/js-yaml tsx

# 6. Verify integrity
npm run validate:claude-infra

# 7. Establish baseline
git tag baseline-pre-hardening-20251216
./scripts/baseline-check.sh
```

**Deliverable:** v4 infrastructure verified, baseline tagged

---

### Phase 2.1: Integration Seams + Low-Hanging Fruit (+100 tests, 1.5 days)

**Target:** 1375/1762 passing (78.0%)

#### Wave 1: Known High-Value Targets (+32 minimum)

**Revised Estimate**: Cluster A (17) + Cluster B (11) + Cluster C (4) = **32
tests minimum** (updated from 31)

**Cluster A (Owner): ops-webhook (17 failures) - OWNS Redis/webhook seam**

Responsibilities:

1. Fix Redis client mocks
2. Fix webhook operation mocking
3. **Document interface contract** for Cluster B

Tools:

- ThinkingMixin deep reasoning ($0.10 budget)
- systematic-debugging skill (NO fixes without root cause)
- If regression → delegate to baseline-regression-explainer

**Batch Gate:**

```bash
npm test -- tests/integration/ops-webhook.test.ts
./scripts/baseline-check.sh
npm run validate:schema-drift  # NEW: Catch seam drift immediately
```

**Cluster B (Follower): stage-validation-mode (11 failures) - USES Redis
interface**

Preparation work (while Cluster A in progress):

1. Write test scaffolding
2. Document expected behaviors
3. Prepare test data

Integration work (after Cluster A completes): 4. Use established Redis mocking
patterns (don't modify seam) 5. Fix validation store issues 6. If drift detected
→ delegate to schema-drift-checker

Tools:

- memory-enabled test-repair agent
- baseline-governance skill

**Batch Gate:**

```bash
npm test -- tests/unit/stage-validation-mode.test.ts
./scripts/baseline-check.sh
npm run validate:schema-drift
```

**Cluster C (Parallel): modeling-wizard (10 failures, 3-4 fixable) -
INDEPENDENT**

**Actual Scope**: 10 total test failures, but only 3-4 are fixable in Phase 2.1:

- **3 fixable now**: Import path issues (2 tests) + field name mismatch (1 test)
- **7 deferred (RED-phase)**: Intentional failures for future ADR-016 refactor
  (persistence-before-navigation invoke pattern)

**Expected Gain**: +4 tests passing (from 0/10 to 4/10), **not +3 as originally
estimated**

Pre-requisite: Create `wizard-state-model.md` ✅ (COMPLETED - see
[docs/wizard-state-model.md](docs/wizard-state-model.md))

**Preparation Work** (COMPLETED):

1. ✅ State model documented (XState v5 with localStorage persistence)
2. ✅ Architectural issue identified (action ordering bug: navigation before
   persistence)
3. ✅ Root cause analysis complete (see
   [docs/staging/phase2.1/cluster-c-modeling-wizard-prep.md](docs/staging/phase2.1/cluster-c-modeling-wizard-prep.md))
4. ✅ Minimal patches ready
   ([docs/staging/phase2.1/cluster-c-patch-\*.diff](docs/staging/phase2.1/))

**Execution Strategy**: Test Repair (not TDD)

1. Apply Patch 1: Remove 3 redundant dynamic imports (fixes Tests 9-11)
2. Apply Patch 2: Fix field name mismatch `'intent'` → `'navigationIntent'`
   (fixes Test 8)
3. Skip or document remaining 7 RED-phase tests (deferred to ADR-016)

**Batch Gate:**

```bash
npm test -- tests/unit/modeling-wizard-persistence.test.tsx
# Expected: 4 pass, 7 fail (down from 0 pass, 10 fail)

./scripts/baseline-check.sh
# Expected: +4 tests, ≤453 TS errors

# No schema drift check (independent, no shared seams)
```

**Reference Docs**:

- State model: [docs/wizard-state-model.md](docs/wizard-state-model.md)
- Prep guide:
  [docs/staging/phase2.1/cluster-c-modeling-wizard-prep.md](docs/staging/phase2.1/cluster-c-modeling-wizard-prep.md)
- Quick start:
  [docs/staging/phase2.1/cluster-c-APPLY-PATCHES.md](docs/staging/phase2.1/cluster-c-APPLY-PATCHES.md)

#### Wave 2: Fill to +100 Target

After Wave 1 completes (+31 minimum), identify next clusters:

```bash
# 1. Get current failure list
npm test 2>&1 | grep "FAIL" > current-failures.txt

# 2. Group failures by:
#    - Same test file (easy: shared setup/mocks)
#    - Same error message (medium: likely shared root cause)
#    - Same module under test (harder: may be unrelated)

# 3. Pick cluster with highest failure count from easy/medium categories
# 4. Repeat until +100 target reached
```

**Don't over-analyze** - use test file and error message as primary grouping,
not deep stack trace analysis.

#### Phase 2.1 Completion Gate

```bash
# If all batch gates passed cleanly:
npm run validate:schema-drift  # Final schema alignment check
./scripts/baseline-check.sh    # Verify cumulative progress

# Verify milestone:
# Current: ~1375/1762 passing (78.0%, +100 from baseline)
```

---

### Phase 2.2: Truth Case Validation (+50 tests, 1.5 days)

**Target:** 1425/1762 passing (80.9%)

#### Numeric Tolerance Standards (Reference Only)

Use **domain-appropriate tolerances** per existing test standards:

| Domain                  | Tolerance | Reference Test                               | Rationale             |
| ----------------------- | --------- | -------------------------------------------- | --------------------- |
| XIRR                    | 1e-7      | xirr-golden-set.test.ts:EXCEL_TOLERANCE      | Excel parity          |
| Dollar amounts          | 0.01      | capital-allocation.test.ts:NUMERIC_TOLERANCE | Penny precision       |
| Percentages             | 1e-6      | reserves.property.test.ts                    | Basis point precision |
| Relative (large values) | 0.001     | truthCaseRunner.test.ts                      | 0.1% tolerance        |

**Parity auditor reviews all deviations.** Do NOT apply universal epsilon—use
domain-specific standards.

#### Waterfall CA Cases (CA-009, CA-010, CA-012)

**Deterministic math validation (NOT Promptfoo):**

```bash
# Step 1: Delegate to waterfall-specialist agent
# Apply financial-calc-correctness skill (Excel parity methodology)

# Step 2: After fixes, assess impact
# Delegate to parity-auditor agent with:
# - CA case changes
# - Excel reference values
# - Domain-specific tolerance from table above

# Step 3: Validate truth cases
/phoenix-truth focus=capital

# Step 4: If numeric drift detected
# Invoke phoenix-precision-guardian agent
# Document intentional deviations in parity-auditor report
```

**Hard gates (sequential):**

1. `/phoenix-truth focus=capital` passes (deterministic)
2. `parity-auditor` confirms Excel parity preserved OR documents justified
   deviation
3. `phoenix-precision-guardian` confirms precision within tolerance

**Batch Gate per CA case:**

```bash
npm test -- tests/unit/truth-cases/capital-allocation.test.ts
./scripts/baseline-check.sh
/phoenix-truth focus=capital
```

#### XIRR Edge Cases (2 failures)

```bash
# Step 1: Delegate to xirr-fees-validator agent
# Apply statistical-testing skill
# Use XIRR tolerance: 1e-7 (per existing standard)

# Step 2: Validate
/phoenix-truth focus=xirr

# Step 3: Pattern learning
# Document in native memory (tenant: agent:xirr-fees-validator)
```

**Batch Gate:**

```bash
npm test -- tests/unit/xirr-golden-set.test.ts
./scripts/baseline-check.sh
/phoenix-truth focus=xirr
```

#### Phase 2.2 Completion Gate

```bash
npm run validate:schema-drift
./scripts/baseline-check.sh
/phoenix-truth  # All truth cases must pass

# Verify milestone:
# Current: ~1425/1762 passing (80.9%, +150 cumulative)
```

**Promptfoo usage:** Documentation validation ONLY (not for math validation)

---

### Phase 2.3: UI/Wizard Tests (+80 tests, 1.5 days)

**Target:** 1505/1762 passing (85.4%)

#### Pre-Implementation: Test Pyramid Classification

For each failing test, apply test-pyramid skill:

```bash
# 1. Can this be tested at unit level? (jsdom sufficient)
# 2. Requires integration level? (API + DB)
# 3. Requires E2E level? (browser-only behavior)
```

**E2E Admission Criteria (ALL must be true):**

- Browser-only behavior (beforeunload, focus/blur, clipboard)
- Cannot be tested with jsdom
- Part of critical user journey

**Hard gate:** All new E2E tests MUST meet admission criteria

#### Execution: Test Repair vs. TDD

**For existing failing tests (default):**

1. Reproduce with systematic-debugging skill
2. Root cause investigation (mandatory)
3. Fix logic/mocks
4. Existing test passes

**For coverage gaps (limited TDD):**

1. RED: Write failing test
2. GREEN: Minimal implementation
3. REFACTOR: Apply code-simplifier

#### Parallel Clusters

**Cluster A: wizard-reserve-bridge**

```bash
# Pre-req: wizard-state-model.md from Phase 2.1
# Apply react-hook-form-stability skill
# If jsdom limits → delegate to playwright-test-author

# Batch Gate:
npm test -- tests/unit/wizard-reserve-bridge.test.ts
./scripts/baseline-check.sh
```

**Cluster B: waterfall-step component**

```bash
# Apply test-pyramid for level classification
# Mode: Test repair primarily

# Batch Gate:
npm test -- tests/unit/waterfall-step.test.tsx
./scripts/baseline-check.sh
```

**Cluster C: portfolio-intelligence API routes**

```bash
# Integration level (API + DB)
# No E2E needed

# Batch Gate:
npm test -- tests/unit/api/portfolio-intelligence.test.ts
./scripts/baseline-check.sh
```

#### Phase 2.3 Completion Gate

```bash
./scripts/baseline-check.sh  # Quality metrics
./scripts/bench-check.sh      # Bundle size

# If bundle size regressed:
# Delegate to perf-regression-triager
# Require justification or optimization

# Verify milestone:
# Current: ~1505/1762 passing (85.4%, +230 cumulative)
```

---

### Phase 2.4: Regression Prevention (+81 tests, 1 day)

**Target:** ≥1586/1762 passing (≥90.0%)

#### Investigation Paths (Diagnostic Hints)

Use this table to guide root cause investigation. **MANDATORY:** Follow
systematic-debugging.md Phase 1 before applying ANY fix.

| Symptom        | Common Root Causes                                                              | Investigation Steps                                                                      |
| -------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Hanging test   | 1) Missing await<br>2) Infinite loop<br>3) Missing timeout                      | Add debug logging<br>Profile execution<br>Trace async chain<br>Check unbounded recursion |
| Stale state    | 1) Cache invalidation missing<br>2) Race condition<br>3) Wrong dependency array | Trace state updates<br>Check React deps<br>Add state logging<br>Verify useEffect deps    |
| Mock drift     | 1) Schema changed<br>2) API contract updated<br>3) Mock data stale              | Run validate:schema-drift<br>Check API version<br>Compare with real data                 |
| Race condition | 1) Missing await<br>2) Parallel mutations<br>3) Async timing                    | Add deterministic ordering<br>Check promise chains<br>Verify transactions                |

**⚠️ Do NOT apply fixes based on symptom alone.** Use table for investigation
direction only.

#### Categorize Remaining 33 Failures

```bash
# 1. Get failure list
npm test 2>&1 | grep "FAIL" > remaining-failures.txt

# 2. Group by investigation path:
#    - API failures → Check schema drift first
#    - UI failures → Check React deps, state management
#    - Integration failures → Check transaction boundaries
#    - Unit failures → Check isolated logic, mocks

# 3. Run schema drift check across all
npm run validate:schema-drift
# If drift → delegate to schema-drift-checker
```

#### Defense-in-Depth (SCOPED)

**Apply ONLY where fixing observed failures:**

```bash
# Acceptable (after root cause):
# - Add idempotency IF test failed from duplicate operations
# - Add locking IF test failed from race condition
# - Add timeout IF test failed from hanging job

# OUT OF SCOPE:
# - Blanket hardening without observed failures
# - Preventive refactoring unrelated to tests
```

**Track deferred opportunities:**

```markdown
# ARCHITECTURAL-DEBT.md (created during sprint)

## Idempotency Improvements (Discovered Phase 2.4)

- [Specific locations where idempotency would help]
- Priority: Medium | Effort: 3-5 days

## Optimistic Locking Gaps (Discovered Phase 2.1)

- [Race condition vulnerabilities]
- Priority: High | Effort: 2-3 days
```

#### Phase 2.4 Completion - Sprint Gate

Run in order (sequential):

```bash
# 1. Infrastructure
npm run validate:claude-infra

# 2. Schema
npm run validate:schema-drift

# 3. Quality
./scripts/baseline-check.sh

# 4. Performance
npm run bench:check

# 5. Domain
/phoenix-truth

# 6. Tests
npm test

# 7. TypeScript
npm run check  # Must be ≤453 errors
```

**Verify final milestone:**

```bash
# Current: ≥1586/1762 passing (≥90.0%, +311 cumulative)
# TypeScript: ≤453 errors
# All gates: PASSING
```

#### Continuous Improvement

After EACH batch in Phase 2.4, apply continuous-improvement skill:

1. What worked well?
2. What was inefficient?
3. What surprised us?
4. How can we improve clarity?
5. What will we do differently next time?

**Document patterns in native memory** (tenant: agent:test-repair)

---

### Post-Sprint: Baseline Update & Documentation

#### Baseline Ratcheting

```bash
./scripts/baseline-check.sh --update all "Foundation Hardening complete: 90%+ pass rate"

git add .baselines/
git commit -m "chore: Update quality baselines after Foundation Hardening Sprint

- Test pass rate: 72.3% → 90%+ (+311 tests)
- TypeScript errors: ≤453 (baseline maintained)
- All Phoenix truth cases: PASSING
- Schema drift: 0 violations
- Bundle size: Within tolerance"
```

#### Documentation Updates

**CAPABILITIES.md:**

- Add investigation paths table (diagnostic hints)
- Document agent delegation patterns learned
- Update decision tree if workflow changed

**CHANGELOG.md:**

```
## 2025-12-XX - Foundation Hardening Sprint Complete

- Test pass rate improved: 72.3% → 90.X% (+XXX tests)
- v4 infrastructure validated (4 validators, 5 diagnosers, 6 skills)
- All Phoenix truth cases passing
- Schema drift eliminated
```

**ARCHITECTURAL-DEBT.md (NEW):** Document deferred hardening opportunities with
priority/effort estimates

#### PR Creation

```markdown
## Foundation Hardening Sprint - Results

### Metrics

- **Before:** 72.3% (1275/1762)
- **After:** 90.X% (XXXX/1762)
- **Improvement:** +XXX tests
- **TypeScript:** ≤453 errors (baseline maintained)

### Quality Gates (All Passing)

- [x] validate:claude-infra
- [x] validate:schema-drift
- [x] baseline-check.sh
- [x] bench:check
- [x] /phoenix-truth
- [x] npm test
- [x] npm run check

### Phase Breakdown

- Phase 2.1 (Integration Seams): +XXX tests
- Phase 2.2 (Truth Cases): +XX tests
- Phase 2.3 (UI/Wizard): +XX tests
- Phase 2.4 (Regression Prevention): +XX tests

### v4 Infrastructure

- Cluster-level schema drift detection (prevented propagation)
- Three-tier gate stack (batch → phase → sprint)
- Pass-rate milestone tracking
- Structured commit messages (root cause documentation)

### Deferred Work

See ARCHITECTURAL-DEBT.md for hardening opportunities
```

---

## Success Criteria

### MUST ACHIEVE (Blocking)

- [x] Test pass rate ≥90% (≥1586/1762)
- [x] TypeScript errors ≤453 (or justified exceptions with approval)
- [x] ALL Phoenix truth cases passing
- [x] ALL 7 sprint gates passing
- [x] Schema drift = 0
- [x] Bundle size within tolerance (+5% or justified)
- [x] All E2E tests meet admission criteria
- [x] All fixes have documented root cause (commit messages)

### NICE TO HAVE (Informational)

- [ ] Test pass rate ≥95% (≥1674/1762)
- [ ] TypeScript errors <400
- [ ] Test pyramid distribution ~80/15/5 (tracked, not blocked)
- [ ] Performance improvements documented

---

## Estimated Timeline

**Total:** 4-6 days

**Breakdown:**

- Phase 1 (Opus Migration): 1-2 hours
- v4 Verification: 30 minutes
- Phase 2.1 (Integration Seams): 1.5 days
- Phase 2.2 (Truth Cases): 1.5 days
- Phase 2.3 (UI/Wizard): 1.5 days
- Phase 2.4 (Regression Prevention): 1 day
- Documentation & PR: 2-3 hours

---

## Rollback Plan

### Full Rollback

```bash
git reset --hard baseline-pre-hardening-20251216
git clean -fd
npm ci
npm run doctor:links
```

### Phase-Level Rollback

Baseline snapshots at each phase gate allow partial rollback to last passing
phase.

### v4 Infrastructure Issues

- v4 already merged (PR #282) - cannot remove
- Can disable specific validators temporarily in package.json
- File issue, continue sprint without blocking gate

---

## Key Principles

1. **Test Repair First** - Fix existing failures via root cause, not new TDD
2. **Systematic Debugging** - NO fixes without root cause (Iron Law)
3. **Validator-Diagnoser** - CI detects → agents diagnose → implementers fix
4. **Domain-Specific Standards** - Use existing tolerances (no universal
   epsilon)
5. **Investigation Paths** - Guide diagnosis, don't prescribe fixes
6. **Simple Branching** - main + feature only, interface contracts for seams
7. **Cluster-Level Gates** - Catch drift immediately (NEW - high value)
8. **Batch-Level Baseline** - Run gates at cluster/phase/sprint boundaries
9. **Scoped Defense-in-Depth** - Only for observed failures with root causes
10. **Evidence Before Claims** - verification-before-completion enforced

---

## KICKOFF PROMPT (For New Conversation)

Copy this prompt to start execution in a fresh conversation:

```
I'm starting the Foundation Hardening Sprint to improve test pass rate from 72.3% → ≥90% (+311 tests minimum).

**Context:**
- Baseline: 1275/1762 tests passing (72.3%), 453 TypeScript errors
- v4 infrastructure verified (PR #282 merged Dec 16, 2025)
- 4 validator scripts, 5 diagnoser agents, 6 quality gate skills operational
- Execution plan: FOUNDATION-HARDENING-EXECUTION-PLAN.md

**Starting with Phase 1: Claude Opus 4.5 Migration (1-2 hours)**

Please execute Phase 1 following the plan:

1. Repo-wide search for old model strings
2. Update to claude-opus-4-5-20251101
3. Verify zero old strings remain
4. Run batch gate (tests + baseline-check)
5. Document in structured commit message

**Key Operating Rules:**
- Test Repair mode (not TDD) - root cause investigation mandatory
- Use systematic-debugging skill (NO fixes without root cause)
- Structured commit messages with root cause documentation
- Run batch gates after each cluster
- Cluster-level schema drift detection (NEW)

**Progress Tracking:**
Track against pass-rate milestones table:
- Phase 2.1: 1375/1762 (+100)
- Phase 2.2: 1425/1762 (+150 cumulative)
- Phase 2.3: 1505/1762 (+230 cumulative)
- Phase 2.4: ≥1586/1762 (+311 cumulative)

**Gate Stack:**
- Batch: npm test + baseline-check + schema-drift (if mocks/contracts touched)
- Phase: batch gates + truth cases + bench-check (optimized if batch gates clean)
- Sprint: Full 7-validator stack before merge

Begin with Phase 1. Apply verification-before-completion skill - show me gate output before claiming complete.
```
