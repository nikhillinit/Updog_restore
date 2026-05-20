---
status: ACTIVE
audience: both
last_updated: 2026-04-18
categories: [development, skills-tools, ai-automation]
keywords: [agents, tools, scripts, mcp, skills, workflows, catalog]
source_of_truth: true
agent_routing:
  priority: 2
  route_hint: 'Repo-verified tooling snapshot and routing guide.'
  use_cases: [tool_discovery, agent_selection]
maintenance:
  owner: 'Core Team'
  review_cadence: 'P90D'
---

# Development Tooling Catalog

**Date**: 2026-04-18 **Version**: 2.1 **Status**: Active **Scope**:
Repo-verified snapshot of agent, command, workflow, skill, and npm script
surfaces.

---

## Governance Notice

This catalog was reconciled against the current repository state on 2026-04-18.
Only counts that were directly verifiable from the filesystem or root
`package.json` were kept in this pass.

**Verified counts**:

- `37` agent files under `.claude/agents`
- `34` `SKILL.md` manifests under `.claude/skills`
- `21` command files under `.claude/commands` (including nested paths)
- `16` workflow files under `.github/workflows`
- `90` npm scripts in the root `package.json`

Older totals for MCP functions, memory adoption percentages, skill category
rollups, and npm script category breakdowns were removed where they were no
longer defensible from the live repo.

**Priority Order** (Section 8 Decision Tree): Phoenix/domain agents -> project
agents -> command workflows -> repo-native tooling -> generic fallback guidance.

---

## Table of Contents

