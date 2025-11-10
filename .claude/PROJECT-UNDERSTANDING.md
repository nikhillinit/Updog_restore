# Project Understanding - Complete Infrastructure Reference

**Last Updated:** 2025-11-10 **Purpose:** Permanent reference for all sessions
to prevent context drift and ensure complete project understanding

---

## CRITICAL: Read These Four Files FIRST

Before starting any work, read these four source files in order:

1. **[CAPABILITIES.md](../CAPABILITIES.md)** - Quick reference, check-first
   discovery (85% complete)
2. **[PROJECT-PHOENIX-COMPREHENSIVE-STRATEGY.md](../PROJECT-PHOENIX-COMPREHENSIVE-STRATEGY.md)** -
   21-week transformation roadmap
3. **[AI-WORKFLOW-COMPLETE-GUIDE.md](../AI-WORKFLOW-COMPLETE-GUIDE.md)** - 28
   agents, orchestration patterns
4. **[COMPREHENSIVE-WORKFLOW-GUIDE.md](../COMPREHENSIVE-WORKFLOW-GUIDE.md)** -
   Extended practical guide

**These four files together provide the complete infrastructure record.**

---

## Three Major Quality Initiatives

### 1. Anti-Pattern Prevention System (ADR-011)

**Status:** Implemented (Nov 8, 2025)

**What it is:**

- 24 cataloged anti-patterns across 4 categories (cursor pagination,
  idempotency, optimistic locking, BullMQ queues)
- 4-layer quality gate system for systematic prevention
- Zero tolerance enforcement policy

**4-Layer Quality Gates:**

- **Layer 1:** ESLint rules (compile-time prevention, 16+ rules)
- **Layer 2:** Pre-commit hooks (pre-merge prevention, emoji + lint-staged)
- **Layer 3:** IDE snippets (development assistance, 5 safe pattern prefixes)
- **Layer 4:** CI/CD gates (final safety net, 15 essential workflows)

**Reference:** `DECISIONS.md` ADR-011, `cheatsheets/anti-pattern-prevention.md`

---

### 2. Document Review Protocol (ADR-012)

**Status:** Implemented (Nov 9, 2025)

**What it is:**

- Evidence-based verification system to prevent AI hallucination and context
  drift
- Mandatory protocol for reviewing planning documents
- "Code is truth. Documentation describes intent."

**5-Step Framework:**

1. **Classify document type:** PLAN (future) vs STATUS (present) vs REFERENCE
   (timeless)
2. **Check timestamp:** Plans >24h old require execution verification
3. **Verify claims:** Never report "missing" without code-level proof
4. **Git log search:** `git log --since=<doc-date>` for evidence
5. **Clarify ambiguity:** Ask if theoretical review or reality check

**Reference:** `CLAUDE.md` Document Review Protocol section,
`cheatsheets/document-review-workflow.md` (620 lines)

---

### 3. NotebookLM Documentation Strategy

**Status:** Phase 1 COMPLETE, Phase 2 COMPLETE (Oct-Nov 2025)

**What it is:**

- Publication-quality technical documentation methodology
- Creates AI-consumable knowledge bases optimized for Google NotebookLM
  ingestion
- Eliminates AI hallucinations through source-grounded, citation-backed answers

**Phase 1 Deliverables (5 Business Logic Modules):**

| Module             | Lines | Quality | Truth Cases | Code Refs | Status   |
| ------------------ | ----- | ------- | ----------- | --------- | -------- |
| Capital Allocation | 2,410 | 97.2%   | 20/20       | 35+       | PLATINUM |
| Fees               | 1,237 | 96.0%   | 10/10       | 35+       | GOLD     |
| XIRR               | 865   | 96.3%   | 10+         | 20+       | GOLD     |
| Waterfall          | 688   | 94.3%   | 15+         | 25+       | COMPLETE |
| Exit Recycling     | 648   | 91.0%   | 8+          | 15+       | COMPLETE |

**Total:** 5,848 lines, 96.2% average quality

**Phase 2 Deliverables (4 Analytical Engines):**

