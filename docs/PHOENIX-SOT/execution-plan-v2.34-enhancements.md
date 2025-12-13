# Phoenix Execution Plan v2.34 - MCP & Tool Routing Enhancements

**Date:** 2025-12-11 **Status:** FOUNDATION COMPLETE - Command infrastructure
delivered in PR #249 **Base:** v2.33 (Phoenix Agent Integration)

**Version Note:** v2.34 = v2.33 + MCP tool routing + Skill invocation
templates + PHOENIX-SOT directory structure

---

## What's New in v2.34

### 1. PHOENIX-SOT Directory Structure

**Created:** `docs/PHOENIX-SOT/` - Single source of truth hub for all Phoenix
work

**Files:**

- `README.md` - Navigation hub for humans and AI agents
- `skills-overview.md` - Complete catalog of 24 skills (9 Phoenix-core + 3
  cross-cutting + 5 situational + 6 v2.34 + extras)
- `mcp-tools-guide.md` - MCP server integration patterns (TaskMaster + Multi-AI)
- `prompt-templates.md` - 3 gate validation templates (Waterfall, ReserveSizing,
  PortfolioQA)
- **`execution-plan-v2.34.md`** - Full execution plan (this document references
  it)

### 2. Tool Routing System

**Created:** `.claude/PHOENIX-TOOL-ROUTING.md` - Comprehensive routing guide

**Eliminates:** "Which agent/tool should I use?" paralysis (30% session waste)

**Features:**

- 6-node decision tree for ambiguous cases
- 9 file-based auto-activation rules
- Phase-by-phase routing (P0/1A/1B/2/3+)
- 40+ TaskMaster MCP functions documented
- 8+ Multi-AI collaboration functions documented
- 3 concrete routing examples

### 3. New v2.34 Skills (6 Added)

| Skill                         | Purpose                                   | Integration Points       |
| ----------------------------- | ----------------------------------------- | ------------------------ |
| `task-decomposition`          | Break complex tasks into ordered subtasks | Step 0.2, 1A.4           |
| `writing-plans`               | Generate 2-5 min TDD plans                | Steps 1A.5-1A.6          |
| `memory-management`           | Cross-phase context management            | Step 0.0, retros         |
| `continuous-improvement`      | End-of-phase retrospectives               | After P0, P1A, P1B, P2   |
| `extended-thinking-framework` | Escalate complex bugs                     | Phase 1B, Phase 2        |
| `prompt-caching-usage`        | Optimize shared context                   | Phase 2 multi-agent work |

### 4. MCP Tool Integration Points

#### TaskMaster (mcp**taskmaster-ai**)

**Step 0.0:** Initialize project tracking

```bash
mcp__taskmaster-ai__initialize_project \
  --projectRoot "c:/dev/Updog_restore" \
  --skipInstall false \
  --storeTasksInGit true
```

**Step 0.2:** Expand truth case work

```bash
mcp__taskmaster-ai__expand_task \
  --projectRoot "c:/dev/Updog_restore" \
  --id "phase0-truth-validation" \
  --num 10
```

**Step 0.10:** Start TDD autopilot (if proceeding to 1A)

```bash
mcp__taskmaster-ai__autopilot_start \
  --taskId "1" \
  --projectRoot "c:/dev/Updog_restore" \
  --maxAttempts 3
```

**Steps 1A.5-1A.6:** Track TDD subtasks

```bash
mcp__taskmaster-ai__add_task \
  --projectRoot "c:/dev/Updog_restore" \
  --prompt "Implement pure calculation function for XIRR with Decimal.js" \
  --priority "high"
```

#### Multi-AI Collaboration (mcp**multi-ai-collab**)

**Step 0.4:** Cross-validate L08 clawback

```bash
mcp__multi-ai-collab__ai_debate \
  --topic "Should L08 clawback use shortfall-based or distribution-based logic?" \
  --ai1 "gemini" \
  --ai2 "openai"
```

**Step 0.9:** XIRR Excel semantics validation

```bash
mcp__multi-ai-collab__ask_all_ais \
  --prompt "Validate XIRR scenario 07 convergence behavior against Excel XIRR() function"
```

**Phase 1B:** Multi-module bug solving

