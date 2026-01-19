---
status: ACTIVE
last_updated: 2026-01-19
---

# Next Actions - Build Strategy Implementation

**Date**: October 16, 2025 **Phase**: Verification Complete → Ready for Phase -1

---

## ✅ COMPLETED: Verification

- ✅ Verified PR #162 exists (TypeScript baseline)
- ✅ Verified PR #159 exists (Excel parity testing)
- ✅ Confirmed TypeScript baseline script (448 lines, production-ready)
- ✅ Confirmed parity validator exists (457 lines)
- ✅ Identified missing parity CLI scripts
- ✅ Documented gaps in `docs/BUILD_READINESS.md`
- ✅ Created executive summary in `docs/VERIFICATION_SUMMARY.md`

**Key Finding**: Strategy is sound, timeline needs adjustment (4-6 weeks → 8-11
weeks)

---

## 🎯 THIS WEEK: Phase -1 (Verification)

### Day 1-2: PR Review & Approval (4-6 hours)

**PR #162 Review**:

- [ ] Read through TypeScript baseline code
- [ ] Verify tests pass locally
- [ ] Check documentation quality
- [ ] Get stakeholder sign-off (if required)
- [ ] Note any requested changes

**PR #159 Review**:

- [ ] Read through parity validator code
- [ ] Verify existing tests pass
- [ ] Check fixture quality
- [ ] Identify CLI requirements
- [ ] Note any requested changes

**Review Commands**:

```bash
# Checkout and test PR #162
git fetch origin
git checkout feat/typescript-baseline-system
npm run baseline:check
npm run baseline:progress

# Checkout and test PR #159
git checkout feat/excel-parity-testing
# (Note: Tests may not run yet due to missing CLI)
```

---

### Day 3: Conflict Resolution (2-3 hours)

**Sync TypeScript Baseline Branch**:

```bash
# Current branch is behind main by 1 commit
git checkout feat/typescript-baseline-system
git fetch origin
git merge origin/main

# If conflicts:
git status  # See conflicting files
# Resolve manually
git add .
git merge --continue

# Re-test after merge
npm run baseline:check
npm test
```

**Sync Parity Testing Branch**:

```bash
git checkout feat/excel-parity-testing
git fetch origin
git merge origin/main

# If conflicts, resolve same as above
```

---

### Day 4-5: Build Parity CLI (Critical Path: 24-34 hours)

**Priority 1: parity-generate.mjs** (8-10 hours)

Create `scripts/parity-generate.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Excel Parity Data Generator
 * Generates CSV output from web app calculations for comparison with Excel
 */

import { ExcelParityValidator } from '../client/src/lib/excel-parity-validator.ts';
import { ConstrainedReserveEngine } from '../client/src/core/reserves/ConstrainedReserveEngine.ts';
import fs from 'fs';
import path from 'path';

// TODO: Implement
// 1. Load fund configuration (from fixtures or CLI args)
// 2. Run calculations using ConstrainedReserveEngine
// 3. Format results as CSV matching schema:
//    periodIndex,tvpi,dpi,irr,nav,contributions,distributions,managementFees
// 4. Write to output file
// 5. Handle edge cases (empty portfolio, failed graduations)
// 6. Add --scenario flag for different test cases
// 7. Add --output flag for file path
```

**Priority 2: parity-compare.mjs** (4-6 hours)

Create `scripts/parity-compare.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Excel Parity Comparator
 * Compares web app output against Excel reference data
 */

import fs from 'fs';
import path from 'path';

// TODO: Implement
// 1. Parse CSV files (web + Excel)
// 2. Implement epsilon comparison (tolerance = 1e-6)
// 3. Calculate drift percentages
// 4. Generate HTML diff report with color coding:
//    - Green: within tolerance
//    - Yellow: 0.5-1% drift (warning)
//    - Red: >1% drift (fail)
// 5. Exit codes: 0 (pass), 1 (fail), 2 (warnings)
// 6. Add --web, --excel, --output flags
// 7. Add --epsilon flag for custom tolerance
```

**Priority 3: npm Scripts** (1 hour)

Add to `package.json`:

```json
{
  "scripts": {
    "parity:generate": "node scripts/parity-generate.mjs",
    "parity:compare": "node scripts/parity-compare.mjs",
    "parity:all": "npm run parity:generate --all && npm run parity:compare --all",
    "parity:scenario": "npm run parity:generate --scenario"
  }
}
```

**Testing**:

```bash
# Test each scenario
npm run parity:generate -- --scenario baseline --output .parity/web/baseline.csv
npm run parity:compare -- --web .parity/web/baseline.csv --excel tests/fixtures/excel-parity/baseline/expected.csv

# Test all scenarios
npm run parity:all
```

---

### Day 5: WSL2 Build Validation (5-10 minutes)

**Why WSL2 Instead of Docker**:

- ✅ Already installed (Ubuntu-22.04)
- ✅ More reliable (no Docker Desktop issues)
- ✅ Faster (native Linux kernel)
- ✅ Exact CI match (GitHub Actions uses Ubuntu)
- ✅ User reported "consistently had trouble with Docker"

**See detailed guide**: `docs/WSL2_BUILD_TEST.md`

**Step 1: Check Node.js in WSL2** (1 minute):

```bash
# From Windows PowerShell:
wsl node -v
wsl npm -v

# If not installed:
wsl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
exit
```

**Step 2: Run WSL2 Build Test** (5-10 minutes):

