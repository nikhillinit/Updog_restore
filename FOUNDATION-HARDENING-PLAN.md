# Foundation Hardening Sprint (Deferred - Scope Documentation Only)

**Status:** NOT STARTED (awaiting Phase 0-1 commit) **Prepared:** 2025-12-15
**Baseline Reference:** baseline-pre-hygiene-20251215

## Current State (Evidence-Based)

- Test Pass Rate: 72.3% (1275/1762 passing)
- Test Files: 52 passed, 56 failed, 3 skipped (111 total)
- TypeScript Errors: 453 (baseline maintained)
- Worktrees: 1 (main only, 100% consolidation)
- Environment: Node v20.19.0, npm 10.9.2

## Target State

- Test Pass Rate: 90%+ (≥1586/1762 passing)
- TypeScript Errors: 453 (no regressions permitted)
- Test Files: ≥100 passing (≤11 failing allowed)
- Required Improvement: +311 tests minimum (from 1275 → 1586)

## Top Failure Categories (From Baseline Analysis)

**Top 20 Failing Test Files (by failure count):**

1. integration/ops-webhook.test.ts - 17 failures (webhook operations)
2. unit/modeling-wizard-persistence.test.tsx - 10 failures (wizard state)
   [UPDATED: 3-4 fixable, 7 RED-phase]
3. unit/api/portfolio-intelligence.test.ts - 3 failures (portfolio APIs)
4. unit/stage-validation-mode.test.ts - 11 failures (validation store)
5. unit/xirr-golden-set.test.ts - 2 failures (XIRR edge cases)
6. unit/wizard-reserve-bridge.test.ts - failures (reserve bridging)
7. unit/waterfall-step.test.tsx - failures (waterfall UI)
8. unit/truth-cases/capital-allocation.test.ts - 3 failures (CA-009, CA-010,
   CA-012)

**Pattern Analysis:**

- Integration tests (ops-webhook): 17 failures
- Validation/state management: 11 failures (stage-validation-mode)
- Wizard/UI tests: 6+ failures (modeling-wizard, waterfall-step, reserve-bridge)
- Capital allocation truth cases: 3 failures
- XIRR edge cases: 2 failures

## Available Tools & Agents

**Automated Repair:**

- `/fix-auto` - Automated lint/type/test repair
- `/test-smart` - Smart test selection based on file changes
- `/deploy-check` - Pre-deployment validation

**Specialized Agents:**

- test-repair agent (memory-enabled, baseline-aware)
- waterfall-specialist agent (CA truth cases)
- xirr-fees-validator agent (XIRR golden set)
- phoenix-precision-guardian agent (numeric drift)

**Validation Commands:**

- `/phoenix-truth focus=waterfall` - Waterfall truth case validation
- `/phoenix-truth focus=xirr` - XIRR truth case validation
- `/phoenix-truth focus=fees` - Fee calculation validation
- `/phoenix-truth focus=capital` - Capital allocation validation

## Recommended Repair Strategy

### Phase 1: Low-Hanging Fruit (Target: +100 tests, 2 days)

**Focus:** Integration/mocking issues

- Fix ops-webhook mocking (17 failures → potential +17 passes)
- Fix stage-validation-mode Redis mocking (11 failures → potential +11 passes)
- Repair modeling-wizard test issues (10 failures → +4 passes immediate, 7
  deferred to ADR-016)
- Total potential: +32 tests minimum (revised from +31)

**Approach:**

1. Run `/test-smart` on integration/ops-webhook.test.ts
2. Inspect mocking setup (likely Redis/webhook client mocks)
3. Fix mock configuration, verify with `npm test -- integration/ops-webhook`
4. Repeat for stage-validation-mode (Redis connection mocks)

### Phase 2: Truth Case Validation (Target: +50 tests, 2 days)

**Focus:** Capital allocation + XIRR edge cases

