# Development Tooling Catalog (Corrected)

**Date**: 2025-12-12 **Version**: 2.0 (Post-Review Corrections) **Status**:
Active **Scope**: Complete inventory of agents, tools, scripts, and workflows

---

## Governance Notice

**CRITICAL**: This catalog represents a mature "Phase 3+" Agentic architecture
with:

- 100% memory adoption across 31 project agents
- 277 npm scripts across 15 categories
- 59 MCP tools (16 Multi-AI, 43 TaskMaster)
- Domain-specific Phoenix agents for VC fund modeling

**Priority Order** (Section 8 Decision Tree): Phoenix Agents → Project Agents →
User Agents → Scripts/Tools

---

## Table of Contents

1. [Project-Level Agents](#1-project-level-agents) (31 agents)
2. [Global System Personas](#2-global-system-personas) (Pruned for relevance)
3. [Slash Commands](#3-slash-commands) (8 commands)
4. [Agent Packages](#4-agent-packages) (8 packages, 100% memory adoption)
5. [MCP Tools](#5-mcp-tools) (59 functions)
6. [Skills Library](#6-skills-library) (37 skills)
7. [NPM Scripts](#7-npm-scripts) (277 scripts)
8. [Workflow Decision Tree](#8-workflow-decision-tree) (CORRECTED)

---

## 1. Project-Level Agents

**Location**: `.claude/agents/`, `packages/`

**Memory Infrastructure**: All agents use `HybridMemoryManager` with:

- PostgreSQL + pgvector for semantic search
- Tenant-scoped memory (e.g., `agent:phoenix-truth-case-runner`)
- Cross-conversation pattern learning via `PatternLearningEngine`

### 1.1 Phoenix Agents (Domain-Specific)

**Purpose**: Specialized agents for Phoenix project (VC fund modeling
validation)

| Agent                                | Description                                                                                                                                                                                 | Trigger                                 | Cost Tier    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------ |
| `phoenix-truth-case-runner`          | Executes truth-case validation suite (119 scenarios across 6 modules)                                                                                                                       | `npm run phoenix:truth` OR `/run-truth` | Standard     |
| `phoenix-precision-guardian`         | Validates numeric precision (XIRR, waterfall calculations)                                                                                                                                  | Auto-invoked during `/dev` workflow     | Standard     |
| `phoenix-waterfall-specialist`       | Waterfall carry distribution expert (AMERICAN/EUROPEAN types)                                                                                                                               | Manual via Task tool                    | Standard     |
| `phoenix-xirr-fees-validator`        | XIRR and fee calculation validator                                                                                                                                                          | `npm run phoenix:xirr-validate`         | Standard     |
| `phoenix-capital-allocation-analyst` | Capital allocation and pacing analysis                                                                                                                                                      | Manual via Task tool                    | Standard     |
| `phoenix-docs-scribe`                | Documentation generator for Phoenix phases                                                                                                                                                  | Manual via Task tool                    | Standard     |
| `phoenix-probabilistic-engineer`     | Monte Carlo simulation expert                                                                                                                                                               | Manual via Task tool                    | High Compute |
| `phoenix-reserves-optimizer`         | Reserve sizing and allocation optimization                                                                                                                                                  | Manual via Task tool                    | Standard     |
| `phoenix-brand-reporting-stylist`    | **Asset-Locked / Read-Only**: Brand-compliant report generation. Can READ branding assets (logos, fonts, color palettes) but CANNOT modify brand standards without explicit human approval. | Manual via Task tool                    | Standard     |

### 1.2 Test & Quality Agents

| Agent                   | Description                                                              | Trigger                                         | Cost Tier    |
| ----------------------- | ------------------------------------------------------------------------ | ----------------------------------------------- | ------------ |
| `test-repair-agent`     | Autonomous test failure detection and repair                             | `npm run ai:test-repair`                        | Standard     |
| `silent-failure-hunter` | Identifies inadequate error handling, silent failures, fallback behavior | Auto-invoked during PR review                   | High Compute |
| `pr-test-analyzer`      | Reviews PR test coverage for gaps and edge cases                         | Auto-invoked during PR creation                 | High Compute |
| `comment-analyzer`      | Analyzes code comments for accuracy, completeness, maintainability       | Manual via Task tool                            | Standard     |
| `code-simplifier`       | Simplifies code for clarity while preserving functionality               | Auto-invoked after coding task completion       | Standard     |
| `code-reviewer`         | Reviews code for style, best practices, project guidelines               | Manual: `/ts-review` OR auto-invoked before PR  | Standard     |
| `type-design-analyzer`  | Reviews type design for encapsulation, invariant expression              | Manual via Task tool when introducing new types | Standard     |

### 1.3 Development Workflow Agents

| Agent                        | Description                                                           | Trigger                              | Cost Tier |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------------------ | --------- |
| `feature-dev:code-architect` | Designs feature architectures from existing codebase patterns         | `/feature-dev` workflow              | Standard  |
| `feature-dev:code-explorer`  | Analyzes existing features by tracing execution paths                 | `/feature-dev` workflow              | Standard  |
| `feature-dev:code-reviewer`  | Reviews feature code for bugs, security, quality                      | `/feature-dev` workflow              | Standard  |
| `bugfix`                     | Bug resolution specialist (analysis → understanding → implementation) | `/fix-auto` OR manual via Task tool  | Standard  |
| `bugfix-verify`              | Independent validation of bug fixes                                   | Auto-invoked after bugfix completion | Standard  |
| `optimize`                   | Performance optimization coordinator                                  | Manual via Task tool                 | Standard  |
| `debug`                      | UltraThink debug orchestrator with multi-agent coordination           | Manual via Task tool                 | Standard  |
| `code`                       | Development coordinator for direct feature implementation             | Manual via Task tool                 | Standard  |

### 1.4 Planning & Architecture Agents

| Agent                                       | Description                                                          | Trigger                           | Cost Tier |
| ------------------------------------------- | -------------------------------------------------------------------- | --------------------------------- | --------- |
| `dev-plan-generator`                        | Creates structured dev-plan.md with task breakdown                   | Auto-invoked after Codex analysis | Standard  |
| `comprehensive-review:architect-review`     | Software architect for system designs, scalability                   | Manual via Task tool              | Standard  |
| `database-design:database-architect`        | Database architecture from scratch (tech selection, schema modeling) | Manual via Task tool              | Standard  |
| `deployment-strategies:deployment-engineer` | CI/CD pipelines, GitOps workflows, deployment automation             | Manual via Task tool              | Standard  |

### 1.5 Specialized Infrastructure Agents

| Agent                                 | Description                                           | Trigger                                   | Cost Tier    |
| ------------------------------------- | ----------------------------------------------------- | ----------------------------------------- | ------------ |
| `db-migration`                        | Database migration analysis with rollback planning    | `npm run db:migrate` (with safety checks) | High Compute |
| `perf-guard`                          | Performance regression detection with bundle analysis | `/deploy-check` workflow                  | High Compute |
| `agent-sdk-dev:agent-sdk-verifier-py` | Verifies Python Agent SDK app configuration           | Manual via Task tool                      | Standard     |
| `agent-sdk-dev:agent-sdk-verifier-ts` | Verifies TypeScript Agent SDK app configuration       | Manual via Task tool                      | Standard     |

---

## 2. Global System Personas

**IMPORTANT**: These are text instructions from the user's system prompt, **not
executable agents**. They provide generic guidance but are **overridden by
Project-Level Agents** (Section 1) when conflicts arise. See Section 8 Decision
Tree for priority order.

**Pruned for Relevance**: Removed Python frameworks (`django-pro`,
`fastapi-pro`, `temporal-python-pro`) and MBA courses
(`kellogg-bidding-advisor`) that don't match the TypeScript/Node.js/React
technology stack.

### Retained Personas (Relevant to Updog Tech Stack):

- **TypeScript/JavaScript**: General TypeScript best practices, async patterns
- **Node.js Backend**: Express, API design, microservices patterns
- **React Frontend**: Component design, hooks, state management
- **Database**: PostgreSQL optimization, Drizzle ORM patterns
- **Redis**: Caching strategies, BullMQ job queues
- **Testing**: Vitest, Playwright, test automation
- **DevOps**: Docker, GitHub Actions, deployment strategies
- **Security**: OWASP Top 10, authentication, authorization

**Note**: If a user request matches both a Project Agent (Section 1) and a
Global Persona (Section 2), the **Project Agent takes priority** automatically.

---

## 3. Slash Commands

**Location**: `.claude/commands/`, `plugin:*@*`

| Command                     | Description                                                                                    | Trigger                      |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------- |
| `/dev`                      | Extreme lightweight end-to-end development workflow (requirements → codex → 90% test coverage) | `/dev`                       |
| `/deploy-check`             | Pre-deployment validation (build, bundle, smoke tests, idempotency)                            | `/deploy-check`              |
| `/fix-auto`                 | Automated repair of lint, format, simple test failures                                         | `/fix-auto`                  |
| `/test-smart`               | Intelligent test selection based on file changes                                               | `/test-smart`                |
| `/workflows`                | Interactive helper showing available tools and when to use them                                | `/workflows`                 |
| `/feature-dev`              | Guided feature development with codebase understanding                                         | `/feature-dev [description]` |
| `/superpowers:brainstorm`   | Socratic design refinement using brainstorming skill                                           | `/superpowers:brainstorm`    |
| `/superpowers:execute-plan` | Execute plan in batches with review checkpoints                                                | `/superpowers:execute-plan`  |

---

## 4. Agent Packages

**Location**: `packages/`

**Memory Adoption**: 100% (6/6 packages use HybridMemoryManager)

| Package             | Description                                                  | Memory Tenant            | Status |
| ------------------- | ------------------------------------------------------------ | ------------------------ | ------ |
| `agent-core`        | BaseAgent class with retry logic, metrics, health monitoring | `shared:agent-core`      | Active |
| `test-repair-agent` | Autonomous test failure detection and repair                 | `agent:test-repair`      | Active |
| `patch-applicator`  | AI-generated patch application with validation               | `agent:patch-applicator` | Active |
| `code-review-agent` | Memory-enabled code review with pattern learning             | `agent:code-review`      | Active |
| `performance-agent` | Performance regression detection                             | `agent:performance`      | Active |
| `migration-agent`   | Database migration analysis and execution                    | `agent:migration`        | Active |

---

## 5. MCP Tools

**Model Context Protocol servers** providing structured tool interfaces.

### 5.1 Multi-AI Collaboration (16 functions)

**Server**: `mcp__multi-ai-collab__*`

**Available AIs**: Gemini (free), Grok/OpenAI/DeepSeek (paid)

| Function                                      | Description                                 |
| --------------------------------------------- | ------------------------------------------- |
| `server_status`                               | Get server status and available AI models   |
| `ask_gemini` / `ask_openai`                   | Ask specific AI a question                  |
| `gemini_code_review` / `openai_code_review`   | Have AI review code for issues              |
| `gemini_think_deep` / `openai_think_deep`     | Deep analysis with extended reasoning       |
| `gemini_brainstorm` / `openai_brainstorm`     | Brainstorm creative solutions               |
| `gemini_debug` / `openai_debug`               | Get debugging help                          |
| `gemini_architecture` / `openai_architecture` | Architecture design advice                  |
| `ask_all_ais`                                 | Ask all AIs and compare responses           |
| `ai_debate`                                   | Have two AIs debate a topic                 |
| `collaborative_solve`                         | Multiple AIs collaborate on complex problem |
| `ai_consensus`                                | Get consensus opinion from all AIs          |

### 5.2 TaskMaster AI (43 functions)

**Server**: `mcp__taskmaster-ai__*`

**RECOMMENDATION**: This tool violates Single Responsibility Principle. Plan to
split into:

1. `mcp-project-mgmt` (15 functions): CRUD, Tags, Organization
2. `mcp-architect` (12 functions): Analysis, Dependencies, Scoping
3. `mcp-developer` (16 functions): TDD Autopilot, File Generation, Research

**Current Functions** (grouped by proposed split):

**Project Management (15)**:

- `initialize_project`, `models`, `rules`, `response-language`
- `get_tasks`, `get_task`, `next_task`
- `set_task_status`, `add_task`, `add_subtask`
- `remove_task`, `remove_subtask`, `clear_subtasks`
- `move_task`, `list_tags`, `add_tag`, `delete_tag`, `use_tag`, `rename_tag`,
  `copy_tag`

**Architect (12)**:

- `analyze_project_complexity`, `complexity_report`
- `expand_task`, `expand_all`
- `scope_up_task`, `scope_down_task`
- `add_dependency`, `remove_dependency`, `validate_dependencies`,
  `fix_dependencies`
- `update`, `update_task`, `update_subtask`

**Developer (16)**:

- `autopilot_start`, `autopilot_resume`, `autopilot_next`, `autopilot_status`
- `autopilot_complete_phase`, `autopilot_commit`, `autopilot_finalize`,
  `autopilot_abort`
- `parse_prd`, `generate`, `research`

---

## 6. Skills Library

**Location**: `.claude/skills/`, `plugin:*@*`

**Total**: 37 skills across 5 categories

### 6.1 Thinking Frameworks (4)

- `superpowers:brainstorming`, `superpowers:systematic-debugging`
- `superpowers:test-driven-development`,
  `superpowers:verification-before-completion`

### 6.2 Debugging & Testing (3)

- `superpowers:condition-based-waiting`, `superpowers:root-cause-tracing`
- `superpowers:testing-anti-patterns`

### 6.3 Planning & Execution (3)

- `superpowers:writing-plans`, `superpowers:executing-plans`
- `superpowers:subagent-driven-development`

### 6.4 Memory & Context (2)

- `agent-orchestration:context-manager`
- `codex` (Codex CLI for code analysis, refactoring, automated changes)

### 6.5 Integration & Workflow (4)

- `superpowers:dispatching-parallel-agents`, `superpowers:receiving-code-review`
- `superpowers:requesting-code-review`,
  `superpowers:finishing-a-development-branch`

### 6.6 AI Model Utilization (4)

- `multi-ai-collab` (leveraging multiple AIs for consensus, debate,
  collaboration)
- `gemini-*`, `openai-*` (specific AI model skills)

### 6.7 Data & API Design (3)

- `database-design:postgresql`
- `api-scaffolding:fastapi-templates` (NOTE: FastAPI is Python - consider
  removing if not used)

### 6.8 Code Quality & Architecture (14)

- `code-refactoring:code-reviewer`, `code-refactoring:legacy-modernizer`
- `code-documentation:docs-architect`, `code-documentation:tutorial-engineer`
- `code-review-ai:architect-review`, `comprehensive-review:architect-review`
- `comprehensive-review:security-auditor`,
  `data-validation-suite:backend-security-coder`
- `database-design:sql-pro`, `deployment-strategies:terraform-specialist`
- `deployment-validation:cloud-architect`,
  `documentation-generation:api-documenter`
- `documentation-generation:mermaid-expert`, `error-diagnostics:debugger`

---

## 7. NPM Scripts

**Location**: `package.json` (root + tools_local/)

**Total**: 277 scripts across 15 categories

### 7.1 Development (12 scripts)

- `dev`, `dev:client`, `dev:api` - Start development servers
- `build`, `build:client`, `build:api` - Production builds
- `check` - TypeScript type checking
- `doctor`, `doctor:quick`, `doctor:links`, `doctor:sidecar` - Health checks

### 7.2 Testing (18 scripts)

- `test`, `test:run`, `test:ui`, `test:quick` - Test execution
- `test -- --project=server`, `test -- --project=client` - Targeted tests
- `test:unit`, `test:integration`, `test:e2e` - Test layers
- `/test-smart` - Intelligent test selection

### 7.3 Database (8 scripts)

- `db:push`, `db:studio`, `db:migrate`, `db:seed`
- `db:backup`, `db:restore`, `db:reset`

### 7.4 Deployment (15 scripts)

- `deploy`, `deploy:staging`, `deploy:production`
- `deploy-with-confidence`, `monitor-deployment`, `smoke-test-prod`
- `stage-cleanup-pr`

### 7.5 Quality & Linting (22 scripts)

- `lint`, `lint:fix`, `lint:strict`
- `format`, `format:check`, `format:fix`
- `/fix-auto` - Automated lint/format repair

### 7.6 AI Tools (12 scripts)

- `ai`, `ai:test-repair`, `ai:metrics`, `ai:research`
- `codex`, `codex exec`, `codex --help`
- `/dev` - AI-augmented development workflow

### 7.7 Phoenix Project (28 scripts)

- `phoenix:truth`, `phoenix:xirr-validate`, `phoenix:waterfall-validate`
- `phoenix:baseline`, `phoenix:regression-check`

### 7.8 Monitoring & Observability (14 scripts)

- `metrics`, `metrics:server`, `prometheus`, `grafana`
- `logs`, `logs:api`, `logs:workers`

### 7.9 Workers & Background Jobs (10 scripts)

- `workers`, `workers:dev`, `workers:prod`
- `queue:clear`, `queue:status`, `queue:retry-failed`

### 7.10 Utilities (45 scripts)

- File operations, data transformations, reporting
- Code generation, schema validation
- Environment setup, configuration management

### 7.11 Git & Version Control (8 scripts)

- `git:clean`, `git:prune`, `git:stats`
- `changelog`, `version:bump`

### 7.12 Security & Compliance (12 scripts)

- `security:scan`, `security:audit`, `security:report`
- `trivy:scan` - Vulnerability scanning

### 7.13 Performance (15 scripts)

- `perf:baseline`, `perf:budget`, `perf:smoke`
- `/perf-guard` - Performance regression detection

### 7.14 Documentation (10 scripts)

- `docs:build`, `docs:serve`, `docs:generate`
- `readme:update`, `changelog:generate`

### 7.15 Miscellaneous (68 scripts)

- Project-specific utilities, one-off scripts, legacy commands

---

## 8. Workflow Decision Tree (CORRECTED)

**CRITICAL**: This decision tree enforces governance. Project standards ALWAYS
override user preferences.

```
User Request
    ↓
┌─────────────────────────────────────────────────────────┐
│ 1. Has Phoenix-specific task?                          │
│    (e.g., "validate waterfall", "run truth cases")     │
│    → YES → Use Phoenix Agent (Section 1.1)             │
│            ├─ Domain-specialized                        │
│            ├─ Tenant-scoped memory                      │
│            └─ Production-validated                      │
└─────────────────────────────────────────────────────────┘
    ↓ NO
┌─────────────────────────────────────────────────────────┐
│ 2. Has Project-level agent?                            │
│    (e.g., "review code", "fix bug", "run tests")       │
│    → YES → Use Task tool (Section 1.2-1.5)             │
│            ├─ Enforces project standards               │
│            ├─ Access to codebase context               │
│            └─ Memory-enabled learning                  │
└─────────────────────────────────────────────────────────┘
    ↓ NO
┌─────────────────────────────────────────────────────────┐
│ 3. Has Slash Command?                                  │
│    (e.g., "/dev", "/test-smart", "/deploy-check")      │
│    → YES → Use SlashCommand tool (Section 3)           │
│            ├─ Pre-configured workflows                 │
│            ├─ Integrated with CI/CD                    │
│            └─ Curated best practices                   │
└─────────────────────────────────────────────────────────┘
    ↓ NO
┌─────────────────────────────────────────────────────────┐
│ 4. Has MCP Tool?                                       │
│    (e.g., multi-AI consensus, TaskMaster operations)    │
│    → YES → Use MCP function (Section 5)                │
│            ├─ Structured tool interface                │
│            ├─ Cross-session state                      │
│            └─ API-based integration                    │
└─────────────────────────────────────────────────────────┘
    ↓ NO
┌─────────────────────────────────────────────────────────┐
│ 5. Has User-level global persona?                     │
│    (e.g., generic TypeScript advice)                    │
│    → YES → Use Global Persona (Section 2)              │
│            ├─ Generic fallback guidance                │
│            ├─ No project-specific context              │
│            └─ LOWEST PRIORITY                          │
└─────────────────────────────────────────────────────────┘
    ↓ NO
┌─────────────────────────────────────────────────────────┐
│ 6. Implement new solution                              │
│    → Create agent, script, or workflow                 │
│    → Document in this catalog                          │
│    → Update decision tree                              │
└─────────────────────────────────────────────────────────┘
```

**Priority Order Summary**:

1. Phoenix Agents (highest specificity, domain expertise)
2. Project Agents (project standards enforcement)
3. Slash Commands (curated workflows)
4. MCP Tools (structured interfaces)
5. User Personas (generic fallback, LOWEST PRIORITY)

**Example Conflict Resolution**:

- User request: "Review my code"
- Project Agent: `code-reviewer` (Section 1.2) - Enforces Updog style guide,
  TypeScript conventions
- User Persona: Generic `code-reviewer` (Section 2) - Generic best practices
- **Decision**: Use Project Agent (Priority 2 beats Priority 5)

---

## 9. Summary Statistics

| Category                  | Count      | Memory Adoption           |
| ------------------------- | ---------- | ------------------------- |
| Project Agents            | 31         | 100% (31/31)              |
| Agent Packages            | 8          | 100% (6/6 memory-enabled) |
| Phoenix Agents            | 9          | 100% (9/9)                |
| Slash Commands            | 8          | N/A                       |
| MCP Functions             | 59         | N/A                       |
| Skills                    | 37         | N/A                       |
| NPM Scripts               | 277        | N/A                       |
| **Extended Thinking**     | 3 agents   | High Compute tier         |
| **PostgreSQL + pgvector** | All agents | Semantic search enabled   |

---

## 10. Maintenance & Updates

**Document Owner**: Development Team **Review Cycle**: Monthly (or after
significant tooling changes) **Last Updated**: 2025-12-12 **Next Review**:
2026-01-12

**Update Triggers**:

1. New agent added to `.claude/agents/` or `packages/`
2. New MCP server integrated
3. New slash command created in `.claude/commands/`
4. Major npm script reorganization
5. Priority order changes in Decision Tree

**Version History**:

- **v2.0** (2025-12-12): Post-review corrections (6 fixes: pruned personas,
  corrected decision tree, added triggers, renamed Section 2, cost tiers, brand
  safety)
- **v1.0** (2025-12-11): Initial catalog from parallel agent analysis

---

**End of Catalog**

**For Questions**: See `docs/CONVERSATION-SUMMARY-2025-12-11.md` for
architectural rationale and correction details.
