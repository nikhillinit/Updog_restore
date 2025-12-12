# Phoenix Skills Overview

> Single reference for all skills used in the Phoenix workflow. Audience:
> humans + AI agents. Source of truth for what each skill does, when it should
> be used, and how it auto-activates.

This document complements:

- `execution-plan-v2.34.md` — phase-by-phase workflow
- `.claude/PHOENIX-TOOL-ROUTING.md` — task/file → agent/skill routing

---

## 0. Conventions

- **Category**
  - `phoenix-core` — VC-model specific skills (truth cases, waterfalls, XIRR,
    reserves, MOIC, brand)
  - `cross-cutting` — always-on safety / discipline
  - `situational` — loaded for specific patterns (debugging, consensus, etc.)
  - `v2.34-enhancement` — new, required skills added in v2.34

- **Phase(s)**
  - `P0` = Truth cases / Excel parity
  - `P1A` = Cleanup & precision
  - `P1B` = Bug fix path
  - `P2` = Advanced forecasting / reserves
  - `P3+` = Brand & presentation

- **Auto-Activation**
  - `file-based` → triggered by file patterns
  - `phase-based` → triggered by phase gates
  - `manual` → call explicitly

---

## 1. Phoenix-Specific Skills (Core VC Model)

These skills are tightly coupled to the six calculation modules and Phase 2
living model work.

| Skill                                | Category     | Purpose / Scope                                                      | Auto-Activation                                                        | Phase(s)  |
| ------------------------------------ | ------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------- |
| `phoenix-truth-case-orchestrator`    | phoenix-core | Orchestrate truth case loading, filtering, and comparison.           | `*.truth-cases.json`, `tests/truth-cases/runner.test.ts`               | P0, P1A/B |
| `phoenix-precision-guard`            | phoenix-core | Enforce Decimal.js precision, eradicate `parseFloat` in core paths.  | `server/analytics/*.ts`, `client/src/core/engines/*.ts`                | P1A       |
| `phoenix-waterfall-ledger-semantics` | phoenix-core | Understand and validate ledger-based waterfall + clawback semantics. | `*waterfall-*.ts`                                                      | P0, P1B   |
| `phoenix-xirr-fees-validator`        | phoenix-core | Validate XIRR + fee calculations vs Excel parity.                    | `xirr.ts`, `fees.ts`                                                   | P0, P1B   |
| `phoenix-capital-exit-investigator`  | phoenix-core | Investigate capital allocation and exit recycling edge cases.        | `capital-allocation.ts`, `exit-recycling.ts`                           | P0, P1A/B |
| `phoenix-docs-sync`                  | phoenix-core | Keep JSDoc + `calculations.md` in sync with implementation.          | `calculations.md`, any `*.ts` JSDoc                                    | P1A, P1B  |
| `phoenix-advanced-forecasting`       | phoenix-core | Graduation engine, MOIC suite, Monte Carlo orchestration.            | `phase == 2` (from execution plan)                                     | P2        |
| `phoenix-reserves-optimizer`         | phoenix-core | Reserve sizing, exit MOIC on planned reserves, budget constraints.   | Any module calling `DeterministicReserveEngine.calculateReserves(...)` | P2        |
| `phoenix-brand-reporting`            | phoenix-core | Enforce Press On Ventures branding in dashboards/reports.            | Brand review tasks, LP output generation                               | P3+       |

---

## 2. Cross-Cutting Mandatory Skills

These are _always on_ and must be respected at phase gates.

| Skill                            | Category      | Purpose                                         | Auto-Activation               | Phase(s) |
| -------------------------------- | ------------- | ----------------------------------------------- | ----------------------------- | -------- |
| `systematic-debugging`           | cross-cutting | Root cause analysis before any fix.             | Always on (especially in P1B) | All      |
| `verification-before-completion` | cross-cutting | Enforce evidence-based checks at phase gates.   | At every phase gate           | All      |
| `test-driven-development`        | cross-cutting | RED–GREEN–REFACTOR discipline for code changes. | During any new implementation | All      |

---

## 3. Situational Skills (On-Demand)

Used when complexity or ambiguity justifies extra structure.

