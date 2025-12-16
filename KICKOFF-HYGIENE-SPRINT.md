# Updog_restore Hygiene Sprint - Kickoff Prompt

**Date:** December 15, 2025 **Purpose:** Foundation stabilization before Phase 2
Monte Carlo validation **Duration:** 3-5 days (realistic estimate based on 8
worktrees)

---

## Context for Claude

You are starting a **Hygiene Sprint** for the Updog_restore project - a VC fund
modeling platform. This sprint focuses on codebase consolidation and baseline
establishment BEFORE starting Phase 2 (Monte Carlo validation).

### Project Overview

**What:** Web-based venture capital fund modeling platform with deterministic
calculations + Monte Carlo simulations **Tech Stack:** React/TypeScript
frontend, Node/Express backend, PostgreSQL, Vitest testing, Windows development
environment **Current Phase:** Phase 1B complete (XIRR 100%, Fees 10/10,
Waterfall 14/14), preparing for Phase 2

### Critical Context

**North Star:** Become the authoritative validation engine for VC fund modeling
with:

- Deterministic calculations reproducible across environments
- Probabilistic simulations with auditable, seed-controlled Monte Carlo
- 95%+ test coverage with documented acceptance criteria
- Zero infrastructure workarounds (Windows sidecar eventually eliminated)

**Non-Goals (Explicitly NOT doing right now):**

- ❌ UI/UX improvements
- ❌ New feature development
- ❌ Infrastructure experiments
- ❌ Documentation beyond current 96% quality

---

## Current State (VERIFIED FACTS)

### Repository Status

- **Worktrees:** 8 active worktrees (needs consolidation to 1-2)
- **Branch:** main (commit d1a9c263)
- **Untracked Files:**
  - `PROJECT-PHOENIX-COMPREHENSIVE-STRATEGY.md` (deprecated, needs archiving)
  - `auto-discovery/dev-automation/` (2 files: monitoring.ts, ui-enhancer.ts)
  - `dev-automation/` (likely duplicate of above)

### Test Status

- **Test Files:** 912+ test files found
- **Claimed Pass Rate:** 74.7% (998/1,337 tests) - needs verification
- **Phoenix Modules:** XIRR 51/51, Waterfall 29/29, Fees 10/10 (Phase 1B
  complete)

### Infrastructure

- **Windows Sidecar:** Active (see SIDECAR_GUIDE.md - 689 lines documenting
  junction architecture)
- **Package Manager:** npm (considering pnpm migration)
- **Node Version:** [verify on startup]

### Recent Work