| Engine        | Files | Pages | Quality | Status   |
| ------------- | ----- | ----- | ------- | -------- |
| ReserveEngine | 4     | ~23   | 95%+    | COMPLETE |
| PacingEngine  | 4     | ~26   | 99%     | COMPLETE |
| CohortEngine  | 3     | ~69   | 95%+    | COMPLETE |
| Monte Carlo   | 4     | ~120  | 98%+    | COMPLETE |

**Total:** 15 files, ~238 pages, ~85,000 words **Time:** 3.5 hours wall time
(31-40 hours work done via parallel agents) **Efficiency:** 87-91% time savings
through orchestration

**10-Layer Documentation Standard:**

1. Executive Summary (What/Why/How)
2. Quick Start (3 persona paths)
3. Table of Contents (50+ semantic hyperlinks)
4. Comprehensive Glossary (10-20 terms with formulas)
5. Visual Aids (2-3 Mermaid.js diagrams)
6. Truth Cases Matrix (10-20 cases with inline JSON)
7. Worked Examples (3-4 step-by-step calculations)
8. Edge Cases & Boundary Conditions (6-10 scenarios)
9. Code References (30-50 file:line anchors, auto-generated)
10. Schema Alignment (explicit mapping to `shared/schemas/`)

**Reference:** `docs/notebooklm-sources/` directory, `notebooklm-upload/`
curated package

---

## Complete Infrastructure Inventory

### Packages (15+ Total)

**Production (3):**

- `@povc/agent-core` - Core AI agent framework with BaseAgent,
  ConversationMemory, PromptCache, AIRouter
- `@povc/test-repair-agent` - Autonomous test failure detection and repair
- `@updog/memory-manager` - mem0-inspired memory system (PostgreSQL + pgvector +
  Redis)

**Experimental (5):**

- `@povc/codex-review-agent` - Real-time code review with MCP multi-AI consensus
- `@updog/multi-agent-fleet` - Multi-agent coordination framework
- `@updog/dependency-analysis-agent` - Intelligent dependency management
- `@updog/bundle-optimization-agent` - Autonomous bundle size optimization
- `@updog/route-optimization-agent` - Automated route optimization and lazy
  loading

**Archived (3):**

- `backtest-framework` - AI agent backtesting (archived after validation
  complete)
- `bmad-integration` - BMad project management methodology (archived Oct
  7, 2025)
- `@povc/zencoder-integration` - Zencoder AI integration (minimal recent
  activity)

**Additional:**

- TypeScript agents: 6
- Project-level agents: 22
- User-level agents: 15
- Marketplace agents: 200+
- Archived BMad agents: 27

---

### Scripts (250+ Across 13 Categories)

**Major Categories:**

- `ai/` - AI orchestration scripts
- `ai-tools/` - Gateway for AI-augmented development (10 scripts)
- `ci/` - CI/CD pipeline support
- `codemods/` - AST-based code transformations
- `validation/` - Domain-specific validation (12+ scripts, 6 YAML test suites)
- `wip-cases/` - Work-in-progress test case library (14+ JSON files)

**Root-Level Utilities:**

- Extended thinking migration (`check-thinking-migration-readiness.mjs`,
  `run-migration.ts`)
- Documentation automation (`extract-code-references.mjs`,
  `sync-capabilities.mjs`)
- Stage normalization (`normalize-stages.ts`, `normalize-stages-batched.ts`)
- Smart testing (`test-smart.mjs` with `--list-only` flag for CI)

---

### Cheatsheets (27 Files)

**Post-Oct 1 (7 files):**

- `agent-architecture.md` (Nov 9) - Three-tier agent organization
- `agent-memory-integration.md` (Nov 6) - HybridMemoryManager integration
- `anti-pattern-prevention.md` (Nov 9) - 24 patterns with 4-layer quality gates
- `capability-checklist.md` (Nov 5) - Pre-task 5-second check
- `coding-pairs-playbook.md` (Nov 6) - Continuous pre-commit review
- `document-review-workflow.md` (Nov 9) - Evidence-based verification (620
  lines)
- `emoji-free-documentation.md` (Nov 9) - No-emoji policy enforcement

**Pre-Oct 1 (20 files):**

