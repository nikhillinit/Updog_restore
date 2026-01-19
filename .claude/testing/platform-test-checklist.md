---
status: ACTIVE
last_updated: 2026-01-19
---

# Platform Testing Quick Reference Checklist

**Purpose:** Fast pre-release smoke test covering all critical paths
**Estimated Time:** 20 minutes
**Use Case:** Quick validation before deployments, demos, or releases

---

## Pre-Test Setup (2 minutes)

- [ ] Database seeded with test data (fund, companies, investments)
- [ ] Development server running (`npm run dev`)
- [ ] Browser DevTools open (Console + Network tabs)
- [ ] Clear browser cache and localStorage
- [ ] Redis running (for caching tests)

---

## Fund Setup (3 minutes)

- [ ] Navigate to `/funds/new`
- [ ] Complete 7-step wizard with valid data
- [ ] Verify fund created successfully
- [ ] Verify redirect to fund dashboard
- [ ] Verify fund appears in fund list

**Critical Issues to Watch:**
- Wizard navigation breaks
- Validation errors block submission
- Fund not created in database

---

## Portfolio Management (4 minutes)

- [ ] Create new company (name, sector, stage)
- [ ] Record initial investment ($1M at $10M valuation)
- [ ] Verify cap table shows 10% ownership
- [ ] Record follow-on investment ($500K)
- [ ] Verify cap table updates with dilution
- [ ] Record exit event ($5M proceeds)
- [ ] Verify MOIC calculated correctly

**Critical Issues to Watch:**
- Cap table calculations incorrect
- Ownership % wrong
- MOIC/IRR not displaying

---

## Calculation Engines (4 minutes)

- [ ] Navigate to company with investments
- [ ] Verify IRR displayed (cross-check with Excel if possible)
- [ ] Navigate to fund dashboard
- [ ] Verify waterfall distribution preview renders
- [ ] Navigate to Monte Carlo page
- [ ] Run 10k simulation
- [ ] Verify completes <5 seconds
- [ ] Verify distribution chart renders

**Critical Issues to Watch:**
- IRR calculation errors
- Monte Carlo timeout or crash
- Charts fail to render

---

## Analytics & Reporting (3 minutes)

- [ ] Navigate to fund dashboard
- [ ] Verify all key metrics display (MOIC, IRR, TVPI, DPI)
- [ ] Verify performance chart renders
- [ ] Navigate to Portfolio Performance table
- [ ] Sort by MOIC (descending)
- [ ] Export to CSV
- [ ] Verify CSV downloads and opens in Excel

**Critical Issues to Watch:**
- Metrics display "NaN" or incorrect values
- Charts don't render
- Export fails

---

## LP Portal (2 minutes)

- [ ] Logout of GP account
- [ ] Login as LP user
- [ ] Verify LP dashboard displays capital account summary
- [ ] Navigate to Capital Calls tab
- [ ] Verify capital calls listed
- [ ] Navigate to Distributions tab
- [ ] Verify distributions listed
- [ ] Logout

**Critical Issues to Watch:**
- LP cannot login
- LP sees other LP's data (privacy breach)
- Capital calls/distributions missing

---

## API Integration (2 minutes)

- [ ] Open browser DevTools → Network tab
- [ ] Navigate to `/api/funds`
- [ ] Verify response 200 (if authenticated)
- [ ] Verify response format: `{success: true, data: [...]}`
- [ ] Create new company via UI
- [ ] Verify POST `/api/portfolio/companies` returns 201
- [ ] Verify response includes created company ID

**Critical Issues to Watch:**
- API returns 500 errors
- Response format inconsistent
- Authentication failures

---

## Cross-Cutting Concerns (2 minutes)

**Security:**
- [ ] Attempt to access `/funds/new` without login → redirect to login
- [ ] Login with wrong password → error message
- [ ] Verify HTTPS in URL (production only)

**Performance:**
- [ ] Dashboard loads <3 seconds
- [ ] API responses <1 second (check Network tab)
- [ ] No console errors in DevTools

**Accessibility:**
- [ ] Tab through dashboard (keyboard only)
- [ ] Verify focus visible on all interactive elements
- [ ] Press Enter on button → activates

**Mobile:**
- [ ] Resize browser to 375px width
- [ ] Verify no horizontal scroll
- [ ] Verify hamburger menu appears
- [ ] Tap menu → drawer opens

**Critical Issues to Watch:**
- Authentication broken
- Console errors on every page
- Page load >5 seconds
- Cannot navigate with keyboard

---

## Scenario Comparison (NEW - 2 minutes)

- [ ] Navigate to Scenario Comparison page (`/scenario-comparison`)
- [ ] Select 2 scenarios (base + comparison)
- [ ] Click "Compare Scenarios"
- [ ] Verify comparison results display
- [ ] Verify delta metrics table renders
- [ ] Verify trend indicators (↑/↓) correct
- [ ] Note comparison ID from URL
- [ ] Refresh page
- [ ] Verify cached result loads (no recalculation)

**Critical Issues to Watch:**
- Comparison fails to create
- Delta metrics incorrect
- Cache not working (404 on refresh)

---

## Pass/Fail Criteria

**PASS:** All checkboxes checked, no critical issues encountered

**FAIL:** Any of the following encountered:
- Data loss (fund/company/investment not saved)
- Calculation error (MOIC/IRR wrong by >1%)
- Authentication bypass (LP sees other LP data)
- Console errors (except warnings)
- Page crash or infinite loading

---

## Quick Issue Triage

**If test fails:**

1. **Check console for errors** - Copy error message
2. **Check Network tab** - Identify failed API call (status code)
3. **Try incognito mode** - Rule out cache issues
4. **Restart dev server** - Rule out server state issues
5. **Check database** - Verify test data exists

**Severity Levels:**
- **BLOCKER:** Data loss, security breach, app crash → Stop deployment
- **CRITICAL:** Core feature broken, no workaround → Fix before release
- **MAJOR:** Feature broken, workaround exists → Fix ASAP
- **MINOR:** UI/UX issue, cosmetic defect → Schedule fix

---

## Smoke Test Report Template

```
SMOKE TEST REPORT
Date: [YYYY-MM-DD]
Tester: [Name]
Branch: [git branch name]
Build: [git commit hash]

RESULTS:
Fund Setup: PASS / FAIL
Portfolio Management: PASS / FAIL
Calculation Engines: PASS / FAIL
Analytics & Reporting: PASS / FAIL
LP Portal: PASS / FAIL
API Integration: PASS / FAIL
Cross-Cutting: PASS / FAIL
Scenario Comparison: PASS / FAIL

OVERALL: PASS / FAIL

ISSUES FOUND:
1. [Issue description] - Severity: [BLOCKER/CRITICAL/MAJOR/MINOR]
2. ...

NOTES:
[Any additional observations]
```

---

## Related Documentation

- [platform-testing-rubric-index.md](platform-testing-rubric-index.md) - Full comprehensive rubrics
- [scenario-comparison-manual-test-rubric.md](scenario-comparison-manual-test-rubric.md) - Detailed scenario comparison testing
- [cheatsheets/pr-merge-verification.md](../../cheatsheets/pr-merge-verification.md) - PR verification process

---

## Version History

| Version | Date       | Changes                           |
|---------|------------|-----------------------------------|
| 1.0     | 2025-12-23 | Initial quick reference checklist |
