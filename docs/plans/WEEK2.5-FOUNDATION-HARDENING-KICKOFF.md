---
status: ACTIVE
last_updated: 2026-01-19
---

# Week 2.5 Foundation Hardening - Comprehensive Session Kickoff

**Created:** 2025-12-19
**Status:** READY FOR EXECUTION
**Branch:** `week2-foundation-hardening`
**PR:** #293 (OPEN - awaiting review)
**Distinguishing Label:** Week 2.5 (Test Infrastructure Deep Dive with Full Tool Inventory)

---

## Executive Summary

**CRITICAL CORRECTION:** Initial assessment of "116 test files fail to load" was INCORRECT.

**Actual Test Status:**
- **Test Files:** 46 failed | 67 passed | 3 skipped (116 total)
- **Individual Tests:** 394 failed | 1641 passed | 87 skipped (2122 total)
- **Success Rate:** 57.8% test files passing, 80.6% individual tests passing
- **Collection Phase:** ✅ ALL test files load successfully
- **Execution Phase:** ❌ Tests run but assertions fail

**Key Finding:** Tests ARE loading and executing - they're failing assertions, NOT failing to load.

**Available Dev Tools:** 250+ components across 5 tiers
- Phoenix Agents: 9 (VC fund domain)
- Project Agents: 35 (testing, infrastructure, quality)
- Skills: 50 (Superpowers + Phoenix + Workflow + Testing)
- Commands: 13 (Phoenix + development + deployment)
- MCP Tools: 16+ (multi-AI collaboration + TaskMaster)

---

## Current State Summary

**Commits:** 26 total (20 cherry-picked + 6 new fixes)
**TypeScript Baseline:** 387 errors (0 new errors)
**Build Status:** ✅ PASSING (Vite + server)
**Test Status:** ⚠️ **46 test files failing** (394 test failures out of 2122 tests)

### What We Accomplished

#### Phase 1: Week 2 Prep Cherry-Picks (20 commits)
- Test infrastructure fixes (import paths, dependencies, environment)
- Database mock CJS/ESM bridge architecture
- Express type system consolidation
- Security patches (CVEs, ESBuild strict settings)

#### Phase 2: Post-Cherry-Pick Stabilization (6 commits)
- **React Version Alignment** (2dfaa4eb): 19.2.0 → 18.3.1
- **jsdom-setup.ts Module Hooks** (81671fb5): Removed module-level afterEach()
- **database-mock.cjs CJS/TS Interop** (cd95e268): Pure CJS delegation pattern
- **node-setup.ts Module Hooks** (217a11d9): Removed module-level beforeAll/afterAll

#### Critical Discovery: Module-Level Hook Anti-Pattern
**Root Cause:** Vitest hooks executing during module import, before test runner initialized
**Error Pattern:**
```
Error: Vitest failed to find the runner. This is a bug in Vitest
❯ tests/setup/[jsdom-setup.ts|node-setup.ts]:XX:1
```
**Fix Pattern:** Remove all module-level hooks from setup files

---

## Comprehensive Error Analysis

### Category A: Database Mock Bypass (~30 API test files) 🔴 HIGH PRIORITY

**Status:** Tests execute but fail database operations

**Error Pattern:**
```
database "povc_dev" does not exist
error: { severity: 'FATAL', code: '3D000', file: 'postinit.c' }
```

**Root Cause:**
API tests in `tests/api/*.test.ts` import the REAL PostgreSQL pool from `server/db/pg-circuit.ts` instead of using the mocked database. Database mock infrastructure exists but tests bypass it.

**Example:** `tests/api/allocations.test.ts:25`
```typescript
const fundResult = await pool.query(  // Bypasses mock, hits real DB
  `INSERT INTO funds (name, size, ...)`,
  ['Test Fund', '100000000', ...]
);
```

**Fix Strategies:**
- **Option A (Quick):** Add `vi.mock('../../server/db/pg-circuit')` to each API test
- **Option B (Proper):** Global mock in vitest.config.ts setup file
- **Option C (Long-term):** Test database with Testcontainers/Docker

---

### Category B: Incomplete Mock Exports (~13 integration test files) 🟡 MEDIUM PRIORITY

**Status:** Tests fail with "No export defined" errors

