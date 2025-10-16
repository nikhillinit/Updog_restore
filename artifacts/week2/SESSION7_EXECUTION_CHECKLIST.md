# Session 7 Execution Checklist

**Status:** 📋 READY FOR EXECUTION
**Estimated Time:** 5-6 hours total (split across 2 sessions)
**Priority Order:** Infrastructure → Measurement → Code Fixes → Hardening

---

## Pre-Flight Validation ✈️

Before starting, verify:
- [ ] Windows PowerShell or CMD available (NOT Git Bash for junction operations)
- [ ] Administrator access OR Developer Mode enabled
- [ ] Node 20.19.0 available via nvm/volta
- [ ] Clean working directory (commit or stash current changes)
- [ ] Backup: `git stash push -m "pre-recovery-backup"`

---

## Session 1: Infrastructure Recovery (2-3 hours)

### Phase 0: Reality Check (10 min)
- [ ] Lock Node version: `nvm use 20.19.0`
- [ ] Verify version: `node -v` → 20.19.0
- [ ] Check branch: `git branch` → remediation/week2-server-strictness
- [ ] Clean TS cache: `npx tsc -b --clean`
- [ ] Baseline server: `npx tsc --pretty=false --noEmit -p tsconfig.server.json | tee artifacts/tsc.server.baseline.txt`
- [ ] Baseline client: `npx tsc --pretty=false --noEmit -p tsconfig.client.json | tee artifacts/tsc.client.baseline.txt`
- [ ] Count server errors: `grep -c "error TS" artifacts/tsc.server.baseline.txt`
- [ ] Count client errors: `grep -c "error TS" artifacts/tsc.client.baseline.txt`
- [ ] Document counts in SESSION7_RECOVERY_PLAN.md

**Expected:** Counts may differ from our "71" - Zencoder reported 165. Document true baseline.

---

### Phase 1: Sidecar System Repair (25 min)

#### 1.1 Reinstall Sidecar Workspace
- [ ] Navigate: `cd tools_local`
- [ ] Clean: `rm -rf node_modules package-lock.json`
- [ ] Install: `npm install`
- [ ] Verify vitest: `ls node_modules/vitest` → Should exist
- [ ] Verify eslint: `ls node_modules/@typescript-eslint` → Should exist
- [ ] Return: `cd ..`

#### 1.2 Recreate Junctions (MUST RUN AS ADMIN OR WITH DEV MODE)
- [ ] **CRITICAL:** Close Git Bash, open PowerShell/CMD
- [ ] Run linker: `node scripts/link-sidecar-packages.mjs`
- [ ] Check for errors in output
- [ ] Verify junction: `powershell "Get-Item node_modules/vitest | Select LinkType"`
- [ ] Expected: `LinkType: Junction`

#### 1.3 Verify Resolvability
- [ ] Test vitest: `node -e "require.resolve('vitest')"`
- [ ] Test eslint: `node -e "require.resolve('@typescript-eslint/parser')"`
- [ ] Test vite react: `node -e "require.resolve('@vitejs/plugin-react')"`
- [ ] Test preact: `node -e "require.resolve('@preact/preset-vite')"`
- [ ] Test npm-run-all: `node -e "require.resolve('npm-run-all')"`
- [ ] **ALL MUST PRINT PATHS, NOT ERRORS**

#### 1.4 Harden Postinstall
- [ ] Edit `scripts/link-sidecar-packages.mjs`
- [ ] Add validation loop at end (see recovery plan)
- [ ] Remove `|| true` from `package.json` postinstall
- [ ] Test: `npm run postinstall` → Should exit 0
- [ ] Test failure mode: Rename a junction, run postinstall → Should exit 1

**Commit Point 1:**
```bash
git add scripts/link-sidecar-packages.mjs package.json
git commit -m "fix(infra): Harden sidecar junction system

- Remove || true from postinstall (fail loudly on errors)
- Add resolvability validation for all critical packages
- Emit clear diagnostics on failure

🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Phase 2: TypeScript Count Stabilization (15 min)

#### 2.1 Verify Quarantine Status
- [ ] Test reserve-approvals: `node scripts/assert-unreferenced.mjs server/routes/v1/reserve-approvals.ts`
- [ ] Test reallocation: `node scripts/assert-unreferenced.mjs server/routes/reallocation.ts`
- [ ] Test mlClient: `node scripts/assert-unreferenced.mjs server/core/reserves/mlClient.ts`
- [ ] Test sentry: `node scripts/assert-unreferenced.mjs server/observability/sentry.ts`
- [ ] **IF ANY FAIL:** Document in recovery plan, must be un-quarantined

#### 2.2 Fix Vitest Globals Typing
- [ ] Edit `tsconfig.client.json` → Add `"types": ["vitest/globals", "vite/client"]`
- [ ] Create `types/vitest-env.d.ts` (see recovery plan template)
- [ ] Verify types directory in include paths

#### 2.3 Re-Measure with Fixed Tools
- [ ] Clean: `npx tsc -b --clean`
- [ ] Server post-fix: `npx tsc --pretty=false --noEmit -p tsconfig.server.json | tee artifacts/tsc.server.postsidecar.txt`
- [ ] Client post-fix: `npx tsc --pretty=false --noEmit -p tsconfig.client.json | tee artifacts/tsc.client.postsidecar.txt`
- [ ] Count server: `grep -c "error TS" artifacts/tsc.server.postsidecar.txt`
- [ ] Count client: `grep -c "error TS" artifacts/tsc.client.postsidecar.txt`
- [ ] Compare to baseline: Should see vitest global errors drop

**Commit Point 2:**
```bash
git add tsconfig.client.json types/vitest-env.d.ts artifacts/
git commit -m "fix(types): Add vitest globals typing

