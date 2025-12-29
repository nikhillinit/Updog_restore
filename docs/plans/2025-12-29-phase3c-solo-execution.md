# Phoenix Phase 3C - Solo Developer Execution Plan (COMPLETE)

**Date:** 2025-12-29
**Status:** COMPLETED
**Actual Duration:** ~1 hour (vs planned 6-8 hours)
**Approach:** Verify-first, code-over-documentation, leverage existing agents

---

## Completion Summary

| Block | Status | Actual Time |
|-------|--------|-------------|
| 1: Investigation & Triage | DONE | 10 min |
| 2: Core Fixes | DONE | 15 min |
| 3: Chrome Validation | DONE | 5 min |
| 4: Component Migration | DONE | 20 min |
| 5: Wrap-Up | DONE | 10 min |

**Key Findings:**
- PDF tests were already passing (40/40), not failing as originally assumed
- Only 6 components needed migration (not 42+)
- Test runner fix was simple (cross-env installation)

---

## Verified State (NOT Assumed)

| Claim (Original Plan) | Actual State | Impact |
|-----------------------|--------------|--------|
| "399 lines PDF tests failing across 4 files" | **1 file, 324 lines** (`tests/unit/utils/pdf-utils.test.tsx`) | Scope reduced 75% |
| "42+ chart components with hardcoded colors" | **6 components with COLORS arrays** | Scope reduced 85% |
| "BrandChartThemeProvider not wired" | **CONFIRMED not in App.tsx** | Needs wiring |
| "npm run phoenix:truth exists" | **Script NOT in package.json** | Needs creation |

---

## Available Project Assets (from .claude/)

### Relevant Agents
| Agent | Use For |
|-------|---------|
| `phoenix-brand-reporting-stylist` | Brand consistency review for charts/PDFs |
| `test-repair` | Fix PDF test failures with memory-enabled learning |
| `code-reviewer` | Review migrations before commit |

### Relevant Skills
| Skill | Use For |
|-------|---------|
| `phoenix-brand-reporting` | Brand guidelines (fonts, colors, logo safe zones) |
| `baseline-governance` | Quality gate policies for baseline changes |

### Relevant Commands
| Command | Use For |
|---------|---------|
| `/pre-commit-check` | Validate lint, typecheck, tests before commit |
| `/phoenix-truth` | Run truth cases (needs script added to package.json) |
| `/test-smart` | Intelligent test selection |

---

## Scope Definition (STRICT)

**IN SCOPE (Phase 3C only):**
- PDF test validation (1 file, 324 lines)
- Chart theme provider wiring to App.tsx
- Migration of 2-3 components (of 6 total with COLORS)
- Add `npm run phoenix:truth` script
- Chrome-only manual validation

**OUT OF SCOPE (defer to backlog):**
- CohortEngine determinism (Phase 2 cleanup)
- Monte Carlo test enablement (testing infra)
- License exception documentation (compliance)
- Cross-browser testing (QA phase)
- Extensive README documentation (code comments suffice)
- BACKLOG.md creation (post-sprint)

---

## Components Requiring Migration (VERIFIED)

All 6 components with hardcoded COLORS arrays:

1. `client/src/components/charts/nivo-allocation-pie.tsx`
2. `client/src/components/dashboard/fund-overview.tsx`
3. `client/src/components/portfolio-constructor/FundStrategyBuilder.tsx`
4. `client/src/components/portfolio/benchmarking-dashboard.tsx`
5. `client/src/components/portfolio/SecondaryMarketAnalysis.tsx`
6. `client/src/components/portfolio/tag-performance-analysis.tsx`

**Target for Phase 3C:** Migrate 2-3 of these (pattern proof)
**Recommended:** `fund-overview.tsx` (high visibility) + `nivo-allocation-pie.tsx` (Nivo compatibility)

---

## Block 1: Investigation & Triage (30 min)

**Objective:** Verify test runner works and PDF test status.

### Step 1.1: Test Runner Health (10 min)
```bash
npm test -- --help 2>&1 | head -10
# If "cross-env: not found" -> fix first
# If works -> proceed
```

### Step 1.2: PDF Test Actual Status (15 min)
```bash
npm test -- pdf 2>&1 | tee /tmp/pdf-status.log
grep -c "FAIL\|PASS" /tmp/pdf-status.log
# Document: X failing, Y passing
# If 0 failing -> plan assumption wrong, skip PDF fixes
```

### Step 1.3: Provider Status (10 min)
```bash
grep -r "BrandChartThemeProvider" client/src/App.tsx
# If found -> already wired, skip wiring step
# If not found -> needs wiring
```

### Step 1.4: Component Migration Scope (15 min)
```bash
# Count components with hardcoded colors
grep -rl "COLORS\s*=" client/src/components/ 2>/dev/null | wc -l
# Actual count: _____ (plan claimed 42+)
```

### Step 1.5: Baseline Health (30 min)
```bash
npm run baseline:check   # Must show 0 new errors
npm run build           # Must succeed
npm run dev &           # App must load
```