**Error Pattern:**
```
[vitest] No "q" export is defined on the "../../server/db" mock
[vitest] No "query" export is defined on the "../../server/db" mock
[vitest] No "queryWithRetry" export is defined on the "../../server/db" mock
[vitest] No "redisSet" export is defined on the "../../server/db" mock
[vitest] No "cache" export is defined on the "../../server/db" mock
```

**Root Cause:**
Tests use `vi.mock('../../server/db')` but mock only exports `{ databaseMock, poolMock }`. Tests expect individual functions.

**Example:** `tests/integration/circuit-breaker-db.test.ts`

**Fix Strategy:**
Update `tests/helpers/database-mock.cjs`:
```javascript
module.exports = {
  databaseMock,
  poolMock,
  query: (...args) => poolMock.query(...args),
  q: (...args) => poolMock.query(...args),
  queryWithRetry: (...args) => poolMock.query(...args),
  redisSet: vi.fn(),
  cache: { get: vi.fn(), set: vi.fn() },
  pgPool: poolMock,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ healthy: true }),
};
```

---

### Category C: Schema Validation Failures (18 test assertions) 🟢 LOW PRIORITY

**Status:** Tests execute successfully but assertions fail

**Error Pattern:**
```
AssertionError: expected false to be true // Object.is equality
```

**Affected Files:**
- `tests/unit/capital-allocation-step.test.tsx` - 1 failure (line 660)
- `tests/unit/general-info-step.test.tsx` - 5 failures
- `tests/unit/modeling-wizard-persistence.test.tsx` - 2 failures
- `tests/unit/waterfall-step.test.tsx` - 10 failures

**Root Cause:**
Schema validation assertions expect `safeParse().success === true` but schemas reject test data. Likely:
- RED-phase TDD tests (intentionally failing)
- Test fixtures need updating after schema changes
- Schema definitions too strict

**Example:** `tests/unit/capital-allocation-step.test.tsx:660`
```typescript
const parseResult = capitalAllocationSchema.safeParse(minimalData);
expect(parseResult.success).toBe(true);  // FAILS: returns false
```

**Fix Strategy:**
1. Check for TDD phase markers (RED:, GREEN:, etc.)
2. If not TDD: Update test fixtures to match schema
3. Run `safeParse()` and log validation errors
4. Fix either test data or schema definition

---

### Category D: Server Unit Test Failures (~3-5 files) 🟡 MEDIUM PRIORITY

**Examples:**
- `tests/unit/reallocation-api.test.ts`
- `tests/unit/database/time-travel-simple.test.ts`

**Status:** Tests execute but fail for various reasons
**Approach:** Individual investigation needed

---

## Comprehensive Dev Tooling Suite (250+ Components)

### Tool Architecture Overview

**5-Tier Plugin System:**
1. **Phoenix Agents** (9) - VC fund domain expertise
2. **Project Agents** (35) - Testing, infrastructure, quality
3. **Skills** (50) - Thinking frameworks + executable workflows
4. **Commands** (13) - Quick execution + validation gates
5. **MCP Tools** (16+) - Multi-AI collaboration + task management

**CRITICAL DISCOVERY:** Marketplace plugins are DISABLED (0 active agents despite CAPABILITIES.md claiming "200+")

---

### TIER 1: PHOENIX AGENTS (9 Domain-Specific)

**Purpose:** VC fund modeling validation and domain expertise

| Agent | Phase | Primary Use | Skill Used |
|-------|-------|-------------|------------|
| phoenix-truth-case-runner | 0 | Truth case validation (119 scenarios) | phoenix-truth-case-orchestrator |
| waterfall-specialist | 0, 1B | Clawback validation, L08 scenarios | phoenix-waterfall-ledger-semantics |
| xirr-fees-validator | 0, 1B | XIRR/fees truth cases, Excel parity | phoenix-xirr-fees-validator |
| phoenix-capital-allocation-analyst | 0, 1A | LOW confidence modules | phoenix-capital-exit-investigator |
| phoenix-precision-guardian | 1A | parseFloat eradication, Decimal.js | phoenix-precision-guard |
| phoenix-docs-scribe | 1A | JSDoc, calculations.md sync | phoenix-docs-sync |
| phoenix-probabilistic-engineer | 2 | Graduation, MOIC, Monte Carlo | phoenix-advanced-forecasting |
| phoenix-reserves-optimizer | 2 | Reserve allocation, "next dollar" | phoenix-reserves-optimizer |
| phoenix-brand-reporting-stylist | 3 | Press On Ventures branding | phoenix-brand-reporting |

