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

### Database

- `npm run db:push` - Push schema changes to database
- `npm run db:studio` - Open Drizzle Studio for database management

### PR Verification & Merge

**CRITICAL: Compare to Baseline, Not Perfection**

Before assessing PR readiness:

1. Check `cheatsheets/pr-merge-verification.md` for baseline
2. Run tests on BOTH main and feature branches
3. Compare pass rates (not absolute counts)
4. See ADR-014 in DECISIONS.md for merge criteria

**Quick Baseline Check:**

```bash
# Main baseline (as of 2025-11-17)
# Pass rate: 74.7% (998/1,337 tests)
# Failing: 300 tests (variance schema, integration infra, client globals)

# Acceptable PR: feature_pass_rate >= 73.7% (baseline - 1%)
# Zero new regressions > absolute pass rate
```

**Known preexisting failures to BYPASS:**

- Variance tracking schema tests (27 tests)
- Integration test infrastructure (31 tests)
- Client test globals (9+ files)
- Lint baseline (22,390 violations)

### AI Tools

- `npm run ai` - Gateway to AI agent operations
- `npm run ai:metrics` - Start observability metrics server

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
| Troubleshooting                 | SIDECAR_GUIDE.md                   |

**Machine-readable index**: `docs/_generated/router-index.json` **Staleness
report**: `docs/_generated/staleness-report.md` **Regenerate**:
`npm run docs:routing:generate`

### Memory Management

- **CLAUDE.md**: Core architecture & conventions only (see
  `cheatsheets/claude-md-guidelines.md`)