- Delegate CA-009, CA-010, CA-012 to waterfall-specialist agent
- Delegate XIRR edge cases to xirr-fees-validator agent
- Run `/phoenix-truth focus=capital` for regression check
- Run `/phoenix-truth focus=xirr` for XIRR parity

**Approach:**

1. Use waterfall-specialist agent with CA truth case files
2. Verify fixes with `/phoenix-truth focus=capital`
3. Use xirr-fees-validator agent for golden set edge cases
4. Verify fixes with `/phoenix-truth focus=xirr`

### Phase 3: UI/Wizard Tests (Target: +80 tests, 2 days)

**Focus:** Wizard component tests

- Fix wizard-reserve-bridge integration
- Fix waterfall-step component tests
- Fix portfolio-intelligence API routes

**Approach:**

1. Run `npm test -- unit/wizard-reserve-bridge` for baseline
2. Inspect component rendering issues (likely props/context)
3. Use `/test-smart` for targeted fixes
4. Verify with test suite re-run

### Phase 4: Regression Prevention (Target: +80 tests, 1 day)

**Focus:** Remaining failing test files

- Systematic review of remaining 33 failing test files
- Use test-repair agent with memory-enabled baseline comparison
- Run full test suite: `npm test`
- Verify NO TypeScript regressions: `npm run check`

**Approach:**

1. Generate test failure report:
   `npm test 2>&1 | grep "FAIL" > test-failures.txt`
2. Categorize failures by module (API, UI, integration, unit)
3. Delegate to test-repair agent with baseline context
4. Final verification: `npm test && npm run check`

## Success Criteria

**MUST ACHIEVE:**

- Test pass rate ≥90% (≥1586/1762 passing)
- TypeScript errors = 453 (no regressions)
- ALL Phoenix truth cases passing (waterfall, XIRR, fees, capital)
- NO new test failures introduced

**NICE TO HAVE:**

- Test pass rate ≥95% (≥1674/1762 passing)
- Reduction in TypeScript errors (453 → <400)
- Test execution time improvement

## Estimated Duration

**Conservative:** 7 days (5 workdays + 2 buffer) **Aggressive:** 5 days (if
automation tools work well) **Realistic:** 6 days (1 day per phase + 1 buffer
for regressions)

## Blockers & Risks

**Identified Blockers:** None **Potential Risks:**

- Integration test mocking may require Redis/webhook infrastructure changes
- UI tests may require component refactoring (not just test fixes)
- Truth case failures may indicate logic bugs (not test issues)

**Mitigation:**

- Use verification-before-completion skill (no claims without evidence)
- Maintain TypeScript baseline (453 errors) at all times
- Create rollback tags before each phase
- Use `/deploy-check` before any commits

## Start Condition

**Prerequisites:**

- Phase 0-1 committed and tagged (baseline-pre-hygiene-20251215) ✅
- BASELINE-SNAPSHOT-20251215.md verified ✅
- regression-typecheck-20251215.txt confirms 453 errors ✅

**Handoff Command:**

```bash
git checkout main
git pull
git tag -l baseline-pre-hygiene-20251215  # Verify tag exists
cat BASELINE-SNAPSHOT-20251215.md          # Review baseline metrics
cat FOUNDATION-HARDENING-PLAN.md           # Review this plan
npm test                                   # Verify 72.3% pass rate
npm run check                              # Verify 453 errors
```

**Start Message:** "Begin Foundation Hardening Sprint using
FOUNDATION-HARDENING-PLAN.md. Start with Phase 1 (Low-Hanging Fruit). Use
verification-before-completion skill for all claims."

## Rollback Plan

If Foundation Hardening introduces regressions:

```bash
git reset --hard baseline-pre-hygiene-20251215
git clean -fd
npm ci
npm run doctor:links
```

---

**Note:** This plan is SCOPE DOCUMENTATION only. Do NOT execute until current
Phase 0-1 work is committed. **Last Updated:** 2025-12-15 21:15 PST **Author:**
Claude (verification-driven planning)