**Invocation:**
```typescript
Task({
  subagent_type: "phoenix-truth-case-runner",
  prompt: "Run full truth case suite and compute pass rates"
});

Task({
  subagent_type: "schema-drift-checker",
  prompt: "Diagnose schema alignment across Migration → Drizzle → Zod → Mock layers"
});
```

---

### TIER 2: PROJECT AGENTS (35 Total)

#### Quality Gate Diagnosers (7)
- **baseline-regression-explainer** - Diagnose baseline deviations
- **parity-auditor** - Assess calculation changes vs Excel/truth cases
- **perf-regression-triager** - Diagnose performance regressions
- **perf-guard** - Bundle analysis, build time metrics (Extended Thinking: $0.06)
- **schema-drift-checker** - Diagnose Migration → Drizzle → Zod → Mock drift
- **db-migration** - Safe schema changes (Extended Thinking: $0.12)
- **silent-failure-hunter** - Find suppressed errors (Extended Thinking: $0.06)

#### Code Quality & Testing (7)
- **code-reviewer** - CLAUDE.md adherence, style violations (model: opus)
- **code-simplifier** - Simplify code while preserving functionality (model: opus)
- **comment-analyzer** - Comment accuracy, prevent comment rot
- **test-repair** - Autonomous test failure detection/repair
- **playwright-test-author** - E2E tests for browser-only behaviors
- **test-automator** - Proactive test automation strategy
- **pr-test-analyzer** - Review PR test coverage quality

#### General Infrastructure (9)
- **general-purpose** - Complex research, multi-step tasks
- **code-explorer** - Deeply understand existing features
- **debug-expert** - Debugging, error analysis, root cause
- **devops-troubleshooter** - Production incidents, perf issues
- **incident-responder** - P0 incident management, SRE practices
- **docs-architect** - Comprehensive technical documentation
- **dx-optimizer** - Developer experience optimization
- **context-orchestrator** - Multi-agent workflow orchestration
- **database-expert** - Database architecture, schema design

#### Specialized (4)
- **type-design-analyzer** - Type design quality assessment
- **chaos-engineer** - Chaos experiments, resilience testing
- **legacy-modernizer** - Modernize legacy codebases
- **waterfall-specialist** - HANDLES ALL WATERFALL LOGIC (also in Phoenix tier)

#### Workflow-Engine Agents (4)
- **code-reviewer** - Code quality assessment (Week 1 Tech Debt - Day 5)
- **security-engineer** - Security infrastructure (Week 1 Tech Debt - Day 1)
- **test-automator** - Test strategy (Week 1 Tech Debt - Day 3)
- **typescript-pro** - Advanced type system (Week 1 Tech Debt - Day 2)

#### wshobson Agents (4 - User-Level Overrides)
- **code-reviewer** - Elite AI-powered analysis (model: opus)
- **legacy-modernizer** - Strangler fig pattern (model: sonnet)
- **test-automator** - TDD excellence (model: sonnet)
- **typescript-pro** - Advanced types, generics (model: opus)

**Invocation:**
```typescript
Task({subagent_type: "code-reviewer", prompt: "Review for CLAUDE.md adherence"});
Task({subagent_type: "test-repair", prompt: "Fix failing tests"});
Task({subagent_type: "perf-guard", prompt: "Bundle analysis"});
```

---

### TIER 3: SKILLS (50 Total)

#### Superpowers Framework (10 - AUTO-ACTIVATE)

**Thinking Frameworks (4):**
- **inversion-thinking** - Identify failure modes
- **analogical-thinking** - Bridge concepts with analogies
- **pattern-recognition** - Detect patterns, contradictions
- **extended-thinking-framework** - Structured reasoning scaffold

**Debugging & Problem Solving (3):**
- **systematic-debugging** - 🔴 MANDATORY (auto-activates for ANY bug)
  - Phase 1: Root Cause Investigation (NO FIXES YET)
  - Phase 2: Pattern Analysis
  - Phase 3: Hypothesis Testing
  - Phase 4: Implementation
- **root-cause-tracing** - Trace bugs backward to source
- **dispatching-parallel-agents** - Coordinate multiple agents

**Planning & Design (3):**
- **brainstorming** - Transform rough ideas into designs
- **task-decomposition** - Break complex tasks into subtasks
- **writing-plans** - Create implementation plans

