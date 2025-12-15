# Development Strategy - Phase 1 Completion Assessment

**Date:** December 14, 2025
**Status:** DRAFT - Pending Approval
**Reference:** Phoenix Execution Plan v2.34
**Approach:** Validation-First, Evidence-Driven, Agent-Enhanced

---

## Executive Summary

Strategic assessment based on parallel subagent analysis of CAPABILITIES.md, CHANGELOG.md, DECISIONS.md, test infrastructure, and Phoenix engine status.

**Current Position:** Phase 1 nearly complete (89/119 truth cases validated)

**Recommended Path:** Modified Path 1A - Complete blocked modules before Phase 2

**Remaining Work:**
- Capital Allocation: 20 truth cases (semantic lock READY)
- Exit Recycling: 10 truth cases (adapter scaffolded)
- PR #227: Wizard Step 4 merge (11 tests blocked)

**Core Principle:** Production code + JSON truth cases are the joint source of truth. Complete Phase 1 deterministic validation before advancing to Phase 2 probabilistic engines.

---

## Verified Ground Truth (Current State)

### Truth Case Distribution (Per v2.34)

| Module | File | Count | Pass Rate | Confidence | Status |
|--------|------|-------|-----------|------------|--------|
| XIRR | `docs/xirr.truth-cases.json` | 51 | 100% (51/51) | HIGH | PRODUCTION READY |
| Waterfall (Tier) | `docs/waterfall-tier.truth-cases.json` | 15 | 100% (15/15) | HIGH | VALIDATED |
| Waterfall (Ledger) | `docs/waterfall-ledger.truth-cases.json` | 14 | 100% (14/14) | HIGH | VALIDATED |
| Fees | `docs/fees.truth-cases.json` | 10 | 100% (10/10) | HIGH | VALIDATED |
| Capital Allocation | `docs/capital-allocation.truth-cases.json` | 20 | PENDING | LOW | SPEC LOCKED |
| Exit Recycling | `docs/exit-recycling.truth-cases.json` | 10 | PENDING | LOW | ADAPTER READY |
| **Total** | | **119** | **75% (89/119)** | | |

### Phase 1 Module Gates (v2.34 Thresholds)

| Module | 1A Threshold | Current | Gate Status |
|--------|--------------|---------|-------------|
| XIRR | 100% (51/51) | 100% (51/51) | PASSED |
| Waterfall (combined) | >= 95% (28/29) | 100% (29/29) | PASSED |
| Fees | >= 90% (9/10) | 100% (10/10) | PASSED |
| Capital Allocation | >= 80% (16/20) | 0% (0/20) | BLOCKED |
| Exit Recycling | >= 80% (8/10) | 0% (0/10) | BLOCKED |

**Assessment:** Phase 1A gates PASSED for 3/5 modules. CA and Exit Recycling block Phase 1 completion.

### Domain Knowledge Sources (NotebookLM)

**Location:** `docs/notebooklm-sources/` (22 files, ~85,000 words)

**Phase 1 (Deterministic) - Status:**
- `xirr.md` - 96.3% validation score - COMPLETE
- `waterfall.md` - 94.3% validation score - COMPLETE
- `fees.md` - 94.5% validation score - COMPLETE
- `capital-allocation.md` - 99% documentation quality - IMPLEMENTATION PENDING
- `exit-recycling.md` - 91% documentation quality - EXECUTION PENDING

**Phase 2 (Probabilistic) - Documentation COMPLETE (Nov 6, 2025):**
- `reserves/` (4 files, ~23 pages) - ReserveEngine
- `pacing/` (4 files, ~26 pages) - PacingEngine
- `cohorts/` (3 files, ~69 pages) - CohortEngine
- `monte-carlo/` (4 files, ~120 pages) - Monte Carlo simulation

---

## Strategic Path Analysis

### Path Options (Per v2.34 Decision Logic)

