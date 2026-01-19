---
status: ACTIVE
last_updated: 2026-01-19
---

# Phase 2: Recommended Agent/Skill Strategy

## Problem Analysis

**Issue**: 517 React hook errors in jsdom test environment
**Complexity**: Medium (test configuration, not code logic)
**Scope**: Narrow (setup files + config)
**Risk**: Low (isolated to test environment)

## Recommended Workflow

### Approach: Direct Execution with Targeted Agent Support

**Why NOT full agent orchestration**:
- Problem is well-defined with clear hypotheses
- Fix likely in 1-2 files (jsdom-setup.ts, vitest.config.ts)
- Quick validation cycle needed (run single test)
- Agent overhead would slow investigation

**Why YES targeted agents for specific tasks**:

---

## Phase 2 Agent Usage Strategy

### Stage 1: Investigation (10 min) - DIRECT

**Task**: Read and analyze setup files
```bash
# Direct execution - fastest
cat tests/setup/jsdom-setup.ts
cat tests/setup/test-infrastructure.ts
npm ls @testing-library/react --depth=0
```

**Rationale**: Simple file reads, no agent needed

---

### Stage 2: Root Cause Analysis (15 min) - CODEX SKILL

**Task**: Deep analysis of React Testing Library patterns and React 18 compatibility

**Use**: `codex` skill for cross-file analysis

```bash
codex-wrapper - <<'EOF'
Analyze React Testing Library setup for React 18.3.1 compatibility:

Files to analyze:
@tests/setup/jsdom-setup.ts
@tests/setup/test-infrastructure.ts
@vitest.config.ts (lines 78-127)

Questions:
1. Is cleanup() from @testing-library/react properly configured?
2. Are there any globals or mocks that could interfere with React hooks?
3. Does jsdom environment configuration support React 18 concurrent features?
4. Compare setup against React Testing Library v13+ best practices

Pattern to find:
- Missing afterEach(cleanup)
- Improper React import mocking
- jsdom options incompatible with React 18

Provide specific fix recommendations with code examples.
EOF
```

**Why Codex**:
- Cross-file context needed
- React 18 + RTL best practices knowledge
- Can identify subtle configuration issues
- Generates fix code based on current setup

---

### Stage 3: Fix Implementation (10 min) - CODEX SKILL

**Task**: Apply fix with validation

```bash
codex-wrapper - <<'EOF'
Apply React Testing Library cleanup fix to tests/setup/jsdom-setup.ts:

1. Add proper cleanup import and afterEach hook for React 18
2. Ensure compatibility with existing test infrastructure
3. Verify no conflicts with global mocks
4. Add inline comment explaining React 18 requirement

Then validate:
- Run single test: npm exec -- vitest run tests/unit/capital-allocation-step.test.tsx --reporter=verbose --no-coverage
- Check for hook errors in output
- Report success/failure with error details if any
EOF
```

**Why Codex**:
- Handles edit + validation in one workflow
- Understands context of fix
- Can iterate if first attempt fails
- Faster than manual edit + test cycle

---

### Stage 4: Full Validation (15 min) - CODEX SKILL + Direct

**Task A**: Run full client test suite (Codex)

```bash
codex-wrapper - <<'EOF'
Run full client test suite and analyze results:

1. Execute: npm test -- --project=client --reporter=verbose
2. Count hook errors (grep "Invalid hook call")
3. Compare to baseline (517 errors)
4. Identify any remaining failures
5. Generate summary report with:
   - Hook errors: before/after
   - Test files: failed/passed
   - Any new failures introduced
   - Recommended next steps if any failures remain
EOF
```

**Task B**: Verify no regression (Direct)
```bash
# Quick checks - no agent needed
npm run build
npm run check
npm test -- --project=server --run
```

---

## Alternative: error-debugging Agent (If Codex Fails)

**Fallback Strategy**: If Codex doesn't resolve in one iteration

**Use**: `error-debugging:debugger` or `error-debugging:error-detective`

```typescript
Task tool with:
- subagent_type: "error-debugging:debugger"
- prompt: "Debug React hook errors in jsdom test environment.

  Context:
  - 517 'Invalid hook call' errors in client tests
  - Pattern: Cannot read properties of null (reading 'useId')
  - All React component tests fail in jsdom environment
  - Server tests (Node env) work fine
  - React deduplicated to 18.3.1 (not a dependency issue)

  Investigation focus:
  1. tests/setup/jsdom-setup.ts - missing RTL cleanup?
  2. vitest.config.ts jsdom environmentOptions
  3. @testing-library/react version compatibility

  Artifacts:
  - artifacts/post-hardening-test-results.log (full error output)
  - tests/unit/capital-allocation-step.test.tsx (sample failing test)

  Goal: Identify root cause and provide fix"
```