#### Phoenix Domain Skills (10 - File-Based AUTO-ACTIVATE)

**Core Calculation Modules (4):**
- **phoenix-truth-case-orchestrator** - Truth-case validation (119 scenarios)
- **phoenix-waterfall-ledger-semantics** - Waterfall/clawback semantics
- **phoenix-xirr-fees-validator** - XIRR/fees Excel parity
- **phoenix-precision-guard** - Numeric precision enforcement

**Advanced Features (2):**
- **phoenix-advanced-forecasting** - Probabilistic modeling (Phase 2)
- **phoenix-reserves-optimizer** - Reserve allocation engine

**Low-Confidence Modules (1):**
- **phoenix-capital-exit-investigator** - Capital allocation/exit recycling

**Supporting Skills (3):**
- **phoenix-docs-sync** - Documentation synchronization
- **phoenix-brand-reporting** - Press On Ventures branding
- **financial-calc-correctness** - Financial calculation validation

#### Workflow Engine Skills (6 - Executable Python Scripts)

- **code-formatter** - Multi-language formatting (95.8% token savings)
- **dependency-guardian** - Dependency management (95.0% token savings)
- **documentation-sync** - Code-doc consistency (75% token savings)
- **security-scanner** - Vulnerability scanning (74% token savings)
- **tech-debt-tracker** - Debt prioritization (97.7% token savings)
- **test-first-change** - TDD workflow enforcement

**Executable Pattern:**
```bash
python .claude/skills/workflow-engine/code-formatter/scripts/main.py format src/
python .claude/skills/workflow-engine/security-scanner/scripts/main.py scan-all
```

#### Testing & Quality Skills (6)

- **baseline-governance** - Baseline-based merge criteria
- **statistical-testing** - Monte Carlo validation patterns
- **test-pyramid** - E2E scope control, test level governance
- **react-hook-form-stability** - RHF infinite loop prevention
- **claude-infra-integrity** - .claude/ directory consistency
- **verification-before-completion** - 🔴 MANDATORY (auto-activates before claiming done)

#### AI/Infrastructure Skills (7)

- **ai-model-selection** - Route to optimal AI model
- **multi-model-consensus** - Query multiple models for validation
- **prompt-caching-usage** - Reduce latency/cost (85% reduction)
- **iterative-improvement** - Evaluator-Optimizer pattern
- **memory-management** - Structured notes for context
- **continuous-improvement** - Self-review and reflection
- **integration-with-other-skills** - Coordinate multiple tools

#### Data & API Design Skills (3)

- **xlsx** - Excel operations for LP reporting
- **api-design-principles** - REST API design patterns
- **architecture-patterns** - Clean Architecture, Hexagonal, DDD

#### Other Skills (4)

- **test-driven-development** - RED-GREEN-REFACTOR cycle (auto-activates)
- **defense-in-depth** - Multi-layer validation
- **notebooklm** - Query Google NotebookLM notebooks
- **condition-based-waiting** - Replace arbitrary timeouts

**Invocation:**
```typescript
// Auto-Activate (MANDATORY)
Skill("systematic-debugging"); // Every debugging task
Skill("test-driven-development"); // Feature implementation
Skill("verification-before-completion"); // Before claiming done

// Manual
Skill("brainstorming");
Skill("task-decomposition");
Skill("ai-model-selection");
```

---

### TIER 4: COMMANDS (13 Total)

#### Phoenix Validation & Testing (3)
- **/phoenix-truth** `[focus=xirr|waterfall|fees|capital|recycling|all]` - Run 119 truth cases
- **/phoenix-phase2** `[goal] seed=<int> iters=<int>` - Phase 2 probabilistic validation
- **/phoenix-prob-report** `path=<artifact.json>` - Format Monte Carlo output

#### Development Workflow Tools (3)
- **/test-smart** - Intelligent test selection (<5s, targets <30s unit tests)
- **/fix-auto** - Automated repair (lint, type, simple tests, <3min target)
- **/workflows** - Interactive helper for tool selection

#### Deployment & Validation (1)
- **/deploy-check** - 8-phase validation (<5min target, <2min fast mode)

#### Memory & Session (2)
- **/session-start** - Initialize session context with Memory Manager
- **/enable-agent-memory** - Add memory capabilities to agents

#### Evaluation & Tooling (2)
- **/evaluate-tools** `[category]` - Test calculation accuracy
- **/catalog-tooling** - Comprehensive tool inventory

