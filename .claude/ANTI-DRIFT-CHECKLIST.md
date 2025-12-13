# Anti-Drift Checklist - Session Protocol

**Purpose:** Mandatory checklist for all sessions to prevent AI context drift,
hallucination, and gap analysis failures

**Last Updated:** 2025-11-10

---

## PRE-SESSION: Complete Discovery (MANDATORY)

**Before analyzing or answering ANY questions, complete this discovery
protocol:**

### 1. Read Project Understanding

```
- [ ] Read .claude/PROJECT-UNDERSTANDING.md (complete infrastructure reference)
- [ ] Read CAPABILITIES.md (check-first discovery, 85% complete infrastructure inventory)
- [ ] Read CHANGELOG.md recent entries (last 2 weeks minimum)
- [ ] Check git status for current branch and modified files
```

### 2. Directory Structure Discovery

```bash
# Run these commands to understand project organization
- [ ] find . -type d -maxdepth 2 | sort
- [ ] find . -name "*.md" -type f | wc -l
- [ ] find . -name "*PHASE*.md"
- [ ] find . -name "ADR*.md"
- [ ] grep -n "^## ADR-" DECISIONS.md
```

### 3. Quality Metrics Archaeology

```bash
# Connect all quality metrics to source files
- [ ] grep -r "96%" . --include="*.md"
- [ ] grep -r "97%" . --include="*.md"
- [ ] grep -r "99%" . --include="*.md"
- [ ] grep -r "COMPLETE" . --include="*.md"
```

**For each metric found:**

- WHERE is the evidence? (file path)
- WHEN was it created? (git log --follow)
- WHAT was delivered? (read first 50 lines)

### 4. Large File Detection

```bash
# Find potential chat histories and large documentation
- [ ] find . -name "*.json" -size +1M
- [ ] find . -name "*.md" -size +100k
```

**Sampling strategy for large files:**

- First 500 lines + last 500 lines
- Sample every 10,000th line from middle
- Use parallel agents for multiple large files

### 5. Recent Modifications

```bash
# Find work done after 2025-10-01 (rebuild start)
- [ ] find . -name "*.md" -type f -newermt "2025-10-01"
- [ ] git log --since="2025-10-01" --oneline | head -20
```

**Critical Rule:** Use git modification dates, NOT content dates (misdating is
consistent in this project)

---

## DURING WORK: Scope and Verification

### Scope Management

```
- [ ] Am I working on what the user explicitly requested?
- [ ] Have I checked CAPABILITIES.md for existing solutions?
- [ ] Am I using strategic sampling (not reading entire files)?
- [ ] Am I staying within the current branch scope?
```

### Archive Barrier (CRITICAL)

```
- [ ] Am I reading from archive/ directory?
- [ ] If YES: Did user explicitly request archived content?
- [ ] If NO to user request: STOP and use active docs only
```

**Default rule:** Treat `archive/` (662 files) as off-limits unless explicitly
requested

### Source of Truth Hierarchy

```
When making claims, use this trust hierarchy:

1. CHANGELOG.md (100% trust) - Timestamped changes
2. Committed code (100% trust) - Implementation reality
3. CLAUDE.md, DECISIONS.md (95% trust) - Active architecture
4. Feature branch code (70% trust) - In progress
5. Active documentation (70% trust) - May have drift
6. Handoff memos (50% trust) - Past AI context
7. Archived documents (0% trust) - Historical only
```

### Recommendation Checkpoint

```
Before making ANY recommendation, answer:

- [ ] Is this in current scope? (Did user ask for this?)
- [ ] Is this in CHANGELOG.md recent entries? (Did this happen?)
- [ ] Can I cite source? (file:line reference available?)
- [ ] Am I reading active docs? (Not archives, not stale plans?)

If ANY answer is NO: Do not recommend. Ask for clarification.
```

---

## DURING CODING: Quality Gates

### Anti-Pattern Prevention (ADR-011)