- Configure vitest/globals in tsconfig.client.json
- Create ambient vitest types declaration
- Expect -15 to -20 errors from test files

🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Break Point: Review Counts

**Before proceeding to Phase 3:**
- [ ] Document true error counts in recovery plan
- [ ] Compare server/client split
- [ ] Identify top 5 error files (from tsc output)
- [ ] Verify test/lint tools work: `npm run test:quick`, `npm run lint`

**Decision Point:**
- If tests/lint work → Proceed to Phase 3
- If still broken → Debug sidecar issues further

---

## Session 2: Code Fixes & Hardening (2-3 hours)

### Phase 3: Error Burn-Down (90-120 min)

#### Priority 1: FeatureFlagProvider.test.tsx (~20 errors)
- [ ] Check if vitest globals fixed it (may already be 0 errors)
- [ ] If errors remain: Add explicit imports from vitest
- [ ] Verify: `npx tsc --noEmit client/providers/__tests__/FeatureFlagProvider.test.tsx`

#### Priority 2: ConversationMemory.ts (~14 errors)
- [ ] Apply safe collection patterns (see recovery plan)
- [ ] Add getOrInit helper
- [ ] Guard before destructure
- [ ] Verify: `npx tsc --noEmit packages/agent-core/src/ConversationMemory.ts`

#### Priority 3: WizardShell.tsx (~5 errors)
- [ ] Export WizardStep type from machine
- [ ] Add stepInfo guard
- [ ] Verify: `npx tsc --noEmit client/components/modeling-wizard/WizardShell.tsx`

#### Priority 4: Complete Phase 2B (remaining 6 errors)
- [ ] http-preconditions.ts: Conditional spreads
- [ ] health.ts: Bracket notation + type guards
- [ ] tsconfig.server.json: Add client/src/machines

#### Priority 5: Complete Phase 2C (5 errors)
- [ ] engine-guards.ts: Guard before destructure
- [ ] engineGuardExpress.ts: Bracket notation
- [ ] lpBusinessMetrics.ts: Record type + nullish coalescing

**Commit after each priority:**
```bash
git add [files]
git commit -m "fix(types): [Priority N] - [description]

- [Change 1]
- [Change 2]

Errors fixed: [N] (total now: [M])

🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Phase 4: Restore Testing & Linting (15 min)

- [ ] ESLint parser check: `node -e "require.resolve('@typescript-eslint/parser')"`
- [ ] Run lint: `npm run lint`
- [ ] Fix any obvious linting errors
- [ ] Vitest check: `node -e "require.resolve('vitest')"`
- [ ] Run tests: `npm run test:quick`
- [ ] Document test failures (code bugs vs infrastructure)

---

### Phase 5: Security Hygiene (30 min)

- [ ] Current audit: `npm audit --json > artifacts/npm-audit-before.json`
- [ ] Safe fixes: `npm audit fix --only=prod`
- [ ] Add overrides to package.json (glob, braces, micromatch)
- [ ] Reinstall: `npm install`
- [ ] Verify sidecars still work: `npm run doctor:links`
- [ ] Smoke test: `npm run build:client`
- [ ] Post audit: `npm audit --json > artifacts/npm-audit-after.json`

**Commit Point:**
```bash
git add package.json package-lock.json artifacts/npm-audit-*.json
git commit -m "fix(deps): Address security vulnerabilities

- npm audit fix for production dependencies
- Add overrides for glob, braces, micromatch
- Verify sidecar system still functional

🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Phase 6: Sidecar Hardening (30-60 min, can be parallel)

- [ ] Create `scripts/doctor-comprehensive.mjs` (see recovery plan)
- [ ] Add `doctor` script to package.json
- [ ] Test: `npm run doctor` → Should pass
- [ ] Update SIDECAR_GUIDE.md with Windows junction guide
- [ ] Document Developer Mode requirement
- [ ] Document fallback copy mode (if implemented)

