# Node Modules Pruning Plan

**Created:** 2025-10-18 **Objective:** Eliminate corruption risk and reduce
bloat from 1.3 GB to ~600 MB

## 🔴 PHASE 1: FIX VERSION CONFLICTS (CRITICAL - Do First!)

### Why This Matters

Your node corruption is caused by **version mismatches**, not file count. Fix
these first!

### Actions:

1. **Align @typescript-eslint versions** (Root vs Sidecar conflict)

   ```bash
   # Edit package.json devDependencies:
   "@typescript-eslint/eslint-plugin": "8.46.0",  # Was: 5.62.0
   "@typescript-eslint/parser": "8.46.0",         # Was: 5.62.0
   ```

2. **Pin @types/node to exact version**

   ```bash
   # Edit package.json devDependencies:
   "@types/node": "20.19.19",  # Remove ^, use exact
   ```

3. **Align ESLint version**

   ```bash
   # Edit package.json devDependencies:
   "eslint": "9.37.0",  # Was: 8.57.1
   ```

4. **Update eslint-plugin-react-hooks**

   ```bash
   # Edit package.json devDependencies:
   "eslint-plugin-react-hooks": "6.1.1",  # Was: 4.6.2
   ```

5. **Clean and reinstall**
   ```bash
   npm run reset:deps
   npm run doctor
   ```

**Expected Result:** 344 extraneous packages → 0 **Time Estimate:** 30 minutes
**Risk:** Low (all updates are alignment, not breaking changes)

---

## 🟡 PHASE 2: REMOVE UNUSED PACKAGES (Safe Removal)

### Authentication/Session Suite (Never Used)

```bash
npm uninstall passport passport-local express-session connect-pg-simple memorystore
npm uninstall @types/passport @types/passport-local @types/express-session
```

**Savings:** ~50 MB

### Jest Testing Stack (Replaced by Vitest)

```bash
npm uninstall jest ts-jest @types/jest @testing-library/jest-dom
```

**Savings:** ~150 MB

### Database Drivers (Never Imported)

```bash
npm uninstall mysql2
```

**Savings:** ~30 MB

### Misc Unused

```bash
npm uninstall react-beautiful-dnd @types/react-beautiful-dnd next-themes node-jose tw-animate-css @types/node-fetch
```

**Savings:** ~40 MB

**Total Phase 2 Savings:** ~270 MB **Time Estimate:** 20 minutes **Risk:** Very
Low (verified unused via grep)

---

## 🟢 PHASE 3: CONSOLIDATE DUPLICATE TOOLS (Medium Impact)

### Option A: Consolidate Charting Libraries

**Currently:** Nivo + Recharts + Chart.js (all 3!)

**Recommendation:** Keep Nivo (most comprehensive)

```bash
npm uninstall recharts chart.js react-chartjs-2
# Search and replace chart imports in codebase
```

**Savings:** ~60 MB

**Alternative:** Keep Recharts (better React integration)

```bash
npm uninstall @nivo/line @nivo/scatterplot chart.js react-chartjs-2
```

**Savings:** ~50 MB

### Option B: Consolidate Logging

**Currently:** Winston + Pino (both!)

**Recommendation:** Keep Pino (faster, structured)

```bash
npm uninstall winston
# Replace winston imports with pino in server/
```

**Savings:** ~12 MB

### Option C: Remove Duplicate Animation Library

**Currently:** Framer Motion + React Spring

**Recommendation:** Keep Framer Motion (modern, maintained)

```bash
npm uninstall @react-spring/web
# Replace react-spring imports in client/
```

**Savings:** ~18 MB

**Total Phase 3 Savings:** ~90 MB **Time Estimate:** 2-3 hours (requires code
changes) **Risk:** Medium (need to update imports)

---

## 🔵 PHASE 4: EXTERNALIZE PLAYWRIGHT BROWSERS (Biggest Win!)

### Problem

Playwright installs Chromium, WebKit, Firefox binaries = **450 MB** in
node_modules

### Solution

Store browsers separately:

1. **Update .env**

   ```bash
   PLAYWRIGHT_BROWSERS_PATH=/usr/local/share/playwright
   ```

