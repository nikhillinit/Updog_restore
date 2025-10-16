# 🚀 Next Session: Start Here

**Last Updated:** 2025-01-14
**Status:** 🔴 **CRITICAL - INFRASTRUCTURE RESET REQUIRED**
**Priority:** Fix toolchain before touching code

---

## ⚡ Quick Status

**Error Counts:**
- Our measurement: 71 errors (UNRELIABLE - toolchain broken)
- Zencoder measurement: 165 errors (with working tools)
- **Action:** Re-measure with fixed tools

**What's Broken:**
- ❌ Vitest not resolvable (tests blocked)
- ❌ ESLint parser not found (linting blocked)
- ❌ Vite plugins missing (build may be affected)
- ❌ Windows sidecar junctions failing

**Why It Matters:**
We've been measuring TypeScript errors with broken dev tools, leading to unreliable counts and wasted effort on potentially phantom issues.

---

## 🎯 Your Mission

**Stop fixing code. Fix infrastructure. Measure accurately. Then fix code.**

---

## 📚 Read These First (In Order)

1. **SESSION7_SUMMARY.md** (10 min read)
   - What happened in last session
   - Why we're pivoting to infrastructure-first
   - Key insights and lessons learned

2. **SESSION7_RECOVERY_PLAN.md** (15 min read)
   - Complete infrastructure-first strategy
   - Phase-by-phase execution plan
   - All commands ready to copy/paste

3. **SESSION7_EXECUTION_CHECKLIST.md** (5 min read)
   - Step-by-step checklist format
   - Time budgets for each phase
   - Success criteria and rollback procedures

**Location:** `artifacts/week2/`

---

## 🔧 Phase 0: Reality Check (10 min) - DO THIS FIRST

```bash
# 1. Lock Node version
nvm use 20.19.0  # or: volta pin node@20.19.0
node -v          # Expected: 20.19.0

# 2. Check git status
git branch                    # Expected: remediation/week2-server-strictness
git status -s                 # Expected: server/lib/locks.ts modified

# 3. Clean and baseline
npx tsc -b --clean
npx tsc --pretty=false --noEmit -p tsconfig.server.json | tee artifacts/tsc.server.baseline.txt
npx tsc --pretty=false --noEmit -p tsconfig.client.json | tee artifacts/tsc.client.baseline.txt

# 4. Count errors
grep -c "error TS" artifacts/tsc.server.baseline.txt
grep -c "error TS" artifacts/tsc.client.baseline.txt
# Document these counts - they are the TRUE baseline
```