**Commit Point:**
```bash
git add scripts/doctor-comprehensive.mjs package.json SIDECAR_GUIDE.md
git commit -m "feat(infra): Comprehensive doctor script

- Machine-readable health check for all dev tools
- Validates Node, npm, git, TS, sidecars
- Outputs JSON report to artifacts/
- Documents Windows junction requirements

🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Phase 7: Governance & Gates (30 min)

- [ ] Install husky: `npm install husky --save-dev`
- [ ] Initialize: `npx husky install`
- [ ] Create pre-commit hook (see recovery plan)
- [ ] Test hook: Stage a file with `@ts-ignore`, try commit → Should block
- [ ] Create `scripts/verify-quarantine.mjs`
- [ ] Add `check:quarantine` to package.json
- [ ] Test: `npm run check:quarantine` → Should pass

**Commit Point:**
```bash
git add .husky/ scripts/verify-quarantine.mjs package.json
git commit -m "feat(governance): Pre-commit hooks and quarantine validation

- Block commits with new TypeScript suppressions
- Validate quarantine status on each build
- Run typecheck + lint before commit

🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Phase 8: Final Validation & Documentation (30 min)

- [ ] Full typecheck: `npm run check`
- [ ] Final counts: Count errors in server and client
- [ ] Generate summary report (see template below)
- [ ] Update SESSION7_RECOVERY_PLAN.md with final counts
- [ ] Create SESSION7_FINAL_REPORT.md
- [ ] Push all commits: `git push origin remediation/week2-server-strictness`

---

## Success Criteria Checklist

### Infrastructure ✅
- [ ] All sidecar packages resolvable
- [ ] `npm run doctor` passes
- [ ] Junctions visible in PowerShell
- [ ] Postinstall fails loudly on errors

### TypeScript ✅
- [ ] Server errors ≤30
- [ ] Client test file errors resolved
- [ ] Counts reproducible across runs
- [ ] No "Cannot find module" for dev tools

### Quality ✅
- [ ] All fixes types-only
- [ ] Quarantine unchanged (unless proven referenced)
- [ ] streaming-monte-carlo-engine.ts still excluded
- [ ] No new `@ts-ignore` or `@ts-expect-error`

### Process ✅
- [ ] Pre-commit hooks active
- [ ] Quarantine validation automated
- [ ] Doctor script comprehensive
- [ ] Windows guide documented

### Artifacts ✅
- [ ] tsc.server.baseline.txt
- [ ] tsc.server.postsidecar.txt
- [ ] tsc.client.baseline.txt
- [ ] tsc.client.postsidecar.txt
- [ ] doctor-report.json
- [ ] npm-audit-before.json
- [ ] npm-audit-after.json
- [ ] SESSION7_FINAL_REPORT.md

---

## Rollback Procedures

### If Sidecar Fix Fails
```bash
# Restore from stash
git stash pop

# Manual copy mode (emergency)
cp -r tools_local/node_modules/* node_modules/

# Or: Disable sidecar system temporarily
# Edit package.json: Remove postinstall script
```

### If Error Counts Spike
```bash
# Revert to last known good
git log --oneline -10
git reset --hard [commit-hash]

# Re-measure
npm run check
```

### If Tests Break
```bash
# Check vitest resolvability
node -e "require.resolve('vitest')"

# Fallback: Direct import in test files
import { describe, it, expect } from 'vitest';
```

---

## Time Budget

| Phase | Estimated | Actual | Notes |
|-------|-----------|--------|-------|
| Phase 0: Reality Check | 10 min | ___ | ___ |
| Phase 1: Sidecar Repair | 25 min | ___ | May need admin access |
| Phase 2: TS Stabilization | 15 min | ___ | ___ |
| Phase 3: Code Fixes | 120 min | ___ | Largest time sink |
| Phase 4: Test/Lint | 15 min | ___ | ___ |
| Phase 5: Security | 30 min | ___ | ___ |
| Phase 6: Hardening | 60 min | ___ | Can be parallel |
| Phase 7: Governance | 30 min | ___ | ___ |
| Phase 8: Final Docs | 30 min | ___ | ___ |
| **Total** | **5.5 hours** | **___** | ___ |

---

## Final Report Template

Create `SESSION7_FINAL_REPORT.md`:

```markdown
# Session 7 Final Report

**Date:** 2025-01-14 to 2025-01-15
**Status:** ✅ COMPLETE

## Results

### Error Reduction
- **Starting (True Baseline):** [N] server + [M] client = [Total]
- **After Sidecar Fix:** [N2] server + [M2] client = [Total2]
- **Final:** [N3] server + [M3] client = [Total3]
- **Reduction:** -[X] errors ([Y]%)

### Infrastructure
- ✅ Sidecar system functional
- ✅ All dev tools resolvable
- ✅ Tests and lint operational
- ✅ Doctor script in place

### Quality
- ✅ All fixes types-only
- ✅ No new suppressions
- ✅ Quarantine validated
- ✅ Pre-commit hooks active

### Key Insights
1. [Insight 1]
2. [Insight 2]
3. [Insight 3]

### Technical Debt
- [ ] 2 Phase 2A errors (TS control flow limitations)
- [ ] streaming-monte-carlo-engine.ts (16 errors, excluded)
- [ ] [Other items]

## Next Steps
1. [Next session focus]
2. [Outstanding issues]
3. [Long-term improvements]
```

---

**Status:** 📋 EXECUTION READY
**Owner:** Session 7 Recovery Team
**Created:** 2025-01-14
**Approval:** PENDING