```
Before writing code:

- [ ] Have I reviewed cheatsheets/anti-pattern-prevention.md?
- [ ] Am I using TDD (test-driven-development skill)?
- [ ] Have I checked the 24 anti-pattern catalog?
- [ ] Will this code have idempotency? (if mutating state)
- [ ] Will this code have optimistic locking? (if updating data)
- [ ] Will this code have proper timeout/DLQ? (if using BullMQ)
```

### TDD Cycle (Mandatory for Features)

```
- [ ] Write failing test FIRST (RED)
- [ ] Implement minimal code to pass (GREEN)
- [ ] Refactor with tests passing (REFACTOR)
- [ ] Run /test-smart after each change
```

### Code in Small Cycles

```
- [ ] Working in 10-20 line cycles
- [ ] Running /test-smart after each cycle
- [ ] Committing logical chunks (not massive changesets)
```

---

## BEFORE COMPLETION: Verification (MANDATORY)

### Evidence-Based Verification (ADR-012)

```
Never claim "complete" or "fixed" without showing evidence:

- [ ] Run actual verification commands (don't just describe)
- [ ] Show actual output from tests/builds
- [ ] Verify git status reflects expected changes
- [ ] Check no unintended files modified
```

### Verification Commands

```bash
# Before claiming tests pass
- [ ] npm test -- --project=server
- [ ] npm test -- --project=client

# Before claiming build succeeds
- [ ] npm run build

# Before claiming quality passes
- [ ] npm run lint
- [ ] npm run check (TypeScript)

# Before claiming deployment ready
- [ ] /deploy-check
```

### Anti-Pattern Compliance Check

```
If code was written:

- [ ] Zero violations of 24 anti-pattern catalog
- [ ] All mutations have idempotency
- [ ] All updates use optimistic locking (version field)
- [ ] All cursors validated
- [ ] All queue jobs have timeouts
```

---

## POST-WORK: Documentation and Handoff

### Update Project Memory

```
- [ ] Update CHANGELOG.md with what was actually done
- [ ] Update DECISIONS.md if architectural decision made
- [ ] Create cheatsheet if new pattern established
```

### Session Handoff (if significant work)

```
- [ ] Create SESSION-HANDOFF-YYYY-MM-DD.md
- [ ] Include all major initiatives context
- [ ] Reference all four source files (PROJECT-UNDERSTANDING, CAPABILITIES, PROJECT-PHOENIX, AI-WORKFLOW)
- [ ] Document any new discoveries
- [ ] Archive immediately to archive/2025-q4/session-records/
```

### Verification Before Handoff

```
- [ ] No fabricated timelines mentioned
- [ ] No fabricated tools mentioned
- [ ] All claims have file:line citations
- [ ] All metrics connected to source files
```

---

## STRATEGIC SAMPLING: How to Read Large Files

### For Documentation (\*.md files)

```
DO:
- Read first 50 lines (header, summary, TOC)
- Read last 20 lines (conclusion, status)
- Search for specific keywords
- Check git log for modification date

DON'T:
- Read entire 500+ line files
- Assume content dates are accurate
- Read archived documents without explicit request
```

### For Large JSON Files (chat histories)

```
DO:
- Check file size first
- Sample: first 500 + last 500 + every 10,000th line
- Use parallel agents for multiple files
- Extract major topics/initiatives only

DON'T:
- Attempt to read entire multi-MB files
- Trust token limits without checking
```

### For Code Files (_.ts, _.tsx)

```
DO:
- Read headers and exports first
- Use grep for specific patterns
- Check tests to understand behavior
- Verify against CHANGELOG for recent changes

DON'T:
- Read entire large implementation files
- Assume understanding without running tests
```

---

## THREE MAJOR QUALITY INITIATIVES (Must Understand)

### 1. Anti-Pattern Prevention (ADR-011)

```
- [ ] I understand the 24 cataloged anti-patterns
- [ ] I understand the 4-layer quality gate system
- [ ] I know zero tolerance enforcement is mandatory
- [ ] Reference: DECISIONS.md ADR-011, cheatsheets/anti-pattern-prevention.md
```

