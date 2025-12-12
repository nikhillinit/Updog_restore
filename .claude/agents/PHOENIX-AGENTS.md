# Phoenix Agent & Skill Registry

**Last Updated**: 2025-12-10 **Phoenix Version**: v2.32 **Total Components**: 9
skills + 9 agents = 18 components

This document catalogs all Phoenix-specific agents and skills for the Updog VC
fund modeling platform, organized by Phoenix execution phase.

---

## Quick Reference Table

| Agent                              | Skill                              | Phase | Primary Use                         | Memory Tenant                            |
| ---------------------------------- | ---------------------------------- | ----- | ----------------------------------- | ---------------------------------------- |
| phoenix-truth-case-runner          | phoenix-truth-case-orchestrator    | 0     | Truth case validation               | agent:phoenix-truth-case-runner          |
| phoenix-precision-guardian         | phoenix-precision-guard            | 1A    | parseFloat eradication, Decimal.js  | agent:phoenix-precision-guardian         |
| waterfall-specialist               | phoenix-waterfall-ledger-semantics | 0, 1B | Clawback validation, L08 scenarios  | agent:waterfall-specialist               |
| xirr-fees-validator                | phoenix-xirr-fees-validator        | 0, 1B | XIRR/fees truth cases, Excel parity | agent:xirr-fees-validator                |
| phoenix-capital-allocation-analyst | phoenix-capital-exit-investigator  | 0, 1A | LOW confidence modules              | agent:phoenix-capital-allocation-analyst |
| phoenix-docs-scribe                | phoenix-docs-sync                  | 1A    | JSDoc, calculations.md sync         | agent:phoenix-docs-scribe                |
| phoenix-probabilistic-engineer     | phoenix-advanced-forecasting       | 2     | Graduation, MOIC, Monte Carlo       | agent:phoenix-probabilistic-engineer     |
| phoenix-reserves-optimizer         | phoenix-reserves-optimizer         | 2     | Reserve allocation, "next dollar"   | agent:phoenix-reserves-optimizer         |
| phoenix-brand-reporting-stylist    | phoenix-brand-reporting            | 3     | Press On Ventures branding          | agent:phoenix-brand-reporting-stylist    |

---

## Phase 0: Validation & Routing (Core Infrastructure)

### phoenix-truth-case-runner

**Agent**: `.claude/agents/phoenix-truth-case-runner.md` **Skill**:
`.claude/skills/phoenix-truth-case-orchestrator/SKILL.md`

**Responsibilities**:

- Run unified truth-case suite (119 scenarios, 6 modules)
- Compute module-level pass rates
- Classify failures (CODE BUG / TRUTH CASE ERROR / MISSING FEATURE)
- Update `docs/phase0-validation-report.md` and `docs/failure-triage.md`
- Recommend Phase 1 path (1A / 1B / 1C)

**Tools**: Read, Write, Grep, Glob, Bash **Skills**:
phoenix-truth-case-orchestrator, systematic-debugging,
verification-before-completion, root-cause-tracing, test-driven-development

**When to Use**:

- Phase 0 Step 0.2: Build truth case runner
- Phase 0 Steps 0.5-0.6: Execute validation, triage failures
- Phase 0 Step 0.10: Compute gate decision
- Phase 1A Step 1A.8: Re-validate after cleanup

**Key Commands**:

```bash
Task("phoenix-truth-case-runner", "Run full truth case suite and compute pass rates")
Task("phoenix-truth-case-runner", "Classify XIRR failures in docs/failure-triage.md")
```

---

### waterfall-specialist (refined)

**Agent**: `.claude/agents/waterfall-specialist.md` _(existing, enhanced)_
**Skill**: `.claude/skills/phoenix-waterfall-ledger-semantics/SKILL.md` _(new)_

**Responsibilities**:

- Validate tier and ledger waterfall engines
- Enforce shortfall-based partial clawback (NOT hard floor)
- Cross-validate L08, L11 truth cases
- Sync waterfall JSDoc with semantics

**Tools**: Read, Edit, Grep, Glob, Bash **Skills**:
phoenix-waterfall-ledger-semantics, phoenix-precision-guard,
systematic-debugging, verification-before-completion

**When to Use**:

