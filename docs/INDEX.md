# Documentation Index

**Purpose**: Central routing table for all project documentation **Audience**:
Humans AND Agents **Last Updated**: 2025-12-12

---

## Quick Navigation

| Category                              | When to Use                          | Primary Docs                   |
| ------------------------------------- | ------------------------------------ | ------------------------------ |
| [Getting Started](#getting-started)   | First time setup, onboarding         | README.md                      |
| [Development](#development)           | Building features, coding workflows  | CLAUDE.md, CAPABILITIES.md     |
| [Testing](#testing)                   | Running tests, fixing failures       | tests/README.md                |
| [Deployment](#deployment)             | Deploying to staging/production      | scripts/README.md              |
| [Architecture](#architecture)         | Design decisions, technical strategy | DECISIONS.md                   |
| [AI & Automation](#ai--automation)    | Agent development, AI workflows      | ai-utils/README.md             |
| [Workflows & CI/CD](#workflows--cicd) | GitHub Actions, deployment scripts   | workflows/README.md            |
| [Scripts](#scripts)                   | NPM scripts, utility commands        | package.json, scripts/         |
| [Phoenix Project](#phoenix-project)   | Truth-case validation, VC modeling   | PHOENIX-SOT/README.md          |
| [Skills & Tools](#skills--tools)      | Available agents, tools, skills      | DEVELOPMENT-TOOLING-CATALOG.md |
| [Troubleshooting](#troubleshooting)   | Debugging, common issues             | SIDECAR_GUIDE.md               |

---

## Getting Started

**Status**: [ACTIVE] **Audience**: Humans + Agents

| Document                              | Description                                                   | When to Use                                        |
| ------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| [README.md](../README.md)             | Project overview, tech stack, setup                           | First time setup                                   |
| [CLAUDE.md](../CLAUDE.md)             | AI assistant guidelines, conventions                          | Before ANY AI-assisted task                        |
| [CAPABILITIES.md](../CAPABILITIES.md) | **READ THIS FIRST**: Complete inventory of existing solutions | Before creating any todos or implementing anything |

**Critical Path**: CAPABILITIES.md → CLAUDE.md → README.md

---

## Development

**Status**: [ACTIVE] **Audience**: Humans + Agents

| Document                                                         | Description                                       | When to Use                         |
| ---------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------- |
| [CLAUDE.md](../CLAUDE.md)                                        | Core architecture, conventions, memory management | Every development session           |
| [CAPABILITIES.md](../CAPABILITIES.md)                            | Existing agents, tools, functions                 | Before implementing new features    |
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

| Document                                                                        | Description                                | When to Use                         |
| ------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------- |
| [tests/README.md](../tests/README.md)                                           | Testing strategy (Unit, Integration, E2E)  | Writing tests, fixing test failures |
| [cheatsheets/pr-merge-verification.md](../cheatsheets/pr-merge-verification.md) | PR verification baseline (74.7% pass rate) | Before merging PRs                  |

**Key Commands**:

- `npm test` - Run full test suite
- `npm test -- --project=server` - Server tests only
- `npm test -- --project=client` - Client tests only
- `/test-smart` - Run tests for changed files only

**Baseline**: 74.7% pass rate (998/1,337 tests) as of 2025-11-17

---

## Deployment

**Status**: [ACTIVE] **Audience**: Humans + Agents

| Document                                                           | Description                                           | When to Use                      |
| ------------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------- |
| [scripts/README.md](../scripts/README.md)                          | Deployment scripts (progressive rollout, smoke tests) | Deploying to staging/production  |
| [workflows/PRODUCTION_SCRIPTS.md](workflows/PRODUCTION_SCRIPTS.md) | Production deployment system details                  | Understanding deployment process |

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

| Document                                                             | Description                           | When to Use                       |
| -------------------------------------------------------------------- | ------------------------------------- | --------------------------------- |
| [DECISIONS.md](../DECISIONS.md)                                      | Architectural Decision Records (ADRs) | Understanding technical rationale |
| [DEVELOPMENT_STRATEGY.md](DEVELOPMENT_STRATEGY.md)                   | Long-term development strategy        | Strategic planning                |
| [MULTI-AI-DEVELOPMENT-WORKFLOW.md](MULTI-AI-DEVELOPMENT-WORKFLOW.md) | Multi-AI collaboration patterns       | Leveraging multiple AIs           |

**Key ADRs**:

- ADR-011: Anti-Pattern Prevention Strategy
- ADR-014: PR Merge Criteria (baseline comparison)

---

## AI & Automation

**Status**: [ACTIVE] **Audience**: Agents

| Document                                                                    | Description                           | When to Use                      |
| --------------------------------------------------------------------------- | ------------------------------------- | -------------------------------- |
| [ai-utils/README.md](../ai-utils/README.md)                                 | Memory-enabled code review system     | Code review automation           |
| [ai/prompt/README.md](../ai/prompt/README.md)                               | Type-safe prompt templates            | Portfolio QA, Reserve Sizing     |
| [.claude/skills/README.md](../.claude/skills/README.md)                     | 21 skills catalog                     | Finding skills for workflows     |
| [.claude/agents/PHOENIX-AGENTS.md](../.claude/agents/PHOENIX-AGENTS.md)     | 9 Phoenix-specific agents             | Phoenix project workflows        |
| [claude_code-multi-AI-MCP/README.md](../claude_code-multi-AI-MCP/README.md) | Multi-AI collaboration (16 functions) | Consensus, debate, collaboration |

**Key Features**:

- **Memory System**: HybridMemoryManager with PostgreSQL + pgvector
- **Pattern Learning**: Cross-conversation pattern learning
- **Multi-AI**: Gemini (free), Grok/OpenAI/DeepSeek (paid)

---

## Workflows & CI/CD

**Status**: [ACTIVE] **Audience**: Humans + Agents

| Document                                                                                 | Description                             | When to Use                              |
| ---------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------- |
| [workflows/README.md](workflows/README.md)                                               | 55 GitHub Actions workflows inventory   | Understanding CI/CD pipelines            |
| [workflows/PRODUCTION_SCRIPTS.md](workflows/PRODUCTION_SCRIPTS.md)                       | Deployment system (progressive rollout) | Production deployments                   |
| [workflows/PAIRED-AGENT-VALIDATION.md](workflows/PAIRED-AGENT-VALIDATION.md)             | Paired-agent quality workflow           | Deletions, structural changes, bulk mods |
| [workflows/CONSOLIDATION_FINAL_VALIDATED.md](workflows/CONSOLIDATION_FINAL_VALIDATED.md) | Workflow consolidation strategy         | Reducing 55 → 18 workflows               |

**Key Stats**:

- 55 workflows (8,621 YAML lines, 108 secrets)
- 54 active, 1 broken (ci-optimized.yml)
- Consolidation opportunity: 67% reduction (55 → 18 workflows)

**Pattern Routing**:

- **Deploy/Production** → PRODUCTION_SCRIPTS.md
- **CI/GitHub Actions** → README.md + inventory.generated.json
- **Quality/Validation** → PAIRED-AGENT-VALIDATION.md

---

## Scripts

**Status**: [ACTIVE] **Audience**: Humans + Agents

| Document                                  | Description                          | When to Use                |
| ----------------------------------------- | ------------------------------------ | -------------------------- |
| [package.json](../package.json)           | 277 npm scripts across 15 categories | Finding available commands |
| [scripts/README.md](../scripts/README.md) | Deployment scripts documentation     | Deployment automation      |

**Key Categories**:

- Development (12 scripts): `dev`, `build`, `check`, `doctor`
- Testing (18 scripts): `test`, `test:run`, `test:ui`, `/test-smart`
- Database (8 scripts): `db:push`, `db:studio`, `db:migrate`
- Deployment (15 scripts): `deploy`, `deploy:staging`, `deploy:production`
- AI Tools (12 scripts): `ai`, `ai:test-repair`, `codex`
- Phoenix (28 scripts): `phoenix:truth`, `phoenix:xirr-validate`

---

## Phoenix Project

**Status**: [ACTIVE] **Audience**: Agents

| Document                                                                                             | Description                            | When to Use                       |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------- |
| [PHOENIX-SOT/README.md](PHOENIX-SOT/README.md)                                                       | Phoenix project single source of truth | Phoenix workflows                 |
| [PHOENIX-SOT/execution-plan-v2.34.md](PHOENIX-SOT/execution-plan-v2.34.md)                           | 2000+ line execution plan              | Phase 0/1A/1B/2/3+ implementation |
| [PHOENIX-SOT/execution-plan-v2.34-enhancements.md](PHOENIX-SOT/execution-plan-v2.34-enhancements.md) | v2.34 MCP + tool routing updates       | Recent enhancements               |

**Key Features**:

- 119 truth-case scenarios across 6 modules (XIRR, Waterfall, Fees, Capital
  Allocation, Exit Recycling)
- 9 Phoenix-specific agents (truth-case-runner, precision-guardian,
  waterfall-specialist, etc.)
- Phase 1B active: 82.4% accuracy (14/17 tests)

**Key Commands**:

- `npm run phoenix:truth` - Run truth-case validation suite
- `/run-truth` - Slash command alias

---

## Skills & Tools

**Status**: [ACTIVE] **Audience**: Agents

| Document                                                         | Description                                               | When to Use            |
| ---------------------------------------------------------------- | --------------------------------------------------------- | ---------------------- |
| [DEVELOPMENT-TOOLING-CATALOG.md](DEVELOPMENT-TOOLING-CATALOG.md) | Complete inventory (31 agents, 277 scripts, 59 MCP tools) | Finding the right tool |
| [.claude/skills/README.md](../.claude/skills/README.md)          | 21 skills catalog                                         | Skill selection        |
| [cheatsheets/](../cheatsheets/)                                  | Implementation guides                                     | How-to documentation   |

**Decision Tree Priority**:

1. Phoenix Agents (domain-specific)
2. Project Agents (project standards)
3. Slash Commands (curated workflows)
4. MCP Tools (structured interfaces)
5. User Personas (generic fallback)

---

## Troubleshooting

**Status**: [ACTIVE] **Audience**: Humans + Agents

| Document                                                                              | Description                                  | When to Use                    |
| ------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------ |
| [SIDECAR_GUIDE.md](../SIDECAR_GUIDE.md)                                               | Windows sidecar architecture troubleshooting | Module resolution issues       |
| [cheatsheets/document-review-workflow.md](../cheatsheets/document-review-workflow.md) | Document review protocol                     | Verifying documentation claims |

**Common Issues**:

- **Module not found**: Run `npm run doctor:links`
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
structural changes) **Last Updated**: 2025-12-12 **Next Review**: 2026-01-12

**Update Triggers**:

1. New README created
2. Documentation moved or archived
3. New major feature/workflow added
4. Project phase transition (e.g., Phoenix 1B → 2)

---

**Navigation Tip**: For agent-facing decision tree and pattern routing, see
`.claude/DISCOVERY-MAP.md` (Phase 2 implementation)