| Path | Trigger Condition | Focus | Duration |
|------|-------------------|-------|----------|
| **1A** | Core tests >= 70% AND module gates met | Cleanup + hardening | 4-5 days |
| **1B** | Core tests >= 50% AND truth cases >= 60% | Bug fixes then cleanup | 12-15 days |
| **1C** | Anything below | Targeted rebuild | 4-6 weeks |

**Current State:**
- Core test pass rate: 74.7% (meets 1A threshold)
- Truth case pass rate: 75% (89/119)
- Module gates: 3/5 PASSED, 2/5 BLOCKED (CA, Exit Recycling)

**Recommended Path:** Modified 1A - Complete blocked modules before Phase 2

### Why Complete Phase 1 First

| Factor | Rationale |
|--------|-----------|
| **Deterministic Foundation** | CA and Exit Recycling are deterministic prerequisites for probabilistic work |
| **Semantic Lock Ready** | CA-SEMANTIC-LOCK.md provides 1,088 lines of machine-testable spec |
| **Adapter Scaffolded** | Exit Recycling adapter exists in `tests/unit/truth-cases/exit-recycling-adapter.ts` |
| **Clean Milestone** | 119/119 = Phase 1 COMPLETE gate (unambiguous success criteria) |
| **Risk Reduction** | Phase 2 probabilistic validation harder without deterministic baseline |

---

## Phase 1 Completion Roadmap

### Step 1.1: Capital Allocation Implementation (Est: 3-5 days)

**Objective:** Validate 20 CA truth cases against production code.

**Semantic Lock:** `docs/CA-SEMANTIC-LOCK.md` (1,088 lines)

**Key Deliverables:**
- 6 conservation models verified
- Determinism contract validated
- 20 truth cases passing (CA-001 to CA-020)

**Agent Utilization:**

| Task | Agent | Skill |
|------|-------|-------|
| Implementation | `waterfall-specialist` | `phoenix-capital-exit-investigator` |
| Truth Case Execution | `phoenix-truth-case-runner` | `test-driven-development` |
| Validation | `code-reviewer` | `verification-before-completion` |

**Commands:**
```bash
# Load and execute CA truth cases
/phoenix-truth --module=capital-allocation

# Validate against semantic lock
Task("phoenix-truth-case-runner", "Validate CA-001 to CA-020 against CA-SEMANTIC-LOCK.md")
```

**Gate:** >= 80% (16/20) for 1A, 100% (20/20) for Phase 1 COMPLETE

### Step 1.2: Exit Recycling Execution (Est: 1-2 days)

**Objective:** Execute 10 Exit Recycling truth cases.

**Adapter Location:** `tests/unit/truth-cases/exit-recycling-adapter.ts`

**Agent Utilization:**

| Task | Agent | Skill |
|------|-------|-------|
| Adapter Integration | `phoenix-truth-case-runner` | `systematic-debugging` |
| Execution | `test-repair` | `root-cause-tracing` |
| Validation | `xirr-fees-validator` | `verification-before-completion` |

**Commands:**
```bash
# Enable exit recycling in runner
/phoenix-truth --module=exit-recycling

# Run truth cases
npm test -- tests/unit/truth-cases/runner.test.ts -t "Exit Recycling"
```

**Gate:** >= 80% (8/10) for 1A, 100% (10/10) for Phase 1 COMPLETE

### Step 1.3: PR #227 Resolution (Est: 2-3 hours)

**Objective:** Merge Wizard Step 4 (Fees) PR.

**Blocker:** 11 tests blocked on full wizard context

**Actions:**
1. Identify specific test failures in PR #227
2. Provide full wizard context for blocked tests
3. Resolve failures
4. Merge PR

**Commands:**
```bash
# Check PR status
gh pr view 227 --json state,statusCheckRollup

# Run blocked tests with context
npm test -- --project=client -t "wizard"
```

---

## Phase 1 Completion Gate

### Definition of Done (Phase 1 COMPLETE)