#### wshobson Plugin Commands (2)
- **/deps-audit** - Dependency security + license compliance
- **/tech-debt** - Technical debt analysis + remediation

**Invocation:**
```bash
/phoenix-truth focus=xirr
/test-smart
/deploy-check
/workflows
```

---

### TIER 5: MCP TOOLS (16+ Available)

#### Multi-AI Collaboration (14 tools)
- **ask_gemini** / **ask_openai** - Ask specific models
- **gemini_code_review** / **openai_code_review** - Model-specific reviews
- **gemini_think_deep** / **openai_think_deep** - Deep analysis
- **gemini_brainstorm** / **openai_brainstorm** - Creative solutions
- **gemini_debug** / **openai_debug** - Debug assistance
- **gemini_architecture** / **openai_architecture** - Architecture advice
- **ask_all_ais** - Query all models, compare responses
- **ai_debate** - Have two AIs debate a topic
- **collaborative_solve** - Multi-AI problem solving
- **ai_consensus** - Get consensus opinion

#### TaskMaster (Project Management)
- **initialize_project** - Set up TaskMaster structure
- **get_tasks** / **get_task** - Retrieve tasks
- **add_task** / **update_task** - Manage tasks
- **expand_task** / **expand_all** - Task decomposition
- **autopilot_start** / **autopilot_next** - TDD workflow automation

**Invocation:**
```typescript
// Multi-AI Collaboration
mcp__multi-ai-collab__gemini_debug({
  error: "database 'povc_dev' does not exist",
  code: "pool.query(...)",
  context: "API test hitting real DB instead of mock"
});

mcp__multi-ai-collab__ai_consensus({
  question: "Should we use Option A (vi.mock), B (global mock), or C (test database)?",
  options: "A: Quick, B: Proper, C: Long-term"
});

// TaskMaster
mcp__taskmaster-ai__get_tasks({
  projectRoot: "c:/dev/Updog_restore",
  status: "pending"
});
```

---

## Tool Routing Decision Tree

```
START: Test failure identified
  |
  v
Is systematic-debugging skill active? (AUTO-ACTIVATES)
  |-- NO  --> ERROR: Must establish root cause FIRST
  |-- YES --> Continue to Phase 1: Root Cause Investigation
  |
  v
Is it a DATABASE MOCK issue (Category A/B)?
  |-- YES --> schema-drift-checker agent (Phoenix)
  |           "Diagnose schema alignment across Migration → Drizzle → Zod → Mock"
  |           Tools: systematic-debugging + schema-drift-checker + test-first-change
  |-- NO  --> Continue
  |
  v
Is it a TRUTH CASE failure (VC fund calculation)?
  |-- YES --> Use domain-specific agent:
  |           - XIRR: xirr-fees-validator
  |           - Waterfall: waterfall-specialist
  |           - Capital: phoenix-capital-allocation-analyst
  |           - All: phoenix-truth-case-runner
  |           Skills: financial-calc-correctness, phoenix-precision-guard
  |-- NO  --> Continue
  |
  v
Is it a SCHEMA VALIDATION failure (Category C)?
  |-- YES --> test-driven-development skill
  |           Check for RED-phase TDD markers
  |           If not TDD: update fixtures or schemas
  |           Skills: test-driven-development, financial-calc-correctness
  |-- NO  --> Continue
  |
  v
Is it a UI/COMPONENT test?
  |-- YES --> test-pyramid skill
  |           Classify: Unit (jsdom) vs E2E (browser-only)
  |           If E2E needed: playwright-test-author agent
  |           Skills: test-pyramid, react-hook-form-stability
  |-- NO  --> Continue
  |
  v
Is it a REGRESSION (was passing, now failing)?
  |-- YES --> baseline-regression-explainer agent
  |           Skills: baseline-governance
  |-- NO  --> Continue systematic-debugging phases
  |
  v
Fix with root cause documentation (systematic-debugging Phase 4)
  |
  v
Add defense-in-depth validation layers (if applicable)
  |-- Skill: defense-in-depth
  |
  v
Run batch gate (verification-before-completion AUTO-ACTIVATES)
  |-- npm test -- <test-file>
  |-- npm run check (TypeScript ≤387)
  |-- schema-drift-checker (if mocks touched)
  |-- /test-smart (affected tests)
  |
  v
DONE
```

