# Post-PR #318 Merge Validation & .claude Infrastructure Plan

**Date**: 2025-12-29
**Branch**: `claude/validate-pr-merge-cnRXX`
**Status**: DRAFT - Awaiting Approval

---

## Executive Summary

This plan addresses two priorities:
1. **P0 Immediate**: Validate PR #318 merge stability (Phase 2 Advanced Forecasting)
2. **P0 Critical**: Fix blocking .claude directory issues causing confusion

### Key Findings from Analysis

**Validated Claims**:
- [x] Agent duplication EXISTS: `workflow-engine/` and `wshobson/` subdirectories duplicate root agents
- [x] Emoji violations EXIST: 3 commands (deploy-check.md, workflows.md, fix-auto.md) contain emojis
- [x] `/log-change` and `/log-decision` commands MISSING (referenced in CLAUDE.md but don't exist)
- [x] phoenix-truth.md is COMPLIANT (no emojis in functional content)

**Test Environment Issue**:
- `cross-env` not found - test run blocked by sidecar/environment issue, not test failure
- Need to resolve environment before validating test counts

---

## Phase 1: Environment Fix & CI Validation (P0 - Immediate)

**Duration**: 15-30 minutes
**Goal**: Get tests running and verify PR #318 stability

### Step 1.1: Fix Test Environment (10 min)

```bash
# Check if cross-env is in sidecar or needs install
npm install cross-env --save-dev

# Verify npm modules
npm run doctor:quick
```

### Step 1.2: Run Tests (10-15 min)

```bash
# Full test suite
npm test

# Verify counts match CHANGELOG claims:
# - 129 truth cases across 6 modules
# - XIRR (50), Waterfall-tier (15), Waterfall-ledger (14)
# - Fees (10), Capital Allocation (20), Exit Recycling (20)
```

### Decision Gate

| Result | Action |
|--------|--------|
| PASS (all tests green) | Proceed to Phase 2 |
| FAIL (test failures) | Use /phoenix-truth to diagnose, triage before continuing |

---

## Phase 2: Critical .claude Directory Fixes (P0 - This Session)

**Duration**: 2-3 hours
**Goal**: Resolve blocking issues causing confusion/inefficiency

### 2.1: Eliminate Agent Duplication (45 min)

**Issue**: Agents duplicated in 3 locations with different content:
- `.claude/agents/code-reviewer.md` (root - project-specific with memory integration)
- `.claude/agents/workflow-engine/code-reviewer.md` (generic from claude-workflow-engine)
- `.claude/agents/wshobson/code-reviewer.md` (another generic version)

**Actions**:
1. **Keep**: Root-level agents (project-specific implementations)
2. **Delete**:
   - `.claude/agents/workflow-engine/` directory (4 files: security-engineer, typescript-pro, code-reviewer, test-automator)
   - `.claude/agents/wshobson/` directory (4 files: legacy-modernizer, typescript-pro, code-reviewer, test-automator)
3. **Document**: Update `CAPABILITIES.md` to clarify agent locations

**Rationale**: Root agents have project-specific memory integration and CLAUDE.md compliance. Subdirectory versions are generic templates that cause confusion.

### 2.2: Fix Emoji Violations in Commands (30 min)

**Issue**: 3 commands violate CLAUDE.md no-emoji policy

| File | Emojis Found | Replacement |
|------|--------------|-------------|
| deploy-check.md | `🟢🟡✅` | `PASS`, `WARN`, `[x]` |
| workflows.md | `🛠️🤖📋🗓️🎯📚💡🔗` | Text headers: `## Commands`, `## Agents`, etc. |
| fix-auto.md | `✅❌⏸️🎉⚠️` | `PASS`, `FAIL`, `SKIP`, `SUCCESS`, `WARN` |

**Pattern** (from compliant phoenix-truth.md):
```markdown
# Before (BAD)
🟢 Phase 1: Code Quality    PASS

# After (GOOD)
PASS - Phase 1: Code Quality
```

### 2.3: Create Missing Commands (1 hour)

**Issue**: `/log-change` and `/log-decision` referenced in CLAUDE.md but don't exist

**Create**: `.claude/commands/log-change.md`
```yaml
---
description: "Guided changelog entry for CHANGELOG.md"
argument-hint: "[type=feat|fix|chore] [description]"
allowed-tools: Read, Write, Edit
---
```

**Create**: `.claude/commands/log-decision.md`
```yaml
---
description: "Guided ADR entry for DECISIONS.md"
argument-hint: "[title]"
allowed-tools: Read, Write, Edit
---
```

### 2.4: Add YAML Frontmatter Consistency (30 min)

**Issue**: Some commands lack frontmatter, inconsistent metadata

**Template** (apply to all commands missing frontmatter):
```yaml
---
description: "Brief description"
argument-hint: "[optional args]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---
```

**Files needing frontmatter**:
- enable-agent-memory.md
- catalog-tooling.md
- session-start.md
- evaluate-tools.md

---

## Phase 3: Documentation Improvements (P1 - If Time Permits)

**Duration**: 2-3 hours
**Goal**: Improve discoverability and reduce confusion

### 3.1: Create Agent Directory Map (1 hour)

**File**: `.claude/AGENT-DIRECTORY.md`

**Content**:
```markdown
# Agent Directory (Canonical Locations)

## Project-Level Agents (.claude/agents/)
[List all 35+ agents with one-line descriptions]

## Archived/Deprecated Locations
- workflow-engine/ - DELETED (use root agents)
- wshobson/ - DELETED (use root agents)

## Agent Selection Guide
| Task Type | Primary Agent | Fallback |
|-----------|--------------|----------|
| Code review | code-reviewer | - |
| Phoenix validation | phoenix-truth-case-runner | /phoenix-truth |
| ...
```

### 3.2: Consolidate Test Agents Documentation (1 hour)

**Issue**: 6 overlapping test agents cause confusion
- test-repair
- test-automator
- test-scaffolder
- pr-test-analyzer
- playwright-test-author
- parity-auditor

**Create**: `.claude/docs/TEST-STRATEGY.md`
```markdown
# Test Agent Selection Guide

| Situation | Use Agent | Why |
|-----------|-----------|-----|
| Tests failing | test-repair | Diagnoses and fixes |
| New module needs tests | test-scaffolder | Creates infrastructure |
| PR test coverage review | pr-test-analyzer | Checks gaps |
| Browser-only behavior | playwright-test-author | E2E tests |
| Financial calc changes | parity-auditor | Excel parity |
| Comprehensive TDD | test-automator | Full coverage |
```

### 3.3: Update DISCOVERY-MAP.md (30 min)

**Add missing routing patterns**:
```yaml
| "log change" OR "changelog"    | /log-change command            | Update CHANGELOG.md |
| "log decision" OR "adr"        | /log-decision command          | Update DECISIONS.md |
| "db validate" OR "schema check"| schema-drift-checker agent     | Schema alignment |
```

---

## Phase 4: Skills Improvements (P2 - Future Sprint)

**Duration**: 4-6 hours
**Goal**: Better skill discovery and activation

### 4.1: Add Frontmatter to All Skills

**Issue**: 51 skill files, inconsistent metadata

**Template**:
```yaml
---
name: skill-name
category: testing|debugging|collaboration|thinking
triggers: [keywords that activate this skill]
auto_activate: true|false
---
```

### 4.2: Phoenix Skills Consolidation

**Create**: `.claude/skills/phoenix/README.md`

**Content**: Routing table for 9 Phoenix skills with decision tree

---

## Success Metrics

| Phase | Metric | Target |
|-------|--------|--------|
| Phase 1 | Tests passing | 100% (maintain 129 truth cases) |
| Phase 2.1 | Agent duplication | Zero (8 files removed) |
| Phase 2.2 | Emoji violations | Zero (3 commands fixed) |
| Phase 2.3 | Missing commands | Zero (2 commands created) |
| Phase 3 | Documentation coverage | Agent directory, test strategy |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Deleting agents breaks references | Search codebase for references first |
| Emoji removal breaks formatting | Use consistent text alternatives |
| Test environment issues | Prioritize cross-env fix |

---

## Not In Scope (Deferred)

1. **Phoenix Phase 3 Planning** - Deferred until Phase 1 validation passes
2. **Workflow Automation** - P2 priority, future sprint
3. **New Skills Creation** - P2 priority, after infrastructure stable
4. **Full skills frontmatter** - P2 priority, 51 files is significant work

---

## Execution Order

```
1. [IMMEDIATE] Fix cross-env / run tests
2. [IF PASS]   Delete duplicate agent directories
3. [THEN]      Fix emoji violations in 3 commands
4. [THEN]      Create /log-change and /log-decision
5. [THEN]      Add frontmatter to 4 commands
6. [IF TIME]   Documentation improvements
```

---

**Plan Author**: Claude Code Assistant
**Approval Required**: Yes - User must approve before implementation