- **CHANGELOG.md**: All changes with timestamps
- **DECISIONS.md**: Architectural decisions and rationale
- **cheatsheets/**: Detailed guides and workflows
- **Commands**: `/log-change`, `/log-decision`, `/create-cheatsheet [topic]`

### Claude Code Development Commands

- `/test-smart` - Intelligent test selection based on file changes
- `/fix-auto` - Automated repair of lint, format, and simple test failures
- `/deploy-check` - Pre-deployment validation (build, bundle, smoke,
  idempotency)
- `/perf-guard` - Performance regression detection with bundle analysis
- `/dev-start` - Optimized development environment setup

### Superpowers Slash Commands (if installed)

**Source**: [obra/superpowers](https://github.com/obra/superpowers)

These commands activate structured thinking frameworks from the Skills Library:

- `/superpowers:brainstorm` - Socratic design refinement (activates
  brainstorming skill)
- `/superpowers:write-plan` - Create detailed implementation plans (activates
  writing-plans skill)
- `/superpowers:execute-plan` - Execute plans in batches with review checkpoints
  (activates executing-plans skill)

**Note**: Skills also auto-activate when relevant (e.g., test-driven-development
activates during feature implementation, systematic-debugging activates when
debugging). See [CAPABILITIES.md](CAPABILITIES.md) for the complete 28-skill
library.

### Prompt Templates

High-quality, version-controlled prompt templates are available in the
`/prompts` directory:

- `feature-implementation.md` - Structured feature request template
- `bug-investigation.md` - Debugging workflow template
- `code-review-request.md` - PR review checklist
- `refactoring-plan.md` - Safe refactoring steps

Copy and customize templates as needed for consistent, well-structured requests.

## Document Review Protocol

When reviewing planning documents (PHASE*, STRATEGY*, \*-PLAN.md):

1. **Classify document type** - PLAN (future) vs STATUS (present) vs REFERENCE
   (timeless)
2. **Check timestamp** - If >24h old, search for execution evidence
3. **Verify claims** - Never report "missing" without code-level proof
4. **Git log search** - `git log --since=<doc-date>` for related commits
5. **Clarify ambiguity** - Ask if theoretical review or reality check

**Core Principle:** Code is truth. Documentation describes intent. Always verify
claims against actual implementation.

**See:**
[cheatsheets/document-review-workflow.md](cheatsheets/document-review-workflow.md)
for comprehensive workflow

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

### Waterfall Update Pattern

All waterfall (carry distribution) updates should use the centralized helper:

**Location:** `client/src/lib/waterfall.ts`

**Usage:**

- `applyWaterfallChange()` - Field updates with validation and clamping
- `changeWaterfallType()` - Type switching with schema enforcement (AMERICAN ↔
  EUROPEAN)

**Features:**

- Type-safe discriminated union handling (overloaded signatures)
- Schema-validated defaults via `WaterfallSchema.parse()`
- Value clamping (hurdle/catchUp to [0,1], carryVesting bounds)
- Immutable updates (returns new object)
- Performance: no-op returns same reference

**Example:**

```ts
import { changeWaterfallType, applyWaterfallChange } from '@/lib/waterfall';

// Type switching (schema-backed)
const european = changeWaterfallType(american, 'EUROPEAN');

// Field updates (type-safe with overloads)
const updated = applyWaterfallChange(waterfall, 'hurdle', 0.1);
```

**See:** `client/src/lib/__tests__/waterfall.test.ts` for comprehensive examples
(19 test cases)

### Path Aliases (vite.config.ts)

- `@/` → `client/src/`
- `@shared/` → `shared/`
- `@assets/` → `assets/`

## AI-Augmented Development

- **Gateway Scripts**: `scripts/ai-tools/` - Structured interfaces for AI agents
  (test runner, patch applicator)
- **Agent Framework**: `packages/agent-core/` - BaseAgent class with retry
  logic, metrics, and health monitoring
- **Test Repair Agent**: `packages/test-repair-agent/` - Autonomous test failure
  detection and repair
- **CLI Interface**: `npm run ai` - Gateway for AI agent operations (test,
  patch, repair, status, metrics)
- **Observability**: Complete monitoring stack with Prometheus, Grafana, and
  Slack alerts
- **Logging**: Structured JSON logging with metrics collection and health
  tracking
- **Architecture**: Self-healing development workflows with progressive autonomy
  and comprehensive monitoring

### Code Quality Integration

- **Codacy**: Automated code analysis with MCP server integration
- **Repository**: `nikhillinit/Updog_restore` on GitHub
- **Auto-analysis**: Runs on all file edits and dependency changes
- **Security**: Trivy scanning for vulnerabilities in dependencies

## Windows Development: Sidecar Architecture

⚠️ **Important:** All npm commands and linking scripts must be run from
**PowerShell** or **CMD**. Running them from Git Bash or WSL can create
incorrect junctions, causing build failures.

This project uses an isolated sidecar workspace (`tools_local/`) to ensure
reliable tool resolution on Windows.

### Quick Start (Windows Setup)

```bash
# 1. Install all dependencies
npm ci --prefix tools_local && npm install

# 2. Verify everything is linked
npm run doctor
```

### Health Checks

- `npm run doctor` - Complete health check (all systems)
- `npm run doctor:quick` - Fast module resolution check
- `npm run doctor:links` - Full junction verification
- `npm run doctor:sidecar` - Sidecar workspace validation

### How It Works

- **Sidecar workspace** (`tools_local/`) contains Vite + all plugins
- **Windows junctions** link packages into root `node_modules/` with absolute
  paths
- **Auto-healing**: `postinstall` hook recreates junctions after any
  `npm install`
- **Config-driven**: Package list in `scripts/sidecar-packages.json`

### Troubleshooting

| Symptom                      | Fix                                      |
| ---------------------------- | ---------------------------------------- |
| `Cannot find package 'vite'` | `node scripts/link-sidecar-packages.mjs` |
| Pre-commit fails             | `npm run doctor:links` then retry        |
| After `npm install`          | Auto-fixed by postinstall hook           |

See [SIDECAR_GUIDE.md](SIDECAR_GUIDE.md) for complete troubleshooting guide.

## Quality-First Development

**CRITICAL**: This rebuild exists to AVOID 24 anti-patterns identified in the
existing codebase. Quality is **mandatory**, not optional.

### Foundation Principle

**Why This Rebuild Exists:**

- 24 anti-patterns cataloged (race conditions, missing idempotency, unsafe
  mutations, unvalidated cursors)
- Technical debt preventing feature velocity
- Prevention is 10x cheaper than remediation

**Zero Tolerance Policy:**

- [REQUIRED] No anti-pattern violations accepted in code review
- [REQUIRED] All mutations MUST have idempotency
- [REQUIRED] All updates MUST use optimistic locking (version field)
- [REQUIRED] All cursors MUST be validated
- [REQUIRED] All queue jobs MUST have timeouts

### Workflow: Before → During → After

**Before Coding:**

```
1. Check CAPABILITIES.md for existing solutions
2. Read cheatsheets/anti-pattern-prevention.md
3. Use /superpowers:brainstorm for design
4. Ask: "How could this introduce a race condition?"
```

**During Coding:**

```
1. TDD (test-driven-development skill auto-activates)
2. Code in 10-20 line cycles
3. Run /test-smart after each change
4. Review against anti-pattern checklist
```

**After Coding:**

```
1. verification-before-completion (MANDATORY)
2. /deploy-check (build + bundle + smoke)
3. /log-change (CHANGELOG.md)
4. /log-decision (if architectural)
```

### 4-Layer Quality Gates

| Layer | Tool         | Speed   | Coverage     |
| ----- | ------------ | ------- | ------------ |
| 1     | ESLint       | < 5s    | 16+ rules    |
| 2     | Pre-commit   | < 30s   | 8+ checks    |
| 3     | IDE snippets | Instant | 5 patterns   |
| 4     | CI/CD        | < 5min  | 15 workflows |

### Cross-References

- [Anti-Pattern Cheatsheet](cheatsheets/anti-pattern-prevention.md) - 24
  patterns with code examples
- [ADR-011: Quality Gates](DECISIONS.md#adr-011-anti-pattern-prevention-strategy) -
  Why this system exists
- [Kickoff Checklist](PHASE3-KICKOFF-CHECKLIST.md) - Pre-flight verification

**Remember:** Every shortcut today is tomorrow's P1 incident. Quality is the
foundation, not a checkbox.

## No Emoji Policy

**Rationale**: Emojis cause encoding issues in GitHub Actions, break CI/CD
pipelines, reduce accessibility, and impair searchability.

### Prohibited Usage

- **Documentation**: All \*.md files
- **Scripts**: Any code that outputs to GitHub Actions (`$GITHUB_OUTPUT`,
  `$GITHUB_STEP_SUMMARY`)
- **Commit messages**: Keep professional and parseable
- **Code comments**: Use text for clarity

### Approved Replacements

| Instead of       | Use                                    |
| ---------------- | -------------------------------------- |
| Check mark       | `[x]` or `PASS:` or `SUCCESS:`         |
| X mark           | `[ ]` or `FAIL:` or `ERROR:`           |
| Warning triangle | `**WARNING:**` or `**NOTE:**`          |
| Stop sign        | `**GATE:**` or `**CHECKPOINT:**`       |
| Target           | `**KEY POINT:**` or `**FOCUS:**`       |
| Clipboard        | `-` (bullet point) or `**CHECKLIST:**` |
| Magnifying glass | `Checking:` or `Searching:`            |
| Test tube        | `**TESTING:**` or `[TEST]`             |
| Robot face       | `[AI-GENERATED]` or `(automated)`      |

### Why This Matters

**Technical Issues:**

- GitHub Actions `$GITHUB_OUTPUT` format doesn't support UTF-8 emoji encoding
- CI/CD log parsing (grep/awk/sed) breaks on multi-byte characters
- Windows terminal emoji rendering varies by environment

**Accessibility:**

- Screen readers announce emojis verbosely ("white heavy check mark")
- Cognitive load: Text is more scannable than symbols

**Maintainability:**

- `grep "GATE"` works; `grep "[stop-sign-emoji]"` requires Unicode regex
- Git diffs show emoji as `\u{1F6D1}` in some tools
- Text translates across locales; emojis don't

### Enforcement

- **Pre-commit hook**: Automatically blocks emoji in staged files
- **CI validation**: Pull requests fail if emojis detected
- **See**:
  [cheatsheets/emoji-free-documentation.md](cheatsheets/emoji-free-documentation.md)
  for complete guide
