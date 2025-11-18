# Session Handoff - Fresh Context for Continuation

**Date**: 2025-11-09 **Branch**: `feat/portfolio-lot-moic-schema` **Purpose**:
Provide clean context for new sessions without stale archived information

---

## What This Session Covered

### Primary Topic: Document Review Protocol & Archive Access

**Key Learnings**:

1. **Archive Access Rule**: Never use `archive/` directory for current context
   unless explicitly asked
2. **CHANGELOG.md is Source of Truth**: Use CHANGELOG.md for "what actually
   happened," not handoff memos
3. **Document Review Protocol**: ADR-012 exists to prevent reviewing stale
   planning documents
4. **Correction Pattern**: When AI recommends tools/timelines not in CHANGELOG,
   challenge immediately

### What Was Corrected

- **Fabricated timelines**: "Q1 2026 pnpm migration" and "Q2 2026 Dev
  Containers" were not real
- **Docker recommendations**: Not in recent CHANGELOG, not a current constraint
- **Phase 0 portfolio work**: Those docs were archived TODAY as
  completed/obsolete
- **Reading archived memos**: SESSION-HANDOFF-2025-11-09.md was in archive,
  shouldn't be used for current context

---

## Current Project State (from CHANGELOG.md)

### Recent Work (2025-11-09)

**Documentation Consolidation**:

- Archived 4 session handoff memos to `archive/2025-q4/session-records/`
- Deleted 1 duplicate: HANDOFF-PHASE3-COMPACTION.md
- Retained 3 active docs: HANDOFF-PORTFOLIO-PHASE0-COMPLETE.md,
  PORTFOLIO-SCHEMA-MIGRATION-ANALYSIS.md, MIGRATION-QUICK-START.md
- Rationale: Session snapshots document past events and should be archived

### Earlier Work (Past 2 Weeks)

**Week 1 (Nov 4-6)**:

- Memory integration for 28 agents
- Multi-AI workflow guide
- Agent memory cheatsheets

**Week 2 (Oct 28-Nov 4)**:

- Documentation quality validation framework
- Extended thinking integration
- Monte Carlo fixes (stage normalization bug)

**Week 3 (Oct 19-28)**:

- Test infrastructure (Vitest multi-project fix)
- Phase documentation
- CI/CD rationalization

---

## Available Capabilities

### Quick Reference

**BEFORE STARTING ANY TASK**: Check CAPABILITIES.md for existing solutions

### 250+ Agents Across 3 Levels

**User-Level (15 agents)** - Available across ALL projects

- Location: `~/.claude/agents/`
- Examples: architect-review, database-admin, docs-architect, test-automator

**Project-Level (22 agents)** - Updog_restore specific

- Location: `.claude/agents/`
- Examples: waterfall-specialist (CRITICAL for VC calculations), test-repair,
  perf-guard

**Marketplace (200+ agents)** - Via plugins

- Location: `~/.claude/plugins/marketplaces/`
- Examples: api-scaffolding, security-comprehensive, kubernetes-operations

**See**: [CAPABILITIES.md](CAPABILITIES.md) for complete inventory

---

## Agent Architecture (3-Tier System)

### Level 1: User-Level Agents

- **Scope**: Available across ALL projects
- **Use for**: Cross-project tools, infrastructure specialists, general
  development helpers
- **When to create**: Agent useful across multiple projects

### Level 2: Project-Level Agents

- **Scope**: Only for this project (Updog_restore)
- **Use for**: Domain-specific agents, project conventions, custom quality gates
- **When to create**: Agent tied to specific domain (venture capital modeling)

### Level 3: Marketplace Agents

- **Scope**: Available via plugin system globally
- **Use for**: Industry-standard patterns, platform specialists, security tools
- **When to use**: Need industry-standard patterns, don't want to maintain
  custom agents

**Override Behavior**: Project agents override user agents with the same name

**See**: [cheatsheets/agent-architecture.md](cheatsheets/agent-architecture.md)
for complete guide

---

## Key Workflows (from AI-WORKFLOW-COMPLETE-GUIDE.md)

### 28 Specialized Agents by Category

**Testing & Quality (7)**: test-automator, test-repair, code-reviewer,
comment-analyzer, type-design-analyzer, silent-failure-hunter, pr-test-analyzer

**Domain Specialists (2)**: waterfall-specialist (CRITICAL - mandatory for VC
calculations), cohort-specialist

**Architecture & Planning (4)**: architect-review, code-explorer, dx-optimizer,
legacy-modernizer

**Database (3)**: db-migration, database-expert, database-admin

**Infrastructure (3)**: incident-responder, devops-troubleshooter,
chaos-engineer

**Documentation (2)**: docs-architect (8 agents -> 2,400 lines in 45 min),
debug-expert

**General Purpose (4)**: general-purpose, context-orchestrator,
knowledge-synthesizer, code-simplifier

**Performance & Security (3)**: perf-guard, security-comprehensive,
accessibility-compliance

### 28 Superpowers Skills

**Auto-activating skills**:

- **test-driven-development**: Activates during feature implementation
  (RED-GREEN-REFACTOR)
- **systematic-debugging**: Activates when debugging (NO FIXES WITHOUT ROOT
  CAUSE FIRST)
- **verification-before-completion**: Activates before claiming work done

**Collaboration**: brainstorming, writing-plans, executing-plans,
dispatching-parallel-agents