- Phase 0 Step 0.4: L08 clawback spot-check
- Phase 1A Step 1A.0: JSDoc hotfix for clawback
- Phase 1B: Waterfall bug fixes

**Key Commands**:

```bash
Task("waterfall-specialist", "Validate L08 clawback scenario")
Task("waterfall-specialist", "Update JSDoc with shortfall-based semantics")
```

---

### xirr-fees-validator

**Agent**: `.claude/agents/xirr-fees-validator.md` **Skill**:
`.claude/skills/phoenix-xirr-fees-validator/SKILL.md`

**Responsibilities**:

- Validate XIRR sign conventions and date handling
- Cross-check against Excel `XIRR()` function
- Validate fee bases and timing
- Fix XIRR/fees truth cases

**Tools**: Read, Write, Grep, Glob, Bash **Skills**:
phoenix-xirr-fees-validator, phoenix-truth-case-orchestrator,
systematic-debugging

**When to Use**:

- Phase 0 Step 0.9: Excel parity cross-check
- Phase 1B: XIRR/fees bug fixes

**Key Commands**:

```bash
Task("xirr-fees-validator", "Cross-check XIRR truth cases against Excel")
Task("xirr-fees-validator", "Validate fee timing for 2% management fee")
```

---

### phoenix-capital-allocation-analyst

**Agent**: `.claude/agents/phoenix-capital-allocation-analyst.md` **Skill**:
`.claude/skills/phoenix-capital-exit-investigator/SKILL.md`

**Responsibilities**:

- Upgrade provenance for LOW confidence modules (capital allocation, exit
  recycling)
- Expand truth cases (zero deployment, over-commitment, late exits)
- Align with fund strategy (stage allocations, graduation matrix)

**Tools**: Read, Write, Grep, Glob, Bash **Skills**:
phoenix-capital-exit-investigator, phoenix-truth-case-orchestrator,
systematic-debugging, iterative-improvement

**When to Use**:

- Phase 0 Step 0.4: CA01, CA15 spot-check
- Phase 1A Step 1A.4: Generate 5 new capital allocation edge cases

**Key Commands**:

```bash
Task("phoenix-capital-allocation-analyst", "Investigate CA01 LOW confidence scenario")
Task("phoenix-capital-allocation-analyst", "Generate 5 edge cases for over-commitment")
```

---

## Phase 1A: Cleanup Path (Precision & Docs)

### phoenix-precision-guardian

**Agent**: `.claude/agents/phoenix-precision-guardian.md` **Skill**:
`.claude/skills/phoenix-precision-guard/SKILL.md`

**Responsibilities**:

- Eradicate parseFloat in P0 calculation paths
- Replace with Decimal.js or parseInt(value, 10)
- Tighten ESLint/TypeScript rules (no-restricted-syntax, radix)
- Maintain precision tests

**Tools**: Read, Write, Grep, Glob, Bash **Skills**: phoenix-precision-guard,
phoenix-truth-case-orchestrator, systematic-debugging,
verification-before-completion

**When to Use**:

- Phase 1A Step 1A.3: Dependency precision audit
- Phase 1A Step 1A.6: parseFloat eradication (replaces
  `/code-refactoring:tech-debt`)

**Key Commands**:

```bash
Task("phoenix-precision-guardian", "Scan for parseFloat in server/analytics/")
Task("phoenix-precision-guardian", "Replace parseFloat with Decimal.js in XIRR module")
```

---

### phoenix-docs-scribe

**Agent**: `.claude/agents/phoenix-docs-scribe.md` **Skill**:
`.claude/skills/phoenix-docs-sync/SKILL.md`

**Responsibilities**:

- Sync `docs/calculations.md` with code behavior
- Update JSDoc (parameters, returns, semantics)
- Cross-reference truth case IDs in docs
- Fix outdated clawback descriptions

**Tools**: Read, Write, Grep, Glob **Skills**: phoenix-docs-sync,
phoenix-truth-case-orchestrator, iterative-improvement

**When to Use**:

- Phase 1A Step 1A.0: JSDoc hotfix (ready-to-paste snippet)
- Phase 1A Step 1A.7: Documentation sync (complements
  `/code-documentation:doc-generate`)

**Key Commands**:

