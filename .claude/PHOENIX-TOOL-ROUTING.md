# Phoenix Tool Routing Guide

> Decision tree for selecting agents, skills, MCP tools, and templates.
> **Purpose:** Eliminate "which tool should I use?" paralysis during Phoenix
> execution. **Audience:** AI agents (Claude Code, etc.) + human developers.

This guide complements:

- `docs/PHOENIX-SOT/execution-plan-v2.34.md` — phase-by-phase workflow
- `docs/PHOENIX-SOT/skills-overview.md` — skill catalog
- `docs/PHOENIX-SOT/mcp-tools-guide.md` — MCP integration patterns

---

## 0. Quick Reference

**When uncertain, follow this decision tree:**

1. Is this about truth cases or Excel parity? →
   `phoenix-truth-case-orchestrator` + `WaterfallChecksTemplate`
2. Is this a calculation bug with failing tests? → `systematic-debugging` FIRST,
   then escalate if complex
3. Is this about precision (parseFloat, rounding)? → `phoenix-precision-guard`
4. Is this about reserves, MOIC, or graduation? → `DeterministicReserveEngine` +
   `phoenix-reserves-optimizer`
5. Is this about multi-module interaction? →
   `TaskMaster analyze_project_complexity` → `Multi-AI ai_debate`
6. Is this LP-facing or brand-related? → `phoenix-brand-reporting-stylist` +
   `PortfolioQATemplate`

---

## 1. Task → Agent/Skill/Tool Map

### 1.1 Code Modification / Debugging / Validation

**Agents:**

- `phoenix-truth-case-runner` (Phase 0)
- `phoenix-precision-guardian` (Phase 1A)

**Skills:**

- `systematic-debugging` (ALWAYS use first for bugs)
- `verification-before-completion` (MANDATORY at phase gates)
- `test-driven-development` (for any code changes)

**MCP Tools:**

- `taskmaster-ai` → `expand_task` (task decomposition)
- `multi-ai-collab` → `ai_consensus` (debugging edge cases)

---

### 1.2 Waterfall / XIRR / Fees

**Agents:**

- `waterfall-specialist` (waterfall semantics)
- `xirr-fees-validator` (XIRR/fees validation)

**Skills:**

- `phoenix-waterfall-ledger-semantics` (ledger + clawback logic)
- `phoenix-xirr-fees-validator` (Excel parity)

**Templates:**

- `WaterfallChecksTemplate` (Step 0.4, 0.9, 1B post-fix)

**MCP Tools:**

- `multi-ai-collab` → `ai_debate` (L08 clawback edge cases)

---

### 1.3 Capital Allocation / Exit Recycling

**Agents:**

- `phoenix-capital-allocation-analyst`

**Skills:**

- `phoenix-capital-exit-investigator`

**MCP Tools:**

- `multi-ai-collab` → `ai_consensus` (edge case validation)

---

### 1.4 Forecasting / Reserves / MOIC

**Agents:**

- `phoenix-probabilistic-engineer` (Phase 2)
- `phoenix-reserves-optimizer` (Phase 2)

**Skills:**

- `phoenix-advanced-forecasting`
- `phoenix-reserves-optimizer`

**Templates:**

- `ReserveSizingTemplate` (reserves tuning)
- `PortfolioQATemplate` (portfolio validation)

**Code Entry Point:**

- `DeterministicReserveEngine.calculateReserves()` (implementation)

**MCP Tools:**

- `multi-ai-collab` → `ai_debate` (graduation matrix design)
- `notebooklm` (Tactyc research, benchmarks)

---

### 1.5 Branding / LP-Facing

**Agents:**

- `phoenix-brand-reporting-stylist` (Phase 3+)

**Skills:**

- `phoenix-brand-reporting`

**Templates:**

- `PortfolioQATemplate` (+ brand mode)

**Brand SOT:**