| Skill                   | Category    | Purpose / When to Use                                      | Auto-Activation             | Phase(s)    |
| ----------------------- | ----------- | ---------------------------------------------------------- | --------------------------- | ----------- |
| `multi-model-consensus` | situational | Cross-check complex logic with multiple models/tools.      | Manual (P0.4, P2, P1B)      | P0, P1B, P2 |
| `root-cause-tracing`    | situational | Backtrack from failures to the original defect.            | Manual, when failures arise | P0, P1B     |
| `iterative-improvement` | situational | Small cycle improvements with verification each step.      | Manual, large refactors     | All         |
| `pattern-recognition`   | situational | Detect anti-patterns (e.g., precision drift, code smells). | Manual, code audits         | P1A, P1B    |
| `inversion-thinking`    | situational | Model "how this breaks" to surface edge cases.             | Manual, design phases       | P0, P2      |

---

## 4. v2.34 Enhancements (New, Required Skills)

These are the skills you proposed to close coverage gaps and wire the plan more
tightly to actual workflows. They must be implemented under `.claude/skills/`
and documented in `execution-plan-v2.34.md`.

| Skill                         | Category          | Purpose / Scope                                                              | Primary Phases     | Typical Triggers / Usage                                            |
| ----------------------------- | ----------------- | ---------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------- |
| `task-decomposition`          | v2.34-enhancement | Break complex tasks into ordered subtasks with explicit acceptance criteria. | P0, P1A            | Phase 0.2 truth case runner setup; P1A.4 (edge case decomposition). |
| `writing-plans`               | v2.34-enhancement | Generate 2–5 minute TDD-sized implementation plans.                          | P1A                | Steps 1A.5–1A.6 before touching code.                               |
| `memory-management`           | v2.34-enhancement | Manage cross-phase context: what to persist, summarize, or discard.          | P0→P1A→P2→P3       | Phase 0.0 initialization; post-phase retros.                        |
| `continuous-improvement`      | v2.34-enhancement | Structure end-of-phase retrospectives into actionable improvements.          | End of every phase | After P0, P1A, P1B, P2 completion.                                  |
| `extended-thinking-framework` | v2.34-enhancement | Escalate especially complex or ambiguous bugs / designs.                     | P1B, P2            | When systematic-debugging is insufficient alone.                    |
| `prompt-caching-usage`        | v2.34-enhancement | Use and optimize prompt caching / shared context across agents.              | All, esp. P2       | Multi-agent coordination, repeated analyses.                        |

> **Note:** v2.34 should explicitly bind these skills to concrete steps in the
> execution plan (e.g., "Step 0.2: must invoke `task-decomposition` on the full
> truth case runner workstream").

---

## 5. Skill–Phase Summary

Quick mental model for which skills dominate each phase:

- **Phase 0 (Truth & Parity)**
  - `phoenix-truth-case-orchestrator`
  - `phoenix-waterfall-ledger-semantics`
  - `phoenix-xirr-fees-validator`
  - `phoenix-capital-exit-investigator`
  - `task-decomposition`, `multi-model-consensus`

- **Phase 1A (Cleanup & Precision)**
  - `phoenix-precision-guard`, `phoenix-docs-sync`
  - `task-decomposition`, `writing-plans`
  - `systematic-debugging`, `test-driven-development`

- **Phase 1B (Bug Fix Path)**
  - Same as 1A + `root-cause-tracing`, `extended-thinking-framework`

- **Phase 2 (Forecasting & Reserves)**
  - `phoenix-advanced-forecasting`, `phoenix-reserves-optimizer`
  - `multi-model-consensus`, `prompt-caching-usage`

- **Phase 3+ (Brand & UI)**
  - `phoenix-brand-reporting`
  - `continuous-improvement` (on LP-facing deliverables)

---

## 6. Implementation Checklist (v2.34)

- [ ] All v2.34 skills defined under `.claude/skills/` with short descriptions.
- [ ] `execution-plan-v2.34.md` references these skills at the exact steps you
      outlined.
- [ ] `.claude/PHOENIX-TOOL-ROUTING.md` refers to this file when picking skills.
- [ ] Deprecated skills (if any) are noted here and in the execution plan.
