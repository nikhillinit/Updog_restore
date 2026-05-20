---
status: ACTIVE
audience: both
last_updated: 2026-05-20
categories: [documentation, navigation]
keywords: [index, docs, navigation, routing, documentation]
source_of_truth: true
agent_routing:
  priority: 2
  route_hint: 'Central navigation for all documentation.'
  use_cases: [doc_discovery, onboarding]
maintenance:
  owner: 'Core Team'
  review_cadence: 'P90D'
---

# Documentation Index

**Purpose**: Central routing table for all project documentation **Audience**:
Humans AND Agents **Last Updated**: 2026-05-20

---

## Quick Navigation

| Category                                         | When to Use                             | Primary Docs                        |
| ------------------------------------------------ | --------------------------------------- | ----------------------------------- |
| [Getting Started](#getting-started)              | First time setup, onboarding            | README.md                           |
| [Development](#development)                      | Building features, coding workflows     | CLAUDE.md, docs/INDEX.md            |
| [Testing](#testing)                              | Running tests, fixing failures          | tests/README.md                     |
| [Deployment](#deployment)                        | Deploying to staging/production         | scripts/README.md                   |
| [Architecture](#architecture)                    | Design decisions, technical strategy    | DECISIONS.md                        |
| [AI & Automation](#ai--automation)               | Agent development, AI workflows         | ai-utils/README.md                  |
| [Workflows & CI/CD](#workflows--cicd)            | GitHub Actions, deployment scripts      | workflows/README.md                 |
| [Scripts](#scripts)                              | NPM scripts, utility commands           | package.json, scripts/              |
| [Phoenix Project](#phoenix-project)              | Truth-case validation, VC modeling      | PHOENIX-SOT/README.md               |
| [Domain Knowledge](#domain-knowledge-notebooklm) | VC fund modeling truth sources          | notebooklm-sources/                 |
| [Skills & Tools](#skills--tools)                 | Available agents, tools, skills         | DEVELOPMENT-TOOLING-CATALOG.md      |
| [CI Quality Gates](#ci-quality-gates)            | Baseline validation, schema drift, perf | CLAUDE-INFRA-V4-INTEGRATION-PLAN.md |
| [Troubleshooting](#troubleshooting)              | Debugging, common issues                | cheatsheets/daily-workflow.md       |
| [Stabilization](#stabilization)                  | Global rules, milestone roadmap         | STABILIZATION-ROADMAP.md            |

---

## Getting Started

**Status**: [ACTIVE] **Audience**: Humans + Agents

| Document                              | Description                                       | When to Use                  |
| ------------------------------------- | ------------------------------------------------- | ---------------------------- |
| [README.md](../README.md)             | Project overview, tech stack, setup               | First time setup             |
| [CLAUDE.md](../CLAUDE.md)             | AI assistant guidelines, conventions              | Before ANY AI-assisted task  |
| [CAPABILITIES.md](../CAPABILITIES.md) | Historical inventory of agents, tools, and skills | Historical capability lookup |

**Current Path**: CLAUDE.md -> repo search -> docs/INDEX.md -> README.md

---

## Development

**Status**: [ACTIVE] **Audience**: Humans + Agents

| Document                                                         | Description                                       | When to Use                         |
| ---------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------- |
| [CLAUDE.md](../CLAUDE.md)                                        | Core architecture, conventions, memory management | Every development session           |
| [CAPABILITIES.md](../CAPABILITIES.md)                            | Historical inventory of agents, tools, functions  | Historical capability context       |
| [CHANGELOG.md](../CHANGELOG.md)                                  | All changes with timestamps                       | Recording changes, checking history |
| [DECISIONS.md](../DECISIONS.md)                                  | Architectural decisions (ADRs)                    | Understanding "why" decisions       |
| [DEVELOPMENT-TOOLING-CATALOG.md](DEVELOPMENT-TOOLING-CATALOG.md) | Complete inventory of agents, tools, scripts      | Finding the right tool for the job  |

**Key Commands**:

- `/dev` - Extreme lightweight development workflow
- `/test-smart` - Intelligent test selection
- `/fix-auto` - Automated repair of lint/format/test failures

---

## Testing

**Status**: [ACTIVE] **Audience**: Humans + Agents

| Document                                                                                                                 | Description                                                                             | When to Use                                                 |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [tests/README.md](../tests/README.md)                                                                                    | Testing strategy (Unit, Integration, E2E)                                               | Writing tests, fixing test failures                         |
| [cheatsheets/service-testing-patterns.md](../cheatsheets/service-testing-patterns.md)                                    | API/service test patterns, integration testing                                          | When writing integration tests                              |
| [cheatsheets/testcontainers-guide.md](../cheatsheets/testcontainers-guide.md)                                            | Testcontainers setup and usage guide                                                    | Setting up Docker-based integration tests                   |
| [ARCHITECTURAL-DEBT.md](ARCHITECTURAL-DEBT.md)                                                                           | Complex refactoring registry (10+ files, architectural)                                 | Documenting deferred architectural work                     |
| [plans/2026-03-31-variance-roadmap-revision.md](plans/2026-03-31-variance-roadmap-revision.md)                           | Validated production order for variance, baselines, alerts, Time Machine, and analytics | When planning follow-on implementation after variance audit |
| [plans/2026-04-01-variance-phase1a1c-implementation-plan.md](plans/2026-04-01-variance-phase1a1c-implementation-plan.md) | Implemented variance-model slice plus rollout limitations                               | Understanding shipped current-state variance behavior       |
| [cheatsheets/pr-merge-verification.md](../cheatsheets/pr-merge-verification.md)                                          | PR verification baseline (74.7% pass rate)                                              | Before merging PRs                                          |

**Key Commands**:

- `npm test` - Run full test suite
- `npm test -- --project=server` - Server tests only
- `npm test -- --project=client` - Client tests only
- `/test-smart` - Run tests for changed files only

**Baseline**: 72.3% pass rate (1275/1762 tests) as of 2025-12-15 (Foundation
Hardening baseline)

---

## Deployment

**Status**: [ACTIVE] **Audience**: Humans + Agents

| Document                                                           | Description                                               | When to Use                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------- |
| [scripts/README.md](../scripts/README.md)                          | Deployment scripts (progressive rollout, smoke tests)     | Deploying to staging/production              |
| [workflows/PRODUCTION_SCRIPTS.md](workflows/PRODUCTION_SCRIPTS.md) | Production deployment system details                      | Understanding deployment process             |
| [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md)                     | Step-by-step production deployment and rollback runbook   | Executing or supervising production rollout  |
| [OPERATOR_RUNBOOK.md](OPERATOR_RUNBOOK.md)                         | Unified metrics diagnostic runbook                        | Investigating production metrics anomalies   |
| [observability.md](observability.md)                               | Monitoring, health checks, metrics, and alerting overview | Understanding runtime observability surfaces |

**Key Scripts**:

- `scripts/deploy-with-confidence.ps1` - Progressive rollout (10% → 25% → 50% →
  100%)
- `scripts/monitor-deployment.ps1` - Deployment monitoring
- `scripts/smoke-test-prod.ps1` - Post-deployment validation

**Key Commands**:

- `/deploy-check` - Pre-deployment validation (build, bundle, smoke,
  idempotency)

---

## Architecture

**Status**: [ACTIVE] **Audience**: Humans + Agents

| Document                                                                               | Description                                             | When to Use                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| [DECISIONS.md](../DECISIONS.md)                                                        | Architectural Decision Records (ADRs)                   | Understanding technical rationale           |
| [adr/](adr/)                                                                           | Standalone ADR files (15 files)                         | Architecture decisions outside DECISIONS.md |
| [DEVELOPMENT_STRATEGY.md](DEVELOPMENT_STRATEGY.md)                                     | Long-term development strategy                          | Strategic planning                          |
| [governance/cleanup-manifest.md](governance/cleanup-manifest.md)                       | Current cleanup candidate register                      | Before deletion/externalization cleanup     |
| [governance/2026-05-19-refactor-roadmap.md](governance/2026-05-19-refactor-roadmap.md) | Active refactor roadmap and priority order              | Cleanup/refactor sequencing                 |
| [MULTI-AI-DEVELOPMENT-WORKFLOW.md](MULTI-AI-DEVELOPMENT-WORKFLOW.md)                   | Multi-AI collaboration patterns                         | Leveraging multiple AIs                     |
| [schema.md](schema.md)                                                                 | Database schema, relationships, and design patterns     | Understanding persisted data model          |
| [IDEMPOTENCY_GUIDE.md](IDEMPOTENCY_GUIDE.md)                                           | Request deduplication and exactly-once processing guide | Designing safe write paths                  |
| [RLS-DEVELOPMENT-GUIDE.md](RLS-DEVELOPMENT-GUIDE.md)                                   | Multi-tenant Row-Level Security development guide       | Building or testing tenant-scoped features  |

**Key ADRs**:

- ADR-011: Anti-Pattern Prevention Strategy (DECISIONS.md)
- ADR-014: PR Merge Criteria (baseline comparison)

**Standalone ADRs (`docs/adr/`)**:

| ADR | Title                                                       |
| --- | ----------------------------------------------------------- |
| 017 | Monte Carlo Validation Strategy                             |
| 018 | Typed Stage Normalization & Statistical Monte Carlo Testing |
| 019 | mem0 Integration for AI Agent Memory Management             |

_Routing note: `DECISIONS.md` also has separate ADR-017/018/019 entries on
different decisions. Reference standalone ADRs by `docs/adr/...` path and title,
not by number alone._

---

## Stabilization

**Status**: [ACTIVE] **Audience**: Humans + Agents

| Document                                             | Description                                       | When to Use                                    |
| ---------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| [STABILIZATION-ROADMAP.md](STABILIZATION-ROADMAP.md) | Global rules and milestone roadmap (0A through 7) | Before starting any milestone work, PR scoping |

---

## AI & Automation

**Status**: [ACTIVE] **Audience**: Agents

| Document                                                | Description                                             | When to Use                          |
| ------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------ |
| [ai-utils/README.md](../ai-utils/README.md)             | Memory-enabled code review system                       | Code review automation               |
| [ai/prompt/README.md](../ai/prompt/README.md)           | Type-safe prompt templates                              | Portfolio QA, Reserve Sizing         |
| [.claude/skills/INDEX.md](../.claude/skills/INDEX.md)   | Skills index                                            | Finding skills for workflows         |
| [.claude/DISCOVERY-MAP.md](../.claude/DISCOVERY-MAP.md) | Agent-facing routing, including Phoenix quick reference | Finding Phoenix agents and workflows |

**Key Features**:

- **Memory System**: HybridMemoryManager with PostgreSQL + pgvector
- **Pattern Learning**: Cross-conversation pattern learning
- **Multi-AI**: Gemini (free), Grok/OpenAI/DeepSeek (paid)

---

## Workflows & CI/CD

**Status**: [ACTIVE] **Audience**: Humans + Agents

| Document                                                                     | Description                             | When to Use                              |
| ---------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------- |
| [workflows/README.md](workflows/README.md)                                   | Current GitHub Actions workflow index   | Understanding CI/CD pipelines            |
| [workflows/PRODUCTION_SCRIPTS.md](workflows/PRODUCTION_SCRIPTS.md)           | Deployment system (progressive rollout) | Production deployments                   |
| [workflows/PAIRED-AGENT-VALIDATION.md](workflows/PAIRED-AGENT-VALIDATION.md) | Paired-agent quality workflow           | Deletions, structural changes, bulk mods |

**Current snapshot**:

- 16 workflow files currently present in `.github/workflows`
- `workflows/README.md` is the maintained repo-verified index
- the archived workflow inventory snapshot is for historical reference only

**Pattern Routing**:

- **Deploy/Production** → PRODUCTION_SCRIPTS.md
- **CI/GitHub Actions** → README.md
- **Quality/Validation** → PAIRED-AGENT-VALIDATION.md

---

## Scripts

**Status**: [ACTIVE] **Audience**: Humans + Agents

| Document                                  | Description                      | When to Use                |
| ----------------------------------------- | -------------------------------- | -------------------------- |
| [package.json](../package.json)           | Current npm script inventory     | Finding available commands |
| [scripts/README.md](../scripts/README.md) | Deployment scripts documentation | Deployment automation      |

**Current snapshot**:

- 80 scripts are currently defined in the root `package.json`
- Use `package.json` as the source of truth for exact script names
- The highest-signal families are development/build, lint/guardrails,
  test/validation, database/seeding, docs/routing, and Phoenix/domain checks
- `guard:scripts:check` blocks new legacy wave/phase/slice script aliases while
  the existing aliases are retired
- Phoenix (28 scripts): `phoenix:truth`, `phoenix:xirr-validate`

---

## Phoenix Project

**Status**: [ACTIVE] **Audience**: Agents **Current Phase**: 1B
(Fees/Waterfall-Ledger validated)

| Document                                                                       | Description                            | When to Use                        |
| ------------------------------------------------------------------------------ | -------------------------------------- | ---------------------------------- |
| [PHOENIX-SOT/README.md](PHOENIX-SOT/README.md)                                 | Phoenix project single source of truth | Phoenix workflows                  |
| [PHOENIX-SOT/execution-plan-v2.34.md](PHOENIX-SOT/execution-plan-v2.34.md)     | 2000+ line execution plan              | Phase 0/1A/1B/2/3+ implementation  |
| [notebooklm-sources/](notebooklm-sources/)                                     | Domain knowledge (85K words, 22 files) | VC fund modeling truth sources     |
| [notebooklm-sources/PHASE2-COMPLETE.md](notebooklm-sources/PHASE2-COMPLETE.md) | Phase 2 engine docs completion summary | Understanding Phase 2 deliverables |

**Key Features**:

- 119 truth-case scenarios across 6 modules (XIRR, Waterfall, Fees, Capital
  Allocation, Exit Recycling)
- 9 Phoenix-specific agents (truth-case-runner, precision-guardian,
  waterfall-specialist, etc.)
- Phase 1B complete: Fees 10/10, Waterfall-Ledger 14/14 validated
- Phase 2 Documentation: COMPLETE (Nov 6, 2025) - All 4 engines documented

**Key Commands**:

- `npm run phoenix:truth` - Run truth-case validation suite
- `/phoenix-truth` - Deterministic truth case validation
- `/phoenix-phase2` - Phase 2 probabilistic workflow
- `/phoenix-prob-report` - Format Monte Carlo distributions

---

## Domain Knowledge (NotebookLM)

**Status**: [ACTIVE] **Audience**: Agents **Completion**: Phase 2 COMPLETE (Nov
6, 2025)

The canonical domain knowledge base for ALL Phoenix validation work. 22 files,
~85,000 words of AI-consumable truth sources.

**Foundation Hardening Coordination**:
[PHOENIX-FOUNDATION-HARDENING-CROSSWALK.md](plans/PHOENIX-FOUNDATION-HARDENING-CROSSWALK.md) -
How Phoenix validation coordinates with Foundation Hardening implementation
parity work

| Document                                                                             | Description                             | When to Use                      |
| ------------------------------------------------------------------------------------ | --------------------------------------- | -------------------------------- |
| [notebooklm-sources/xirr.md](notebooklm-sources/xirr.md)                             | XIRR calculation semantics              | XIRR validation, Excel parity    |
| [notebooklm-sources/waterfall.md](notebooklm-sources/waterfall.md)                   | Waterfall distribution logic            | Carry, clawback, tier validation |
| [notebooklm-sources/fees.md](notebooklm-sources/fees.md)                             | Fee calculation standards               | Management/performance fees      |
| [notebooklm-sources/capital-allocation.md](notebooklm-sources/capital-allocation.md) | Capital allocation policy               | Capital deployment logic         |
| [notebooklm-sources/exit-recycling.md](notebooklm-sources/exit-recycling.md)         | Exit recycling rules                    | Recycled capital handling        |
| [notebooklm-sources/reserves/](notebooklm-sources/reserves/)                         | ReserveEngine docs (4 files, ~23 pages) | Reserve allocation strategies    |
| [notebooklm-sources/pacing/](notebooklm-sources/pacing/)                             | PacingEngine docs (4 files, ~26 pages)  | Investment pacing patterns       |
| [notebooklm-sources/cohorts/](notebooklm-sources/cohorts/)                           | CohortEngine docs (3 files, ~69 pages)  | Cohort-based analytics           |
| [notebooklm-sources/monte-carlo/](notebooklm-sources/monte-carlo/)                   | Monte Carlo docs (4 files, ~120 pages)  | Simulation engine                |

**Quality Metrics**:

- Phase 1: 91-99% validation scores (capital-allocation: 99%, xirr: 96.3%)
- Phase 2: 95-99% self-validation (all 4 engines documented)
- Total: ~238 pages across 15 files for Phase 2 alone

**Known Issue**: Pacing validation config mismatch documented in
`notebooklm-sources/pacing/VALIDATION-NOTES.md`

---

## Skills & Tools

**Status**: [ACTIVE] **Audience**: Agents

| Document                                                         | Description                                      | When to Use            |
| ---------------------------------------------------------------- | ------------------------------------------------ | ---------------------- |
| [DEVELOPMENT-TOOLING-CATALOG.md](DEVELOPMENT-TOOLING-CATALOG.md) | Repo-verified tooling snapshot and routing guide | Finding the right tool |
| [.claude/skills/INDEX.md](../.claude/skills/INDEX.md)            | Skills index                                     | Skill selection        |
| [cheatsheets/](../cheatsheets/)                                  | Implementation guides                            | How-to documentation   |

**Decision Tree Priority**:

1. Phoenix Agents (domain-specific)
2. Project Agents (project standards)
3. Slash Commands (curated workflows)
4. MCP Tools (structured interfaces)
5. User Personas (generic fallback)

---

## CI Quality Gates

**Status**: [ACTIVE] **Audience**: Agents **Added**: 2025-12-16 (v4 optimal
infrastructure)

Validator-diagnoser architecture for quality assurance. CI scripts detect
issues; specialized agents diagnose root causes.

| Document                                                                   | Description                                           | When to Use                       |
| -------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------- |
| [CLAUDE-INFRA-V4-INTEGRATION-PLAN.md](CLAUDE-INFRA-V4-INTEGRATION-PLAN.md) | Integration plan for v4 infrastructure                | Understanding quality gates       |
| [TYPESCRIPT_BASELINE.md](TYPESCRIPT_BASELINE.md)                           | TypeScript baseline governance and reduction workflow | Working baseline debt down safely |
| [../scripts/baseline-check.sh](../scripts/baseline-check.sh)               | Quality metric validation (tests, TS, lint)           | CI baseline ratcheting            |
| [../scripts/validate-schema-drift.sh](../scripts/validate-schema-drift.sh) | Schema alignment validation                           | Migration/Drizzle/Zod sync        |
| [../scripts/bench-check.sh](../scripts/bench-check.sh)                     | Performance benchmark validation                      | Perf regression detection         |
| [../scripts/validate-claude-infra.ts](../scripts/validate-claude-infra.ts) | Claude infra consistency check                        | Agent/skill integrity             |

**Diagnoser Agents** (delegated from code-reviewer):

| Agent                         | Invoked When                   | Role                             |
| ----------------------------- | ------------------------------ | -------------------------------- |
| baseline-regression-explainer | baseline-check.sh fails        | Diagnose test/TS/lint regression |
| schema-drift-checker          | validate-schema-drift.sh fails | Diagnose schema layer mismatch   |
| perf-regression-triager       | bench-check.sh fails           | Diagnose performance regression  |
| parity-auditor                | Truth-case tests fail          | Assess Excel parity impact       |
| playwright-test-author        | Browser-only bug detected      | Create E2E tests                 |

**New Skills** (quality gate governance):

- **test-pyramid** - E2E scope control, test level governance
- **statistical-testing** - Monte Carlo validation, seeded testing
- **react-hook-form-stability** - RHF infinite loop prevention
- **baseline-governance** - Quality gate policies, ratcheting strategy
- **financial-calc-correctness** - Excel parity methodology
- **claude-infra-integrity** - .claude/ directory consistency

**Key Pattern**: Validators run in CI (deterministic exit codes) → Diagnoser
agents explain failures and recommend fixes.

---

## Troubleshooting

**Status**: [ACTIVE] **Audience**: Humans + Agents

| Document                                                                              | Description                                     | When to Use                                           |
| ------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| [cheatsheets/daily-workflow.md](../cheatsheets/daily-workflow.md)                     | Current troubleshooting workflow                | Build, dependency, and module issues                  |
| [cheatsheets/document-review-workflow.md](../cheatsheets/document-review-workflow.md) | Document review protocol                        | Verifying documentation claims                        |
| [dev-environment-reset.md](dev-environment-reset.md)                                  | Tiered local-environment reset guide            | Recovering from persistent cache or dependency issues |
| [WINDOWS_NODE_CORRUPTION_PREVENTION.md](WINDOWS_NODE_CORRUPTION_PREVENTION.md)        | Windows-specific Node/npm corruption prevention | Stabilizing a broken Windows dev environment          |
| [failure-triage.md](failure-triage.md)                                                | XIRR truth-case failure triage guide            | Diagnosing Phoenix/XIRR validation failures           |

**Common Issues**:

- **Module not found**: Run `npm run doctor:quick`
- **Pre-commit fails**: Run `npm run doctor` then retry
- **After npm install**: Auto-fixed by postinstall hook

---

## Status Legend

- **[ACTIVE]**: Current, regularly updated
- **[REFERENCE]**: Timeless reference material
- **[HISTORICAL]**: Past context, may be superseded
- **[DEPRECATED]**: Obsolete, see superseded_by link

---

## Document Review Protocol

When reviewing planning documents (PHASE*, STRATEGY*, \*-PLAN.md):

1. **Classify**: PLAN (future) vs STATUS (present) vs REFERENCE (timeless)
2. **Check timestamp**: If >24h old, search for execution evidence
3. **Verify claims**: Code is truth, documentation describes intent
4. **Git log search**: `git log --since=<doc-date>` for related commits
5. **Clarify ambiguity**: Ask if theoretical review or reality check

**See**:
[cheatsheets/document-review-workflow.md](../cheatsheets/document-review-workflow.md)
for complete workflow

---

## Maintenance

**Document Owner**: Development Team **Review Cycle**: Monthly (or after major
structural changes) **Last Updated**: 2026-05-20 **Next Review**: 2026-06-20

**Update Triggers**:

1. New README created
2. Documentation moved or archived
3. New major feature/workflow added
4. Project phase transition (e.g., Phoenix 1B → 2)

---

**Navigation Tip**: For agent-facing decision tree and pattern routing, see
[.claude/DISCOVERY-MAP.md](../.claude/DISCOVERY-MAP.md)