### Deliverable: Investigation Report

```markdown
## Phase 3C Investigation Results (2025-12-29)

### Test Runner
- Status: [WORKING / BROKEN: reason]

### PDF Tests
- Claimed: 399 lines failing across 4 files
- Actual: [X] tests failing, [Y] passing
- Files affected: [list]
- Primary error: [actual error message]

### Chart Theme Provider
- Claimed: Not wired to App.tsx
- Actual: [WIRED / NOT WIRED]

### Component Migration Scope
- Claimed: 42+ components
- Actual: [X] components with COLORS arrays

### Baseline
- TypeScript: [X] errors (baseline: 482)
- Build: [PASS / FAIL]
- Dev server: [WORKS / BROKEN]

### Plan Adjustments
- [List what changes based on findings]
```

**GATE:** If test runner broken, fix before proceeding. If baseline fails, stop and investigate.

---

## Block 2: Core Fixes (3-4 hours)

**Objective:** Fix only what Block 1 proves is broken.

### 2.1: Test Runner Fix (if needed, 30 min)
```bash
# Option A: Install cross-env
npm install -D cross-env

# Option B: Modify script to use shell variable
# Change: "cross-env TZ=UTC vitest"
# To: "TZ=UTC vitest"

# Verify
npm test -- --help
```

### 2.2: PDF Test Fixes (if failing, 1-2 hours)

**Investigation approach (not assumed fixes):**
```bash
# Read ACTUAL errors
npm test -- pdf 2>&1 | grep -A 5 "Error\|FAIL"

# Common patterns and fixes:
# 1. Module not found -> Check import paths, install missing deps
# 2. Font errors -> Check font file paths, mock in test setup
# 3. Canvas errors -> Mock canvas API in jsdom setup
# 4. Timeout -> Increase test timeout or mock heavy operations
```

**Fix pattern:**
1. Identify actual error (not guessed)
2. Apply minimal fix
3. Verify: `npm test -- [specific-test-file]`
4. Commit: `git commit -m "fix(pdf): [actual issue fixed]"`

### 2.3: Provider Wiring (if needed, 30 min)

```tsx
// client/src/App.tsx
import { BrandChartThemeProvider } from '@/lib/chart-theme/chart-theme-provider';

function App() {
  return (
    <BrandChartThemeProvider>
      {/* existing app content unchanged */}
    </BrandChartThemeProvider>
  );
}
```

**Verify:**
```bash
npm run dev
# Visual: App loads, no console errors
# Check React DevTools: BrandChartThemeProvider in tree
```

**Commit:** `git commit -m "feat: wire BrandChartThemeProvider to App"`

### Block 2 Gate
```bash
npm test                # All passing (or known pre-existing failures only)
npm run baseline:check  # 0 new errors
npm run dev            # App loads with provider
```

---

## Block 3: Chrome Validation (2 hours)

**Objective:** Prove PDF infrastructure works in real scenario.

### 3.1: PDF Export Test (45 min)
1. Navigate to tear sheet dashboard (or equivalent PDF export page)
2. Click export button
3. Verify:
   - [ ] PDF downloads (blob, not 404)
   - [ ] PDF opens without corruption
   - [ ] Fonts render (Inter/Poppins, not system fonts)
   - [ ] Any charts render (not blank boxes)
   - [ ] Layout intact (no overflow)

**If issues found:**
- Document actual error in code comment
- Fix if < 30 min, otherwise add to PR as known limitation

### 3.2: Print Validation (30 min)
1. Navigate to dashboard with charts
2. Ctrl+P / Cmd+P
3. Verify:
   - [ ] Print preview shows content
   - [ ] Navigation hidden (if print.css exists)
   - [ ] Charts visible in preview
   - [ ] No content cut-off

### 3.3: Provider Verification (15 min)
```tsx
// Temporarily add to any chart page:
import { useChartTheme } from '@/lib/chart-theme/hooks';

function DebugTheme() {
  const theme = useChartTheme();
  console.log('Theme active:', theme); // Should log theme object
  return null;
}
```

**Remove after verification.**

### Block 3 Deliverable
```markdown
## Manual Validation Results

### PDF Export (Chrome)
- Download: [PASS/FAIL]
- Fonts: [PASS/FAIL - details]
- Charts: [PASS/FAIL - details]
- Layout: [PASS/FAIL - details]

### Print Preview (Chrome)
- Preview renders: [PASS/FAIL]
- Styling applied: [PASS/FAIL]

### Known Issues
- [Issue 1]: [description] - [fix plan or defer]
```

---

## Block 4: Component Migration Proof (2 hours)

**Objective:** Prove chart theme pattern works on one real component.

### Target Selection
Pick ONE component that:
- Has hardcoded COLORS array
- Is frequently visible (high-traffic page)
- Has existing tests

**Likely candidates:**
- `fund-overview.tsx`
- `portfolio-performance-chart.tsx`
- First component from Block 1.4 grep results

### Migration Steps (1.5 hours for one component)

**Step 1: Baseline (10 min)**
```bash
# Screenshot current state
npm run dev
# Navigate to page with component
# Take screenshot: before-[component].png
```