```bash
mcp__multi-ai-collab__collaborative_solve \
  --problem "XIRR + Waterfall + Fees all failing - investigate dependency chain" \
  --approach "sequential"
```

---

## Skill Invocation Templates

### 1. task-decomposition (Step 0.2, 1A.4)

**When:** Breaking down complex work into ordered subtasks

**Invocation:**

```markdown
Use task-decomposition skill to break down [task] into subtasks:

1. Analyze complexity (simple/moderate/complex)
2. Identify dependencies (sequential/parallel/hybrid)
3. Define acceptance criteria for each subtask
4. Estimate 10-30 minute time boxes per subtask

Deliverable: Ordered list of subtasks with clear success criteria
```

**Example (Step 0.2):**

```markdown
Task: Build truth case runner for 119 scenarios

Subtasks:

1. JSON schema validation (10 min) - All 6 JSON files load without errors
2. Assertion helper functions (15 min) - toBeCloseTo, stripNotes, handleNull
   implemented
3. XIRR test suite (15 min) - 50 scenarios passing
4. Waterfall-tier suite (10 min) - 15 scenarios passing
5. Waterfall-ledger suite (15 min) - 14 scenarios with clawback logic
6. Fees + Capital + Exit suites (15 min) - 40 scenarios passing
7. Coverage validation (10 min) - ≥90% coverage on helpers

Total: 90 minutes, 7 subtasks
```

### 2. writing-plans (Steps 1A.5-1A.6)

**When:** Before touching code for TDD microsteps

**Invocation:**

```markdown
Use writing-plans skill to generate TDD implementation plan:

1. RED phase (2-5 min):
   - Write failing test
   - Expected behavior
   - Edge cases

2. GREEN phase (2-5 min):
   - Minimal implementation
   - Passes test
   - No extras

3. REFACTOR phase (2-5 min):
   - Extract pure functions
   - Improve names
   - Add JSDoc

Deliverable: 3-step plan, each step 2-5 minutes, with clear test → code →
refactor
```

**Example (Step 1A.5):**

```markdown
Plan: Extract calculateWaterfallTier pure function

RED (3 min):

- Test: expect(calculateWaterfallTier({...})).toEqual({lpProceeds: 800K,
  gpCarry: 200K})
- Input: Simple 20% carry, no hurdle
- Edge: Zero exit proceeds

GREEN (4 min):

- Implement: function calculateWaterfallTier(input) { /_ tier logic _/ }
- Use Decimal.js for all arithmetic
- Return {lpProceeds: Decimal, gpCarry: Decimal}

REFACTOR (3 min):

- Extract: calculateCarryWithHurdle(proceeds, hurdle, carryRate)
- JSDoc: @param, @returns, @example
- Type: interface WaterfallInput, WaterfallOutput
```

### 3. memory-management (Step 0.0, retros)

**When:** Phase initialization or retrospectives

**Invocation:**

```markdown
Use memory-management skill to determine context handling:

1. Persist:
   - Truth case pass rates (baseline)
   - Bug classifications (P0/P1/P2)
   - Architecture decisions

2. Summarize:
   - Long error messages → root cause + file:line
   - Test output → pass/fail counts + critical failures
   - Git diffs → semantic changes only

3. Discard:
   - Verbose logs
   - Intermediate debugging output
   - Redundant stack traces

Deliverable: Context summary for next phase/session
```

### 4. multi-model-consensus (Step 0.4, 0.9, 1B)

**When:** Ambiguous edge cases or semantic validation

**Invocation:**

```markdown
Use multi-model-consensus with MCP Multi-AI:

1. Frame question:
   - Specific edge case
   - Expected behavior options
   - Constraints

2. Query multiple models:
   - mcp**multi-ai-collab**ask_all_ais or ai_consensus
   - Provide truth case context
   - Include Excel formula if relevant

3. Synthesize:
   - Common agreement → use as truth
   - Disagreement → escalate to user
   - Document rationale

Deliverable: Consensus answer with reasoning
```

**Example (Step 0.4):**

```markdown
Question: L08 clawback - shortfall-based or distribution-based?

Query: mcp**multi-ai-collab**ai_consensus \
 --question "Should waterfall L08 clawback use shortfall-based (GP returns only
shortfall) or distribution-based (GP returns proportional to distribution)?" \
 --options "shortfall-based,distribution-based"

Consensus: "shortfall-based" (3/3 models agree) Reasoning: LPA terms specify GP
carry limited by LP hurdle achievement
```

