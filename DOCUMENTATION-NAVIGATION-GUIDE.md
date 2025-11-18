# Documentation Navigation Guide

**Last Updated**: 2025-11-04 **Purpose**: Quick reference for finding
information without reading everything **Scope**: All documentation in the
Updog_restore codebase

---

## Table of Contents

1. [Quick Lookup: Where Do I Find...?](#quick-lookup-where-do-i-find)
2. [Core Documentation Overview](#core-documentation-overview)
3. [Domain Documentation (NotebookLM Sources)](#domain-documentation-notebooklm-sources)
4. [Architecture Decision Records (ADRs)](#architecture-decision-records-adrs)
5. [Cheatsheets](#cheatsheets)
6. [Process Documentation](#process-documentation)
7. [Documentation Quality Assessment](#documentation-quality-assessment)
8. [Known Documentation Gaps](#known-documentation-gaps)

---

## Quick Lookup: Where Do I Find...?

### Business & Product

| Topic                             | Primary Source              | Supporting Sources     |
| --------------------------------- | --------------------------- | ---------------------- |
| **Product vision & requirements** | `docs/prd.md`               | `README.md` (overview) |
| **Project overview**              | `README.md`, `CLAUDE.md`    | `docs/prd.md`          |
| **Feature status**                | `README.md` (wizard steps)  | `CHANGELOG.md`         |
| **Roadmap & gates**               | `docs/prd.md` (G1-G5 gates) | `CHANGELOG.md`         |

### Architecture & Decisions

| Topic                      | Primary Source                                      | Supporting Sources            |
| -------------------------- | --------------------------------------------------- | ----------------------------- |
| **Why we chose X**         | `DECISIONS.md`                                      | `docs/adr/ADR-*.md`           |
| **Tech stack rationale**   | `CLAUDE.md` (stack) + `DECISIONS.md` (why)          | `README.md`                   |
| **Architectural patterns** | `docs/adr/ADR-*.md`                                 | `DECISIONS.md`                |
| **API design**             | `docs/adr/ADR-010` (PowerLaw), `cheatsheets/api.md` | `docs/api/`                   |
| **Database schema**        | `shared/schemas/`, `docs/schema.md`                 | `docs/adr/ADR-012` (mem0)     |
| **Windows development**    | `SIDECAR_GUIDE.md`                                  | `CLAUDE.md` (sidecar section) |

### Domain Calculations

| Topic                       | Primary Source                                                               | Supporting Sources                                                                           |
| --------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Fee calculations**        | `docs/notebooklm-sources/fees.md` (1,237 lines, 96% quality)                 | `docs/adr/ADR-006-fee-calculation-standards.md` (36KB), `client/src/lib/fee-calculations.ts` |
| **Capital allocation**      | `docs/notebooklm-sources/capital-allocation.md` (2,410 lines, 97.2% quality) | `docs/adr/ADR-008-capital-allocation-policy.md`, `client/src/core/` engines                  |
| **Waterfall distributions** | `docs/notebooklm-sources/waterfall.md` (688 lines)                           | `docs/adr/ADR-004-waterfall-names.md`, `client/src/lib/waterfall.ts`                         |
| **XIRR calculations**       | `docs/notebooklm-sources/xirr.md` (865 lines)                                | `docs/adr/ADR-005-xirr-excel-parity.md`                                                      |
| **Exit recycling**          | `docs/notebooklm-sources/exit-recycling.md` (648 lines)                      | `docs/adr/ADR-007-exit-recycling-policy.md`                                                  |
| **Stage normalization**     | `docs/stage-normalization-v3.4.md`                                           | `docs/adr/ADR-011-stage-normalization-v2.md`                                                 |

### Development Workflows

| Topic                       | Primary Source                                                            | Supporting Sources                        |
| --------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| **Testing patterns**        | `cheatsheets/testing.md`, `cheatsheets/service-testing-patterns.md`       | `docs/adr/ADR-010` (validation), `tests/` |
| **API conventions**         | `cheatsheets/api.md`                                                      | `server/routes/`, `docs/api/`             |
| **Memory/logging patterns** | `cheatsheets/memory-patterns.md`, `cheatsheets/memory-commit-strategy.md` | `cheatsheets/memory-commands.md`          |
| **Claude Code commands**    | `cheatsheets/claude-commands.md`, `cheatsheets/command-summary.md`        | `CLAUDE.md` (commands section)            |
| **Code review**             | `cheatsheets/pr-review-workflow.md`                                       | `docs/processes/code-review-checklist.md` |
| **Extended thinking**       | `cheatsheets/extended-thinking.md`                                        | `docs/extended-thinking-integration.md`   |

### Deployment & Operations

| Topic                    | Primary Source          | Supporting Sources                                                  |
| ------------------------ | ----------------------- | ------------------------------------------------------------------- |
| **Deployment checklist** | `docs/deployment/`      | `docs/ROLLBACK.md`, `docs/runbooks/`                                |
| **Observability**        | `docs/observability.md` | `observability/README.md`, `docs/performance-logging-automation.md` |
| **Rollback procedures**  | `docs/ROLLBACK.md`      | `docs/rollback-playbook.md`, `docs/ROLLBACK_TRIGGERS.md`            |
| **Security**             | `SECURITY.md`           | `docs/security/`                                                    |

### AI & Automation

| Topic                      | Primary Source                          | Supporting Sources                          |
| -------------------------- | --------------------------------------- | ------------------------------------------- |
| **Available agents**       | `CAPABILITIES.md` (30+ agents)          | `.claude/agents/`                           |
| **Claude Code workflow**   | `cheatsheets/daily-workflow.md`         | `cheatsheets/claude-code-best-practices.md` |
| **Multi-AI collaboration** | `docs/MULTI-AI-DEVELOPMENT-WORKFLOW.md` | `claude_code-multi-AI-MCP/`                 |
| **Prompt improver hook**   | `cheatsheets/prompt-improver-hook.md`   | `CLAUDE.md` (hook section)                  |

---

## Core Documentation Overview

### 1. CAPABILITIES.md ( START HERE)

**Status**: Comprehensive (30+ agents, full tool inventory) **Last Updated**:
2025-10-28 **Lines**: ~200

**What's Covered**:

- Complete inventory of 30+ specialized agents (testing, architecture, domain
  experts)
- Built-in tools (Read, Write, Edit, Glob, Grep, Bash, etc.)
- MCP tools for multi-AI collaboration
- Custom slash commands (`/test-smart`, `/fix-auto`, `/deploy-check`)

**When to Use**: ALWAYS check first before implementing anything. If an agent
exists, use it instead of building from scratch.

**Quality**: Excellent - Well-organized, categorized by function

---

### 2. CLAUDE.md ( PRIMARY REFERENCE)

**Status**: Comprehensive, signal-rich **Last Updated**: Actively maintained
**Lines**: ~300

**What's Covered**:

- **Project overview** (1 paragraph - fund modeling platform)
- **Essential commands** (dev, test, db, AI tools)
- **Architecture** (frontend/backend/shared structure)
- **Tech stack** (React, TypeScript, Express, PostgreSQL, Redis, BullMQ)
- **Coding conventions** (PascalCase, kebab-case, waterfall update pattern)
- **Windows sidecar architecture** (critical for Windows dev)
- **Path aliases** (`@/`, `@shared/`, `@assets/`)
- **AI-augmented development** (agent framework, test repair)

**When to Use**: Primary orientation document. Read sections 1-3 for new
developers, reference specific sections as needed.

**Quality**: Excellent - Follows own guidelines
(cheatsheets/claude-md-guidelines.md), high signal-to-noise ratio

**Key Strength**: Points to detailed docs instead of cluttering with
implementation details

---

### 3. CHANGELOG.md

**Status**: Comprehensive, actively maintained **Last Updated**: 2025-11-04
**Lines**: ~1000+ **Format**: [Keep a Changelog](https://keepachangelog.com/)

**What's Covered**:

- **Phase 1D** (2025-11-04): Fees & Capital Allocation documentation (96-97.2%
  quality)
- **Phase 1C** (2025-10-29): Waterfall, XIRR, Exit Recycling modules
- **Phase 1B** (2025-10-26): Monte Carlo validation, stage normalization
- **Historical changes** with timestamps, quality metrics, validation results

**Organization**:

- Chronological (newest first)
- Semantic versioning style (Added/Changed/Fixed/Deprecated)
- Includes quality metrics (e.g., "96.0% publication quality")
- Growth metrics (line count, percentage improvements)
- Gemini validation scores

**When to Use**:

- Check before starting work (similar past work?)
- Reference validation patterns
- Understand module maturity

**Quality**: Excellent - Detailed, metric-driven, well-structured

---

### 4. DECISIONS.md

**Status**: Comprehensive (4 major ADRs + 6 unnumbered decisions) **Last
Updated**: 2025-11-10 **Lines**: ~3000+

**What's Covered**:

**Numbered ADRs:**

- **ADR-012**: Mandatory Evidence-Based Document Reviews
- **ADR-011**: Anti-Pattern Prevention Strategy for Portfolio Route API
- **ADR-010**: PowerLawDistribution API design (constructor over factory)
- **ADR-009**: Vitest Path Alias Configuration and test.projects Migration

**Unnumbered Decisions:**

- Foundation-First Test Remediation Strategy
- Vitest test.projects Migration Required for Environment Isolation
- Official Claude Code Plugins Over Custom BMad Infrastructure
- AI Orchestrator for Multi-Model Code Review
- Prompt Improver Hook Internalization
- Service Layer Extraction for Time-Travel Analytics

**Format**: Context → Decision → Rationale → Consequences → Alternatives

**When to Use**:

- Before making architectural decisions (check for precedent)
- Understanding "why" behind current implementations
- Evaluating alternatives (rejected options documented)

**Quality**: Excellent - Thorough rationale, clear consequences, comprehensive

**Navigation**: All ADRs also exist as standalone files in `docs/adr/ADR-*.md`

---

### 5. README.md

**Status**: User-facing, concise **Lines**: ~250

**What's Covered**:

- High-level overview
- 7-step wizard feature status ( / )
- Performance SLOs and badges
- Quick start commands
- Tech stack
- Key file map

**When to Use**: External onboarding, GitHub visitors, executive overview

**Quality**: Good - Well-formatted, clear status indicators

**Key Difference from CLAUDE.md**: README is external-facing (GitHub), CLAUDE.md
is AI-facing (development)

---

## Domain Documentation (NotebookLM Sources)

**Location**: `docs/notebooklm-sources/` **Purpose**: Publication-quality
technical documentation optimized for AI consumption (NotebookLM) **Quality
Target**: ≥96% (Gemini validation standard)

### Documentation Standards

All NotebookLM sources follow this structure:

1. **Executive Summary** (What/Why/How framework)
2. **Quick Start** (3 persona paths: Newcomers, Implementers, Debuggers)
3. **Table of Contents** (50+ semantic hyperlinks)
4. **Comprehensive Glossary** (10-20 terms with formulas, code refs, examples)
5. **Visual Aids** (2-3 Mermaid.js diagrams)
6. **Truth Cases Matrix** (10-20 cases with inline JSON)
7. **Worked Examples** (3-4 step-by-step calculations)
8. **Edge Cases & Boundary Conditions** (6-10 scenarios)
9. **Code References** (30-50 file:line anchors)
10. **Schema Alignment** (explicit mapping to `shared/schemas/`)

---

### 1. fees.md

**Status**: Publication-ready **Quality**: 96.0% (Gemini validation: 96/100)
**Lines**: 1,237 (+73% growth from 714) **Last Updated**: 2025-11-04

**Coverage**:

- **Categories**: Management Fees (6 basis types), Carried Interest, Fee
  Recycling, Admin Expenses
- **Truth Cases**: 10/10 management fee cases (FEE-001 to FEE-010)
- **Glossary**: 18 terms (Management Fee, Hurdle Rate, Catch-Up, Waterfall
  types, all 6 fee basis types)
- **Diagrams**: 3 Mermaid.js (Fee Pipeline, Waterfall Integration, Recycling
  Logic)
- **Edge Cases**: 8 scenarios (zero fund size, tier gaps, recycling caps, FMV
  volatility)
- **Code References**: 35+ file:line anchors

**Key Strengths** (per Gemini validation):

- Navigability: 20/20 (perfect - 50+ link TOC)
- Visual Clarity: 20/20 (perfect - 3 diagrams, 2 tables)
- Technical Accuracy: 20/20 (perfect - Decimal.js formulas, ADR-006 alignment)
- Accessibility: 20/20 (perfect - multi-level clarity)
- ️ Completeness: 16/20 (10 truth cases; expansion to 20+ recommended)

**Supporting Docs**:

- `docs/adr/ADR-006-fee-calculation-standards.md` (36KB, comprehensive)
- `shared/schemas/fee-profile.ts` (schema authority)
- `client/src/lib/fee-calculations.ts` (primary implementation)
- `docs/fees.truth-cases.json` (6,649 bytes)

**When to Use**:

- Implementing fee calculations
- Debugging fee discrepancies
- Understanding fee basis types (Committed, Called, Invested, FMV, Unrealized
  Cost, Called Net of Returns)
- Fee step-down logic
- Fee recycling caps and limits

---

### 2. capital-allocation.md

**Status**: Publication-ready **Quality**: 97.2% (exceeds NotebookLM gold
standard) **Lines**: 2,410 (largest domain doc) **Last Updated**: 2025-11-04

**Coverage**:

- **Engines**: Reserve, Pacing, Cohort (3 coordinated engines)
- **Truth Cases**: 20/20 complete (CA-001 to CA-020)
- **Worked Examples**: 4 comprehensive (CA-009, CA-013, CA-015, CA-020)
- **Glossary**: 11 terms (Reserve Floor, Pacing Window, Cohort Weights,
  Carryover, Spill Logic)
- **Diagrams**: 2 Mermaid.js (Capital Flow Pipeline, Spill Logic Decision Tree)
- **Edge Cases**: 8 scenarios (zero reserve, single cohort, no carryover, cap
  exceeded)
- **Code References**: 35+ file:line anchors

**Key Principles**:

- **Precedence**: Reserve floor > Pacing target > Cohort allocation
- **Deterministic**: Same inputs → identical outputs
- **Conservative**: Never over-deploy capital
- **Prospective**: Rule changes apply forward-only
- **Traceable**: Full audit trail

**Supporting Docs**:

- `docs/adr/ADR-008-capital-allocation-policy.md` (19KB)
- `client/src/core/ReserveEngine.ts`
- `client/src/core/PacingEngine.ts`
- `client/src/core/CohortEngine.ts`
- `docs/capital-allocation.truth-cases.json` (23,300 bytes)
- `docs/references/capital-allocation-follow-on.md` (follow-on investment logic)
- `docs/references/seed-cases-ca-007-020.md` (truth case seeds)

**When to Use**:

- Understanding capital deployment precedence
- Implementing reserve calculations
- Debugging pacing carryover issues
- Cohort allocation spill logic
- Integrating with recycling module

---

### 3. waterfall.md

**Status**: Complete **Quality**: ~90-92% (estimated) **Lines**: 688 **Last
Updated**: 2025-10-29

**Coverage**:

- **Waterfall Types**: American, European (discriminated union)
- **Parameters**: Hurdle rate, catch-up, carry vesting, GP commitment
- **Truth Cases**: 15+ cases (WATERFALL-001 to WATERFALL-015+)
- **Update Pattern**: Centralized helper (`client/src/lib/waterfall.ts`)

**Supporting Docs**:

- `docs/adr/ADR-004-waterfall-names.md` (13,681 bytes)
- `client/src/lib/waterfall.ts` (centralized update helper)
- `client/src/lib/__tests__/waterfall.test.ts` (19 test cases)
- `docs/waterfall.truth-cases.json` (20,357 bytes)
- `docs/notebooklm-sources/.waterfall-metadata.json` (3,545 bytes)

**Key Functions**:

- `applyWaterfallChange()` - Field updates with validation and clamping
- `changeWaterfallType()` - Type switching with schema enforcement (AMERICAN ↔
  EUROPEAN)

**When to Use**:

- Implementing waterfall calculations
- Switching between American and European waterfalls
- Understanding carry distributions
- Hurdle rate calculations

---

### 4. xirr.md

**Status**: Complete **Quality**: ~88-90% (estimated) **Lines**: 865 **Last
Updated**: 2025-10-29

**Coverage**:

- **Algorithm**: Newton-Raphson method for IRR calculation
- **Excel Parity**: Matches Excel XIRR function
- **Precision**: Handles cash flows with date-weighted returns
- **Truth Cases**: 10+ cases (XIRR-001 to XIRR-010+)

**Supporting Docs**:

- `docs/adr/ADR-005-xirr-excel-parity.md` (22,581 bytes)
- `shared/lib/xirr.ts` (implementation)
- `docs/xirr.truth-cases.json` (18,426 bytes)

**When to Use**:

- Implementing IRR calculations
- Understanding Newton-Raphson convergence
- Debugging date-weighted cash flows
- Excel parity validation

---

### 5. exit-recycling.md

**Status**: Complete **Quality**: ~85-88% (estimated) **Lines**: 648 **Last
Updated**: 2025-10-29

**Coverage**:

- **Policy**: Recycling caps, term limits, eligibility rules
- **Integration**: Works with capital allocation precedence
- **Truth Cases**: 8+ cases (RECYCLING-001 to RECYCLING-008+)

**Supporting Docs**:

- `docs/adr/ADR-007-exit-recycling-policy.md` (8,816 bytes)
- `client/src/core/RecyclingEngine.ts`
- `docs/exit-recycling.truth-cases.json` (30,298 bytes)

**When to Use**:

- Understanding recycling eligibility
- Implementing recycling caps
- Integrating recycling with capital allocation
- Debugging recycling term limits

---

### NotebookLM Quality Summary

| Module                 | Lines | Quality | Truth Cases | Diagrams | Glossary | Code Refs | Status   |
| ---------------------- | ----- | ------- | ----------- | -------- | -------- | --------- | -------- |
| **capital-allocation** | 2,410 | 97.2%   | 20/20       | 2        | 11       | 35+       | Gold     |
| **fees**               | 1,237 | 96.0%   | 10/10       | 3        | 18       | 35+       | Gold     |
| **waterfall**          | 688   | ~92%    | 15+         | 2        | 8        | 25+       | Complete |
| **xirr**               | 865   | ~90%    | 10+         | 1        | 6        | 20+       | Complete |
| **exit-recycling**     | 648   | ~88%    | 8+          | 1        | 5        | 15+       | Complete |

**Total**: 5,848 lines of publication-quality domain documentation

---

## Architecture Decision Records (ADRs)

**Location**: `docs/adr/` **Format**: Lightweight ADR (Status, Context,
Decision, Consequences, Alternatives) **Total**: 12 ADRs (ADR-001 to ADR-012 + 3
early ADRs)

### ADR Index

| ADR         | Title                           | Status      | Date       | Size  | Quality       |
| ----------- | ------------------------------- | ----------- | ---------- | ----- | ------------- |
| **ADR-012** | Mem0 Integration                | Implemented | 2025-11-01 | 15KB  | Complete      |
| **ADR-011** | Stage Normalization v2          | Implemented | 2025-10-30 | 16KB  | Complete      |
| **ADR-010** | Monte Carlo Validation Strategy | Implemented | 2025-10-30 | 12KB  | Complete      |
| **ADR-008** | Capital Allocation Policy       | Accepted    | 2025-01-28 | 19KB  | Comprehensive |
| **ADR-007** | Exit Recycling Policy           | Accepted    | 2025-01-28 | 9KB   | Complete      |
| **ADR-006** | Fee Calculation Standards       | Accepted    | 2025-01-28 | 37KB  | Exceptional   |
| **ADR-005** | XIRR Excel Parity               | Accepted    | 2025-01-28 | 23KB  | Complete      |
| **ADR-004** | Waterfall Names                 | Accepted    | 2025-01-28 | 14KB  | Complete      |
| **ADR-003** | Streaming Architecture          | Accepted    | -          | 1.3KB | Basic         |
| **ADR-002** | Token Budgeting                 | Accepted    | -          | 1.5KB | Basic         |
| **ADR-001** | Evaluator Metrics               | Accepted    | -          | 4.5KB | Good          |

**Also see**: `docs/ADR-00X-resilience-circuit-breaker.md` (draft)

### When to Write an ADR

Per `docs/adr/README.md`:

- Making a significant architectural choice
- Adopting a new pattern or framework
- Changing a fundamental design decision
- Resolving a contentious debate with a clear decision

### ADR Quality Tiers

** Exceptional (ADR-006)**:

- 37KB, comprehensive problem statement, 10+ alternatives, validation strategy,
  migration path, test cases, schema integration

** Complete (ADR-004, 005, 007, 008)**:

- Clear context, thorough decision rationale, consequences documented,
  alternatives evaluated

** Basic (ADR-001, 002, 003)**:

- Lightweight format, essential information, minimal alternatives

---

## Cheatsheets

**Location**: `cheatsheets/` **Purpose**: Focused implementation guides for
specific workflows **Total**: 21 cheatsheets

### Cheatsheet Inventory

| Cheatsheet                          | Lines | Quality   | Purpose                                 |
| ----------------------------------- | ----- | --------- | --------------------------------------- |
| **claude-code-best-practices.md**   | 16KB  | Excellent | Workflow best practices, tool selection |
| **daily-workflow.md**               | 11KB  | Excellent | Day-to-day development patterns         |
| **pr-review-workflow.md**           | 13KB  | Excellent | Pull request review process             |
| **service-testing-patterns.md**     | 8KB   | Good      | Service layer testing strategies        |
| **documentation-validation.md**     | 17KB  | Excellent | Doc quality validation (Promptfoo)      |
| **evaluator-optimizer-workflow.md** | 12KB  | Good      | AI evaluator/optimizer patterns         |
| **extended-thinking.md**            | 9KB   | Good      | Extended thinking integration           |
| **prompt-improver-hook.md**         | 9KB   | Good      | Prompt improvement hook usage           |
| **ai-code-review.md**               | 9KB   | Good      | AI-assisted code review                 |
| **capability-checklist.md**         | 3KB   | Good      | Capability verification                 |
| **correct-workflow-example.md**     | 2KB   | Good      | Example workflows                       |
| **claude-md-guidelines.md**         | 2KB   | Excellent | CLAUDE.md maintenance rules             |
| **memory-commit-strategy.md**       | 3KB   | Good      | Changelog/decision logging              |
| **memory-patterns.md**              | 2KB   | Good      | Memory management patterns              |
| **memory-commands.md**              | 3KB   | Good      | `/log-change`, `/log-decision`          |
| **claude-commands.md**              | 1KB   | Good      | Slash command reference                 |
| **command-summary.md**              | 1KB   | Good      | Quick command lookup                    |
| **init-vs-update.md**               | 2KB   | Good      | Initialization vs update patterns       |
| **testing.md**                      | 57B   | Stub      | Placeholder only                        |
| **api.md**                          | 49B   | Stub      | Placeholder only                        |

**Total**: ~100KB of focused workflow documentation

### Key Cheatsheets for Common Tasks

**Starting a new task**: `cheatsheets/daily-workflow.md` **Code review**:
`cheatsheets/pr-review-workflow.md` **Testing**:
`cheatsheets/service-testing-patterns.md` (note: `testing.md` is a stub)
**Documentation**: `cheatsheets/documentation-validation.md` **CLAUDE.md
maintenance**: `cheatsheets/claude-md-guidelines.md` **Memory commands**:
`cheatsheets/memory-commands.md` → `cheatsheets/memory-commit-strategy.md`

---

## Process Documentation

**Location**: `docs/processes/` **Purpose**: Team workflows, checklists,
automation guides

### Process Docs Inventory

| Document                              | Purpose                           | Quality   |
| ------------------------------------- | --------------------------------- | --------- |
| **code-review-checklist.md** (16KB)   | Comprehensive PR review checklist | Excellent |
| **CONTRIBUTING.md** (8KB)             | Contribution guidelines           | Good      |
| **AUTOMATION_GUIDE.md** (4KB)         | Automation setup and usage        | Good      |
| **PRE_PUSH_CHECKLIST.md** (6KB)       | Pre-push validation steps         | Good      |
| **GITHUB_SETUP.md** (6KB)             | GitHub repository setup           | Good      |
| **GITHUB_COMMIT_GUIDE.md** (3KB)      | Commit message conventions        | Good      |
| **TEAM_SETUP.md** (8KB)               | Team onboarding                   | Good      |
| **PEER_REVIEW.md** (1.3KB)            | Peer review process               | Basic     |
| **COMMIT_LOG.md** (1KB)               | Commit logging guidelines         | Basic     |
| **DEPLOYMENT_COMPLETE.md** (1.4KB)    | Deployment completion checklist   | Basic     |
| **DEPLOYMENT_TODO.md** (0.8KB)        | Deployment TODO template          | Basic     |
| **FINAL_VALIDATION.md** (1.4KB)       | Final validation checklist        | Basic     |
| **PIPELINE_SCHEMA_COMPLETE.md** (2KB) | Pipeline schema validation        | Basic     |
| **PIPELINE_TODO.md** (1KB)            | Pipeline TODO template            | Basic     |

---

## Documentation Quality Assessment

### Tier 1: Publication-Ready (≥96% Quality)

** Gold Standard**:

- `docs/notebooklm-sources/capital-allocation.md` - 97.2% (2,410 lines)
- `docs/notebooklm-sources/fees.md` - 96.0% (1,237 lines)

**Characteristics**:

- Gemini validation ≥96/100
- 50+ semantic hyperlinks (TOC)
- 2-3 Mermaid.js diagrams
- 10-20 truth cases with inline JSON
- 30-50 code references (file:line)
- Comprehensive glossary (10-20 terms)
- Multi-persona entry points
- 3-4 worked examples
- 6-10 edge cases documented

---

### Tier 2: Complete & Comprehensive (85-95% Quality)

** Excellent**:

- `CLAUDE.md` - Primary development reference
- `CAPABILITIES.md` - Agent and tool inventory
- `CHANGELOG.md` - Comprehensive change history
- `DECISIONS.md` - 10 major ADRs
- `docs/adr/ADR-006-fee-calculation-standards.md` - 37KB flagship ADR
- `docs/notebooklm-sources/waterfall.md` - ~92% (688 lines)
- `docs/notebooklm-sources/xirr.md` - ~90% (865 lines)
- `docs/notebooklm-sources/exit-recycling.md` - ~88% (648 lines)

**Characteristics**:

- Well-structured, comprehensive coverage
- Clear examples and code references
- Actively maintained
- Good navigability

---

### Tier 3: Functional & Useful (70-85% Quality)

** Good**:

- `README.md` - User-facing overview
- `docs/prd.md` - Product requirements
- `SIDECAR_GUIDE.md` - Windows development
- Most cheatsheets (daily-workflow, pr-review, etc.)
- Most process docs (code-review-checklist, CONTRIBUTING)
- ADRs 004, 005, 007, 008, 010, 011, 012

**Characteristics**:

- Clear purpose and structure
- Practical guidance
- Some examples
- Adequate for current needs

---

### Tier 4: Basic/Placeholder (<70% Quality)

** Basic**:

- `cheatsheets/testing.md` - 57 bytes (placeholder)
- `cheatsheets/api.md` - 49 bytes (placeholder)
- ADRs 001, 002, 003 - Lightweight format
- Some process docs (DEPLOYMENT_TODO, PIPELINE_TODO)

**Characteristics**:

- Minimal content
- Needs expansion
- Placeholder status

---

## Known Documentation Gaps

### Critical Gaps (High Priority)

1. **Testing Patterns** ️
   - `cheatsheets/testing.md` is a 57-byte stub
   - Should document: Vitest patterns, test.projects (server/client), React
     Testing Library conventions
   - **Workaround**: Use `cheatsheets/service-testing-patterns.md` (8KB) for
     service layer
   - **Action**: Expand `testing.md` to 5-10KB comprehensive guide

2. **API Conventions** ️
   - `cheatsheets/api.md` is a 49-byte stub
   - Should document: RESTful patterns, Zod validation, error handling, route
     structure
   - **Workaround**: Check `server/routes/` for patterns, `docs/api/` for
     examples
   - **Action**: Expand `api.md` to 5-10KB with examples

3. **Fee Module Truth Cases**
   - Current: 10/10 management fee cases
   - Missing: 12 additional cases (Carried Interest, Fee Recycling, Admin
     Expenses, Fee Impact)
   - **Impact**: Completeness score 16/20 (Gemini validation)
   - **Action**: Add cases FEE-011 to FEE-022 to reach 20+ total

### Medium Priority Gaps

4. **Common Pitfalls / Debugging Playbook**
   - NotebookLM sources lack dedicated troubleshooting sections
   - **Workaround**: Edge cases section covers some scenarios
   - **Action**: Add "Debugging Playbook" section to each NotebookLM doc

5. **Database Schema Documentation**
   - `docs/schema.md` exists but limited detail
   - Drizzle schemas in `shared/schemas/` lack overview doc
   - **Action**: Create `docs/database-architecture.md` with ER diagrams

6. **Frontend Component Patterns**
   - Component organization documented in CLAUDE.md (feature-based)
   - Missing: Shadcn/ui integration guide, custom hooks patterns
   - **Action**: Create `cheatsheets/component-patterns.md`

7. **Performance Optimization Guide**
   - Performance SLOs in README.md
   - Missing: Optimization techniques, profiling guide
   - **Action**: Create `docs/performance-optimization.md`

### Low Priority Gaps

8. **Deployment Runbook Consolidation**
   - Multiple deployment docs: `DEPLOYMENT.md`, `DEPLOYMENT_RUNBOOK.md`,
     `docs/deployment/`
   - Some redundancy and fragmentation
   - **Action**: Consolidate into single `docs/deployment/RUNBOOK.md`

9. **Security Documentation**
   - `SECURITY.md` exists at root
   - `docs/security/` exists but limited content
   - **Action**: Expand security architecture documentation

10. **CI/CD Pipeline Documentation**
    - GitHub Actions workflows documented in `docs/processes/`
    - Missing: Pipeline architecture overview
    - **Action**: Create `docs/ci-cd-architecture.md`

---

## Usage Examples

### Example 1: "How do I calculate management fees?"

**Path**:

1. Check `docs/notebooklm-sources/fees.md` (primary reference)
2. Review `docs/adr/ADR-006-fee-calculation-standards.md` (architectural
   decisions)
3. Examine `client/src/lib/fee-calculations.ts` (implementation)
4. Reference `shared/schemas/fee-profile.ts` (schema authority)
5. Use truth cases `docs/fees.truth-cases.json` for validation

**Quick Answer**: Search `fees.md` for your fee basis type (e.g., "Committed
Capital", "FMV"), find relevant truth case (FEE-001 to FEE-010), follow code
references.

---

### Example 2: "Why did we choose constructor over factory for PowerLawDistribution?"

**Path**:

1. Check `DECISIONS.md` → ADR-010
2. Read `docs/adr/ADR-010-monte-carlo-validation-strategy.md` (wait, wrong ADR)
3. Actually in `DECISIONS.md` inline (ADR-010 in main file)

**Quick Answer**: ADR-010 in `DECISIONS.md` explains type safety, IDE
autocomplete, no wrapper indirection, standard OOP pattern. Factory function
caused silent failures (undefined → NaN cascade).

---

### Example 3: "What agents are available for testing?"

**Path**:

1. Check `CAPABILITIES.md` → "Testing & Quality" section
2. Find: `test-automator`, `pr-test-analyzer`, `code-reviewer`, `test-repair`

**Quick Answer**: Use `test-automator` for comprehensive test
generation/TDD/coverage. Use `test-repair` for fixing failing tests.

---

### Example 4: "How do I set up Windows development?"

**Path**:

1. Check `SIDECAR_GUIDE.md` (comprehensive Windows-specific guide)
2. Also reference `CLAUDE.md` → "Windows Development: Sidecar Architecture"
   section
3. Run `npm run doctor` for health checks

**Quick Answer**: Windows uses sidecar workspace (`tools_local/`) with
junctions. Run `npm ci --prefix tools_local && npm install`, verify with
`npm run doctor`.

---

### Example 5: "What's the capital allocation precedence hierarchy?"

**Path**:

1. Check `docs/notebooklm-sources/capital-allocation.md` → "Integration &
   Precedence" section
2. Reference `docs/adr/ADR-008-capital-allocation-policy.md`

**Quick Answer**: Reserve floor > Pacing target > Cohort allocation. Reserve
Engine runs first (liquidity protection), Pacing Engine smooths deployment,
Cohort Engine distributes remaining capital.

---

## Maintenance & Updates

### Keeping This Guide Current

**Update Triggers**:

- New documentation added (cheatsheets, ADRs, NotebookLM sources)
- Documentation restructuring
- Quality assessments change (Gemini validation scores)
- Major documentation gaps filled

**Review Frequency**: Monthly or after major documentation additions

**Ownership**: Documentation architect / tech lead

---

## Quick Reference Card

### Top 5 Documents to Read First

1. **CAPABILITIES.md** - Check for existing agents/tools before implementing
2. **CLAUDE.md** - Primary development reference (architecture, conventions,
   commands)
3. **README.md** - Project overview, quick start, feature status
4. **CHANGELOG.md** - Recent changes, quality metrics, validation patterns
5. **Domain doc** - Relevant NotebookLM source (`fees.md`,
   `capital-allocation.md`, etc.)

### Top 5 Documents for Reference

1. **DECISIONS.md** - Why we chose X (architectural rationale)
2. **ADR-006** - Fee calculation standards (flagship ADR, 37KB)
3. **cheatsheets/daily-workflow.md** - Day-to-day development patterns
4. **cheatsheets/pr-review-workflow.md** - Pull request review process
5. **SIDECAR_GUIDE.md** - Windows development (if on Windows)

### Emergency Contacts

**Stuck on task?** → Check `CAPABILITIES.md` for relevant agent **Architecture
decision?** → Check `DECISIONS.md` + relevant ADR **Domain calculation?** →
Check `docs/notebooklm-sources/[module].md` **Workflow unclear?** → Check
`cheatsheets/daily-workflow.md` **Windows issues?** → Check `SIDECAR_GUIDE.md`,
run `npm run doctor`

---

**End of Documentation Navigation Guide**

_This guide is a living document. Contributions welcome via PR._