| Criteria | Target | Current |
|----------|--------|---------|
| XIRR Truth Cases | 51/51 (100%) | 51/51 |
| Waterfall Truth Cases | 29/29 (100%) | 29/29 |
| Fees Truth Cases | 10/10 (100%) | 10/10 |
| Capital Allocation | 20/20 (100%) | 0/20 |
| Exit Recycling | 10/10 (100%) | 0/10 |
| **Total** | **119/119 (100%)** | **89/119 (75%)** |
| PR #227 | Merged | Open |
| Test Pass Rate | >= 74.7% | 74.7% |
| TypeScript Errors | <= 450 | 450 |

### Quality Gates (Per ADR-014)

- Feature pass rate >= baseline - 1% (73.7%)
- Zero NEW regressions
- No new TypeScript errors
- Pre-commit hooks passing

---

## Optimal Dev Tool Combinations

### Phase 1 Tool Stack (Comprehensive)

This section maps the best combination of all available tools for maximum efficiency.

---

### Layer 1: Slash Commands (Workflow Automation)

| Command | Phase | Usage | Fallback |
|---------|-------|-------|----------|
| `/phoenix-truth` | All | Run 119 truth cases, classify failures, route to specialists | `npm run phoenix:truth` |
| `/test-smart` | After changes | Intelligent test selection based on modified files | `npm test -- --changed` |
| `/fix-auto` | After failures | Auto-repair lint, format, simple test failures (4-phase) | `npm run lint:fix` |
| `/deploy-check` | Before merge | Pre-deployment validation (8 phases) | `npm run check && npm run build` |

**Workflow Chain:**
```
/phoenix-truth → identify failures → /fix-auto → /test-smart → /deploy-check
```

---

### Layer 2: Skills (Auto-Activate on Context)

| Skill | Activation | Phase 1 Usage |
|-------|------------|---------------|
| `task-decomposition` | Complex task (3+ steps) | Break CA into 20 subtasks |
| `systematic-debugging` | Any bug/failure | ROOT CAUSE FIRST (Iron Law) |
| `root-cause-tracing` | Deep call stack errors | Trace backward through function calls |
| `dispatching-parallel-agents` | 3+ independent failures | Parallelize CA truth case validation |
| `writing-plans` | Before implementation | Generate TDD plans (2-5 min tasks) |
| `multi-model-consensus` | Complex logic | Cross-validate clawback semantics via MCP |
| `memory-management` | Cross-session context | Persist truth case pass rates, bug classifications |
| `iterative-improvement` | After each subtask | Small cycles with verification |

**Skill Chain for CA Implementation:**
```
task-decomposition → writing-plans → systematic-debugging (if failures) → iterative-improvement
```

---

### Layer 3: MCP Tools (Multi-AI Collaboration)

| Tool | Usage | Phase 1 Application |
|------|-------|---------------------|
| `mcp__multi-ai-collab__ai_debate` | Complex semantics | Validate CA conservation models |
| `mcp__multi-ai-collab__collaborative_solve` | Multi-module bugs | Cross-validate CA + Exit Recycling integration |
| `mcp__multi-ai-collab__ask_gemini` | Quick validation | Spot-check individual truth cases |
| `mcp__notebooklm-mcp__ask_question` | Domain knowledge | Query 85K word Phoenix documentation (zero hallucination) |

**MCP Chain for LOW Confidence Scenarios:**
```
notebooklm__ask_question (domain knowledge) → ai_debate (semantics validation) → collaborative_solve (integration)
```

---

### Layer 4: Phoenix-Specific Agents

| Agent | Scope | Phase 1 Task Assignment |
|-------|-------|-------------------------|
| `phoenix-truth-case-runner` | Truth case execution | CA-001 to CA-020 validation |
| `waterfall-specialist` | Waterfall/allocation edge cases | CA conservation model verification |
| `phoenix-capital-allocation-analyst` | LOW confidence modules | CA/Exit Recycling spot-checks |
| `xirr-fees-validator` | Excel parity | Cross-validate Exit Recycling |
| `test-repair` | Automated failure triage | Classify failures as CODE BUG / TRUTH CASE ERROR / MISSING FEATURE |

