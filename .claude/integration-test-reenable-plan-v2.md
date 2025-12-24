# Integration Test Re-enablement Plan v2 (Tool-Leveraged Approach)

**Status**: Ready for Execution
**Created**: 2025-12-21
**Timeline**: 5-7 days (vs 5 weeks original)
**Efficiency Gain**: 85% time reduction via existing tool leverage

---

## Executive Summary

### Critical Discovery
Parallel analysis of all 4 skipped tests reveals the original 5-week plan significantly overestimated effort. **Key findings:**

1. **Test #1 (Portfolio Intelligence)**: Route handlers exist, just needs testStorage wiring (~1-2 hours)
2. **Test #2 (Critical Bugs)**: Uses REAL engines (DeterministicReserveEngine), likely over-cautious skip (~30min)
3. **Test #3 (Monte Carlo)**: Complete mock infrastructure exists, deterministic seed configured (~1 hour)
4. **Test #4 (Cohort Engine)**: Uses REAL CohortEngine, needs fixture extension (~1-2 hours)

### Timeline Compression Justification

**Original Plan**: 5 weeks (200 hours)
- Phase 1: Build mock infrastructure (80 hours)
- Phase 2: Test re-enablement (80 hours)
- Phase 3: Documentation (40 hours)

**Improved Plan**: 5-7 days (30-40 hours)
- Day 1-2: Test #1 with test-scaffolder + test-automator (8 hours)
- Day 3: Test #2 with test-repair agent (3 hours)
- Day 4: Test #3 with statistical-testing skill (4 hours)
- Day 5: Test #4 with test-fixture-generator (4 hours)
- Day 6: Integration validation + perf:guard (4 hours)
- Day 7: Documentation with docs-architect agent (4 hours)
- **Buffer**: 3-13 hours for unknowns

