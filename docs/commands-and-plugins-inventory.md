# Commands and Plugins Inventory

**Date**: 2025-12-09 **Status**: Complete - All commands and plugins copied to
project

---

## Overview

This document catalogs all slash commands and plugin marketplaces that have been
copied from the user's global `.claude` directory to this project's `.claude`
directory for Phoenix v2.32 execution.

---

## User-Level Commands (20 Commands)

**Location**: `.claude/commands/`

All user-level commands have been copied to the project:

1. **ask** - Senior Systems Architect consultation with 4-expert panel
2. **bugfix** - Automated bug fix workflow with 90% quality gate
3. **catalog-tooling** - Catalog and document available tools
4. **code** - Development coordinator with 4 coding specialists
5. **debug** - UltraThink debug orchestrator with systematic analysis
6. **deploy-check** - Pre-deployment validation (8 phases) - PROJECT COMMAND
7. **dev** - End-to-end workflow with 90% test coverage requirement
8. **docs** - Documentation generation
9. **enable-agent-memory** - Enable memory for agents
10. **enhance-prompt** - Rewrite and clarify instructions
11. **evaluate-tools** - Evaluate available tools and their usage
12. **fix-auto** - Automated repair of lint, format, simple test failures -
    PROJECT COMMAND
13. **optimize** - Performance optimization coordinator
14. **refactor** - Refactoring coordination
15. **review** - Code review workflow
16. **session-start** - Session initialization
17. **test** - Test strategy coordinator with 4 testing specialists
18. **test-smart** - Intelligent test selection based on file changes - PROJECT
    COMMAND
19. **think** - Multi-agent coordinator with ultrathink reflection
20. **workflows** - Interactive helper showing available tools - PROJECT COMMAND

**Note**: Commands marked as "PROJECT COMMAND" were already in the project and
retained.

---

## Plugin Marketplaces (4 Marketplaces)

**Location**: `.claude/plugins/marketplaces/`

### 1. superpowers-dev

**Purpose**: Obra's Superpowers framework - structured thinking frameworks and
skills library

**Contents**:

- Commands: `/superpowers:brainstorm`, `/superpowers:execute-plan`,
  `/superpowers:write-plan`
- Skills: 20+ skills including:
  - `brainstorming` - Socratic design refinement
  - `systematic-debugging` - 4-phase debugging framework
  - `test-driven-development` - TDD workflow
  - `verification-before-completion` - Evidence-based completion verification
  - `dispatching-parallel-agents` - Parallel agent coordination
  - `defense-in-depth` - Multi-layer validation
  - `condition-based-waiting` - Replace timeouts with condition polling
  - `testing-anti-patterns` - Avoid testing anti-patterns
  - `root-cause-tracing` - Backward trace from failures
  - `receiving-code-review` - Process code review feedback
  - `requesting-code-review` - Request code review with context
  - `sharing-skills` - Contribute skills via pull request
  - `subagent-driven-development` - Task execution with subagents
  - `executing-plans` - Execute implementation plans in batches
  - `finishing-a-development-branch` - Complete development branches
  - `using-git-worktrees` - Create isolated git worktrees
  - `using-superpowers` - Introduction to skills framework
  - `writing-plans` - Create detailed implementation plans
  - `writing-skills` - Create new skills
  - `testing-skills-with-subagents` - Test skills with subagents

**Total Files**: 43 markdown files

### 2. claude-code-workflows

**Purpose**: Backend development, API design, and architecture patterns

**Contents**:

- Plugins for:
  - Database design (PostgreSQL)
  - API scaffolding (FastAPI templates)
  - Backend development (microservices, architecture patterns, temporal
    workflows)
  - Full-stack orchestration

**Total Files**: 307 markdown files

**Key Commands**:

- `/database-design:postgresql`
- `/api-scaffolding:fastapi-templates`
- `/backend-development:api-design-principles`
- `/backend-development:architecture-patterns`
- `/backend-development:microservices-patterns`
- `/backend-development:temporal-python-testing`
- `/backend-development:workflow-orchestration-patterns`

### 3. claude-code-plugins

**Purpose**: Feature development and code review workflows

**Contents**:

- Feature development agent (`/feature-dev:feature-dev`)
- Code review workflows (`/code-review:code-review`)
- Agent SDK development tools

**Key Commands**:

- `/feature-dev:feature-dev` - Guided feature development with codebase
  understanding
- `/code-review:code-review` - Automated code analysis
- `/agent-sdk-dev:new-sdk-app` - Create new Claude Agent SDK application

### 4. cliftonc-plugins

**Purpose**: TypeScript quality analysis

**Contents**:

- `/ts-quality:ts-review` - TypeScript code review
- Architectural review of TypeScript code
- Quality checks and pragmatic improvement suggestions

---

## Phoenix v2.32 Enhanced Commands

The following commands were specifically highlighted in Phoenix v2.32
enhancements:

