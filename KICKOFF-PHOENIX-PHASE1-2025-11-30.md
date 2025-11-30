# Phoenix v3.0 Phase 1 Kickoff Prompt

**Copy this entire prompt into your next Claude Code session to continue Phoenix
v3.0 Phase 1 execution.**

---

## Context Loading

I'm continuing Phoenix v3.0 execution from Phase 0 (completed 2025-11-30). Phase
0 established ground zero baseline with TypeScript errors locked at 452 and test
pass rate at 74.2%. All baseline containment systems are operational.

**Read these documents in order**:

1. `HANDOFF-PHOENIX-PHASE1-2025-11-30.md` - Complete Phase 0 summary & Phase 1
   context
2. `runbooks/phoenix-execution.md` - Phase 1 execution steps (lines 142-192)
3. `docs/strategies/PHOENIX-PLAN-2025-11-30.md` - Phoenix v3.0 strategy

---

## Phase 1 Objective

Execute **Phase 1 - Feature Delivery** with two parallel tracks:

### Track 1: IA Consolidation - Modern Portfolio Shell

Create unified portfolio experience at `/portfolio-modern` that:

- Reuses existing portfolio components
- Integrates MOIC views in one coherent shell
- Reduces route sprawl toward 5 core shells (Overview, Portfolio, Model,
  Operate, Report)

### Track 2: Wizard Step 4 - Fees & Expenses

Extend modeling wizard with Fees & Expenses step:

- Integrate into wizard flow: Fund → Sector → Allocations → **Fees & Expenses**
- Connect to existing fund modeling context
- Validate fee inputs with proper form state

---

## Critical Operating Principles

**Baseline Acceptance (ADR-014)**:

- Current 452 TS errors are **known technical debt**
- New errors beyond baseline will **fail CI**
- Test failures within 269 baseline are **acceptable**
- **Do NOT** pause features to fix baseline errors

**Phoenix v3.0 Doctrine**:

1. Code is truth - measure, don't assume
2. Baseline before heroics - prevent regression, not perfection
3. Features first - infra NEVER blocks delivery
4. Validation before migration - prove value before committing

---

## Starting Workflow

**Before any work**, execute this checklist using Superpowers skills:

```bash
# 1. Invoke mandatory skill
/using-superpowers

# 2. Verify git state
git status
git log --oneline -5

# 3. Confirm baseline unchanged
npm run baseline:progress

# 4. Check CAPABILITIES.md for existing solutions
# CRITICAL: Read CAPABILITIES.md before creating any todos!

# 5. Create Phase 1 feature branch
git checkout main
git pull origin main
git checkout -b phoenix/phase-1-ia-portfolio  # or phoenix/phase-1-wizard-fees
```

---

## Phase 1 Implementation Plan

### Step 1: Choose Your Track

**Option A - IA Consolidation (Recommended First)**:

- Faster to deliver
- Highly visible user-facing improvement
- Lower technical risk

**Option B - Wizard Step 4**:

- Extends existing wizard flow
- Requires understanding wizard state management
- Medium technical complexity

**Option C - Both in Parallel** (Advanced):

- Use separate branches
- Switch between tracks with `git checkout`
- Merge incrementally

### Step 2: Read Execution Runbook

Navigate to `runbooks/phoenix-execution.md` and read:

- **Lines 142-192**: Phase 1 detailed steps
- Follow checklist exactly as written
- Use TodoWrite tool to track progress

### Step 3: Apply TDD & Quality Gates

**BEFORE writing implementation**:

```bash
# Invoke test-driven-development skill
/test-driven-development

# Write failing test FIRST
# Then implement feature
# Then verify test passes
```

**AFTER completing logical chunk**:

```bash
# Run verification
npm run check          # No new TS errors
/test-smart           # Run affected tests
/verification-before-completion  # Mandatory skill

# Log changes
/log-change           # Update CHANGELOG.md
```

### Step 4: Create PR When Track Complete

```bash
# Commit all changes
git add .
git commit -m "feat(phoenix): <track-name> implementation

- Detailed description of changes
- Key files modified
- Tests added/updated

Part of Phoenix v3.0 Phase 1 - Feature Delivery

Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push branch
git push -u origin phoenix/phase-1-<track-name>

# Create PR
gh pr create --title "feat(phoenix): Phase 1 - <Track Name>" --body "$(cat <<'EOF'
## Summary
Phoenix v3.0 Phase 1 - <Track Name>

- [x] Feature implementation complete
- [x] Tests passing (≥73.7% pass rate)
- [x] No new TS errors (baseline: 452)
- [x] Changes logged in CHANGELOG.md

## Changes
- Key file changes listed here

## Test Plan
- Manual testing steps
- Automated test coverage

## References
- Strategy: docs/strategies/PHOENIX-PLAN-2025-11-30.md
- Runbook: runbooks/phoenix-execution.md (Phase 1)
- Baseline: ADR-014 in DECISIONS.md

Generated with Claude Code
EOF
)"
```

---

## Troubleshooting

### If Baseline Check Fails