- API, testing, memory patterns, daily workflow, PR review, service testing, AI
  code review, documentation validation, multi-agent orchestration, etc.

---

### Archive (662 Files)

**Organization:**

- `2025-10-07` (421 files) - Legacy cleanup (wizard components, backups, demo
  assets)
- `2025-q4` (77 files) - Active phase planning, handoff memos, session records
- `2025-q3` (27 files) - Demo prep, security hardening, TypeScript baseline
- `2025-10-18` (28 files) - BMad infrastructure removal
- `chat-transcripts` (6 files) - Chat history and session records
- `deployment-planning` (41 files) - Deployment strategies, CI/CD fixes
- `status-reports` (62 files) - Parallel execution status, PR cleanup

**Archival Strategy:**

- Detailed ARCHIVE_MANIFEST.md files document purpose, rationale, space
  reclaimed
- Preserves git history via `git mv` operations
- Includes rollback instructions and verification checklists

---

## Quality Systems

### 4-Layer Quality Gates

**Layer 1: ESLint Rules** (Compile-time prevention)

- 16+ rules for anti-pattern prevention
- Zero tolerance (errors, not warnings)
- Custom plugin planned: `eslint-plugin-portfolio-antipatterns`

**Layer 2: Pre-commit Hooks** (Pre-merge prevention)

- Emoji detection (blocks emoji in staged files except legacy docs)
- lint-staged integration
- Feedback: <5 seconds

**Layer 3: IDE Snippets** (Development assistance)

- VSCode snippets for safe patterns
- 5 prefixes: `cursor-`, `idempotent-`, `optimistic-`, `bullmq-`, `safe-`
- IntelliSense autocomplete for correct implementations

**Layer 4: CI/CD Gates** (Final safety net)

- 15 essential workflows (was 57, -73.7% reduction)
- Core gates (9): ci-unified, test, pr-tests, validate, code-quality,
  docs-validate, dependency-validation, bundle-size-check, performance-gates
- Security gates (6): security-scan, security-tests, codeql, zap-baseline,
  dockerfile-lint, sidecar-windows

---

### Multi-AI Validation System

**16 MCP Tools Available:**

- `mcp__multi-ai-collab__ask_gemini` / `ask_openai`
- `mcp__multi-ai-collab__gemini_code_review` / `openai_code_review`
- `mcp__multi-ai-collab__gemini_think_deep` / `openai_think_deep`
- `mcp__multi-ai-collab__ai_debate` - Two AIs debate a topic
- `mcp__multi-ai-collab__collaborative_solve` - Multiple AIs collaborate
- `mcp__multi-ai-collab__ai_consensus` - Get consensus from all AIs

**Validation Process:**

- Consensus scoring (both Gemini AND OpenAI must score 92%+)
- Variance analysis (>5 points triggers re-validation)
- Integration: Pre-commit, CI/CD, agent task completion

---

### Promptfoo Mechanical Validation

**4-Dimensional Rubric:**

1. **Entity Truthfulness** (30%) - Domain concept coverage, accuracy
2. **Math** (25%) - Formulas, calculations, derivations
3. **Schema Alignment** (25%) - Mapping to `shared/schemas/`
4. **Integration** (20%) - Code references, cross-module links

**Thresholds:**

- Minimum: 92% for Phase 1 modules
- Gold Standard: 96%+ quality
- Integration Points: Pre-commit hooks, CI/CD gates, agent task completion

**Examples:**

- XIRR: 96.3% quality
- Fees: 94.5% → 96.1% after uplift
- Capital Allocation: 99% quality (PLATINUM)

---

### Truth-Case-First Methodology

**Core Principles:**

- 70+ validated test cases prevent AI invention
- JSON Schema validation for all examples
- Real-world scenarios from test fixtures (not hypothetical)
- Code is truth, documentation describes intent

**Implementation:**

- Truth case files: `docs/*.truth-cases.json`
- Schema files: `docs/schemas/*.schema.json`
- Validation configs: `scripts/validation/*.yaml`

---

## Current Project State

