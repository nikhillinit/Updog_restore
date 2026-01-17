# CLAUDE.md

**CRITICAL: Read CAPABILITIES.md FIRST before ANY task to check for existing
solutions!**

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

## Essential Commands

### Development

- `npm run dev` - Start full development environment (frontend + backend on
  port 5000)
- `npm run dev:client` - Frontend only (Vite dev server)
- `npm run dev:api` - Backend API only (Express with hot reload)
- `npm run build` - Production build (frontend + backend)
- `npm run check` - TypeScript type checking
- `npm run doctor:links` - Verify package junctions
- `npm run doctor:quick` - Fast sidecar health check

### Testing & Quality

- `npm test` - Run full test suite (both server + client projects)
- `npm test -- --project=server` - Run server tests only (Node.js environment)
- `npm test -- --project=client` - Run client tests only (jsdom environment)
- `npm run test:ui` - Tests with interactive dashboard
- `npm run test:run` - Single test run (CI mode)
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

## MANDATORY WORKFLOW - CHECK THESE FIRST

1. **CAPABILITIES.md** - ALWAYS READ FIRST before creating any todos or
   implementing anything
2. **docs/INDEX.md** - Central routing table for all documentation (NEW)
3. **CHANGELOG.md** - Check for similar past work
4. **DECISIONS.md** - Review architectural decisions
5. **cheatsheets/** - Detailed implementation guides

## BEFORE ANY TASK

```
STOP! Have you checked CAPABILITIES.md for existing solutions?
- If NO: Read it now
- If YES: Use existing agents/tools in your todo list
```

## Discovery Routing (Quick Reference)

For detailed routing logic, see `.claude/DISCOVERY-MAP.md`. Key patterns:

| Task Type                       | Route To                           |
| ------------------------------- | ---------------------------------- |
| New feature/capability          | CAPABILITIES.md first              |
| Phoenix validation              | `/phoenix-truth` command           |
| Phoenix Phase 2 (probabilistic) | `/phoenix-phase2` command          |
| Waterfall/clawback issues       | `waterfall-specialist` agent       |
| Precision/numeric drift         | `phoenix-precision-guardian` agent |
| XIRR/fees issues                | `xirr-fees-validator` agent        |
| Architecture decisions          | DECISIONS.md                       |
| Troubleshooting                 | cheatsheets/daily-workflow.md      |

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
- **Skills**: 28 auto-activating skills - See [CAPABILITIES.md](CAPABILITIES.md)

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

## AI-Augmented Development

- **CLI Gateway**: `npm run ai` - AI agent operations (test, patch, repair,
  metrics)
- **Agent Framework**: `packages/agent-core/` - BaseAgent with retry logic,
  monitoring
- **Code Quality**: Codacy integration, Trivy security scanning
- **Codex CLI**: Multi-LLM consultation via ChatGPT Pro (see below)

### Codex CLI Integration

Consult OpenAI Codex (GPT-5.2, xhigh reasoning) for complex tasks. Uses ChatGPT Pro subscription - no API costs.

**Setup:** `tools/maestro/` contains:
- `env.ps1` - Environment setup
- `scripts/setup-maestro.ps1` - Diagnostic script
- `snippets/common-workflows.md` - Example commands
- `README.md` - Full documentation

**Quick usage:**
```bash
codex exec "Your question" --sandbox read-only
```

**When to consult Codex:**
- Complex architectural decisions
- Performance optimization strategies
- Debugging difficult issues
- Second opinion on implementation

**Orchestrator workflow:**
1. Call `codex exec "question" --sandbox read-only`
2. Evaluate Codex suggestions critically
3. Implement best approach
4. Codex validates with sandbox evidence

**Auth:** `codex login status` (uses ChatGPT Pro OAuth)

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

### Legacy Note

The sidecar architecture (`tools_local/`) was eliminated on 2025-12-20. All
dependencies are now installed directly via `npm install`. See
[docs/archive/2025-sidecar/](docs/archive/2025-sidecar/) for historical
reference only.

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
- Use text alternatives: `[x]` instead of ✅, `PASS:` instead of checkmarks
- **See:**
  [cheatsheets/emoji-free-documentation.md](cheatsheets/emoji-free-documentation.md)
  for complete guide

**Complete Documentation Index:**

- All 30 cheatsheets organized by category:
  [cheatsheets/INDEX.md](cheatsheets/INDEX.md)