- Capital Allocation Phase 1 (PRs #280, #279, #268, #266, #264 recently merged)
- XIRR Excel parity: 100% (51/51 tests, 94.1% Excel parity per CHANGELOG)
- Phase 2 Documentation: COMPLETE (all 4 engines documented in
  notebooklm-sources/)

---

## Essential Tools & Commands

### Must-Read Documentation (Priority Order)

1. **[CAPABILITIES.md](CAPABILITIES.md)** - Complete inventory of 250+ agents,
   28 skills, 59 MCP tools (READ FIRST!)
2. **[CLAUDE.md](CLAUDE.md)** - Core architecture, conventions, memory
   management
3. **[docs/PHOENIX-SOT/execution-plan-v2.34.md](docs/PHOENIX-SOT/execution-plan-v2.34.md)** -
   Current Phoenix execution plan
4. **[SIDECAR_GUIDE.md](SIDECAR_GUIDE.md)** - Windows sidecar architecture
   (critical for understanding dev environment)
5. **[docs/INDEX.md](docs/INDEX.md)** - Central documentation routing

### Critical Slash Commands

- `/phoenix-truth` - Run deterministic truth-case validation suite (119
  scenarios, 6 modules)
- `/test-smart` - Intelligent test selection based on file changes
- `/fix-auto` - Automated repair of lint/format/test failures
- `/deploy-check` - Pre-deployment validation

### Key NPM Scripts

```bash
npm test                    # Full test suite (both server + client)
npm run check               # TypeScript type checking
npm run phoenix:truth       # Truth-case validation (deterministic)
npm run doctor              # Sidecar health check
npm run doctor:links        # Verify junction integrity
```

### Specialized Agents (from CAPABILITIES.md)

- **waterfall-specialist** - Waterfall/carry calculations (handles ALL waterfall
  logic)
- **xirr-fees-validator** - XIRR and fee validation
- **phoenix-precision-guardian** - Precision/numeric drift detection
- **code-reviewer** - Code quality checking
- **systematic-debugging** - Mandatory for all debugging (NO FIXES WITHOUT ROOT
  CAUSE)

### Skills (auto-activating when relevant)

- **systematic-debugging** - Four-phase framework (activates automatically)
- **test-driven-development** - RED-GREEN-REFACTOR cycle
- **verification-before-completion** - Evidence before assertions (activates
  before claiming "done")
- **brainstorming** - Socratic design refinement (use for unclear requirements)

---

## Your Mission: Hygiene Sprint Execution

### Immediate Objectives (Next Session)

**Step 0: Worktree Reconciliation (30 min)**

- Run `git worktree list` to document all 8 worktrees
- Identify which worktrees contain:
  - Capital Allocation work
  - XIRR precision fixes
  - Active feature development
  - Stale/abandoned work
- Decision: Merge, defer, or delete each worktree
- Goal: Reduce to 1-2 active worktrees

**Step 1: Read-Only Baseline (30 min)**

- Run `npm run check` (verify TypeScript compiles)
- Run `npm test` (capture current pass rate)
- Run `npm run phoenix:truth` (verify Phoenix modules)
- Check dev-automation usage:
  `grep -E "dev-automation|auto-discovery" package.json`
- **CRITICAL:** Do NOT modify any files yet - this is pure observation

**Step 2: Safe Quarantine (20 min)**

- Move (don't delete!) experimental code to `_deprecated/2025-12-prototypes/`
- Archive `PROJECT-PHOENIX-COMPREHENSIVE-STRATEGY.md` to
  `docs/archive/phoenix/v3.0/`
- Git track all moves (no `rm -rf` - everything must be recoverable)

**Step 3: Regression Check (20 min)**

- Re-run all checks from Step 1
- Compare results (any differences = regression)
- Only commit if NO regressions detected

### Success Criteria (End of Session)

✓ All 8 worktrees documented ✓ Baseline established (tests, Phoenix suite, type
check) ✓ Experimental code quarantined (not deleted) ✓ Deprecated docs archived
✓ NO regressions introduced ✓ Ready for next session (worktree consolidation)

---

## Critical Safety Rules

### DO NOT:

- ❌ Use `rm -rf` on untracked files (irreversible)
- ❌ Run tests/validation AFTER modifying files (baseline must be BEFORE)
- ❌ Merge worktrees without testing each one first
- ❌ Start Phase 2 work until hygiene complete
- ❌ Skip the `/phoenix-truth` baseline (it's our source of truth)

### ALWAYS:

- ✅ Read CAPABILITIES.md FIRST (avoid reinventing existing tools)
- ✅ Use quarantine (`_deprecated/`) instead of deletion
- ✅ Establish baseline BEFORE any modifications
- ✅ Git track all moves (enable rollback)
- ✅ Use `npm run phoenix:truth` (not `/phoenix-truth` in bash - that's a Claude
  slash command)
- ✅ Verify with `npm run check` after any file moves

---

## Phase 2 Blockers (DO NOT START until complete)

Phase 2 (Monte Carlo validation) is **blocked** until:

1. ✓ Worktrees consolidated to ≤2
2. ✓ Global test pass rate >= 90% (from current ~75%)
3. ✓ Phase 2 acceptance criteria documented (see execution-plan-v2.34.md)
4. ✓ Baseline snapshot tagged (reproducible environment)
5. ✓ Agent memory sanitized (deprecated Phoenix v3.0 patterns removed)

**Estimated Timeline:**

- Hygiene Sprint: 3-5 days (8 worktrees is significant integration debt)
- Foundation Hardening: 3-5 days (test repair to 90%+)
- Phase 2 Preflight: 1-2 days (acceptance criteria)
- **Total before Phase 2:** 7-12 days

---

## How to Use This Kickoff

### Recommended First Actions

1. **Read CAPABILITIES.md** (mandatory - check for existing solutions)
2. **Run worktree inventory:** `git worktree list`
3. **Verify baseline:** `npm test && npm run phoenix:truth`
4. **Ask clarifying questions** if anything is ambiguous

### If You Encounter Issues

- **Test failures:** Use `/fix-auto` or systematic-debugging skill
- **Worktree conflicts:** Use code-reviewer agent per worktree
- **Phoenix failures:** Route to waterfall-specialist or xirr-fees-validator
- **Type errors:** Check recent Capital Allocation PRs (#280, #279)
- **Sidecar issues:** Run `npm run doctor:links`

### Decision Points You'll Face

**Question 1:** Should we consolidate worktrees now or after baseline?
**Recommendation:** After baseline - need clean measurement first

**Question 2:** Merge or delete stale worktrees? **Recommendation:** Merge if <
30 days old, delete if abandoned

**Question 3:** Keep or remove dev-automation code? **Recommendation:**
Quarantine to `_deprecated/` - can restore if needed

---

## Expected Outcomes

**By End of Hygiene Sprint:**

- Single main branch (or main + 1 active feature)
- Clean root directory (no untracked experimental code)
- Reproducible baseline (tagged commit + environment docs)
- Test pass rate measured and documented
- Ready to start Foundation Hardening (test repair to 90%+)

**By End of Foundation Hardening:**

- Test pass rate >= 90%
- All invariant violations documented
- Phase 2 acceptance criteria written
- Monte Carlo seed control architecture designed

**By Phase 2 Start:**

- Codebase consolidated and stable
- Validation infrastructure proven
- Statistical acceptance criteria agreed
- Ready for 2-week Monte Carlo implementation sprint

---

## Final Context

This is NOT a "quick cleanup" - this is **foundation work** that enables
everything else. The 8 worktrees represent integration debt that MUST be paid
before attempting Phase 2 probabilistic validation.

**Philosophy:** Hygiene-first, validation-second, features-third.

**Attitude:** Professional, evidence-based, no shortcuts.

**Goal:** Build the authoritative VC fund modeling validation engine.

---

## Quick Reference Card

```bash
# Essential commands for this sprint
git worktree list                    # Show all worktrees
npm test                             # Full test suite
npm run phoenix:truth                # Truth-case validation
npm run check                        # TypeScript check
npm run doctor:links                 # Sidecar health
grep -r "dev-automation" package.json  # Check usage

# Critical files
CAPABILITIES.md                      # Tool inventory (READ FIRST!)
CLAUDE.md                            # Core architecture
SIDECAR_GUIDE.md                     # Windows environment
docs/PHOENIX-SOT/execution-plan-v2.34.md  # Phoenix plan
CHANGELOG.md                         # Recent changes

# Specialized agents (via Task tool)
waterfall-specialist                 # Waterfall logic
xirr-fees-validator                  # XIRR/fees
phoenix-precision-guardian           # Precision issues
code-reviewer                        # Code quality
systematic-debugging                 # Debugging (mandatory)
```

---

**Ready to begin the Hygiene Sprint. Start by reading CAPABILITIES.md, then
document the 8 worktrees.**