---

## Execution Plans with Full Tool Chains

### Priority 1: Database Mock Bypass (Category A) - 4-6 hours

**Tool Chain:**
```
systematic-debugging → schema-drift-checker → test-first-change →
code-formatter → verification-before-completion → /test-smart
```

**Step-by-Step:**

1. **Phase 1: Root Cause Investigation** (systematic-debugging AUTO-ACTIVATES)
   ```typescript
   // NO FIXES YET - Investigation only

   // Read infrastructure
   cat tests/helpers/database-mock.ts
   cat tests/helpers/database-mock.cjs
   cat tests/setup/db-delegate-link.ts
   cat tests/setup/node-setup.ts

   // Read failing test
   cat tests/api/allocations.test.ts | head -50

   // Document root cause in commit message (later)
   ```

2. **Phase 2: Pattern Analysis**
   ```typescript
   // Invoke schema-drift-checker agent
   Task({
     subagent_type: "schema-drift-checker",
     prompt: "Diagnose schema alignment across Migration → Drizzle → Zod → Mock layers. Focus on server/db exports vs database-mock.cjs exports. List all missing mock contracts."
   });

   // Use pattern-recognition skill
   Skill("pattern-recognition");
   // Compare working vs failing tests
   // Identify mock bypass pattern
   ```

3. **Phase 3: Hypothesis Testing**
   ```typescript
   // Choose fix approach
   // Option A: vi.mock() in each test file
   // Option B: Global mock in vitest.config.ts
   // Option C: Test database with Testcontainers

   // Test on 1-2 files as proof of concept
   ```

4. **Phase 4: Implementation**
   ```bash
   # Find all API test files
   find tests/api -name "*.test.ts"

   # Apply fix systematically
   # (Edit files with chosen pattern)

   # Run test-first-change skill
   Skill("test-first-change");
   # Establish before/after baseline

   # Format code
   python .claude/skills/workflow-engine/code-formatter/scripts/main.py format tests/api/
   ```

5. **Validation** (verification-before-completion AUTO-ACTIVATES)
   ```bash
   # Run affected tests
   /test-smart

   # TypeScript baseline check
   npm run check  # Must be ≤387 errors

   # Re-validate schema alignment
   Task({
     subagent_type: "schema-drift-checker",
     prompt: "Re-validate after database mock updates"
   });
   ```

**Success Criteria:**
- [ ] All API tests use mocked database (no real DB connections)
- [ ] schema-drift-checker validates mock contracts
- [ ] TypeScript baseline ≤387 errors
- [ ] /test-smart passes for all API tests

---

### Priority 2: Incomplete Mock Exports (Category B) - 2-3 hours

**Tool Chain:**
```
schema-drift-checker → typescript-pro → code-formatter →
verification-before-completion → /test-smart
```

**Step-by-Step:**

1. **Investigation**
   ```typescript
   // Invoke schema-drift-checker
   Task({
     subagent_type: "schema-drift-checker",
     prompt: "List all missing exports in tests/helpers/database-mock.cjs that integration tests expect. Compare server/db/index.ts exports with database-mock.cjs exports."
   });

   // Read server/db entry point
   cat server/db/index.ts
   // Catalog ALL exports
   ```

2. **Implementation**
   ```typescript
   // Invoke typescript-pro agent
   Task({
     subagent_type: "typescript-pro",
     model: "opus",
     prompt: "Design type-safe export additions for database-mock.cjs to include: q, query, queryWithRetry, redisSet, cache, pgPool, checkDatabaseHealth"
   });

   // Update database-mock.cjs with recommended exports
   // (Edit file)

   // Format
   python .claude/skills/workflow-engine/code-formatter/scripts/main.py format tests/helpers/
   ```

3. **Validation**
   ```bash
   # Run integration tests
   /test-smart

   # Re-validate schema alignment
   Task({
     subagent_type: "schema-drift-checker",
     prompt: "Confirm alignment after mock export updates"
   });
   ```

**Success Criteria:**
- [ ] database-mock.cjs exports all required functions
- [ ] schema-drift-checker confirms alignment
- [ ] Integration tests pass
- [ ] No "No export defined" errors

---

### Priority 3: Schema Validation Failures (Category C) - 2-4 hours

**Tool Chain:**
```
test-driven-development → financial-calc-correctness →
code-reviewer → verification-before-completion → /test-smart
```

