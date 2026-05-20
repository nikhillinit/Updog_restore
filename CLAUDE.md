---
status: ACTIVE
last_updated: 2026-04-03
---

# CLAUDE.md

**Start here:** Read this file first, then use repo search plus `docs/INDEX.md`
and `.claude/DISCOVERY-MAP.md` to find existing solutions. Consult
`CAPABILITIES.md` only as a historical inventory.

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

This is a web-based venture-capital fund modeling and reporting platform built
as an internal tool for Press On Ventures for GPs to build, run, and compare
"what-if" scenarios for portfolio construction, pacing, reserve allocation, and
exit outcomes—all without leaving their browser. Under the hood it combines a
TypeScript/Node API (with Express, BullMQ + Redis workers, and PostgreSQL) and a
React / Tailwind frontend (powered by shadcn/ui) to support Monte Carlo
simulations, strategic scenario planning, and interactive dashboards. It evolved
from an Excel-first proof of concept into a code-centric, modular
architecture—so you get the rigor and repeatability of programmatic models, plus
easy-to-extend engines for new calculations. This single file points you at the
CHANGELOG for "what changed," DECISIONS for "why we chose it," and focused
cheatsheets for testing, APIs, and UI conventions.

## Documentation Governance

**PRUNE by default** - do not create:

- Session artifacts (progress logs, handoff docs, session summaries)
- Navigation docs (indexes, capability catalogs, routing tables)
- Capability inventories that can be derived from code and active docs

**PRESERVE and CREATE** - these are institutional memory:

- REFLs for debugging learnings (`docs/skills/REFL-NNN-*.md`)
- ADR entries in `DECISIONS.md` for architectural rationale
- Memory entries for non-derivable gotchas
- Domain docs when business logic cannot be inferred from code

**Derivability test:** Could a future session reconstruct this from code and git
log alone? If NO, write it down. If YES, do not create a file.

**Key references** (consult as needed, not mandatory pre-reads):

- `CHANGELOG.md` - recent changes
- `DECISIONS.md` - architectural rationale
- `cheatsheets/daily-workflow.md` - development patterns

## Architecture

- **Frontend (`/client`)**: React SPA with feature-based component organization,
  custom hooks, and analytical engines (ReserveEngine, PacingEngine,
  CohortEngine)
- **Backend (`/server`)**: Express.js API with Zod validation, modular routes,
  and storage abstraction layer
- **Shared (`/shared`)**: Common TypeScript types, Drizzle ORM schemas, and Zod
  validation schemas
- **Data Flow**: React → TanStack Query → Express API → PostgreSQL/Redis →
  Worker processes for background calculations
- **Workers**: Background job processing with BullMQ for reserve calculations,
  pacing analysis, and Monte Carlo simulations

### Key Directories

- `client/src/components/` - Reusable UI components (feature-organized)
- `client/src/core/` - Analytics engines (reserves, pacing, cohorts)
- `client/src/pages/` - Application routes and page components
- `server/routes/` - API endpoint definitions
- `tests/` - Comprehensive test suite (API, performance, UI)
- `packages/` - AI agent system for autonomous development

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Shadcn/ui, TanStack
  Query, Recharts/Nivo, React Hook Form
- **Backend**: Node.js, Express.js, TypeScript, PostgreSQL, Drizzle ORM,
  BullMQ + Redis, Zod validation
- **Testing**: Vitest (test.projects: server/Node.js + client/jsdom), React
  Testing Library
- **Infrastructure**: Docker Compose, Prometheus monitoring, Winston logging
- **Dev Tools**: ESLint, TypeScript strict mode, concurrent dev servers

## Coding Conventions

- **Components**: PascalCase files (`DashboardCard.tsx`), functional components
  with hooks
- **Files**: kebab-case for multi-word files (`fund-setup.tsx`)
- **Hooks**: `use` prefix (`useFundData`)
- **API**: RESTful endpoints, Zod validation, consistent error responses
- **Imports**: Path aliases (`@/` for client, `@shared/` for shared types)
- **Testing**: Tests alongside source files, comprehensive coverage with Vitest
- **Patterns**: Composition over inheritance, custom hooks for business logic,
  error boundaries
- **Type Safety**: TypeScript strict mode enabled, NEVER use `any` type
  (`@typescript-eslint/no-explicit-any: 'error'`)
- **Quality Gates**: Run `/pre-commit-check` before commits - linting, type
  checking, and tests MUST pass

### Path Aliases (vite.config.ts)

- `@/` → `client/src/`
- `@shared/` → `shared/`
- `@assets/` → `assets/`

## Development Setup

### Quick Start

```bash
# Install all dependencies
npm install

# Verify setup
npm run doctor
```

### Health Checks

- `npm run doctor` - Complete health check (all systems)
- `npm run doctor:quick` - Fast module resolution check

### Node.js Compatibility

- **Supported**: Node.js >= 20.19.0 (including Node 22.x)
- **Package Manager**: npm >= 10.8.0

## Quality & Documentation Standards

**Zero Tolerance Quality Policy:**