```bash
# Start WSL2
wsl

# Navigate to project
cd /mnt/c/dev/Updog_restore

# IMPORTANT: Set CI flag (disables sidecar)
export CI=true

# Install dependencies
npm ci

# Verify sidecar disabled
ls -la node_modules/vite
# Should show: drwxr-xr-x (directory, not symlink)

# Full validation with timing
time (npm run typecheck && npm run build && npm test)

# Exit WSL2
exit
```

**Step 3: Document Results**:

If **SUCCESS** ✅:

```powershell
Add-Content -Path "docs\BUILD_READINESS.md" -Value @"

## WSL2 Build Test Results
**Date**: $(Get-Date)
**Status**: ✅ PASSED
**Duration**: [copy time from output]
**Node.js**: $(wsl node -v)
**Conclusion**: Linux build compatibility CONFIRMED
"@
```

If **FAILURE** ❌:

```powershell
Add-Content -Path "docs\BUILD_READINESS.md" -Value @"

## WSL2 Build Test Results
**Date**: $(Get-Date)
**Status**: ❌ FAILED
**Error**: [paste error]
**Action**: Investigate (add 1-2 days)
"@
```

---

## 📋 Phase -1 Checklist

### PR Review

- [ ] PR #162 code reviewed
- [ ] PR #159 code reviewed
- [ ] Stakeholder approval obtained (if required)
- [ ] Review feedback addressed

### Conflict Resolution

- [ ] feat/typescript-baseline-system synced with main
- [ ] feat/excel-parity-testing synced with main
- [ ] All conflicts resolved
- [ ] Tests pass after merge

### Parity CLI Implementation

- [ ] parity-generate.mjs created and tested
- [ ] parity-compare.mjs created and tested
- [ ] npm scripts added
- [ ] All 3 scenarios work end-to-end
- [ ] HTML reports generate correctly

### Linux Build Validation (WSL2)

- [ ] Node.js installed in WSL2
- [ ] WSL2 build test run (5-10 min)
- [ ] Results documented in BUILD_READINESS.md
- [ ] If failures: Issues investigated OR GitHub Actions fallback used

### Documentation

- [ ] Rollback plan documented
- [ ] CLI usage documented
- [ ] Edge cases documented
- [ ] Phase 0 ready to begin

---

## 🚀 NEXT WEEK: Phase 0 (Integration)

**Only proceed if Phase -1 complete**

### Week 1: Merge & Monitor

- [ ] Merge PR #162 (TypeScript baseline)
- [ ] Monitor for 2-3 days (watch for issues)
- [ ] Merge PR #159 (Parity testing)
- [ ] Monitor for 2-3 days
- [ ] Fix any integration issues

### Week 2: Consolidation

- [ ] Audit 54 workflows
- [ ] Create consolidation plan
- [ ] Archive redundant workflows
- [ ] Test consolidated pipeline
- [ ] Document changes

---

## ⚠️ Blockers & Dependencies

### Current Blockers (Updated)

1. ~~**Docker Daemon Not Running**~~ **RESOLVED**
   - Original Issue: Docker Desktop problems
   - Resolution: Using WSL2 instead (more reliable)
   - Timeline: 0 minutes (WSL2 already installed)

2. **Parity CLI Scripts Missing**
   - Impact: Cannot run parity tests end-to-end
   - Resolution: Build scripts (Day 4-5)
   - Timeline: 24-34 hours

### Dependencies

- PR #162 merge → Depends on: Conflict resolution + stakeholder approval
- PR #159 merge → Depends on: CLI completion + PR #162 merged
- Phase 0 start → Depends on: Phase -1 100% complete

---

## 📊 Progress Tracking

### Overall Progress: 65% Foundation Complete

| Component                  | Status         | Completion   |
| -------------------------- | -------------- | ------------ |
| TypeScript baseline script | ✅ Complete    | 100%         |
| Excel parity validator     | ✅ Complete    | 100%         |
| Golden fixtures            | ⚠️ Partial     | 60% (3 of 5) |
| Parity CLI                 | ❌ Missing     | 0%           |
| CI integration             | ❌ Not started | 0%           |
| Workflow consolidation     | ❌ Not started | 0%           |

### This Week's Goal: 80% Complete

- Complete parity CLI
- Validate Linux build (WSL2)
- Resolve conflicts
- Ready for Phase 0

---

## 🎯 Success Criteria for Phase -1

Before starting Phase 0, must have:

✅ **PRs Ready**:

- Both PRs reviewed and approved
- Conflicts resolved
- Synced with main

✅ **Parity CLI Working**:

- parity:generate produces valid CSV
- parity:compare generates accurate diffs
- All 3 scenarios pass locally

✅ **Linux Build Validated** (WSL2 or GitHub Actions):

- Linux build test passes
- OR issues documented with remediation plan

✅ **Documentation Complete**:

- Rollback plan exists
- CLI usage documented
- Remaining work clearly scoped

---

## 📞 Help Needed?

If blocked on any of these tasks:

1. **PR Review Questions**: Check PR descriptions and linked documentation
2. **Parity CLI Design**: Reference `client/src/lib/excel-parity-validator.ts`
   for patterns
3. **Linux Build Issues**: See `docs/WSL2_BUILD_TEST.md` for WSL2
   troubleshooting
4. **Timeline Concerns**: See `docs/VERIFICATION_SUMMARY.md` for realistic
   estimates

---

**Last Updated**: October 16, 2025 **Current Phase**: Phase -1 (Verification)
**Next Milestone**: Parity CLI completion (Day 4-5)