1. [Project-Level Agents](#1-project-level-agents)
2. [Global System Personas](#2-global-system-personas)
3. [Command Workflows](#3-command-workflows)
4. [Agent Packages](#4-agent-packages)
5. [MCP Tools](#5-mcp-tools)
6. [Skills Library](#6-skills-library)
7. [NPM Scripts](#7-npm-scripts)
8. [Workflow Decision Tree](#8-workflow-decision-tree)
9. [Summary Statistics](#9-summary-statistics)
10. [Maintenance & Updates](#10-maintenance--updates)

---

## 1. Project-Level Agents

**Verified inventory**: `37` files under `.claude/agents`

**Location**: `.claude/agents/`, plus supporting agent packages under
`packages/`

This section is intentionally a routing aid, not a hand-maintained exhaustive
file dump. Use `.claude/agents` as the live source of truth when you need the
exact current agent list.

### 1.1 Phoenix and Fund-Modeling Specialists

Representative domain agents currently in the repo:

- `phoenix-brand-reporting-stylist`
- `phoenix-capital-allocation-analyst`
- `phoenix-docs-scribe`
- `phoenix-precision-guardian`
- `phoenix-probabilistic-engineer`
- `phoenix-reserves-optimizer`
- `phoenix-truth-case-runner`
- `waterfall-specialist`
- `xirr-fees-validator`

### 1.2 Quality, Test, and Review Agents

Representative quality-oriented agents currently in the repo:

- `code-reviewer`
- `code-simplifier`
- `comment-analyzer`
- `debug-expert`
- `parity-auditor`
- `perf-guard`
- `perf-regression-triager`
- `pr-test-analyzer`
- `schema-drift-checker`
- `silent-failure-hunter`
- `test-automator`
- `test-repair`
- `test-scaffolder`
- `type-design-analyzer`

### 1.3 Platform, Docs, and Workflow Agents

Representative platform/support agents currently in the repo:

- `code-explorer`
- `context-orchestrator`
- `database-expert`
- `db-migration`
- `devops-troubleshooter`
- `docs-architect`
- `dx-optimizer`
- `general-purpose`
- `incident-responder`
- `legacy-modernizer`
- `workflow-orchestrator`

---

## 2. Global System Personas

These are generic guidance surfaces from broader agent tooling, not the primary
repo-specific execution surface. When a request matches both a project agent and
a generic persona, prefer the project agent.

### Retained Relevance for Updog

- **TypeScript/JavaScript**: strict typing, async patterns, build hygiene
- **Node.js Backend**: Express routes, API design, workers, Redis integration
- **React Frontend**: components, hooks, state/query patterns
- **Database**: PostgreSQL, Drizzle, schema evolution
- **Testing**: Vitest, integration tests, smoke tests
- **DevOps**: Docker, GitHub Actions, deployment validation
- **Security**: OWASP-style review, authorization, secrets hygiene

---

## 3. Command Workflows

**Verified inventory**: `21` command files under `.claude/commands`

This count includes nested command docs such as `.claude/commands/wshobson/*`.
The list below highlights the current repo-visible command workflow surfaces.

| Command File             | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `advise.md`              | General advisory workflow                  |
| `catalog-tooling.md`     | Tooling discovery and inventory assistance |
| `db-validate.md`         | Database validation workflow               |
| `deploy-check.md`        | Pre-deployment validation                  |
| `enable-agent-memory.md` | Memory-enablement guidance                 |
| `evaluate-tools.md`      | Tool evaluation workflow                   |
| `fix-auto.md`            | Automated repair workflow                  |
| `log-change.md`          | Change logging                             |
| `log-decision.md`        | Decision logging                           |
| `phoenix-phase2.md`      | Phoenix phase-2 workflow                   |
| `phoenix-prob-report.md` | Phoenix probabilistic reporting            |
| `phoenix-truth.md`       | Phoenix truth-case workflow                |
| `pr-ready.md`            | PR readiness checks                        |
| `pre-commit-check.md`    | Pre-commit validation                      |
| `retrospective.md`       | Retrospective workflow                     |
| `session-learnings.md`   | Session learnings capture                  |
| `session-start.md`       | Session bootstrap                          |
| `test-smart.md`          | Targeted/smart test selection              |
| `workflows.md`           | Workflow selection helper                  |
| `wshobson/deps-audit.md` | Dependency audit helper                    |
| `wshobson/tech-debt.md`  | Tech debt review helper                    |

---

## 4. Agent Packages

**Location**: `packages/`

This section is preserved as a package map. Historical package totals and
memory-adoption percentages were removed in this pass because they were not
re-verified.

| Package             | Description                                                | Status |
| ------------------- | ---------------------------------------------------------- | ------ |
| `agent-core`        | Base agent primitives, retries, metrics, health monitoring | Active |
| `code-review-agent` | Code review package support                                | Active |
| `migration-agent`   | Migration-oriented package support                         | Active |
| `patch-applicator`  | Patch application and validation                           | Active |
| `performance-agent` | Performance regression support                             | Active |
| `test-repair-agent` | Test failure detection and repair                          | Active |

---

## 5. MCP Tools

MCP availability changes more often than the checked-in docs in this repo. The
older exact function totals in this file were stale, so they were removed.

Use this section as a conceptual routing hint only:

- **Multi-model / multi-AI collaboration** for second opinions, review, and
  synthesis
- **Task/project management MCPs** for task expansion, dependency management,
  and workflow scaffolding
- **Session tool inventory** as the live source of truth for which MCP tools are
  actually available in a given run

If you need exact MCP function names or counts, inspect the active session tool
registry instead of relying on this document.

---

## 6. Skills Library

**Verified inventory**: `34` `SKILL.md` manifests under `.claude/skills`

This count intentionally tracks only real skill manifests. Supporting markdown,
reference docs, scripts, and indexes under `.claude/skills` are not counted as
skills.

### Current Skill Themes

- **Phoenix domain skills**: `phoenix-advanced-forecasting`,
  `phoenix-brand-reporting`, `phoenix-capital-exit-investigator`,
  `phoenix-docs-sync`, `phoenix-precision-guard`, `phoenix-reserves-optimizer`,
  `phoenix-truth-case-orchestrator`, `phoenix-waterfall-ledger-semantics`,
  `phoenix-workflow-orchestrator`, `phoenix-xirr-fees-validator`
- **Quality and refactoring**: `bundle-size`, `code-reviewer`, `refactor-code`,
  `regression-checker`, `test-pyramid`, `test-fixture-generator`
- **Workflow engine**: `workflow-engine/code-formatter`,
  `workflow-engine/dependency-guardian`, `workflow-engine/documentation-sync`,
  `workflow-engine/security-scanner`, `workflow-engine/tech-debt-tracker`,
  `workflow-engine/test-first-change`
- **UI and design**: `frontend-ui-ux`, `ui-design-system`, `ui-ux-pro-max`
- **Governance and support**: `baseline-governance`, `claude-infra-integrity`,
  `control-plane`, `financial-calc-correctness`, `owasp-security`,
  `session-learnings`

---

## 7. NPM Scripts

**Verified inventory**: `90` scripts in the root `package.json`

This count is limited to the root manifest. Historical claims that combined root
scripts with older auxiliary inventories were removed.

### High-Signal Script Families

- **Development/build**: `dev`, `dev:client`, `dev:api`, `build`, `build:prod`,
  `build:server`, `build:web`, `check`, `preview`, `start`
- **Docs/tooling validation**: `docs:check-links`, `docs:lint`,
  `docs:routing:check`, `docs:routing:generate`, `docs:routing:query`,
  `validate:claude-md`
- **Lint/guardrails**: `lint`, `lint:eslint`, `lint:fix`, `lint:phase4`,
  `lint:phase4:strict`, `guardrails:check`, `guard:scripts:check`,
  `baseline:check`
- **Database/seeding**: `db:push`, `db:studio`, `db:seed:test`,
  `db:seed:test:minimal`, `db:seed:test:reset`, `seed:multi-tenant`,
  `seed:reset`
- **Tests**: `test`, `test:quick`, `test:smart`, `test:unit`,
  `test:integration`, `test:security`, `test:smoke`, `test:ui`, plus the
  remaining `test:wave4` and `test:phase4*` families
- **Phoenix/domain validation**: `phoenix:truth`, `phase0`,
  `phase2:slice3:audit`, `preflight:phase0`

For the exact current script list, inspect `package.json`.

---

## 8. Workflow Decision Tree

This decision tree remains useful as a routing heuristic even though older
inventory totals were removed.

```
User Request
    ↓
1. Phoenix/fund-modeling task?
    → YES: Use Phoenix/domain specialist first
    ↓ NO
2. Existing project agent fits?
    → YES: Use repo-specific agent
    ↓ NO
3. Existing command workflow fits?
    → YES: Use the matching command doc under .claude/commands
    ↓ NO
4. Repo-native script or workflow fits?
    → YES: Prefer npm script or GitHub workflow
    ↓ NO
5. Generic fallback guidance
    → Use broader persona/skill guidance
```

**Priority summary**:

1. Phoenix/domain specialists
2. Repo-specific agents
3. Command workflows
4. Repo-native scripts/workflows
5. Generic fallback guidance

---

## 9. Summary Statistics

| Category        | Verified Count | Source of Truth              |
| --------------- | -------------- | ---------------------------- |
| Workflow files  | 16             | `.github/workflows/*.yml`    |
| Agent files     | 37             | `.claude/agents/*`           |
| Skill manifests | 34             | `.claude/skills/**/SKILL.md` |
| Command files   | 21             | `.claude/commands/**`        |
| NPM scripts     | 90             | `package.json` -> `scripts`  |

All other historical aggregate totals were removed pending a fresh audit.

---

## 10. Maintenance & Updates

**Document Owner**: Development Team **Review Cycle**: Monthly or after major
tooling changes **Last Updated**: 2026-04-18

**Update Triggers**:

1. File-count drift under `.claude/agents`, `.claude/skills`,
   `.claude/commands`, or `.github/workflows`
2. Root `package.json` script inventory changes materially
3. Command workflow additions/removals
4. Phoenix/domain tooling expansion
5. A new repo-level source of truth replaces this catalog structure

**Maintenance rule**:

- Keep only claims that can be re-verified quickly from the repo
- Prefer directory/package-manifest counts over hand-maintained rollups
- Remove stale aggregate metrics rather than guessing replacements

---

**End of Catalog**

For broader documentation routing, start with `docs/INDEX.md` and
`.claude/DISCOVERY-MAP.md`.