- All mutations MUST have idempotency
- All updates MUST use optimistic locking
- All cursors MUST be validated
- All queue jobs MUST have timeouts
- **See:**
  [cheatsheets/anti-pattern-prevention.md](cheatsheets/anti-pattern-prevention.md)
  for 24 cataloged patterns

**No Emoji Policy:**

- Emojis break CI/CD, reduce accessibility, impair searchability
- Use text alternatives: `[x]` instead of checkmarks, `PASS:` instead of
  checkmarks
- **See:**
  [cheatsheets/emoji-free-documentation.md](cheatsheets/emoji-free-documentation.md)
  for complete guide

**Complete Documentation Index:**

- All 30 cheatsheets organized by category:
  [cheatsheets/INDEX.md](cheatsheets/INDEX.md)

## Essential Commands

### Development

- `npm run dev` - Start full development environment (frontend + backend on
  port 5000)
- `npm run dev:client` - Frontend only (Vite dev server)
- `npm run dev:api` - Backend API only (Express with hot reload)
- `npm run build` - Production build (frontend + backend)
- `npm run check` - TypeScript type checking

### Testing & Quality

- `npm test` - Run full test suite (both server + client projects)
- `npm test -- --project=server` - Run server tests only (Node.js environment)
- `npm test -- --project=client` - Run client tests only (jsdom environment)
- `npm run test:ui` - Tests with interactive dashboard
- `npm run test:quick` - Skip API tests for faster feedback
- `npm run lint` - ESLint code quality check
- `npm run lint:fix` - Auto-fix linting issues
- **Quality Gates**: See
  [.claude/WORKFLOW.md](.claude/WORKFLOW.md#quality-gate-protocol) - MANDATORY
  pre-commit validation

### Database

- `npm run db:push` - Push schema changes to database
- `npm run db:studio` - Open Drizzle Studio for database management

### AI Tools

- `npm run ai` - Gateway to AI agent operations
- **PR Verification**: Compare to baseline, not perfection - See
  [cheatsheets/pr-merge-verification.md](cheatsheets/pr-merge-verification.md)

## Discovery Routing (Quick Reference)

For detailed routing logic, see `.claude/DISCOVERY-MAP.md`. Key patterns:

| Task Type                       | Route To                                  |
| ------------------------------- | ----------------------------------------- |
| New feature/capability          | CLAUDE.md -> repo search -> docs/INDEX.md |
| Phoenix validation              | `/phoenix-truth` command                  |
| Phoenix Phase 2 (probabilistic) | `/phoenix-phase2` command                 |
| Waterfall/clawback issues       | `waterfall-specialist` agent              |
| Precision/numeric drift         | `phoenix-precision-guardian` agent        |
| XIRR/fees issues                | `xirr-fees-validator` agent               |
| Architecture decisions          | DECISIONS.md                              |
| Milestone governance / PR scope | docs/STABILIZATION-ROADMAP.md             |
| Troubleshooting                 | cheatsheets/daily-workflow.md             |

**Machine-readable index**: `docs/_generated/router-index.json` **Staleness
report**: `docs/_generated/staleness-report.md` **Regenerate**:
`npm run docs:routing:generate`

### Memory, Commands & Skills

- **Memory**: CHANGELOG.md (changes), DECISIONS.md (rationale), cheatsheets/
  ([INDEX.md](cheatsheets/INDEX.md))
- **Commands**: `/log-change`, `/log-decision`, `/test-smart`, `/fix-auto`,
  `/deploy-check`
- **Superpowers**: `/superpowers:brainstorm`, `/superpowers:write-plan`,
  `/superpowers:execute-plan` - See
  [obra/superpowers](https://github.com/obra/superpowers)
- **Skills**: See [.claude/skills/INDEX.md](.claude/skills/INDEX.md)

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `nikhillinit/Updog_restore`.
See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the default five-label vocabulary. See
`docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo using root governance docs plus `docs/adr/`. See
`docs/agents/domain.md`.

## MANDATORY WORKFLOW - START HERE

1. **CLAUDE.md** - Current operating guidance and governance
2. **Repo search** - Check for existing code, commands, skills, and docs
3. **docs/INDEX.md** - Human-facing documentation routing
4. **.claude/DISCOVERY-MAP.md** - Agent-facing discovery routing
5. **CHANGELOG.md** - Check for similar past work
6. **DECISIONS.md** - Review architectural decisions
7. **CAPABILITIES.md** - Historical inventory only, if helpful

## BEFORE ANY TASK

```
START HERE:
- Read CLAUDE.md
- Search the repo for existing implementations
- Use docs/INDEX.md and .claude/DISCOVERY-MAP.md for routing
- Consult CAPABILITIES.md only if historical inventory context helps
```

## Mandatory Pre-Action Checks

- BEFORE changing shared test mocks or fixtures, grep for ALL assertion patterns
  that depend on current behavior across the full test suite.
- BEFORE pushing when test infrastructure changed, run `npm test` (full suite),
  not just targeted tests.
- BEFORE writing data to JSONB, check schema for dedicated columns. Do NOT nest
  structured data into a blob when proper columns exist.
- BEFORE implementing client route changes, trace actual app routing to verify
  which component renders. Spec may name the wrong component.
- AFTER subagent batches, diff for files outside owned scope before committing.
- WHEN errors occur, follow graduated response: lint fails ->
  `npm run lint:fix`. Type errors -> `npm run check` with targeted fix. Test
  fails -> run targeted test first, full suite only if targeted passes but
  suspicion remains.

## AI-Augmented Development

- **CLI Gateway**: `npm run ai` - AI agent operations (test, patch, repair,
  metrics)
- **Agent Framework**: `packages/agent-core/` - BaseAgent with retry logic,
  monitoring
- **Code Quality**: Codacy integration, Trivy security scanning

### Hermes Dev Co-op

For phase-routed multi-model development, see `DEV_BRAIN.md`. Hermes defaults
are subordinate to this file. Config: `.claude/hermes/model-routing.json`. CLI:
`node orchestrate.js --help`.

### Codex CLI Integration

Consult OpenAI Codex (GPT-5.3, xhigh reasoning) for complex tasks:
`codex exec "question" --sandbox read-only`. See memory for setup details.

## Babysitter Orchestration

**Profile**: `.a5c/project-profile.json` | **Autonomy**: Semi-autonomous |
**Methodology**: TDD quality convergence with iterative refinement

### Quick Commands

- `/babysitter:babysit` - Start an orchestrated babysitter run (interactive
  process selection)
- `/babysitter:plan` - Plan a babysitter run without executing
- `/babysitter:resume` - Resume an existing babysitter run
- `/babysitter:doctor` - Diagnose babysitter run health

### Installed Processes

| Process                     | Description                                       |
| --------------------------- | ------------------------------------------------- |
| `gsd/execute`               | Primary workflow for implementing features        |
| `gsd/verify`                | Post-implementation verification with truth cases |
| `gsd/plan`                  | Planning and architecture design                  |
| `gsd/iterative-convergence` | Systematic improvement loops (lint debt, tests)   |
| `gsd/audit`                 | Codebase audit and quality assessment             |
| `cradle/project-install`    | Project onboarding and profile management         |

### Recommended Agents

- `code-reviewer` - AI-assisted code review (solo developer workflow)
- `test-repair` - Autonomous test failure detection and repair
- `waterfall-specialist` - Waterfall/carry distribution calculations
- `phoenix-precision-guardian` - Numeric precision in financial calculations
- `debug-expert` - Complex debugging and root cause analysis

### Project Conventions (Babysitter-Enforced)

- Phoenix truth cases must pass before merging calculation changes. Run
  `npm run phoenix:truth` for current count; do not trust hardcoded numbers in
  docs (they drift as cases are added/revised).
- Pre-push baseline check compiles client/server/shared separately
- TZ=UTC required for all test runs
- No emoji in code, docs, or logs
- Conventional commits (feat:, fix:, refactor:, chore:, docs:, test:)

## Operating Loop

**Canonical loop**: Frame -> Verify -> Execute -> Reconcile -> Git Safety ->
Checkpoint

See [docs/claude/operating-loop.md](docs/claude/operating-loop.md) for full
details.

| Command        | Purpose                            |
| -------------- | ---------------------------------- |
| `/frame-brief` | Create frame brief before work     |
| `/checkpoint`  | Checkpoint before risky operations |
| `/handoff`     | Session handoff artifact           |
| `/reconcile`   | Verify after parallel work         |
| `/explore`     | Non-executing discovery mode       |
| `/bias-audit`  | Evidence/audience enforcement      |

## Full vs Lite Mode

**Lite mode** (all must be true): clear scope, 1-2 files, no risky git, no
unknown state, no parallel fan-out, no claims.

**Full mode** (any true): ambiguous scope, 3+ files, uncertain state, risky git,
parallel execution, claims-heavy output.

See
[.claude/skills/control-plane/SKILL.md](.claude/skills/control-plane/SKILL.md).

## Git Safety

- **Large files**: warn 5-10MB, block >10MB
- **Force push**: blocked unless `CLAUDE_ACK_GIT_RISK=1`
- **Post-rewrite**: audit for dropped remote files
- **Artifacts**: `.claude/artifacts/git-audits/`

## Evidence and Audience Checks

For audit/playbook/claims work, use `/bias-audit`:

- Audience statement (who it is for, who it is NOT for)
- Claim inventory (only/first/best claims)
- Evidence status (citation_required, inference_allowed, opinion_only)

See [.claude/skills/bias-audit/SKILL.md](.claude/skills/bias-audit/SKILL.md).

## Handoff and Checkpoint

Checkpoints include resume metadata with staleness detection:

- TTL expiration
- HEAD SHA change
- Branch change
- Git status hash change

On stale resume: re-derive state from repo, regenerate artifact before
continuing.

Artifacts: `HANDOFF.json`, `HANDOFF.md`, `.claude/artifacts/checkpoints/`

## Escape Valve and Kill Switch

- `/explore` - non-executing discovery mode
- `CLAUDE_HOOKS_DISABLE=1` - disable all control plane hooks (logged)
- All bypasses logged to `.claude/artifacts/metrics.jsonl`