```bash
Task("phoenix-docs-scribe", "Update waterfall JSDoc with clawback semantics")
Task("phoenix-docs-scribe", "Sync calculations.md with L08 truth case example")
```

---

## Phase 2: Advanced Forecasting (Living Model)

### phoenix-probabilistic-engineer

**Agent**: `.claude/agents/phoenix-probabilistic-engineer.md` **Skill**:
`.claude/skills/phoenix-advanced-forecasting/SKILL.md`

**Responsibilities**:

- Design graduation rate engine (deterministic expectations + stochastic
  sampling)
- Implement MOIC calculation suite (7 variants)
- Build reserves ranking ("Exit MOIC on planned reserves")
- Implement scenario management (Construction vs Current)
- Build Monte Carlo orchestrator

**Tools**: Read, Write, Grep, Glob, Bash **Skills**:
phoenix-advanced-forecasting, phoenix-truth-case-orchestrator,
systematic-debugging, multi-model-consensus

**When to Use**:

- Phase 2+: Graduation modeling, MOIC analytics, Monte Carlo

**Key Commands**:

```bash
Task("phoenix-probabilistic-engineer", "Design graduation rate engine with expectation mode")
Task("phoenix-probabilistic-engineer", "Implement Exit MOIC on planned reserves metric")
```

**Critical Constraint**: Phase 2 must NEVER degrade Phase 1 truth-case pass
rates.

---

### phoenix-reserves-optimizer

**Agent**: `.claude/agents/phoenix-reserves-optimizer.md` **Skill**:
`.claude/skills/phoenix-reserves-optimizer/SKILL.md`

**Responsibilities**:

- Implement `DeterministicReserveEngine.calculateReserves(...)`
- Validate reserve allocations (sum ≤ availableReserves, no negatives)
- Support reserves ranking visualization
- Handle edge cases (zero reserves, insufficient pool)

**Tools**: Read, Write, Grep, Glob, Bash **Skills**: phoenix-reserves-optimizer,
phoenix-capital-exit-investigator, systematic-debugging

**When to Use**:

- Phase 2: Reserve allocation features
- "Next dollar" decision support

**Key Commands**:

```bash
Task("phoenix-reserves-optimizer", "Validate reserve allocations respect budget constraints")
Task("phoenix-reserves-optimizer", "Handle edge case: insufficient reserves pool")
```

---

## Phase 3+: Brand & UI (Cosmetic)

### phoenix-brand-reporting-stylist

**Agent**: `.claude/agents/phoenix-brand-reporting-stylist.md` **Skill**:
`.claude/skills/phoenix-brand-reporting/SKILL.md`

**Responsibilities**:

- Ensure Press On Ventures brand consistency
- Recommend typography (Inter for headlines, Poppins for body)
- Validate color palette (#F2F2F2, #E0D8D1, #292929)
- Enforce logo safe zones

**Tools**: Read, Grep, Glob _(NO Write - presentation only)_ **Skills**:
phoenix-brand-reporting

**When to Use**:

- Dashboard design reviews
- LP-facing report exports (PDF/CSV)
- Chart layout recommendations

**Key Commands**:

```bash
Task("phoenix-brand-reporting-stylist", "Review MainDashboardV2 for brand consistency")
Task("phoenix-brand-reporting-stylist", "Suggest layout for LP quarterly report PDF")
```

---

## Agent Invocation Patterns

### Direct Invocation (Task Tool)

```bash
# Truth case validation
Task("phoenix-truth-case-runner", "Run full suite and compute pass rates")

# Precision enforcement
Task("phoenix-precision-guardian", "Eradicate parseFloat in server/analytics/")

# Waterfall validation
Task("waterfall-specialist", "Validate L08 clawback scenario")
```

### Skill Auto-Activation (File-Based)

Skills automatically load when editing specific files:

| Skill                              | Auto-Activates On                                       |
| ---------------------------------- | ------------------------------------------------------- |
| phoenix-truth-case-orchestrator    | `*.truth-cases.json`, `runner.test.ts`                  |
| phoenix-waterfall-ledger-semantics | `waterfall-*.ts`                                        |
| phoenix-precision-guard            | `server/analytics/*.ts`, `client/src/core/engines/*.ts` |
| phoenix-xirr-fees-validator        | `xirr.ts`, `fees.ts`                                    |
| phoenix-capital-exit-investigator  | `capital-allocation.ts`, `exit-recycling.ts`            |
| phoenix-docs-sync                  | `calculations.md`, JSDoc in `*.ts`                      |

### Command Integration

Phoenix agents complement (not replace) existing commands:

| Command                            | Agent Equivalent           | Relationship                  |
| ---------------------------------- | -------------------------- | ----------------------------- |
| `/test-smart truth-cases`          | phoenix-truth-case-runner  | Agent uses command            |
| `/fix-auto`                        | phoenix-precision-guardian | Agent uses command for ESLint |
| `/code-documentation:doc-generate` | phoenix-docs-scribe        | Agent augments command        |
| `/defense-in-depth`                | phoenix-precision-guardian | Agent automates Step 1A.3     |

---

## Memory Coordination

All agents use unique tenant IDs for cross-session learning:

```yaml
# Truth case patterns
agent:phoenix-truth-case-runner

# Precision violations
agent:phoenix-precision-guardian

# Waterfall edge cases (existing)
agent:waterfall-specialist

# XIRR/fees Excel parity
agent:xirr-fees-validator

# Capital allocation patterns
agent:phoenix-capital-allocation-analyst

# Documentation drift
agent:phoenix-docs-scribe

# Probabilistic patterns
agent:phoenix-probabilistic-engineer

# Reserve optimization
agent:phoenix-reserves-optimizer

# Brand violations
agent:phoenix-brand-reporting-stylist
```

**No Memory Conflicts**: Each agent has distinct domain scope.

---

## Integration Checklist

**Before deploying Phoenix agents**:

- [x] All 9 skills created in `.claude/skills/`
- [x] All 9 agents created in `.claude/agents/`
- [x] Memory tenant IDs unique across all agents
- [x] waterfall-specialist refined (not replaced)
- [x] Naming conflict resolved (skill = `phoenix-waterfall-ledger-semantics`)
- [x] Brand-reporting-stylist tools corrected (Read/Grep/Glob only, no Write)
- [x] File references handle missing files (runner.test.ts built via `/dev`)
- [x] Auto-activation patterns defined for all skills
- [ ] Week 1 agents tested (truth-case-runner, precision-guardian)
- [ ] Week 2 agents tested (waterfall-specialist refinement, XIRR/fees
      validator)
- [ ] Week 3 agents tested (probabilistic-engineer, reserves-optimizer,
      brand-stylist)

---

## Testing Protocol

### Week 1 Validation

```bash
# Test truth-case-runner
Skill("phoenix-truth-case-orchestrator")  # Should expand workflow
Task("phoenix-truth-case-runner", "Validate XIRR truth cases")

# Test precision-guardian
Task("phoenix-precision-guardian", "Scan server/analytics/ for parseFloat")
```

### Week 2 Validation

```bash
# Test waterfall-specialist refinement
Task("waterfall-specialist", "Validate L08 using ledger-semantics skill")

# Test XIRR/fees validator
Task("xirr-fees-validator", "Cross-check XIRR against Excel")
```

### Week 3 Validation

```bash
# Test probabilistic-engineer
Task("phoenix-probabilistic-engineer", "Design graduation rate engine")

# Test brand-stylist
Task("phoenix-brand-reporting-stylist", "Review MainDashboardV2 branding")
```

---

## Maintenance & Updates

**When to update this registry**:

- New Phoenix agent created
- Agent responsibilities change
- Phase gates updated in Phoenix execution plan
- Memory tenant IDs reorganized

**Version History**:

- 2025-12-10: Initial registry (9 skills + 9 agents)
- Phoenix v2.32: Command enhancements integrated

**See Also**:

- [PHOENIX-EXECUTION-PLAN-v2.31.md](../PHOENIX-EXECUTION-PLAN-v2.31.md) -
  Execution plan
- [docs/phoenix-v2.32-command-enhancements.md](../docs/phoenix-v2.32-command-enhancements.md) -
  Command recommendations
- [.claude/specs/truth-case-runner/dev-plan.md](../specs/truth-case-runner/dev-plan.md) -
  Truth case runner implementation plan