**Agent Dispatch Strategy:**
```typescript
// Parallel dispatch for independent CA truth cases (single message)
Task({ subagent_type: "phoenix-capital-allocation-analyst", prompt: "Validate CA-001 to CA-010..." });
Task({ subagent_type: "phoenix-capital-allocation-analyst", prompt: "Validate CA-011 to CA-020..." });
```

---

### Layer 5: TodoWrite Integration

**Track all Phase 1 work with TodoWrite:**

```typescript
TodoWrite({
  todos: [
    { content: "Run /phoenix-truth baseline", activeForm: "Running Phoenix truth baseline", status: "pending" },
    { content: "Decompose CA into 20 subtasks", activeForm: "Decomposing CA implementation", status: "pending" },
    { content: "Validate CA conservation models", activeForm: "Validating CA conservation models", status: "pending" },
    { content: "Execute Exit Recycling truth cases", activeForm: "Executing Exit Recycling validation", status: "pending" },
    { content: "Run /deploy-check before merge", activeForm: "Running pre-deployment validation", status: "pending" }
  ]
});
```

---

### Optimal Tool Combinations by Step

#### Step 1.1: Capital Allocation (3-5 days)

| Phase | Tools | Rationale |
|-------|-------|-----------|
| **Decomposition** | `task-decomposition` skill + TodoWrite | Break 20 truth cases into testable chunks |
| **Domain Research** | `mcp__notebooklm-mcp__ask_question` | Query CA documentation (99% quality) |
| **Implementation** | `writing-plans` skill + `test-driven-development` | RED-GREEN-REFACTOR for each case |
| **Validation** | `/phoenix-truth --module=capital` | Execute CA truth cases |
| **Debugging** | `systematic-debugging` + `root-cause-tracing` | ROOT CAUSE FIRST for failures |
| **Cross-Validate** | `mcp__multi-ai-collab__ai_debate` | Verify conservation model semantics |
| **Parallel Work** | `dispatching-parallel-agents` (if 3+ failures) | Dispatch agents per failure domain |

**Command Sequence:**
```bash
# 1. Domain research
mcp__notebooklm-mcp__ask_question("What are the 6 CA conservation models?")

# 2. Decompose
Use task-decomposition skill for CA-001 to CA-020

# 3. Execute with TDD
For each truth case: write test → run (FAIL) → implement → run (PASS)

# 4. Validate
/phoenix-truth --module=capital

# 5. Cross-validate semantics
mcp__multi-ai-collab__ai_debate("Validate CA conservation model: total_allocated == sum(investments)")
```

#### Step 1.2: Exit Recycling (1-2 days)

| Phase | Tools | Rationale |
|-------|-------|-----------|
| **Enable Adapter** | `systematic-debugging` | Debug adapter integration issues |
| **Execute Cases** | `/phoenix-truth --module=recycling` | Run 10 Exit Recycling scenarios |
| **Cross-Validate** | `xirr-fees-validator` agent | Verify recycling math against Excel |
| **Integration** | `mcp__multi-ai-collab__collaborative_solve` | Validate CA + Exit Recycling work together |

**Command Sequence:**
```bash
# 1. Enable adapter in runner
Edit tests/unit/truth-cases/runner.test.ts to include exit-recycling-adapter

# 2. Run focused validation
/phoenix-truth --module=recycling

# 3. Cross-validate with agent
Task("xirr-fees-validator", "Cross-check Exit Recycling ER-001 to ER-010 against Excel")
```

#### Step 1.3: PR #227 Resolution (2-3 hours)

| Phase | Tools | Rationale |
|-------|-------|-----------|
| **Diagnose** | `gh pr view 227` + `systematic-debugging` | Identify 11 blocked test root causes |
| **Fix** | `/fix-auto` | Auto-repair simple failures |
| **Verify** | `/test-smart` | Run affected wizard tests |
| **Merge** | `/deploy-check` | Pre-merge validation |