**Branch:** `feat/portfolio-lot-moic-schema` **Phase:** Phase 0 - Portfolio API
implementation **Status:** 15% complete (scaffolding done, 501 stubs remain)

**Active Documents:**

- `HANDOFF-PORTFOLIO-PHASE0-COMPLETE.md` (899 lines) - Implementation plan
- `PORTFOLIO-SCHEMA-MIGRATION-ANALYSIS.md` (894 lines) - Technical spec
- `MIGRATION-QUICK-START.md` (195 lines) - Operational runbook

**Modified Files:**

- `CHANGELOG.md` - Documentation cleanup entry
- `cheatsheets/emoji-free-documentation.md` - Emoji enforcement
- `server/middleware/idempotency.ts` - PENDING lock, fingerprinting
- `shared/schema.ts` - Portfolio tables (bigint versions, scoped idempotency)
- `tests/middleware/idempotency-dedupe.test.ts` - Integration tests

**Untracked Files:**

- `server/routes/portfolio/` (3 files: index.ts, snapshots.ts, lots.ts)
- `migrations/` (2 files: hardening SQL + rollback SQL)
- Multiple handoff memos and analysis documents

**Recent Commits:**

- `649db899` (Nov 9) - fix: Add --list-only flag to test-smart.mjs for CI
- `d9a29cf6` (Nov 9) - fix: Remove emoji causing CI failures, add enforcement
- `551a33a4` (Nov 9) - Merge branch 'main' into feat/portfolio-lot-moic-schema

---

## Project Phoenix - 21-Week Transformation

**Phase 1 (90% Complete):** Documentation Excellence

- 5 business logic modules documented (5,848 lines, 96-97% quality)
- 4 analytical engines documented (238 pages, 95-99% quality)
- Gold standard: Capital Allocation (99%), XIRR (96.3%), Fees (96.0%)

**Phase 2 (Planned Q1 2026):** Sidecar Elimination

- Migrate from Windows sidecar to pnpm (native Windows support)
- 3x faster installs, 60% disk savings
- 72% faster onboarding (18 min → 5 min)
- Eliminate 689 lines of junction management scripts

**Phase 3 (In Progress):** Information Architecture Consolidation

- Consolidate 9+ routes → 5 cohesive routes
- `/overview` - Executive dashboard with real KPIs
- `/portfolio` - Company-centric investment view
- `/model` - Single 7-step wizard (replaces 3 modeling routes)
- `/operate` - Operational workflows
- `/report` - LP statements and custom reports

**Phase 4 (Ongoing):** Developer Experience

- Test infrastructure improvements
- CI/CD optimization
- Agent memory integration

**Phase 5 (Week 20-21):** Production Readiness

- Feature flags for instant rollback
- Hard cutover with zero downtime
- LP reporting functional
- 90%+ test coverage
- Rollback time <1 minute

---

## Hard Constraints

### Archive Barrier

**Rule:** Never use `archive/` directory for current context unless explicitly
requested by user.

**Exceptions:**

1. User explicitly asks to check archives for incorrectly removed files
2. User explicitly asks for historical context
3. User explicitly references an archived file

**Default behavior:** Treat `archive/` as off-limits (662 archived files exist
but are not current context)

---

### Source of Truth Hierarchy

**Trust levels for information sources:**

1. **CHANGELOG.md** (100% trust) - Timestamped changes, what actually happened
2. **Committed code** (100% trust) - Implementation reality, ground truth
3. **CLAUDE.md, DECISIONS.md** (95% trust) - Active architecture and decisions
4. **Feature branch code** (70% trust) - In progress, may change
5. **Active documentation** (70% trust) - May have drift from implementation
6. **Handoff memos** (50% trust) - Past AI context, may be stale
7. **Archived documents** (0% trust for current work) - Historical only,
   off-limits

**Core Principle:** Code is truth. Documentation describes intent. Always verify
claims against actual implementation.

---

### Document Dating

**Critical Issue:** Misdating is consistent in this project.

**Solution:** Use git modification dates, NOT content dates.

**Commands:**

```bash
# Check actual modification date
git log --follow -- <file>

# Find files modified after specific date
find . -name "*.md" -type f -newermt "2025-10-01"

# Check file history
git log --all --full-history -- <file>
```