### 5. extended-thinking-framework (Phase 1B, Phase 2)

**When:** Systematic-debugging insufficient

**Invocation:**

```markdown
Use extended-thinking-framework when:

Triggers:

- Bug affects 3+ modules
- Root cause unclear after 30 min investigation
- Multiple hypotheses equally plausible

Steps:

1. Gather all evidence (logs, tests, diffs)
2. Generate 5-7 hypotheses
3. Design experiments to eliminate hypotheses
4. Run experiments in order (cheapest first)
5. Document findings in truth cases or ADR

Deliverable: Root cause with evidence + fix plan
```

---

## Integration with v2.33 Execution Plan

**Full Plan:** `docs/PHOENIX-SOT/execution-plan-v2.34.md` (2,435 lines from
v2.33 base)

**v2.34 Enhancements Applied To:**

- **Step 0.0:** Added `memory-management` skill + TaskMaster
  `initialize_project`
- **Step 0.2:** Added `task-decomposition` skill + TaskMaster `expand_task`
- **Step 0.4:** Added `multi-model-consensus` skill + Multi-AI `ai_debate`
- **Step 0.9:** Added Multi-AI `ask_all_ais` for XIRR validation
- **Step 0.10:** Added `verification-before-completion` + TaskMaster
  `autopilot_start`
- **Steps 1A.5-1A.6:** Added `writing-plans` skill + TaskMaster `add_task`
- **Phase 1B:** Added `extended-thinking-framework` + Multi-AI
  `collaborative_solve`

**Tool Routing:** All steps now reference `.claude/PHOENIX-TOOL-ROUTING.md` for
agent/skill selection

---

## Quick Start for AI Agents

When starting a Phoenix session:

1. Load `docs/PHOENIX-SOT/README.md` (navigation hub)
2. Load `docs/PHOENIX-SOT/execution-plan-v2.34.md` (full plan)
3. Load `docs/PHOENIX-SOT/skills-overview.md` (skill catalog)
4. Load `.claude/PHOENIX-TOOL-ROUTING.md` (decision tree)
5. Identify current phase from execution plan
6. Follow routing rules for tool selection
7. DO NOT ask "which tool?" - use routing guide

---

## Success Criteria for v2.34

**What's Complete:**

- ✅ PHOENIX-SOT directory structure created
- ✅ Discovery routing system (DISCOVERY-MAP.md + router-index.json) - PR #249
- ✅ Command file structure (/phoenix-truth, /phoenix-phase2,
  /phoenix-prob-report) - PR #249
- ✅ Tool routing guide eliminates decision paralysis
- ✅ 6 v2.34 skills documented with invocation templates
- ✅ MCP tools integrated at 7 key steps (0.0, 0.2, 0.4, 0.9, 0.10, 1A, 1B)
- ✅ Prompt templates created (Waterfall, ReserveSizing, PortfolioQA)
- ✅ Legacy plans deprecated and archived
- ✅ Documentation templates (DOC-FRONTMATTER-SCHEMA.md) - PR #249
- ✅ Agent coordination updates (5 agents) - PR #249

**What's Deferred:**

- ⏳ npm script automation (`phoenix:truth`, `phoenix:phase2`) - awaiting
  sidecar environment fix
- ⏳ Command execution testing - manual workarounds documented
- ⏳ Full inline integration of MCP/skill references into
  execution-plan-v2.34.md

**Next Steps:** Commands exist as slash command wrappers around manual
workflows. To enable npm script shortcuts, add to package.json after sidecar
environment stabilized. See README.md Known Limitations section for current
workarounds.

---

## Version History

| Version | Date       | Changes                                                                | PR   |
| ------- | ---------- | ---------------------------------------------------------------------- | ---- |
| v2.33   | 2025-12-10 | Phoenix agent integration (9 specialized agents)                       | #247 |
| v2.34   | 2025-12-11 | PHOENIX-SOT directory + Discovery routing + Commands + MCP integration | #249 |

---

**Delivered:** Foundation complete (discovery system, command infrastructure,
templates) **Deferred:** npm script automation, full plan integration (awaiting
sidecar fix)