### Phase 0 Commands

- `/verification-before-completion` (MANDATORY - Step 0.10)
- `/error-diagnostics:error-analysis` (MANDATORY - Step 0.6)
- `/tracking-regression-tests` (MANDATORY - Step 0.8)
- `/comprehensive-review:full-review` (Step 0.4)
- `/multi-model-consensus` (Steps 0.4, 0.9)
- `/analyzing-test-coverage` (Step 0.5)
- `/test-coverage-analyzer:analyze-coverage` (Step 0.5)
- `/error-diagnostics:smart-debug` (Step 0.6)
- `/regression-test-tracker:track-regression` (Step 0.8)

### Phase 1A Commands

- `/ts-quality` (Step 1A.1)
- `/defense-in-depth` (Steps 1A.1, 1A.3)
- `/code-refactoring:context-restore` (Step 1A.2)
- `/code-refactoring:tech-debt` (Steps 1A.2, 1A.6)
- `/test` with 4 specialists (Step 1A.4)
- `/code-refactoring:refactor-clean` (Step 1A.5)
- `/code-documentation:doc-generate` (Step 1A.7)
- `/comprehensive-review:pr-enhance` (Step 1A.8)
- `/deploy-check` (Step 1A.8)

### Phase 1B Commands

- `/error-diagnostics:smart-debug` (Bug Workflow Selection)
- `/dispatching-parallel-agents` (Multi-Module Bug Coordination)
- `/tracking-regression-tests` (Post-Fix Regression Tracking - MANDATORY)
- `/comprehensive-review:pr-enhance` (High-Stakes Fix Review)
- `/bugfix` (Primary workflow)
- `/debug` (Alternative for complex bugs)
- `/dev` (Coverage-required fixes)

---

## Command Availability Matrix

| Command                           | Location         | Type                | Phoenix Phase   |
| --------------------------------- | ---------------- | ------------------- | --------------- |
| `/ask`                            | User commands    | Consultation        | All             |
| `/bugfix`                         | User commands    | Bug fixing          | 1B              |
| `/code`                           | User commands    | Development         | All             |
| `/debug`                          | User commands    | Debugging           | 0, 1B           |
| `/deploy-check`                   | Project commands | Validation          | 0.10, 1A.8      |
| `/dev`                            | User commands    | Feature development | 0.2, 1B         |
| `/defense-in-depth`               | Superpowers      | Validation          | 1A.1, 1A.3      |
| `/dispatching-parallel-agents`    | Superpowers      | Parallel execution  | 1B              |
| `/error-diagnostics:smart-debug`  | Workflows        | Bug classification  | 0.6, 1B         |
| `/fix-auto`                       | Project commands | Auto-repair         | 1A.1            |
| `/test`                           | User commands    | Testing             | 1A.4            |
| `/test-smart`                     | Project commands | Test selection      | All             |
| `/think`                          | User commands    | Multi-agent         | 1A.4 (replaced) |
| `/tracking-regression-tests`      | Superpowers      | Regression tracking | 0.8, 1B         |
| `/verification-before-completion` | Superpowers      | Phase gates         | 0.10, 1A.8      |

---

## Usage Notes

### Accessing Commands

All commands are now available in the project context. Use them with the `/`
prefix:

```bash
/ask "Should I use event-driven or procedural pattern for recycling?"
/dev "Implement truth case runner with 90% coverage"
/verification-before-completion --phase="Phase 1A" --evidence-required
```

### Accessing Skills

Skills from the superpowers framework are automatically available. They
auto-activate based on context or can be explicitly invoked:

```bash
# Auto-activates when debugging
# systematic-debugging skill

# Explicitly invoke for complex scenarios
# Use brainstorming skill before coding
```

### Plugin Commands

Plugin commands use the namespace format `plugin-name:command-name`:

```bash
/database-design:postgresql
/api-scaffolding:fastapi-templates
/backend-development:microservices-patterns
/ts-quality:ts-review
```

---

## Verification

**Commands Copied**: 20 user-level commands **Plugin Marketplaces Copied**: 4
marketplaces **Total Plugin Files**: 350+ markdown files **Superpowers Skills**:
20+ skills **Phoenix v2.32 Enhanced Commands**: 40+ command recommendations

**All commands and plugins referenced in Phoenix v2.32 are now available in the
project.**

---

## Next Steps

1. **Verify Installation**: Run `/workflows` to see all available commands
2. **Test Key Commands**: Try `/verification-before-completion`,
   `/defense-in-depth`, `/test`
3. **Review Skills**: Check
   `.claude/plugins/marketplaces/superpowers-dev/skills/`
4. **Execute Phoenix Plan**: Use PHOENIX-EXECUTION-PLAN-v2.31.md (content
   updated to v2.32)

---

**Status**: COMPLETE - Project is now self-contained with all commands and
plugins needed for Phoenix v2.32 execution.