**Rule:** Documents before 2025-10-01 are not relevant to current rebuild
efforts.

---

### Recommendation Checkpoint

**Before making ANY recommendation, answer these four questions:**

1. **Is this in current scope?** (Did user explicitly ask for this?)
2. **Is this in CHANGELOG.md recent entries?** (Did this actually happen?)
3. **Can I cite source?** (file:line reference available?)
4. **Am I reading active docs?** (Not archives, not stale planning docs?)

**If any answer is NO:** Do not recommend. Ask for clarification or execute only
what was requested.

---

## Discovery Protocol (Mandatory for New Sessions)

### Phase 1: Directory Structure

```bash
# 1. Full directory tree
find . -type d -maxdepth 2 | sort

# 2. Count markdown files
find . -name "*.md" -type f | wc -l

# 3. Find PHASE documentation
find . -name "*PHASE*.md"

# 4. Find ADRs
find . -name "ADR*.md"
grep -n "^## ADR-" DECISIONS.md
```

### Phase 2: Quality Metrics

```bash
# Find quality score mentions
grep -r "96%" . --include="*.md"
grep -r "97%" . --include="*.md"
grep -r "99%" . --include="*.md"

# Find completion claims
grep -r "COMPLETE" . --include="*.md"
grep -r "complete" . --include="*.md"
```

### Phase 3: Large Files

```bash
# Find large JSON files (potential chat histories)
find . -name "*.json" -size +1M

# Find recent modifications
find . -name "*.md" -type f -newermt "2025-10-01"
```

### Phase 4: Strategic Sampling

**For each major directory:**

- Read first 50 lines + last 20 lines
- If relevant, add to investigation list
- If not relevant, move on (don't read entire file)

**For large JSON files:**

- Check file size first
- Sample: first 500 + last 500 + every 10,000th line
- Use parallel agents for multiple files

**For documentation:**

- Check git modification date (NOT content dates)
- Read headers/summaries only
- Connect quality metrics to source files

---

## Quick Reference Commands

### Daily Commands

```bash
/test-smart          # Fast test feedback (~30s)
/fix-auto            # Auto-cleanup (2-3 min)
/deploy-check        # Pre-deployment validation
/log-change          # Document changes in CHANGELOG.md
/log-decision        # Document architectural decisions
/workflows           # Interactive decision trees
```

### Discovery Commands

```bash
# Check capabilities before implementing
cat CAPABILITIES.md

# Verify recent work
git log --since="2025-10-01" --oneline

# Find specific patterns
grep -r "pattern" . --include="*.ts"

# Check test status
npm test -- --project=server
npm test -- --project=client
```

---

## Session Handoff Template

When creating session handoff documents:

1. **Reference all four source files** (CAPABILITIES.md, PROJECT-PHOENIX,
   AI-WORKFLOW, COMPREHENSIVE-WORKFLOW)
2. **Document major initiatives** (anti-patterns, document review, NotebookLM)
3. **Include infrastructure changes** (new packages, scripts, cheatsheets)
4. **Verify against code** (don't claim completion without evidence)
5. **Archive immediately** to `archive/2025-q4/session-records/`

---

## For Next Session

### Checklist Before Starting Any Work

- [ ] Read this file (PROJECT-UNDERSTANDING.md)
- [ ] Read CAPABILITIES.md for existing solutions
- [ ] Check CHANGELOG.md for recent changes
- [ ] Review .claude/ANTI-DRIFT-CHECKLIST.md
- [ ] Run discovery protocol (directory tree, quality metrics)
- [ ] Verify no archives are being used for current context

### What NOT to Do

1. ❌ Don't read archived handoff memos for current context
2. ❌ Don't recommend tools without checking CHANGELOG.md first
3. ❌ Don't invent timelines (Q1/Q2 dates) without source
4. ❌ Don't treat agent analysis outputs as YOUR plan
5. ❌ Don't extrapolate from archived documents to current roadmap
6. ❌ Don't read entire files - use strategic sampling

---

**This document is the single source of truth for project understanding. Update
it whenever major infrastructure changes occur.**