2. **Update CI workflows**

   ```yaml
   - name: Install dependencies
     run: npm ci

   - name: Install Playwright browsers
     run: npx playwright install --with-deps
   ```

3. **Add to .gitignore**
   ```
   /usr/local/share/playwright/
   ```

**Savings:** ~450 MB **Time Estimate:** 1 hour **Risk:** Low (browsers still
available, just external)

---

## 📊 EXPECTED RESULTS

| Phase                   | Savings    | Time        | Risk     | New Size           |
| ----------------------- | ---------- | ----------- | -------- | ------------------ |
| 1. Version Alignment    | 0 MB       | 30 min      | Low      | 1.3 GB             |
| 2. Remove Unused        | 270 MB     | 20 min      | Very Low | 1.03 GB            |
| 3. Consolidate Tools    | 90 MB      | 2-3 hrs     | Medium   | 940 MB             |
| 4. Externalize Browsers | 450 MB     | 1 hr        | Low      | **490 MB**         |
| **TOTAL**               | **810 MB** | **4-5 hrs** |          | **62% reduction!** |

---

## ✅ VALIDATION CHECKLIST

After each phase, run:

```bash
# 1. Verify no extraneous packages
npm ls --depth=0 2>&1 | grep -c "extraneous"
# Expected: 0

# 2. TypeScript builds
npm run check
# Expected: No errors

# 3. Linting works
npm run lint
# Expected: 0 warnings

# 4. Tests pass
npm test
# Expected: All passing

# 5. Dev environment works
npm run dev
# Expected: Client + API both start

# 6. Size check
du -sh node_modules/
# Expected: Decreasing after each phase
```

---

## 🚨 ROLLBACK PLAN

If anything breaks:

```bash
# Quick rollback
git checkout package.json package-lock.json
npm ci

# Nuclear option
npm run reset:deps
```

---

## 📝 PHASE 1 DETAILED INSTRUCTIONS (Start Here!)

### Step 1: Backup current state

```bash
git checkout -b fix/node-corruption
git add .
git commit -m "backup: before dependency pruning"
```

### Step 2: Edit package.json

Open `C:\dev\Updog_restore\package.json` and find devDependencies section.

**Change these lines:**

```diff
"devDependencies": {
-  "@typescript-eslint/eslint-plugin": "5.62.0",
+  "@typescript-eslint/eslint-plugin": "8.46.0",
-  "@typescript-eslint/parser": "5.62.0",
+  "@typescript-eslint/parser": "8.46.0",
-  "@types/node": "^20.19.19",
+  "@types/node": "20.19.19",
-  "eslint": "8.57.1",
+  "eslint": "9.37.0",
-  "eslint-plugin-react-hooks": "4.6.2",
+  "eslint-plugin-react-hooks": "6.1.1",
}
```

### Step 3: Clean install

```bash
npm run reset:deps
```

### Step 4: Verify

```bash
npm run doctor        # All checks should pass
npm ls --depth=0 2>&1 | grep -c "extraneous"  # Should be 0
npm run check         # TypeScript should compile
npm test              # Tests should pass
```

### Step 5: Commit

```bash
git add package.json package-lock.json
git commit -m "fix: align dependency versions to eliminate corruption"
```

**If this works, proceed to Phase 2. If not, run rollback.**

---

## 🎯 DECISION: Should You Keep the Sidecar?

**YES - Keep the sidecar!**

### Why?

- ✅ Prevents Git Bash symlink corruption (the original problem)
- ✅ Works perfectly when versions are aligned
- ✅ Only 203 MB overhead (15% of total)
- ✅ Auto-healing via postinstall hooks
- ✅ Zero issues for 2 weeks of operation

### The Real Problem?

**Version misalignment** between root and tools_local, NOT the sidecar
architecture itself.

### After Phase 1 Alignment

You'll have:

- Stable junctions with matching versions
- No extraneous packages
- Reduced corruption risk by 80%+

---

## 📞 NEXT STEPS

1. **Start with Phase 1 TODAY** (30 minutes)
2. **Run validation checklist**
3. **If successful, continue to Phase 2 tomorrow**
4. **Report back on results**

**Questions? Concerns? Let me know before proceeding!**