```bash
# Check what changed
npm run baseline:progress

# If NEW errors appeared beyond 452:
# Option 1: Fix the new errors
# Option 2: Revert changes that introduced them

# If baseline count is correct (452):
# Verify CI is using latest baseline
git diff .tsc-baseline.json
```

### If Tests Fail Beyond Baseline

```bash
# Acceptable: 269 baseline failures
# Unacceptable: NEW failures beyond baseline

# Check test diff
npm test 2>&1 | tee current-test-run.txt
diff test-baseline-2025-11-30.txt current-test-run.txt

# If new failures:
# Fix them before merging
```

### If Pre-Push Hook Hangs

```bash
# Pre-push runs full test suite (3-5 min)
# If stuck >10 min and baseline unchanged:
git push --no-verify
```

---

## Success Criteria Checklist

Phase 1 track is complete when ALL true:

**Code Quality**:

- [ ] `npm run check` passes (no NEW TS errors beyond 452)
- [ ] Test pass rate ≥ 73.7%
- [ ] No anti-patterns introduced (check
      `cheatsheets/anti-pattern-prevention.md`)
- [ ] Code follows conventions in CLAUDE.md

**Feature Delivery**:

- [ ] Feature works in `npm run dev`
- [ ] Navigation updated (if applicable)
- [ ] Existing functionality not broken
- [ ] User-facing improvements documented

**Documentation**:

- [ ] Changes logged in CHANGELOG.md
- [ ] PR description complete with test plan
- [ ] Any new patterns documented in cheatsheets/

**Git State**:

- [ ] All changes committed
- [ ] Branch pushed to remote
- [ ] PR created with proper labels
- [ ] CI passing on PR branch

---

## Available Tools & Skills

**Custom Slash Commands**:

```bash
/test-smart              # Intelligent test selection
/fix-auto               # Automated repair
/deploy-check           # Pre-deployment validation
/workflows              # Show available tools
```

**Superpowers Skills** (Use `/superpowers:<skill>` or Skill tool):

```bash
/superpowers:brainstorm              # Design refinement
/superpowers:test-driven-development # TDD workflow
/superpowers:verification-before-completion # Mandatory before claiming done
/superpowers:systematic-debugging    # Bug investigation
/superpowers:using-superpowers       # Mandatory first step
```

**Memory Commands**:

```bash
/log-change             # Update CHANGELOG.md
/log-decision           # Update DECISIONS.md
/create-cheatsheet      # New documentation
```

---

## Key File Locations

**Phoenix Strategy**:

- `docs/strategies/PHOENIX-PLAN-2025-11-30.md` - Strategy v3.0
- `runbooks/phoenix-execution.md` - Execution runbook

**Baseline Files**:

- `.tsc-baseline.json` - TypeScript error baseline (452 errors)
- `test-baseline-2025-11-30.txt` - Test output baseline
- `scripts/typescript-baseline.cjs` - Baseline management script

**Architecture Guides**:

- `CLAUDE.md` - Core conventions
- `CAPABILITIES.md` - **READ FIRST before any implementation**
- `cheatsheets/anti-pattern-prevention.md` - Quality gates

**Existing Components** (for reference):

- `client/src/pages/moic-analysis.tsx` - MOIC views
- `client/src/pages/` - Existing page components
- `client/src/components/` - Reusable UI components
- `client/src/App.tsx` - Route definitions

---

## Example: Starting Track 1 (IA Consolidation)

Here's exactly how to start Track 1:

```markdown
I'm starting Phoenix v3.0 Phase 1 Track 1 (IA Consolidation - Modern Portfolio
Shell).

First, I'll invoke the using-superpowers skill to establish mandatory workflows:

<Skill tool invocation for using-superpowers>

Next, I'll verify the git state and baseline:

<Bash commands to check git status and baseline>

Then I'll read CAPABILITIES.md to check for existing portfolio-related
solutions:

<Read CAPABILITIES.md>

After confirming approach, I'll:

1. Create feature branch: phoenix/phase-1-ia-portfolio
2. Read runbooks/phoenix-execution.md lines 148-170 for IA steps
3. Create TodoWrite list from runbook checklist
4. Invoke brainstorming skill to refine modern Portfolio shell design
5. Use TDD skill to implement with tests first

Let's begin...
```

---

## Final Reminders

**CRITICAL - Do These Every Time**:

1. [x] Read HANDOFF memo FIRST
2. [x] Invoke /using-superpowers skill
3. [x] Check CAPABILITIES.md before implementing
4. [x] Use TodoWrite for all checklists
5. [x] Invoke verification-before-completion before claiming done

**NEVER**:

- [ ] Skip baseline verification
- [ ] Pause features to fix baseline errors
- [ ] Commit without running `npm run check`
- [ ] Merge without PR review
- [ ] Use emojis in documentation

---

**Ready to Execute Phase 1**

Copy everything above this line into your next Claude Code session, then follow
the Starting Workflow checklist to begin Track 1 or Track 2.

Good luck! Remember: Features first, baseline contained, quality enforced.