**Decision Point:** If counts match our 71, tools may be working. If counts are much higher (like Zencoder's 165), infrastructure is definitely broken.

---

## 🔨 Phase 1: Sidecar Repair (25 min) - CRITICAL

**⚠️ MUST RUN IN POWERSHELL/CMD AS ADMINISTRATOR (or with Developer Mode enabled)**

```bash
# 1. Reinstall sidecar workspace
cd tools_local
rm -rf node_modules package-lock.json
npm install
cd ..

# 2. Recreate junctions
node scripts/link-sidecar-packages.mjs

# 3. Verify every critical package
node -e "require.resolve('vitest')"                      # MUST print path
node -e "require.resolve('@typescript-eslint/parser')"   # MUST print path
node -e "require.resolve('@vitejs/plugin-react')"        # MUST print path
node -e "require.resolve('@preact/preset-vite')"         # MUST print path
node -e "require.resolve('npm-run-all')"                 # MUST print path

# If ANY fail: Check Windows Developer Mode or run as admin
```

**Commit this:**
```bash
# After hardening postinstall script (see recovery plan)
git add scripts/link-sidecar-packages.mjs package.json
git commit -m "fix(infra): Harden sidecar junction system"
```

---

## 📊 Phase 2: Stabilize Counts (15 min)

```bash
# 1. Verify quarantine still valid
node scripts/assert-unreferenced.mjs server/routes/v1/reserve-approvals.ts
# (repeat for other 3 quarantined files)

# 2. Fix vitest globals
# Edit tsconfig.client.json: add "types": ["vitest/globals"]
# Create types/vitest-env.d.ts (see recovery plan)

# 3. Re-measure with fixed tools
npx tsc -b --clean
npx tsc --pretty=false --noEmit -p tsconfig.server.json | tee artifacts/tsc.server.postsidecar.txt
npx tsc --pretty=false --noEmit -p tsconfig.client.json | tee artifacts/tsc.client.postsidecar.txt

# 4. Compare
echo "Server before: $(grep -c 'error TS' artifacts/tsc.server.baseline.txt)"
echo "Server after:  $(grep -c 'error TS' artifacts/tsc.server.postsidecar.txt)"
echo "Client before: $(grep -c 'error TS' artifacts/tsc.client.baseline.txt)"
echo "Client after:  $(grep -c 'error TS' artifacts/tsc.client.postsidecar.txt)"
```

**Commit this:**
```bash
git add tsconfig.client.json types/vitest-env.d.ts artifacts/
git commit -m "fix(types): Add vitest globals typing"
```

---

## 🎯 Phase 3: Code Fixes (2-3 hours)

**Only proceed after Phases 0-2 complete and tools working!**

### Priority Order (from Zencoder heatmap)

1. **FeatureFlagProvider.test.tsx** (-20 errors expected)
   - May already be fixed by vitest globals
   - If not: Add explicit imports

2. **ConversationMemory.ts** (-14 errors)
   - Apply safe collection patterns
   - Guard before destructure

3. **WizardShell.tsx** (-5 errors)
   - Export WizardStep type
   - Add stepInfo guard

4. **Complete Phase 2B** (-6 errors)
   - http-preconditions: Conditional spreads
   - health.ts: Bracket notation + guards
   - tsconfig: Add machines to include

5. **Complete Phase 2C** (-5 errors)
   - engine-guards: Guard before destructure
   - engineGuardExpress: Bracket notation
   - lpBusinessMetrics: Record types

**See recovery plan for detailed patterns and code samples.**

---

## ✅ Success Criteria

### You'll Know You're Done When:

**Infrastructure:**
- ✅ All sidecar packages resolve: `npm run doctor` passes
- ✅ Tests run: `npm run test:quick` executes
- ✅ Linting works: `npm run lint` runs
- ✅ Counts reproducible across multiple runs

**Code:**
- ✅ Server errors ≤30 (from TRUE baseline)
- ✅ All fixes types-only (no runtime changes)
- ✅ Quarantine unchanged
- ✅ No new suppressions (`@ts-ignore`, `@ts-expect-error`)

---

## 🚫 What NOT To Do

- ❌ Fix code before Phase 0-2 complete
- ❌ Trust the "71 errors" count
- ❌ Use Git Bash for junction operations
- ❌ Skip the reality check
- ❌ Un-quarantine files without proof
- ❌ Add TypeScript suppressions

---

## 📁 Key Files

### Documentation
```
artifacts/week2/
├── SESSION7_SUMMARY.md           ⭐ Read first
├── SESSION7_RECOVERY_PLAN.md     ⭐ Master plan
├── SESSION7_EXECUTION_CHECKLIST.md ⭐ Step-by-step
├── ZENCODER_INVESTIGATION_PROMPT.md (for 2 stubborn errors)
└── PHASE2A_INVESTIGATION_REQUIRED.md (detailed error analysis)
```

### Code State
```
Branch: remediation/week2-server-strictness
Uncommitted: server/lib/locks.ts (line 293 fix)
Commits ahead: 9 (unpushed)
```

---

## ⏱️ Time Budget

| Phase | Time | Cumulative |
|-------|------|------------|
| Phase 0: Reality Check | 10 min | 10 min |
| Phase 1: Sidecar Repair | 25 min | 35 min |
| Phase 2: Stabilize Counts | 15 min | 50 min |
| **Break: Review Counts** | 10 min | 1 hour |
| Phase 3: Code Fixes | 120 min | 3 hours |
| Phase 4-7: Hardening | 120 min | 5 hours |
| Phase 8: Final Docs | 30 min | 5.5 hours |

**Total:** 5-6 hours to complete Session 7 properly

---

## 💡 Key Insight

**"Never fix code with broken tools."**

We spent 2.5 hours attempting fixes while the toolchain was fundamentally broken. The error counts (71 vs 165) represented different realities. Fix infrastructure first, get accurate measurements, then fix code systematically.

---

## 🆘 If You Get Stuck

### Sidecar Junctions Won't Create
1. Check Windows Developer Mode: Settings → Developer
2. Run PowerShell/CMD as Administrator
3. See `SIDECAR_GUIDE.md` for detailed troubleshooting

### Error Counts Don't Stabilize
1. Clear all caches: `rm -rf .tsbuildinfo* node_modules/.cache`
2. Reinstall: `npm ci`
3. Re-link: `node scripts/link-sidecar-packages.mjs`

### Tests Still Won't Run
1. Check vitest: `node -e "require.resolve('vitest')"`
2. Check tsconfig: `"types": ["vitest/globals"]` present?
3. Check ambient types: `types/vitest-env.d.ts` exists?

---

## 📞 External Resources

### Zencoder Investigation
- **Status:** Identified root cause (sidecar failure)
- **Report:** Available for review
- **Action:** Use findings to guide recovery

### AI Agent Investigation (Optional)
- **Target:** 2 stubborn Phase 2A errors
- **Prompt:** `ZENCODER_INVESTIGATION_PROMPT.md`
- **Priority:** LOW (not blocking infrastructure work)

---

## 🎯 Target Outcome

**After completing recovery plan:**
- Stable, reproducible error counts
- Working test and lint suite
- Clear understanding of true error baseline
- Server errors ≤30 (from accurate measurement)
- Bulletproof sidecar system for future work

**Then we can confidently complete the remediation to <30 total errors.**

---

**Status:** 📋 READY TO EXECUTE
**Next Step:** Phase 0 Reality Check → `artifacts/week2/SESSION7_EXECUTION_CHECKLIST.md`
**Estimated Time:** 5-6 hours total

**Good luck! Fix the tools first, then fix the code. 🚀**