**Step 2: Migration (45 min)**
```tsx
// Before
const COLORS = ['#292929', '#555555', '#777777'];

<PieChart>
  <Pie>
    {data.map((entry, i) => (
      <Cell fill={COLORS[i % COLORS.length]} />
    ))}
  </Pie>
</PieChart>

// After
import { getChartColor, rechartsProps } from '@/lib/chart-theme';

<PieChart>
  <Pie>
    {data.map((entry, i) => (
      <Cell fill={getChartColor(i)} />
    ))}
  </Pie>
  <Tooltip {...rechartsProps.tooltip} />
</PieChart>
```

**Step 3: Verify (20 min)**
```bash
npm run dev
# Navigate to component
# Take screenshot: after-[component].png
# Compare: colors changed, layout intact

npm test -- [component-test-file]
# Must pass
```

**Step 4: Commit**
```bash
git add client/src/components/[component].tsx
git commit -m "feat(charts): migrate [component] to brand theme"
```

### Block 4 Gate
- One component migrated
- Visual regression clean (before/after match intent)
- Component tests pass
- Pattern proven for remaining components

---

## Block 5: Wrap-Up (1 hour)

### 5.1: Code Comments (15 min)
Add usage comment at top of provider file:
```tsx
// client/src/lib/chart-theme/chart-theme-provider.tsx

/**
 * BrandChartThemeProvider - Provides POV brand colors to all charts
 *
 * Usage:
 * - Already wired in App.tsx (no setup needed)
 * - In chart components: import { getChartColor, rechartsProps } from '@/lib/chart-theme'
 * - Replace: COLORS[i] -> getChartColor(i)
 * - Add: <Tooltip {...rechartsProps.tooltip} />
 *
 * See fund-overview.tsx for migration example.
 */
```

### 5.2: CHANGELOG Entry (10 min)
```markdown
## [Unreleased]

### Added
- BrandChartThemeProvider wired to App.tsx for global chart theming
- Migrated [component-name] to brand chart theme (pattern proof)

### Fixed
- [Any PDF test fixes made]
- [Any test runner fixes made]
```

### 5.3: Commit & Push (15 min)
```bash
git add -A
git commit -m "feat(phase3c): PDF validation + chart theme infrastructure"
git push -u origin claude/prioritize-tasks-0BRDX
```

### 5.4: PR Creation (20 min)
```markdown
## Summary
Phase 3C infrastructure validation: PDF generation + chart theming.

## Changes
- Fixed: [actual issues fixed, not assumed]
- Added: BrandChartThemeProvider wired to App.tsx
- Migrated: [component] to brand theme (pattern proof)

## Validation
- PDF export: Tested in Chrome, [PASS/issues found]
- Chart theme: One component migrated, visual regression clean
- Tests: All passing, 0 new TypeScript errors

## Deferred (Backlog)
- Remaining [X] component migrations
- Cross-browser testing
- Extensive documentation
- CohortEngine determinism
- Monte Carlo test enablement

## Files Changed
- [list actual files]
```

---

## What's Explicitly Deferred

| Item | Reason | Effort | When |
|------|--------|--------|------|
| 40+ component migrations | Pattern proven, scale later | 10-15h | Next sprint |
| Firefox/Safari testing | QA phase, Chrome proves feature | 2h | Pre-release |
| README documentation | Code comments sufficient | 2h | Post-sprint |
| BACKLOG.md | Not blocking delivery | 1h | Post-sprint |
| CohortEngine determinism | Not Phase 3C | 1h | Separate PR |
| Monte Carlo tests | Not Phase 3C | 2h | Separate PR |
| License exceptions | Not Phase 3C | 30min | Separate PR |

---

## Success Criteria

**Must Have (PASS/FAIL):**
- [ ] Test suite passes (or only pre-existing failures)
- [ ] TypeScript baseline: 0 new errors
- [ ] App loads with BrandChartThemeProvider
- [ ] PDF exports in Chrome (downloads, opens, fonts work)
- [ ] One component migrated to chart theme

**Nice to Have:**
- [ ] Second component migrated
- [ ] Print CSS validated
- [ ] Detailed before/after screenshots

---

## Timeline (REVISED with Verified Scope)

| Block | Duration | Day | Cumulative |
|-------|----------|-----|------------|
| 1: Investigation | 30 min | Day 1 AM | 0.5h |
| 2: Core Fixes | 2h | Day 1 AM | 2.5h |
| 3: Validation | 1h | Day 1 PM | 3.5h |
| 4: Migration | 2h | Day 1 PM | 5.5h |
| 5: Wrap-Up | 1h | Day 1 PM | 6.5h |

**Total: 6-8 hours over 1 day** (vs original 13-18 hours over 3 days)

### Why Reduced
- PDF tests: 1 file vs 4 claimed (75% reduction)
- Components: 6 vs 42+ claimed (85% reduction)
- Documentation: Code comments vs README essays
- Cross-browser: Chrome only vs 3 browsers