**Step-by-Step:**

1. **Triage**
   ```bash
   # Check for TDD phase markers
   grep -n "RED:" tests/unit/capital-allocation-step.test.tsx
   grep -n "GREEN:" tests/unit/capital-allocation-step.test.tsx

   # Invoke test-driven-development skill
   Skill("test-driven-development");
   # Determines if intentional RED-phase

   # If VC fund calculation-related, invoke financial-calc-correctness
   Skill("financial-calc-correctness");
   # Check Excel parity, tolerances
   ```

2. **Fix or Document**
   ```typescript
   // If RED-phase TDD
   // → Document as intentional, add TODO for GREEN phase

   // If regression
   // → Analyze safeParse() errors
   const parseResult = capitalAllocationSchema.safeParse(minimalData);
   if (!parseResult.success) {
     console.error(parseResult.error.format());
   }

   // → Update test fixtures OR schema definitions

   // Invoke code-reviewer
   Task({
     subagent_type: "code-reviewer",
     prompt: "Quality check schema validation fixes"
   });
   ```

3. **Validation**
   ```bash
   # verification-before-completion skill AUTO-ACTIVATES
   Skill("verification-before-completion");
   # Requires evidence before claiming done

   # Run tests
   /test-smart
   ```

**Success Criteria:**
- [ ] RED-phase TDD tests documented as intentional
- [ ] Non-TDD failures fixed (test data or schemas)
- [ ] verification-before-completion confirms fixes

---

## Quality Gates & Success Criteria

### Per-Category Gates

**Category A (Database Mock Bypass):**
```bash
# Individual test validation
npm test -- tests/api/allocations.test.ts

# Schema alignment check
Task({subagent_type: "schema-drift-checker", prompt: "Validate mock contracts"});

# TypeScript baseline
npm run check  # Must be ≤387 errors

# Affected tests
/test-smart
```

**Category B (Incomplete Mock Exports):**
```bash
# Integration tests
npm test -- tests/integration

# Schema alignment re-check
Task({subagent_type: "schema-drift-checker", prompt: "Confirm alignment"});

# TypeScript check
npm run check
```

**Category C (Schema Validation):**
```bash
# TDD phase verification
Skill("test-driven-development");

# Financial calculation correctness (if VC domain)
Skill("financial-calc-correctness");

# Affected tests
/test-smart

# Evidence before claims
Skill("verification-before-completion");
```

### Sprint Completion Gate

```bash
# Run in order (sequential dependencies):
npm run validate:claude-infra    # 1. Infrastructure consistency
npm run validate:schema-drift    # 2. Schema alignment
npm run check                    # 3. TypeScript (≤387 errors)
npm run build                    # 4. Build passes
npm test                         # 5. Full test suite
/phoenix-truth                   # 6. All 119 truth cases pass
/deploy-check                    # 7. 8-phase comprehensive validation

# Target Metrics:
# - Test file pass rate: >90% (currently 57.8%)
# - Individual test pass rate: >95% (currently 80.6%)
# - TypeScript errors: ≤387 (no new errors)
```

---

## Key Files to Review

### Database Mock Infrastructure
- `tests/helpers/database-mock.ts` - Rich TypeScript mock (source of truth)
- `tests/helpers/database-mock.cjs` - Pure CJS delegation shell
- `tests/setup/db-delegate-link.ts` - CJS/ESM bridge
- `server/db/pg-circuit.ts` - Production database pool (what tests import)
- `server/db/index.ts` - Database module entry point

### Test Setup
- `tests/setup/jsdom-setup.ts` - Client test environment (fixed)
- `tests/setup/node-setup.ts` - Server test environment (fixed)
- `tests/setup/test-infrastructure.ts` - Shared setup
- `vitest.config.ts` - Test projects configuration

### Failing Tests (Samples)
- `tests/api/allocations.test.ts` - Category A example
- `tests/integration/circuit-breaker-db.test.ts` - Category B example
- `tests/unit/capital-allocation-step.test.tsx` - Category C example

### Dev Tooling References
- `CAPABILITIES.md` - Capability inventory (**NOTE:** Claims "200+ marketplace agents" but 0 active)
- `.claude/agents/PHOENIX-AGENTS.md` - Phoenix agent registry (9 agents)
- `.claude/skills/README.md` - Skills catalog (50 total)
- `.claude/commands/` - 13 command definitions
- `cheatsheets/INDEX.md` - 30 cheatsheets by category

