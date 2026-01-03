---
status: ACTIVE
audience: agents
last_updated: 2025-12-29
owner: 'Platform Team'
review_cadence: P30D
categories: [agents, routing, discovery]
keywords: [agent-directory, agent-selection, canonical-locations]
---

# Agent Directory (Canonical Locations)

This document provides the authoritative list of all project-level agents and
their intended use cases. Use this for agent selection and routing.

**Total Agents**: 37 (after cleanup of duplicate subdirectories)

---

## Quick Selection Guide

| Task Type | Primary Agent | When to Use |
|-----------|---------------|-------------|
| Code review | code-reviewer | After writing code, before PR |
| Test failures | test-repair | Autonomous test fix |
| New test suite | test-scaffolder | Setting up test infrastructure |
| Performance issues | perf-guard | Bundle analysis, regressions |
| Database changes | db-migration | Before `npm run db:push` |
| Waterfall/carry | waterfall-specialist | Any waterfall calculation changes |
| XIRR/fees | xirr-fees-validator | XIRR or fee calculation changes |
| Phoenix validation | phoenix-truth-case-runner | Running truth case suites |
| Schema drift | schema-drift-checker | Migration/Drizzle/Zod alignment |
| Production incident | incident-responder | P0 incidents |

---

## Core Development Agents (10)

| Agent | Description | Model |
|-------|-------------|-------|
| **code-reviewer** | Expert code reviewer ensuring adherence to project guidelines | opus |
| **code-simplifier** | Simplifies code while preserving functionality | opus |
| **code-explorer** | Deep understanding of existing features and systems | inherit |
| **general-purpose** | Research, code exploration, multi-step tasks | inherit |
| **comment-analyzer** | Analyze comments for accuracy and technical debt | inherit |
| **type-design-analyzer** | Type design, invariants, encapsulation quality | inherit |
| **silent-failure-hunter** | Find silent failures and inadequate error handling | inherit |
| **debug-expert** | Debugging and root cause investigation | inherit |
| **legacy-modernizer** | Modernize legacy code, migrate frameworks | inherit |
| **dx-optimizer** | Developer experience and tooling improvement | inherit |

---

## Testing and Quality Agents (8)

| Agent | Description | Model | Skills |
|-------|-------------|-------|--------|
| **test-repair** | Autonomous test failure detection and repair | sonnet | memory-enabled |
| **test-automator** | Test automation strategy and coverage analysis | inherit | memory-only |
| **test-scaffolder** | Scaffold test infrastructure for new modules | sonnet | - |
| **pr-test-analyzer** | PR test coverage quality review | inherit | memory-only |
| **playwright-test-author** | E2E tests for browser-only behaviors | sonnet | test-pyramid |
| **perf-guard** | Performance regression detection, bundle analysis | sonnet | memory-enabled |
| **perf-regression-triager** | Diagnose performance regressions | sonnet | statistical-testing |
| **baseline-regression-explainer** | Diagnose quality metric regressions | sonnet | baseline-governance |

---

## Infrastructure and Database Agents (3)

| Agent | Description | Model | Skills |
|-------|-------------|-------|--------|
| **db-migration** | Schema changes, zero-downtime migration | sonnet | memory-enabled |
| **schema-drift-checker** | Schema alignment across layers | sonnet | root-cause-tracing |
| **database-expert** | Database architecture and query optimization | inherit | memory-only |

---

## Production and DevOps Agents (3)

| Agent | Description | Model |
|-------|-------------|-------|
| **devops-troubleshooter** | Production incidents, deployment failures | inherit |
| **incident-responder** | P0 incident management, SRE practices | inherit |
| **chaos-engineer** | Chaos engineering and resilience testing | inherit |

---

## Phoenix Calculation Agents (9)

| Agent | Description | Phase | Skills |
|-------|-------------|-------|--------|
| **waterfall-specialist** | Waterfall (carry distribution) calculations | 0,1B | phoenix-waterfall-ledger-semantics |
| **xirr-fees-validator** | XIRR and fee module validation | 0,1B | phoenix-xirr-fees-validator |
| **parity-auditor** | Excel parity impact assessment | 1B | financial-calc-correctness |
| **phoenix-truth-case-runner** | Truth-case execution and triage | 0 | phoenix-truth-case-orchestrator |
| **phoenix-precision-guardian** | Numeric precision and type safety | 1A | phoenix-precision-guard |
| **phoenix-probabilistic-engineer** | Graduation, MOIC, Monte Carlo | 2 | phoenix-advanced-forecasting |
| **phoenix-reserves-optimizer** | Reserve sizing optimization | 2 | phoenix-reserves-optimizer |
| **phoenix-capital-allocation-analyst** | Capital allocation and recycling | 0,1A | phoenix-capital-exit-investigator |
| **phoenix-brand-reporting-stylist** | Brand-consistent reporting | 3 | phoenix-brand-reporting |

---

## Documentation and Architecture Agents (2)

| Agent | Description | Model |
|-------|-------------|-------|
| **docs-architect** | Technical documentation and architecture guides | inherit |
| **phoenix-docs-scribe** | Phoenix docs and JSDoc alignment | sonnet |

---

## Context and Coordination Agents (1)

| Agent | Description | Model |
|-------|-------------|-------|
| **context-orchestrator** | Memory systems, multi-agent coordination | inherit |

---

## Deprecated/Removed Locations

The following directories were removed on 2025-12-29 as they contained
duplicate generic templates. Use root-level agents instead:

- `.claude/agents/workflow-engine/` - DELETED (4 files)
- `.claude/agents/wshobson/` - DELETED (4 files)

Root-level agents have project-specific memory integration and CLAUDE.md
compliance.

---

## Agent Invocation Patterns

**Via Task Tool**:
```
Task("code-reviewer", "Review the changes in src/components/")
Task("test-repair", "Fix the failing waterfall tests")
Task("waterfall-specialist", "Validate my carry calculation changes")
```

**Via Slash Commands** (some agents have command equivalents):
```
/phoenix-truth      -> phoenix-truth-case-runner
/deploy-check       -> perf-guard + db-migration (orchestrated)
/fix-auto           -> test-repair (if tests fail)
```

---

## Memory-Enabled Agents

These agents use `HybridMemoryManager` for cross-session learning:

- code-reviewer - Learns CLAUDE.md violations
- waterfall-specialist - Remembers validation patterns
- test-repair - Learns failure patterns and repairs
- perf-guard - Tracks bundle baselines
- db-migration - Remembers migration patterns
- silent-failure-hunter - Learns error handling patterns

---

## See Also

- [PHOENIX-AGENTS.md](.claude/agents/PHOENIX-AGENTS.md) - Phoenix agent details
- [CAPABILITIES.md](CAPABILITIES.md) - Full capability inventory
- [DISCOVERY-MAP.md](.claude/DISCOVERY-MAP.md) - Routing patterns
- [cheatsheets/agent-memory-integration.md](cheatsheets/agent-memory-integration.md) - Memory enablement