**Thinking**: inversion-thinking, analogical-thinking, pattern-recognition,
extended-thinking-framework

**Memory**: memory-management, continuous-improvement

**See**: [AI-WORKFLOW-COMPLETE-GUIDE.md](AI-WORKFLOW-COMPLETE-GUIDE.md) for
complete workflow patterns

### Orchestration Modes

**Mode 1: PARALLEL INDEPENDENT (87-91% savings)**

- Use for: Documentation, batch operations, independent modules
- Example: 8 docs-architect agents -> 45 min vs 5.5 hours

**Mode 2: SEQUENTIAL WITH GATES (30-50% savings)**

- Use for: High-risk changes, new features with dependencies
- Example: Architecture -> (gate) -> Implement -> (gate) -> Test

**Mode 3: HYBRID PIPELINE (50-75% savings)**

- Use for: PR reviews, deployment prep, refactoring
- Example: Parallel research -> Sequential fixes -> Parallel cleanup

---

## Hard Constraints (Learned This Session)

### Archive Access Rule

**NEVER use archived documents (`archive/` directory) for current project
context unless:**

1. You explicitly ask me to check archives for incorrectly removed files, OR
2. You explicitly ask me to gain historical context, OR
3. You explicitly reference an archived file

**Default behavior**: Treat `archive/` as off-limits

### Document Review Protocol (ADR-012)

When reviewing planning documents:

1. **Classify document type**: PLAN (future) vs STATUS (present) vs REFERENCE
   (timeless)
2. **Check timestamp**: Plans >24h old require execution verification
3. **Verify claims**: Never report "missing" without code-level proof
4. **Git log search**: `git log --since=<doc-date>` for evidence
5. **Clarify ambiguity**: Ask if theoretical review or reality check

**Core Principle**: Code is truth. Documentation describes intent.

### Source of Truth Hierarchy

1. **CHANGELOG.md** (100% trust) - What actually happened, with timestamps
2. **Committed code** (100% trust) - Current implementation reality
3. **CLAUDE.md, DECISIONS.md** (95% trust) - Active architecture and decisions
4. **Feature branch code** (70% trust) - In progress, may change
5. **Active documentation** (70% trust) - May have drift
6. **Handoff memos** (50% trust) - Past AI context, may be stale
7. **Archived documents** (0% trust for current work) - Historical only

### Before Making Recommendations

**CHECKPOINT**: Am I about to recommend something outside stated scope?

Questions to ask myself:

1. Is this in the current task scope? (Y/N)
2. Did user explicitly ask for this? (Y/N)
3. Is this in CHANGELOG.md recent entries? (Y/N)
4. Can I cite where this was requested? (file:line)

**If any answer is NO**: Do not recommend, just execute current task or ask for
clarification

---

## Project Architecture (Quick Reference)

### Tech Stack

**Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Shadcn/ui **Backend**:
Node.js, Express, PostgreSQL (Neon), Redis (memory://), BullMQ **Shared**:
Drizzle ORM, Zod validation **Testing**: Vitest (multi-project: server + client)

### Key Engines (client/src/core/)

- **ReserveEngine**: Reserve allocation calculations
- **PacingEngine**: Investment pacing analysis
- **CohortEngine**: Cohort-based portfolio analytics

### Domain Patterns

- Waterfall types: AMERICAN vs EUROPEAN (client/src/lib/waterfall.ts)
- Use `applyWaterfallChange()` and `changeWaterfallType()` for waterfall updates
- Always use waterfall-specialist agent for VC carry calculations

---

## Daily Commands

```bash
/test-smart      # Fast test feedback (~30s)
/fix-auto        # Auto-cleanup (2-3 min)
/log-change      # Document changes in CHANGELOG.md
/log-decision    # Document architectural decisions
/workflows       # Interactive decision trees
```

---

## For Next Session

### How to Use This Handoff

1. **Read this file FIRST** for current context
2. **Check CHANGELOG.md** for most recent changes
3. **Reference CAPABILITIES.md** before implementing anything new
4. **Follow archive access rule** - never use `archive/` unless explicitly asked

### What NOT to Do

1. ❌ Don't read archived handoff memos for current context
2. ❌ Don't recommend tools (Docker, pnpm, WSL2) without checking CHANGELOG.md
   first
3. ❌ Don't invent timelines (Q1/Q2 dates) without source
4. ❌ Don't treat agent analysis outputs as YOUR plan
5. ❌ Don't extrapolate from archived documents to current roadmap

### Quick Checks

Before starting any task:

- [ ] Have I checked CAPABILITIES.md for existing solutions?
- [ ] Is this request in CHANGELOG.md or committed code?
- [ ] Am I reading active docs (not archived)?
- [ ] Have I followed Document Review Protocol (ADR-012)?

---

## Session Metadata

**Token Usage**: ~166k/200k (83% used in this session) **Key Topics**: Archive
access, document review protocol, source of truth hierarchy **Outcome**:
Established clear rules for future sessions to prevent stale context drift

**Files Referenced** (all active, non-archived):

- cheatsheets/agent-architecture.md
- CAPABILITIES.md
- AI-WORKFLOW-COMPLETE-GUIDE.md
- CHANGELOG.md
- CLAUDE.md
- DECISIONS.md

**Archive Created**: `archive/2025-q4/session-records/` (contains old handoff
memos)

---

**Last Updated**: 2025-11-09 **Next Session**: Start by reading this handoff +
CHANGELOG.md for current state