**Command Sequence:**
```bash
# 1. Check PR status
gh pr view 227 --json statusCheckRollup

# 2. Run blocked tests
npm test -- --project=client -t "wizard"

# 3. Auto-fix if simple failures
/fix-auto

# 4. Pre-merge validation
/deploy-check
```

---

### Anti-Pattern Prevention (Per ADR-011)

| Anti-Pattern | Tool Prevention |
|--------------|-----------------|
| Fixing without root cause | `systematic-debugging` skill (Iron Law: NO FIXES WITHOUT ROOT CAUSE) |
| Sequential agent dispatch | `dispatching-parallel-agents` (single message for parallelism) |
| Missing validation | `/phoenix-truth` (119 truth cases) |
| Regression introduction | `/test-smart` after each change |
| Pre-merge failures | `/deploy-check` (8-phase validation) |

---

### Quality Gates with Tools

| Gate | Tool | Success Criteria |
|------|------|------------------|
| **Phase 0** | `/phoenix-truth` | Baseline captured, failures classified |
| **CA Implementation** | `task-decomposition` + TodoWrite | 20/20 truth cases passing |
| **Exit Recycling** | `/phoenix-truth --module=recycling` | 10/10 truth cases passing |
| **Pre-Merge** | `/deploy-check` | Build, lint, test, bundle all pass |
| **Phase 1 COMPLETE** | `/phoenix-truth` | 119/119 truth cases (100%) |

---

## Risk Mitigation

| Risk | Mitigation | Agent/Skill |
|------|------------|-------------|
| CA implementation complexity | Semantic lock provides complete spec | `phoenix-capital-allocation-analyst` |
| Exit Recycling adapter issues | Adapter already scaffolded | `test-repair` |
| Test environment issues | Node version workarounds documented | Manual |
| Scope creep to Phase 2 | Strict Phase 1 COMPLETE gate | `verification-before-completion` |

---

## Immediate Next Steps

### Step 0: Environment Verification (10 min)

```bash
# Verify test runner works
npm run doctor:quick

# Check truth case file count
ls docs/*.truth-cases.json | wc -l
# Expected: 6 files
```

### Step 1: Current State Assessment (20 min)

```bash
# Run Phase 0 validation
/phoenix-truth

# Capture baseline
npm test -- --run --reporter=verbose 2>&1 | head -50
```

### Step 2: CA Semantic Lock Review (30 min)

```bash
# Review implementation spec
Read docs/CA-SEMANTIC-LOCK.md

# Check existing CA code
rg "allocateCapital|capital.*allocation" --type ts
```

### Step 3: Begin Implementation (Ongoing)

```bash
# Use agent for CA implementation
Task("phoenix-capital-allocation-analyst", "Implement CA truth cases CA-001 to CA-020 per CA-SEMANTIC-LOCK.md")
```

---

## Timeline Summary

| Phase | Work | Duration | Gate |
|-------|------|----------|------|
| **Step 1.1** | Capital Allocation | 3-5 days | 20/20 |
| **Step 1.2** | Exit Recycling | 1-2 days | 10/10 |
| **Step 1.3** | PR #227 Merge | 2-3 hours | Merged |
| **Phase 1 COMPLETE** | All modules validated | **5-8 days total** | 119/119 |

**Phase 2 Start:** After Phase 1 COMPLETE gate achieved

---

## Cross-References

- **Execution Plan:** `docs/PHOENIX-SOT/execution-plan-v2.34.md`
- **CA Semantic Lock:** `docs/CA-SEMANTIC-LOCK.md`
- **Phase 2 Documentation:** `docs/notebooklm-sources/PHASE2-COMPLETE.md`
- **Tool Routing:** `.claude/PHOENIX-TOOL-ROUTING.md`
- **Agent Reference:** `.claude/agents/PHOENIX-AGENTS.md`
- **ADR-014 (Merge Criteria):** `DECISIONS.md`

---

*This strategy document aligns with Phoenix Execution Plan v2.34 nomenclature.*