**Why error-debugging agent**:
- Specialized in systematic debugging
- Can trace error patterns across logs
- Correlates errors with code structure
- Provides structured analysis

---

## NOT Recommended Agents for This Task

### ❌ test-automator
**Reason**: Problem is test configuration, not test writing
**When to use**: After fixing hook errors, for adding new tests

### ❌ code-reviewer
**Reason**: No code quality issue, it's environment setup
**When to use**: After fix, for reviewing changes before commit

### ❌ typescript-pro
**Reason**: TypeScript already at 0 errors, this is runtime hook issue
**When to use**: Already used in Phase 1

### ❌ legacy-modernizer
**Reason**: Not a legacy code issue, modern React 18 setup problem
**When to use**: Not applicable

---

## Recommended Execution Flow

### Option A: Codex-First (Recommended - Fastest)
```
1. Direct: Read setup files (30 sec)
2. Codex: Analyze + generate fix (5 min)
3. Codex: Apply fix + validate single test (5 min)
4. Codex: Run full suite + report (10 min)
5. Direct: Verify no regression (5 min)

Total: ~25 minutes
```

### Option B: Direct Investigation + Codex Fix
```
1. Direct: Read files and manually identify issue (10 min)
2. Direct: Apply fix manually (5 min)
3. Codex: Validate + full suite analysis (10 min)
4. Direct: Verify no regression (5 min)

Total: ~30 minutes
```

### Option C: Agent-Heavy (If Stuck)
```
1. error-debugging:debugger for root cause (15 min)
2. Codex for fix implementation (10 min)
3. Codex for validation (10 min)
4. code-reviewer for change review (10 min)

Total: ~45 minutes
```

---

## Codex Configuration

### Optimal Settings
```bash
# Use default timeout (plenty for this task)
timeout: 7200000

# Working directory
workdir: /c/dev/Updog_restore

# Model: Use default (sufficient for config changes)
# No need for specialized model
```

### Task Breakdown for Parallel Execution

**If using Codex --parallel** (advanced):
```bash
codex-wrapper --parallel <<'EOF'
---TASK---
id: analyze_setup_1234567890
workdir: /c/dev/Updog_restore
---CONTENT---
Analyze React Testing Library setup in @tests/setup/jsdom-setup.ts
and identify missing cleanup or React 18 incompatibilities
---TASK---
id: check_rtl_version_1234567891
workdir: /c/dev/Updog_restore
---CONTENT---
Check @testing-library/react version compatibility with React 18.3.1
and identify required peer dependencies
---TASK---
id: review_jsdom_config_1234567892
workdir: /c/dev/Updog_restore
dependencies: analyze_setup_1234567890
---CONTENT---
Review vitest.config.ts jsdom environmentOptions for React 18 support
based on findings from analyze_setup task
EOF
```

**When to use parallel**: Only if initial investigation is unclear and multiple independent analyses needed.

---

## Success Indicators

### Agent is helping if:
- ✓ Identifies root cause in first analysis
- ✓ Generates working fix code
- ✓ Validates fix automatically
- ✓ Provides clear next steps

### Switch to direct if:
- ✗ Agent takes >2 iterations without progress
- ✗ Fix is obvious from manual inspection
- ✗ Agent suggests irrelevant changes

---

## Post-Fix: Recommended Agent Usage

### After hook errors resolved:

**code-reviewer** - Review all changes
```
Task tool:
- subagent_type: "code-reviewer"
- prompt: "Review Phase 1 + Phase 2 changes for:
  1. Config correctness
  2. No regressions introduced
  3. Best practices followed
  4. Documentation completeness"
```

**NOT test-automator** - Tests already exist, just need to pass

---

## Quick Decision Tree

```
Start Phase 2
    |
    ├─> Problem obvious from file read?
    |       ├─> YES → Direct fix (5 min)
    |       └─> NO → Use Codex analysis (10 min)
    |
    ├─> Fix worked on single test?
    |       ├─> YES → Codex full validation (10 min)
    |       └─> NO → error-debugging agent (15 min)
    |
    └─> All tests passing?
            ├─> YES → code-reviewer for final check
            └─> NO → Iterate with Codex or debugging agent
```

---

## Recommendation for Next Session

**Start with**: Option A (Codex-First) using the analysis task above

**Escalate to**: error-debugging agent if Codex doesn't resolve in 2 attempts

**Time budget**:
- Target: 25-30 min with Codex
- Maximum: 45 min with debugging agent fallback

**Success metric**: Hook errors 517 → 0 in single session