- `/docs/brand/PressOnVentures-Guideline.pdf`
- Tailwind tokens (fonts: Inter/Poppins, colors: #F2F2F2, #E0D8D1, #292929)

---

## 2. File-Based Auto-Activation Rules

| File Pattern                                 | Auto-Activate                              |
| -------------------------------------------- | ------------------------------------------ |
| `*.truth-cases.json`                         | `phoenix-truth-case-orchestrator` skill    |
| `tests/truth-cases/runner.test.ts`           | `phoenix-truth-case-runner` agent          |
| `*waterfall*.ts`                             | `phoenix-waterfall-ledger-semantics` skill |
| `xirr.ts`, `fees.ts`                         | `phoenix-xirr-fees-validator` skill        |
| `capital-allocation.ts`, `exit-recycling.ts` | `phoenix-capital-exit-investigator` skill  |
| `server/analytics/*.ts`                      | `phoenix-precision-guard` skill (1A)       |
| `client/src/core/engines/*.ts`               | `phoenix-precision-guard` skill (1A)       |
| `calculations.md`, JSDoc changes             | `phoenix-docs-sync` skill                  |
| `DeterministicReserveEngine.ts`              | `phoenix-reserves-optimizer` skill         |

---

## 3. Phase-Based Routing

### Phase 0: Truth & Parity

**Start:**

- Load `docs/PHOENIX-SOT/execution-plan-v2.34.md`
- Load `docs/PHOENIX-SOT/skills-overview.md`
- Load `.claude/PHOENIX-TOOL-ROUTING.md` (this file)

**Step 0.0: Initialize**

- MCP: `taskmaster-ai` → `initialize_project`
- Skill: `memory-management` (context setup)

**Step 0.2: Truth Case Runner Setup**

- MCP: `taskmaster-ai` → `expand_task` (break down 119 scenarios)
- Skill: `task-decomposition` (ordered subtasks with acceptance criteria)

**Step 0.4: Spot-Check Edge Cases**

- Template: `WaterfallChecksTemplate` (L08 clawback validation)
- MCP: `multi-ai-collab` → `ai_consensus` (cross-validate)

**Step 0.9: Cross-Validation**

- MCP: `multi-ai-collab` → `ask_all_ais` (XIRR Excel semantics)
- MCP: `notebooklm` (provenance validation - "Where did W14 exit rate come
  from?")

**Step 0.10: Decision Gate**

- Skill: `verification-before-completion` (MANDATORY)
- MCP: `taskmaster-ai` → `autopilot_start` (if proceeding to 1A)

---

### Phase 1A: Cleanup & Precision

**Primary Skills:**

- `phoenix-precision-guard` (parseFloat eradication)
- `phoenix-docs-sync` (JSDoc + calculations.md)
- `writing-plans` (TDD microsteps)

**Step 1A.4: Edge Case Decomposition**

- Skill: `task-decomposition`

**Steps 1A.5-1A.6: TDD Microsteps**

- Skill: `writing-plans` (2-5 min implementation plans)
- MCP: `taskmaster-ai` → `add_task` (track subtasks)

**Step 1A.8: Final Validation**

- Skill: `verification-before-completion` (MANDATORY)

**MCP Tools:**

- `ai-code-review` (precision checks, Decimal.js usage)
- `taskmaster-ai` (TDD subtask tracking)

---

### Phase 1B: Bug Fix Path

**Primary Skills:**

- `systematic-debugging` (ALWAYS start here)
- `root-cause-tracing` (backtrack from failures)
- `extended-thinking-framework` (escalation for complex bugs)

**Bug Selection:**

- MCP: `multi-ai-collab` → `ai_consensus` (prioritize failures)

**Multi-Module Bugs:**

- MCP: `multi-ai-collab` → `collaborative_solve` (XIRR + Waterfall + Fees in
  parallel)

**Post-Fix Validation:**

- Template: `WaterfallChecksTemplate` (re-run affected scenarios)
- Skill: `verification-before-completion`

**MCP Tools:**

- `taskmaster-ai` → `autopilot` (structured bug workflow)
- `multi-ai-collab` → `gemini_debug` / `openai_debug` (complex edge cases)

---

### Phase 2: Forecasting & Reserves

**Primary Agents:**

- `phoenix-probabilistic-engineer` (graduation, MOIC, Monte Carlo)
- `phoenix-reserves-optimizer` (reserve sizing)

**Templates:**

- `ReserveSizingTemplate` (reserves tuning)
- `PortfolioQATemplate` (portfolio validation)

**MCP Tools:**

- `multi-ai-collab` → `ai_debate` (graduation matrix design)
- `notebooklm` (Tactyc research, industry benchmarks)

**Code Entry Point:**

- `DeterministicReserveEngine.calculateReserves()` in:
  - `client/src/core/reserves/DeterministicReserveEngine.ts`
  - `shared/core/reserves/DeterministicReserveEngine.ts`

**Guardrail:** Phase 2 must NEVER degrade Phase 0/1 truth-case pass rates.

---

### Phase 3+: Brand & UI

**Primary Agent:**

- `phoenix-brand-reporting-stylist`

**Templates:**

- `PortfolioQATemplate` (+ brand checks)

**Brand Sources:**

- `/docs/brand/PressOnVentures-Guideline.pdf`
- Tailwind config (fonts, colors, logo safe zones)

**MCP Tools:**

- `ai-code-review` (brand token consistency)

---

## 4. MCP Tool Function Reference

### TaskMaster (mcp**taskmaster-ai**)

**When to Use:**

- Task decomposition (Step 0.2, 1A.4)
- Project complexity analysis (multi-module work)
- TDD autopilot (Phase 0.10, 1A, 1B)

**Key Functions:**

```text
initialize_project(projectRoot, skipInstall, storeTasksInGit)
  → Use at: Phase 0.0

expand_task(projectRoot, id, num, research)
  → Use at: Step 0.2 (truth case breakdown), 1A.4 (edge cases)

get_tasks(projectRoot, status, withSubtasks)
  → Use for: Current task state visibility

add_task(projectRoot, prompt, priority, dependencies)
  → Use at: Steps 1A.5-1A.6 (TDD subtasks)

autopilot_start(taskId, projectRoot, maxAttempts)
  → Use at: Step 0.10, Phase 1B (structured bug workflow)

analyze_project_complexity(projectRoot, from, to, threshold)
  → Use for: Estimating Phase 2 work, multi-module complexity
```

---

### Multi-AI Collaboration (mcp**multi-ai-collab**)

**When to Use:**

- Ambiguous edge cases (Step 0.4, 0.9)
- Multi-module debugging (Phase 1B)
- Design decisions (Phase 2 graduation matrix)

**Key Functions:**

```text
ask_all_ais(prompt, temperature)
  → Use at: Step 0.9 (XIRR Excel semantics validation)

ai_debate(topic, ai1, ai2)
  → Use at: Step 0.4 (L08 clawback), Phase 2 (graduation design)

ai_consensus(question, options)
  → Use at: Step 0.4 (edge case validation), 1B (bug priority)

collaborative_solve(problem, approach)
  → Use at: Phase 1B (multi-module bugs like XIRR + Waterfall + Fees)

gemini_code_review(code, focus) / openai_code_review(code, focus)
  → Use at: Phase 1A (precision checks), 1B (post-fix review)

gemini_think_deep(topic, context) / openai_think_deep(topic, context)
  → Use at: Phase 1B (complex bugs), Phase 2 (reserves design)
```

---

## 5. Decision Tree for Ambiguous Cases

```text
START: User asks for help with Phoenix work

├─ Is this about truth cases or Excel parity?
│  YES → phoenix-truth-case-orchestrator + WaterfallChecksTemplate
│  NO  → Continue to next check

├─ Is this a calculation bug with failing tests?
│  YES → systematic-debugging skill FIRST
│  │     If complex → extended-thinking-framework + Multi-AI collaborative_solve
│  NO  → Continue to next check

├─ Is this about precision (parseFloat, Decimal.js, rounding)?
│  YES → phoenix-precision-guard skill
│  NO  → Continue to next check

├─ Is this about reserves, MOIC, or graduation?
│  YES → DeterministicReserveEngine + phoenix-reserves-optimizer
│  │     + ReserveSizingTemplate / PortfolioQATemplate
│  NO  → Continue to next check

├─ Is this about multi-module interaction or complex design?
│  YES → TaskMaster analyze_project_complexity
│  │     → Multi-AI ai_debate for design decisions
│  NO  → Continue to next check

├─ Is this LP-facing output or brand-related?
│  YES → phoenix-brand-reporting-stylist + PortfolioQATemplate (brand mode)
│  NO  → Escalate: Ask user for clarification

END
```

---

## 6. Routing Examples

### Example 1: "Waterfall L08 clawback is failing"

**Decision Path:**

1. Calculation bug with failing test → `systematic-debugging` skill
2. Waterfall-specific → `phoenix-waterfall-ledger-semantics` skill
3. Complex clawback logic → `WaterfallChecksTemplate`
4. Needs cross-validation → `multi-ai-collab` → `ai_debate`

**Actions:**

```bash
# 1. Use systematic-debugging to investigate root cause
# 2. Review with waterfall-specialist agent
# 3. Apply WaterfallChecksTemplate for validation
# 4. If ambiguous, call ai_debate:
mcp__multi-ai-collab__ai_debate \
  --topic "Should L08 clawback use shortfall-based or distribution-based logic?" \
  --ai1 "gemini" \
  --ai2 "openai"
```

---

### Example 2: "Need to break down Phase 0 truth case work"

**Decision Path:**

1. Task decomposition needed → `task-decomposition` skill
2. Phase 0 Step 0.2 → TaskMaster integration

**Actions:**

```bash
# 1. Initialize TaskMaster project
mcp__taskmaster-ai__initialize_project \
  --projectRoot "c:/dev/Updog_restore" \
  --skipInstall false

# 2. Expand truth case validation into subtasks
mcp__taskmaster-ai__expand_task \
  --projectRoot "c:/dev/Updog_restore" \
  --id "phase0-truth-validation" \
  --num 10

# 3. Use task-decomposition skill for ordered subtasks with acceptance criteria
```

---

### Example 3: "Reserves sizing for Phase 2"

**Decision Path:**

1. Reserves work → `phoenix-reserves-optimizer` skill
2. Phase 2 → `phoenix-probabilistic-engineer` agent
3. Design validation → `ReserveSizingTemplate`
4. Research needed → `multi-ai-collab` + `notebooklm`

**Actions:**

```bash
# 1. Apply ReserveSizingTemplate with current config
# Variables: reserve_config_path, assumptions_summary, reserve_objectives

# 2. Debate graduation matrix design
mcp__multi-ai-collab__ai_debate \
  --topic "Optimal reserve allocation policy: equal-weight vs conviction-based" \
  --ai1 "gemini" \
  --ai2 "openai"

# 3. Research industry benchmarks (NotebookLM via web UI)
# Upload: docs/tactyc-research/, industry whitepapers
# Query: "Typical VC reserve ratios by stage (Seed, A, B, C)"
```

---

## 7. Integration with Execution Plan

This routing guide is designed to be loaded at the start of every Phoenix
session alongside:

1. `docs/PHOENIX-SOT/execution-plan-v2.34.md` (what to do)
2. `docs/PHOENIX-SOT/skills-overview.md` (skill catalog)
3. `.claude/PHOENIX-TOOL-ROUTING.md` (how to choose tools)

**Session Start Protocol:**

```markdown
**For AI Agents:** At the start of every Phoenix session:

1. Load execution-plan-v2.34.md (understand current phase + steps)
2. Load skills-overview.md (understand available skills)
3. Load PHOENIX-TOOL-ROUTING.md (THIS FILE - decision tree)
4. Identify current phase from execution-plan-v2.34.md
5. Follow routing rules from Section 3 (Phase-Based Routing)
6. DO NOT ask user "which agent/tool should I use?" - use this guide
```

---

## 8. Maintenance

**When adding new agents/skills/tools:**

1. Update this file (Task → Agent/Skill/Tool Map)
2. Update `docs/PHOENIX-SOT/skills-overview.md` (skill catalog)
3. Update `docs/PHOENIX-SOT/execution-plan-v2.34.md` (if workflow changes)
4. Add file-based activation rules (Section 2)
5. Update decision tree (Section 5) if needed

**When deprecating tools:**

1. Mark as DEPRECATED in this file
2. Redirect to replacement tool
3. Do NOT remove until all execution plan references updated

---

## 9. Version History

| Version | Date       | Changes                            |
| ------- | ---------- | ---------------------------------- |
| v1.0    | 2025-12-11 | Initial creation for Phoenix v2.34 |

---

**Status:** ACTIVE - Use this guide for all Phoenix tool selection decisions.