### 2. Document Review Protocol (ADR-012)

```
- [ ] I understand the 5-step verification framework
- [ ] I know "Code is truth, documentation describes intent"
- [ ] I will verify all claims against committed code
- [ ] Reference: CLAUDE.md, cheatsheets/document-review-workflow.md
```

### 3. NotebookLM Documentation Strategy

```
- [ ] I understand Phase 1 deliverables (5 modules, 5,848 lines, 96-97% quality)
- [ ] I understand Phase 2 deliverables (4 engines, 238 pages, 95-99% quality)
- [ ] I understand truth-case-first methodology
- [ ] Reference: docs/notebooklm-sources/, notebooklm-upload/
```

---

## COMPLETE INFRASTRUCTURE INVENTORY (Must Know)

### Packages

```
- [ ] 3 production: agent-core, test-repair-agent, memory-manager
- [ ] 5 experimental: codex-review-agent, multi-agent-fleet, 4 optimization agents
- [ ] 3 archived: backtest-framework, bmad-integration, zencoder-integration
- [ ] 15+ total (including TypeScript, project, user, marketplace levels)
```

### Scripts

```
- [ ] 250+ scripts across 13 categories
- [ ] Major categories: ai/, ai-tools/, ci/, validation/, wip-cases/
- [ ] Root utilities: extended thinking, documentation automation, stage normalization
```

### Cheatsheets

```
- [ ] 27 cheatsheets (7 created post-Oct 1)
- [ ] Key guides: anti-pattern-prevention, document-review-workflow, agent-architecture
```

### Archive

```
- [ ] 662 files organized by date/quarter
- [ ] Detailed manifests with rollback instructions
- [ ] OFF-LIMITS unless explicitly requested
```

---

## COMMON FAILURE PATTERNS (Avoid These)

### Gap Analysis Failures

```
SYMPTOM: Missing major initiatives like NotebookLM strategy
ROOT CAUSE: Never explored subdirectories systematically
PREVENTION: Run discovery protocol FIRST, read PROJECT-UNDERSTANDING.md
```

### Hallucination Patterns

```
SYMPTOM: Claiming features are "missing" without checking code
ROOT CAUSE: Trusting old planning docs without verification
PREVENTION: Follow ADR-012, verify against committed code
```

### Context Drift

```
SYMPTOM: Recommending tools/timelines not in CHANGELOG
ROOT CAUSE: Reading archived documents or stale plans
PREVENTION: Archive barrier, source of truth hierarchy
```

### Attention to Detail

```
SYMPTOM: Seeing "96-97% quality" but not investigating source
ROOT CAUSE: Treating metrics as abstract evidence
PREVENTION: Connect all metrics to actual deliverable files
```

---

## QUICK REFERENCE: Four Source Files

**Read these in order before starting any work:**

1. **PROJECT-UNDERSTANDING.md** - This reference guide (complete infrastructure)
2. **CAPABILITIES.md** - Check-first discovery (85% complete inventory)
3. **docs/PHOENIX-SOT/execution-plan-v2.34.md** - Phoenix validation-first
   execution plan (current)
   _(Note: PROJECT-PHOENIX-COMPREHENSIVE-STRATEGY.md archived - see docs/archive/phoenix/)_
4. **AI-WORKFLOW-COMPLETE-GUIDE.md** - 28 agents, orchestration patterns

---

## CHECKLIST VERIFICATION

Before claiming this checklist is complete:

```
- [ ] I have run ALL discovery commands
- [ ] I have read all four source files
- [ ] I understand all three major quality initiatives
- [ ] I know the complete infrastructure inventory
- [ ] I will not read archives without explicit request
- [ ] I will verify all claims against committed code
- [ ] I will use strategic sampling (not full reads)
- [ ] I will follow the 4-layer quality gates if coding
- [ ] I will run verification commands before claiming completion
```

---

**This checklist is mandatory for all sessions. Failure to follow this protocol
leads to context drift, hallucination, and incomplete gap analysis.**