**Why 85% Faster:**
- Existing [database-mock.ts](tests/helpers/database-mock.ts) (150+ lines) eliminates infrastructure build
- 6 memory-enabled agents automate scaffolding, repair, and analysis
- 6 auto-activating skills provide TDD, fixtures, and anti-patterns
- 40+ npm scripts enable rapid iteration (test:quick, test:smart, test:repair)
- Real engines already imported (Tests #2, #4) eliminate mocking needs

---

## Available Capabilities Inventory

### Test-Focused Agents (Memory-Enabled)

| Agent | Capability | Memory Tenant | Use For |
|-------|-----------|---------------|---------|
| `test-automator` | Comprehensive test generation, TDD workflow | `agent:test-automator:updog` | Generate test suites across boundaries |
| `test-repair` | Autonomous failure detection/repair, flakiness tracking | `agent:test-repair` | Stabilize re-enabled tests |
| `test-scaffolder` | Scaffold test infrastructure | `agent:test-scaffolder` | Wire testStorage, create fixtures |
| `pr-test-analyzer` | PR coverage analysis | `agent:pr-test-analyzer` | Verify integration test coverage |
| `playwright-test-author` | E2E browser tests | (invoked via test-repair) | Browser-only scenarios |
| `chaos-engineer` | Resilience testing | `agent:chaos-engineer:updog` | Chaos-style integration validation |

### Auto-Activating Skills

| Skill | Activation Trigger | Integration Test Value |
|-------|-------------------|------------------------|
| `test-driven-development` | Feature implementation | RED→GREEN→REFACTOR workflow |
| `condition-based-waiting` | Async waits in tests | Eliminate flaky waits |
| `testing-anti-patterns` | Testing tasks | Prevent brittle mocks |
| `test-pyramid` | Test governance | Keep integration scope tight |
| `test-fixture-generator` | Fixture creation | Schema-validated datasets |
| `statistical-testing` | Probabilistic checks | Monte Carlo validation |

### Key npm Scripts

```bash
# Fast Feedback
npm run test:quick              # Exclude **/api/** for speed
npm run test:smart              # Run affected tests only
npm run test:intelligent:fast   # Fail-fast scanning

# Automated Repair
npm run test:repair             # Auto-fix common failures

# Validation Gates
npm run test:integration        # Full integration suite
npm run perf:guard              # Performance regression check
npm run test:parallel           # Unit + lint + typecheck
```

### Existing Mock Infrastructure

**[tests/helpers/database-mock.ts](tests/helpers/database-mock.ts)** (150+ lines, production-ready)
- Constraint validation (enums, checks, unique, FK)
- Call history tracking
- 15+ table mocks with fixtures
- Reusable extension patterns

**Existing vi.mock patterns:**
- [tests/unit/services/monte-carlo-engine.test.ts:17-34](tests/unit/services/monte-carlo-engine.test.ts#L17-L34) - Complete db mock
- [tests/unit/api/time-travel-api.test.ts:76-77](tests/unit/api/time-travel-api.test.ts#L76-L77) - Service layer pattern
- [tests/setup/node-setup-redis.ts](tests/setup/node-setup-redis.ts) - Redis mock

---

## Per-Test Action Plan (Tool-Centric)

### Test #1: Portfolio Intelligence - Concurrent Strategy Creation

**File**: [tests/unit/api/portfolio-intelligence.test.ts:94-132](tests/unit/api/portfolio-intelligence.test.ts#L94-L132)
**Current State**: Route handler exists, testStorage declared but not wired
**Effort**: 1-2 hours

**Action Items:**
1. **Wire testStorage into request lifecycle**
   - Set `app.locals.portfolioStorage = testStorage` in [tests/unit/api/portfolio-intelligence.test.ts:48](tests/unit/api/portfolio-intelligence.test.ts#L48)
   - Read from `app.locals.portfolioStorage` in route handlers
   - Pattern from [tests/unit/api/time-travel-api.test.ts:107](tests/unit/api/time-travel-api.test.ts#L107)

2. **Remove skip markers**
   - [tests/unit/api/portfolio-intelligence.test.ts:94](tests/unit/api/portfolio-intelligence.test.ts#L94) - `describe.skip` on POST strategies
   - [tests/unit/api/portfolio-intelligence.test.ts:1062](tests/unit/api/portfolio-intelligence.test.ts#L1062) - `it.skip` on concurrent test

3. **Tool Usage**
   - **Agent**: `test-scaffolder` for storage wiring pattern
   - **Agent**: `test-automator:updog` for unskip + validation
   - **Skills**: `test-driven-development` (auto-activates), `condition-based-waiting`
   - **Validation**: `npm run test:smart` → `npm run test:quick`

**Risk Mitigation:**
- Reuse [tests/helpers/database-mock.ts](tests/helpers/database-mock.ts) if any db calls surface
- `test-repair` agent available for assertion fixes

---

### Test #2: Phase 3 Critical Bugs - Risk-Based Cash Buffer

**File**: [tests/unit/bug-fixes/phase3-critical-bugs.test.ts](tests/unit/bug-fixes/phase3-critical-bugs.test.ts)
**Current State**: Uses REAL engines (DeterministicReserveEngine, ConstrainedReserveEngine)
**Effort**: 30 minutes

**Action Items:**
1. **Validate skip necessity**
   - Engines imported at [line 12-13](tests/unit/bug-fixes/phase3-critical-bugs.test.ts#L12-L13) are REAL implementations
   - Fixtures complete at [lines 25-137](tests/unit/bug-fixes/phase3-critical-bugs.test.ts#L25-L137)
   - Likely over-cautious skip - run test to confirm

2. **Remove skip if tests pass**
   - Check for `.skip` markers (grep analysis needed)
   - Validate baseline calculations against known values

3. **Tool Usage**
   - **Agent**: `test-repair` for quick triage if assertions fail
   - **Skills**: `test-pyramid`, `testing-anti-patterns`
   - **Validation**: `npm run test:intelligent:fast` (fail-fast mode)

**Risk Mitigation:**
- Real engine means no mock needed
- If test fails, `test-repair` agent has Phase 3A-3G memory patterns

---

### Test #3: Monte Carlo Engine - Reserve Optimization

**File**: [tests/unit/services/monte-carlo-engine.test.ts:413](tests/unit/services/monte-carlo-engine.test.ts#L413)
**Current State**: Complete mock infrastructure + deterministic seed
**Effort**: 1 hour

**Action Items:**
1. **Infrastructure already complete**
   - db mock at [lines 17-34](tests/unit/services/monte-carlo-engine.test.ts#L17-L34)
   - mockConfig with `randomSeed: 12345` at [line 66](tests/unit/services/monte-carlo-engine.test.ts#L66)
   - Fixtures at [lines 52-99](tests/unit/services/monte-carlo-engine.test.ts#L52-L99)

2. **Remove skip and validate**
   - Remove `it.skip` at [line 413](tests/unit/services/monte-carlo-engine.test.ts#L413)
   - Confirm deterministic output via seed
   - Validate convergence behavior

3. **Tool Usage**
   - **Agent**: `pr-test-analyzer` to confirm mock completeness
   - **Skills**: `statistical-testing` (auto-activates for Monte Carlo)
   - **Validation**: `npm run test:smart` → verify reproducibility

**Risk Mitigation:**
- `randomSeed: 12345` ensures deterministic testing
- Existing `optimizeReserveAllocation` is pure (no db dependency)
- Fallback: Extend [tests/helpers/database-mock.ts](tests/helpers/database-mock.ts) if needed

---

### Test #4: Cohort Engine - Multiple Cohort Calculations

**File**: [tests/unit/engines/cohort-engine.test.ts:237](tests/unit/engines/cohort-engine.test.ts#L237)
**Current State**: Uses REAL CohortEngine, needs fixture extension
**Effort**: 1-2 hours

**Action Items:**
1. **Extend existing fixtures**
   - Promote `createCohortInput` helper from [line 14-19](tests/unit/engines/cohort-engine.test.ts#L14-L19)
   - Add to shared fixtures (similar to [tests/fixtures/portfolio-fixtures.ts](tests/fixtures/portfolio-fixtures.ts))
   - Generate edge cases (empty cohorts, single-company)

2. **Remove skip and validate**
   - Find and remove `.skip` at [line 237](tests/unit/engines/cohort-engine.test.ts#L237)
   - Other tests at [lines 25-99](tests/unit/engines/cohort-engine.test.ts#L25-L99) already pass

3. **Tool Usage**
   - **Agent**: `test-fixture-generator` + `test-scaffolder`
   - **Skills**: `test-fixture-generator` (auto-activates)
   - **Validation**: `npm run test:unit` (full server+client suite)

**Risk Mitigation:**
- Real CohortEngine means no mock needed
- Existing tests demonstrate pattern
- `test-repair` agent available for statistical calculation fixes

---

## Parallel Workflow Strategy

### Workflow Tracks (Execute Concurrently)

**Track A: Portfolio Intelligence (Days 1-2)**
```bash
# Codex parallel execution
codex-wrapper --parallel <<'EOF'
---TASK---
id: wire_storage_1735000000
workdir: c:\dev\Updog_restore
---CONTENT---
Use test-scaffolder to wire testStorage into @tests/unit/api/portfolio-intelligence.test.ts
Pattern: app.locals.portfolioStorage = testStorage (line 48)
Reference: @tests/unit/api/time-travel-api.test.ts:107
---TASK---
id: unskip_tests_1735000001
workdir: c:\dev\Updog_restore
dependencies: wire_storage_1735000000
---CONTENT---
Use test-automator:updog to remove .skip markers and validate
Run: npm run test:smart after unskip
Files: @tests/unit/api/portfolio-intelligence.test.ts
EOF
```

**Track B: Critical Bugs (Day 3)**
```bash
# Quick validation with test-repair
codex-wrapper - <<'EOF'
Use test-repair agent to validate @tests/unit/bug-fixes/phase3-critical-bugs.test.ts
1. Identify .skip markers
2. Run tests to confirm if skip is necessary (uses real engines)
3. Remove .skip if tests pass
4. Run npm run test:intelligent:fast
EOF
```

**Track C: Monte Carlo + Cohort (Days 4-5)**
```bash
codex-wrapper --parallel <<'EOF'
---TASK---
id: monte_carlo_1735000100
workdir: c:\dev\Updog_restore
---CONTENT---
Remove .skip from @tests/unit/services/monte-carlo-engine.test.ts:413
Validate deterministic output with randomSeed: 12345
Use statistical-testing skill for convergence validation
Run: npm run test:smart
---TASK---
id: cohort_fixtures_1735000101
workdir: c:\dev\Updog_restore
---CONTENT---
Use test-fixture-generator to extend @tests/unit/engines/cohort-engine.test.ts:14
Generate edge cases (empty cohorts, single-company)
Remove .skip at line 237
Run: npm run test:unit
EOF
```

**Track D: Performance Guard (Day 6)**
```bash
# After all tests re-enabled
npm run perf:guard  # Automated performance regression check
```

---

## Automated Validation Workflow

### Validation Pipeline (After Each Re-enablement)

```bash
# 1. Fast feedback (excludes API tests)
npm run test:quick

# 2. Affected tests only
npm run test:smart

# 3. Fail-fast scanning
npm run test:intelligent:fast

# 4. Full integration suite (after all 4 tests)
npm run test:integration

# 5. Auto-repair if failures
npm run test:repair

# 6. Performance gate
npm run perf:guard
```

### Quality Gates

**Pre-merge checklist:**
- [ ] `npm run test:quick` passes
- [ ] `npm run test:smart` passes
- [ ] `npm run test:integration` passes (all 4 tests)
- [ ] `npm run perf:guard` shows no regressions
- [ ] `npm run test:repair` yields zero auto-fixes needed
- [ ] Zero new quarantined tests

---

## Day-by-Day Timeline

### Day 1-2: Portfolio Intelligence (8 hours)
**Track A Execution**

**Morning (4h):**
- Use `test-scaffolder` agent to wire testStorage
- Reference [tests/unit/api/time-travel-api.test.ts:107](tests/unit/api/time-travel-api.test.ts#L107) pattern
- Validate with `npm run test:quick`

**Afternoon (4h):**
- Use `test-automator:updog` to remove all `.skip` markers
- Run `npm run test:smart` for affected tests
- Use `test-repair` if any assertions fail
- Validate concurrent test with `npm run test:quick`

**Deliverable**: Test #1 passing, no skips

---

### Day 3: Critical Bugs (3 hours)
**Track B Execution**

**Morning (3h):**
- Use `test-repair` agent to analyze [tests/unit/bug-fixes/phase3-critical-bugs.test.ts](tests/unit/bug-fixes/phase3-critical-bugs.test.ts)
- Run tests to confirm skip necessity (engines are real)
- Remove `.skip` markers if tests pass
- Validate with `npm run test:intelligent:fast`

**Deliverable**: Test #2 passing or skip reason validated

---

### Day 4: Monte Carlo Engine (4 hours)
**Track C (Monte Carlo) Execution**

**Morning (2h):**
- Remove `it.skip` at [tests/unit/services/monte-carlo-engine.test.ts:413](tests/unit/services/monte-carlo-engine.test.ts#L413)
- Confirm deterministic behavior with `randomSeed: 12345`
- `statistical-testing` skill auto-activates

**Afternoon (2h):**
- Validate convergence with `npm run test:smart`
- Use `pr-test-analyzer` to verify mock completeness
- Run full suite with `npm run test:unit`

**Deliverable**: Test #3 passing with deterministic output

---

### Day 5: Cohort Engine (4 hours)
**Track C (Cohort) Execution**

**Morning (2h):**
- Use `test-fixture-generator` skill to extend `createCohortInput`
- Generate edge cases (empty cohorts, single-company)
- Add to shared fixtures

**Afternoon (2h):**
- Remove `it.skip` at [tests/unit/engines/cohort-engine.test.ts:237](tests/unit/engines/cohort-engine.test.ts#L237)
- Validate with `npm run test:unit`
- Use `test-repair` for any statistical calculation fixes

**Deliverable**: Test #4 passing with edge case coverage

---

### Day 6: Integration Validation (4 hours)
**Track D Execution**

**Morning (2h):**
- Run full integration suite: `npm run test:integration`
- Validate all 4 tests pass together
- Check for test interactions

**Afternoon (2h):**
- Performance gate: `npm run perf:guard`
- Validate no regressions
- Run `npm run test:parallel` (unit + lint + typecheck)

**Deliverable**: All validation gates pass

---

### Day 7: Documentation (4 hours)
**Documentation Automation**

**Morning (2h):**
- Use `docs-architect` agent to generate [cheatsheets/integration-test-mocking.md](cheatsheets/integration-test-mocking.md)
- Document testStorage wiring pattern
- Document fixture extension pattern

**Afternoon (2h):**
- Update agent memory:
  - `test-repair` with re-enablement patterns
  - `test-scaffolder` with storage wiring
  - `test-fixture-generator` with cohort fixtures
- Run `/log-change` command for CHANGELOG.md

**Deliverable**: Documentation complete, agent memory updated

---

## Success Criteria (Automated Validation)

### Test Execution
- [ ] All 4 integration tests pass on `npm run test:integration`
- [ ] Zero test failures on `npm run test:unit`
- [ ] `npm run test:smart` passes for affected files
- [ ] `npm run test:intelligent:fast` completes with zero failures

### Quality Gates
- [ ] `npm run perf:guard` shows no performance regressions
- [ ] `npm run test:repair` yields zero auto-fixes needed
- [ ] Zero new tests added to quarantine
- [ ] All tests properly tagged with `@group integration`

### Infrastructure
- [ ] Mock infrastructure documented in cheatsheets/
- [ ] testStorage wiring pattern documented
- [ ] Fixture extension patterns documented
- [ ] Agent memory updated with successful patterns

### Timeline
- [ ] Completed in 5-7 days (vs 5 weeks original)
- [ ] No production code changes required
- [ ] Test execution time < 5 minutes (total suite)

---

## Risk Assessment & Mitigation

### Risk #1: Test Infrastructure Incomplete
**Original Risk**: HIGH - Assumed need to build mock infrastructure
**Actual Risk**: LOW - Infrastructure exists ([database-mock.ts](tests/helpers/database-mock.ts) 150+ lines)

**Mitigation**:
- Reuse existing constraint validation patterns
- Extend testStorage wiring from [time-travel-api test](tests/unit/api/time-travel-api.test.ts)
- `test-scaffolder` agent for systematic extension

---

### Risk #2: Tests Use Real Infrastructure
**Original Risk**: HIGH - Assumed all tests need mocked infrastructure
**Actual Risk**: NEGLIGIBLE - Tests #2 & #4 use real engines

**Mitigation**:
- Test #2: Uses DeterministicReserveEngine (real implementation)
- Test #4: Uses CohortEngine (real implementation)
- No mocking needed - just remove `.skip` and validate

---

### Risk #3: Performance Degradation
**Original Risk**: MEDIUM - Mock overhead concerns
**Actual Risk**: LOW - Automated detection available

**Mitigation**:
- `npm run perf:guard` provides automated regression detection
- `test:quick` excludes slow tests from development workflow
- Integration tests run separately (no dev workflow impact)
- `statistical-testing` skill ensures deterministic Monte Carlo tests

---

### Risk #4: Flaky Tests
**Original Risk**: MEDIUM - Concurrent request timing issues
**Actual Risk**: LOW - Skills and agents handle flakiness

**Mitigation**:
- `condition-based-waiting` skill (auto-activates) eliminates timing issues
- `test-repair` agent has flakiness detection built-in
- `randomSeed: 12345` ensures deterministic Monte Carlo output
- `testing-anti-patterns` skill prevents brittle mocks

---

## Tool Reference Quick Guide

### Agent Invocation Patterns

```typescript
// Test infrastructure scaffolding
Task("test-scaffolder", {
  target: "portfolio-intelligence-storage",
  pattern: "tests/unit/api/time-travel-api.test.ts",
  extend: ["testStorage wiring", "app.locals pattern"]
})

// Test repair and validation
Task("test-repair", {
  files: ["tests/unit/bug-fixes/phase3-critical-bugs.test.ts"],
  action: "analyze"
})

// Comprehensive test generation
Task("test-automator:updog", {
  module: "portfolio-intelligence",
  coverage: "integration"
})

// PR coverage review
Task("pr-test-analyzer", {
  pr: "current",
  focus: "integration-tests"
})

// Documentation generation
Task("docs-architect", {
  action: "document-patterns",
  source: "tests/helpers/database-mock.ts",
  output: "cheatsheets/integration-test-mocking.md"
})

// Performance validation
Task("chaos-engineer:updog", {
  action: "perf-guard"
})
```

### Skill Activation (Auto-Activating)

Skills auto-activate based on context - no explicit invocation needed:
- `test-driven-development`: During feature implementation
- `test-fixture-generator`: When creating test data
- `statistical-testing`: For Monte Carlo validation
- `condition-based-waiting`: When async waits appear
- `testing-anti-patterns`: During testing tasks
- `test-pyramid`: For test level decisions

### npm Script Workflow

```bash
# Development workflow (fast feedback)
npm run test:quick              # Exclude API tests (~30s)
npm run test:smart              # Affected tests only (~1min)
npm run test:intelligent:fast   # Fail-fast scanning (~2min)

# Repair workflow
npm run test:repair             # Auto-fix common failures

# Integration validation
npm run test:integration        # Full integration suite (~3min)
npm run test:unit               # Server + client projects (~4min)
npm run test:parallel           # Unit + lint + typecheck (~5min)

# Quality gates
npm run perf:guard              # Performance regression check
```

### File References

**Mock Infrastructure:**
- [tests/helpers/database-mock.ts](tests/helpers/database-mock.ts) - 150+ line foundation
- [tests/unit/api/time-travel-api.test.ts:76-77](tests/unit/api/time-travel-api.test.ts#L76-L77) - Service mock pattern
- [tests/setup/node-setup-redis.ts](tests/setup/node-setup-redis.ts) - Redis mock

**Test Files:**
- [tests/unit/api/portfolio-intelligence.test.ts:94-132](tests/unit/api/portfolio-intelligence.test.ts#L94-L132) - Test #1
- [tests/unit/bug-fixes/phase3-critical-bugs.test.ts](tests/unit/bug-fixes/phase3-critical-bugs.test.ts) - Test #2
- [tests/unit/services/monte-carlo-engine.test.ts:413](tests/unit/services/monte-carlo-engine.test.ts#L413) - Test #3
- [tests/unit/engines/cohort-engine.test.ts:237](tests/unit/engines/cohort-engine.test.ts#L237) - Test #4

**Cheatsheets:**
- [cheatsheets/service-testing-patterns.md](cheatsheets/service-testing-patterns.md) - Mock cookbook
- [cheatsheets/test-pyramid.md](cheatsheets/test-pyramid.md) - Test level guidance
- [cheatsheets/INDEX.md](cheatsheets/INDEX.md) - Complete catalog

---

## Next Actions (When Approved)

### Immediate Actions (Day 1)

1. **Kick off Track A (Portfolio Intelligence)**
   ```bash
   codex-wrapper --parallel <<'EOF'
   ---TASK---
   id: wire_storage
   workdir: c:\dev\Updog_restore
   ---CONTENT---
   Wire testStorage into portfolio intelligence tests using test-scaffolder
   EOF
   ```

2. **Validate existing test state**
   ```bash
   npm run test:quick  # Baseline before changes
   ```

3. **Start parallel tracks**
   - Track A: Portfolio Intelligence (test-scaffolder + test-automator)
   - Track B: Critical Bugs (test-repair)
   - Track C: Monte Carlo + Cohort (test-fixture-generator)

### Continuous Validation

After each re-enablement:
```bash
npm run test:smart          # Affected tests
npm run test:intelligent:fast  # Fail-fast
npm run test:repair         # Auto-fix if needed
```

### Final Validation (Day 6)

```bash
npm run test:integration    # All 4 tests together
npm run perf:guard          # Performance gate
npm run test:parallel       # Full validation
```

---

## Conclusion

### Key Improvements Over Original Plan

**Timeline**: 5 weeks → 5-7 days (85% reduction)
**Effort**: 200 hours → 30-40 hours (80% reduction)
**Risk**: HIGH → LOW (existing infrastructure + automation)

### Critical Success Factors

1. **Leverage Existing Tools**: 6 agents + 6 skills + 40 scripts eliminate manual work
2. **Real Engines**: Tests #2 & #4 need zero mocking (just unskip + validate)
3. **Complete Mocks**: Tests #1 & #3 have infrastructure ready (just wire + extend)
4. **Parallel Execution**: 4 tracks run concurrently (maximize throughput)
5. **Automated Validation**: test:smart, test:repair, perf:guard provide rapid feedback

### Expected Outcomes

- All 4 integration tests re-enabled and passing
- Zero regressions in existing tests
- Reusable patterns documented for future integration tests
- Agent memory updated with successful patterns
- 5-7 day delivery vs 5-week original estimate

---

**Ready for execution when approved.**