---

## Tool Discovery Quick Reference

### How to Find Available Tools

**Agents:**
```bash
# List all project agents
ls .claude/agents/*.md

# Phoenix registry
cat .claude/agents/PHOENIX-AGENTS.md

# Agent invocation
Task({subagent_type: "agent-name", prompt: "description"});
```

**Skills:**
```bash
# List all skills
ls .claude/skills/*.md
ls .claude/skills/*/SKILL.md

# Skills catalog
cat .claude/skills/README.md

# Skill invocation
Skill("skill-name");
```

**Commands:**
```bash
# List all commands
ls .claude/commands/*.md

# Command invocation
/command-name [args]
```

**Executable Skills:**
```bash
# List workflow-engine executable skills
ls .claude/skills/workflow-engine/*/scripts/main.py

# Execution
python .claude/skills/workflow-engine/<skill-name>/scripts/main.py <action>
```

**MCP Tools:**
```typescript
// List in settings.local.json
cat .claude/settings.local.json | grep mcp

// Invocation
mcp__<server>__<tool>({...params});
```

---

## Estimated Effort

| Category | Hours | Tool Combination |
|----------|-------|------------------|
| **Category A (Database Mock)** | 4-6 | systematic-debugging + schema-drift-checker + test-first-change + code-formatter + verification-before-completion |
| **Category B (Mock Exports)** | 2-3 | schema-drift-checker + typescript-pro + code-formatter + verification-before-completion |
| **Category C (Schema Validation)** | 2-4 | test-driven-development + financial-calc-correctness + code-reviewer + verification-before-completion |
| **Documentation Updates** | 2-3 | Update CAPABILITIES.md (marketplace agent count), create tool routing guide |
| **Total** | **10-16 hours** across multiple sessions |

---

## How to Use This Kickoff

### For Claude Code:
```
I'm continuing Week 2 Foundation Hardening work (labeled Week 2.5). The current state is documented in week2-foundation-hardening branch (PR #293).

Please read docs/plans/WEEK2.5-FOUNDATION-HARDENING-KICKOFF.md and:
1. Start with Category A (Database Mock Bypass) - highest impact
2. Follow the Tool Chain: systematic-debugging → schema-drift-checker → test-first-change
3. Apply fixes with incremental validation
4. Use the comprehensive 5-tier tool inventory (250+ components)
5. Report progress with test file pass rate metrics

MANDATORY: Invoke systematic-debugging skill for root cause investigation BEFORE proposing fixes. Follow the 4-phase framework.

Tool Routing Decision Tree is your primary guide for tool selection.
```

### For Manual Work:
```bash
# Checkout branch
git checkout week2-foundation-hardening

# Pull latest
git pull origin week2-foundation-hardening

# Review PR context
gh pr view 293

# Category A investigation
cat tests/helpers/database-mock.ts
cat tests/api/allocations.test.ts | head -50

# Run API tests to confirm error
npm test -- tests/api/allocations.test.ts
```

---

## Plugin Infrastructure Status

### Active Tools
- **Project-Level:** 81 components (44 agents + 37 skills + 13 commands)
- **User-Level:** ~15 global agents (cross-project)
- **MCP Servers:** multi-ai-collab (16 tools), taskmaster-ai

### Disabled Tools
- **Marketplace Plugins:** 0 active (4 repos cloned but `.git_disabled`)
  - claude-code-workflows
  - claude-code-plugins
  - cliftonc-plugins
  - superpowers-dev

**CRITICAL NOTE:** CAPABILITIES.md claims "200+ marketplace agents" but ALL marketplace plugins are DISABLED. All functionality comes from project-level and user-level plugins.

### Recommended Documentation Updates
1. **CAPABILITIES.md:** Correct marketplace agent count (0 active, not 200+)
2. **Tool Routing Guide:** Create comprehensive 5-tier routing guide
3. **Plugin Architecture:** Document project vs user vs marketplace tiers

---

**Last Updated:** 2025-12-19
**Author:** Claude Code (Sonnet 4.5)
**PR:** #293
**Test Status:** 46/116 files failing (57.8% pass rate) → Target: 90%+ pass rate
**Tool Suite:** 250+ components (Phoenix + Project + Skills + Commands + MCP)
**Distinguishing Label:** Week 2.5 (Complete tool inventory + execution plans)
