---
status: ACTIVE
last_updated: 2026-01-19
---

# Manual Testing Rubric: Scenario Comparison MVP

**Feature:** Scenario Comparison Tool (Phase 1 - Ephemeral Comparisons)
**Version:** 1.0.0
**Test Date:** _______________
**Tester:** _______________
**Environment:** Development / Staging / Production
**Estimated Time:** 90 minutes

---

## Executive Summary

### Feature Scope
- **What's Included (MVP Phase 1):**
  - Ephemeral scenario comparisons (2-6 scenarios)
  - 5 performance metrics (MOIC, total investment, follow-ons, exit proceeds, exit valuation)
  - Redis caching (5min TTL, optional)
  - Delta calculations (absolute + percentage)
  - Visual comparison table with trend indicators

- **What's Excluded (Phase 2):**
  - Saved configurations
  - Export functionality (CSV/PDF)
  - Access tracking/audit logs
  - Advanced metrics (IRR, TVPI, DPI)
  - Portfolio-level scenarios

### Critical Issues to Verify

**ISSUE #1: ScenarioSelector Component Prop Mismatch** [CRITICAL]
- **Problem:** Page passes `value`/`onChange` props, but component expects `baseScenarioId`/`comparisonScenarioIds`/`onBaseChange`/`onComparisonChange`
- **Impact:** Component may not render correctly
- **Test:** Verify scenario selection UI loads and functions
- **Status:** [ ] PASS [ ] FAIL [ ] N/A

**ISSUE #2: API vs UI Max Scenario Count** [DOCUMENTATION]
- **API:** Max 5 comparison scenarios (1 base + 5 comparisons = 6 total)
- **UI:** Shows "6 scenarios max"
- **Test:** Verify error when selecting >6 total scenarios
- **Status:** [ ] PASS [ ] FAIL [ ] N/A

---

## Pre-Test Setup

### Database Prerequisites
- [ ] PostgreSQL running and accessible
- [ ] `portfolio_companies` table has at least 1 record (id=1)
- [ ] `scenarios` table has at least 6 test scenarios
- [ ] Each scenario has at least 2 `scenario_cases`
- [ ] All cases have valid probability values (sum = 1.0 per scenario)

### Environment Prerequisites
- [ ] Redis running (optional - test both with/without)
- [ ] Development server running (`npm run dev`)
- [ ] Frontend accessible at http://localhost:5173
- [ ] Backend API accessible at http://localhost:5000
- [ ] Browser console open (check for errors)
- [ ] Network tab open (monitor API calls)

### Test Data Setup
```sql
-- Verify test scenarios exist
SELECT s.id, s.name, COUNT(sc.id) as case_count
FROM scenarios s
LEFT JOIN scenario_cases sc ON s.id = sc.scenario_id
WHERE s.company_id = 1
GROUP BY s.id, s.name
HAVING COUNT(sc.id) >= 2
LIMIT 10;
```

Expected: At least 6 scenarios with 2+ cases each

---

## Test Phase 1: Functional Testing (MUST PASS)

### 1.1 Page Load & Empty State

| Test Case | Steps | Expected Result | Actual Result | Pass/Fail |
|-----------|-------|-----------------|---------------|-----------|
| TC-001 | Navigate to `/scenario-comparison` | Page loads without errors | | [ ] PASS [ ] FAIL |
| TC-002 | Check browser console | No React errors or warnings | | [ ] PASS [ ] FAIL |
| TC-003 | Verify empty state | Shows "No scenarios selected" message | | [ ] PASS [ ] FAIL |
| TC-004 | Check compare button | Button is disabled (grayed out) | | [ ] PASS [ ] FAIL |

### 1.2 Scenario Selection (2-6 Scenarios)

| Test Case | Steps | Expected Result | Actual Result | Pass/Fail |
|-----------|-------|-----------------|---------------|-----------|
| TC-010 | Click "Base Scenario" button | Popover opens with scenario list | | [ ] PASS [ ] FAIL |
| TC-011 | Select a base scenario | Popover closes, scenario name displayed | | [ ] PASS [ ] FAIL |
| TC-012 | Click "Compare Against (0/5)" button | Popover opens with checkboxes | | [ ] PASS [ ] FAIL |
| TC-013 | Select 1 comparison scenario | Checkbox checked, badge appears | | [ ] PASS [ ] FAIL |
| TC-014 | Verify validation message | "Please select at least one more scenario" shown | | [ ] PASS [ ] FAIL |
| TC-015 | Select 2nd comparison scenario | Compare button enabled, message disappears | | [ ] PASS [ ] FAIL |
| TC-016 | Add scenarios to total of 6 | All badges displayed, counter shows "5/5" | | [ ] PASS [ ] FAIL |
| TC-017 | Try to add 7th scenario | Checkbox disabled or error shown | | [ ] PASS [ ] FAIL |
| TC-018 | Remove a scenario via badge X | Badge removed, counter decrements | | [ ] PASS [ ] FAIL |
| TC-019 | Change base scenario | Previous base moved to available comparisons | | [ ] PASS [ ] FAIL |
| TC-020 | Select base that's in comparisons | Scenario auto-removed from comparison list | | [ ] PASS [ ] FAIL |

### 1.3 Comparison Execution

| Test Case | Steps | Expected Result | Actual Result | Pass/Fail |
|-----------|-------|-----------------|---------------|-----------|
| TC-030 | Click "Compare Scenarios" | Loading spinner appears | | [ ] PASS [ ] FAIL |
| TC-031 | Monitor network tab | POST to `/api/portfolio/comparisons` | | [ ] PASS [ ] FAIL |
| TC-032 | Check request body | Contains fundId, baseScenarioId, comparisonScenarioIds, comparisonMetrics | | [ ] PASS [ ] FAIL |
| TC-033 | Check response status | HTTP 200 OK | | [ ] PASS [ ] FAIL |
| TC-034 | Check response structure | Has id, status, scenarios, deltaMetrics, comparisonMetrics, createdAt, expiresAt | | [ ] PASS [ ] FAIL |
| TC-035 | Verify loading completes | Spinner disappears, results shown | | [ ] PASS [ ] FAIL |
| TC-036 | Check response time | < 2 seconds for 6 scenarios | | [ ] PASS [ ] FAIL |

### 1.4 Results Display

| Test Case | Steps | Expected Result | Actual Result | Pass/Fail |
|-----------|-------|-----------------|---------------|-----------|
| TC-040 | Check results card header | Shows scenario count and metric count | | [ ] PASS [ ] FAIL |
| TC-041 | Check expiration time | Displays "Expires: HH:MM:SS" (5min from now) | | [ ] PASS [ ] FAIL |
| TC-042 | Verify table structure | Headers: Metric, Base Scenario, Comparison 1, ... | | [ ] PASS [ ] FAIL |
| TC-043 | Check metric rows | 5 rows: MOIC, Total Investment, Follow-ons, Exit Proceeds, Exit Valuation | | [ ] PASS [ ] FAIL |
| TC-044 | Verify base column | Shows calculated values for base scenario | | [ ] PASS [ ] FAIL |
| TC-045 | Verify comparison columns | Shows calculated values + deltas | | [ ] PASS [ ] FAIL |
| TC-046 | Check delta formatting | Absolute: "+$XXM" or "-$XXK", Percentage: "+XX.X%" | | [ ] PASS [ ] FAIL |
| TC-047 | Verify delta indicators | Green up-arrow (better), red down-arrow (worse), gray dash (insignificant) | | [ ] PASS [ ] FAIL |
| TC-048 | Check base scenario badge | Yellow star icon + "Base" badge in table header | | [ ] PASS [ ] FAIL |

### 1.5 Delta Calculation Accuracy

Test with known scenario data:
- **Base Scenario:** Investment=$1M, Exit=$3M, MOIC=3.0x
- **Comparison Scenario:** Investment=$1M, Exit=$4M, MOIC=4.0x

| Test Case | Metric | Expected Delta | Actual Delta | Pass/Fail |
|-----------|--------|----------------|--------------|-----------|
| TC-050 | MOIC | Absolute: +1.0x, Percentage: +33.3% | | [ ] PASS [ ] FAIL |
| TC-051 | Total Investment | Absolute: $0, Percentage: 0% | | [ ] PASS [ ] FAIL |
| TC-052 | Exit Proceeds | Absolute: +$1M, Percentage: +33.3% | | [ ] PASS [ ] FAIL |
| TC-053 | Trend: MOIC | Green up-arrow (higher is better) | | [ ] PASS [ ] FAIL |
| TC-054 | Trend: Investment | Gray dash (no change) | | [ ] PASS [ ] FAIL |

### 1.6 Cache Behavior

| Test Case | Steps | Expected Result | Actual Result | Pass/Fail |
|-----------|-------|-----------------|---------------|-----------|
| TC-060 | Complete a comparison | Note the comparison ID from network tab | | [ ] PASS [ ] FAIL |
| TC-061 | GET `/api/portfolio/comparisons/{id}` | Returns same result, HTTP 200 | | [ ] PASS [ ] FAIL |
| TC-062 | Wait 5+ minutes | | | [ ] WAIT |
| TC-063 | GET `/api/portfolio/comparisons/{id}` again | Returns 404 "expired or not found" | | [ ] PASS [ ] FAIL |
| TC-064 | Recreate same comparison | Generates new ID, HTTP 200 | | [ ] PASS [ ] FAIL |

---

## Test Phase 2: Input Validation (MUST PASS)

### 2.1 API Request Validation

Test using browser DevTools or Postman:

| Test Case | Request Body | Expected Response | Actual Response | Pass/Fail |
|-----------|--------------|-------------------|-----------------|-----------|
| TC-100 | `{}` (empty) | 400 "Invalid request" | | [ ] PASS [ ] FAIL |
| TC-101 | Missing `fundId` | 400 with field error | | [ ] PASS [ ] FAIL |
| TC-102 | `fundId: "string"` | 400 "Expected number" | | [ ] PASS [ ] FAIL |
| TC-103 | `fundId: -1` | 400 "Must be positive" | | [ ] PASS [ ] FAIL |
| TC-104 | `baseScenarioId: "not-a-uuid"` | 400 "Invalid UUID" | | [ ] PASS [ ] FAIL |
| TC-105 | `comparisonScenarioIds: []` | 400 "At least one required" | | [ ] PASS [ ] FAIL |
| TC-106 | 6 comparison scenarios (7 total) | 400 "Maximum 5 allowed" | | [ ] PASS [ ] FAIL |
| TC-107 | `comparisonMetrics: []` | Uses defaults: moic, total_investment, exit_proceeds | | [ ] PASS [ ] FAIL |
| TC-108 | Extra field `foo: "bar"` | 400 (strict mode rejects) | | [ ] PASS [ ] FAIL |
| TC-109 | Non-existent scenario ID | 404 "Scenarios not found: {id}" | | [ ] PASS [ ] FAIL |
| TC-110 | Mix of valid/invalid IDs | 404 lists all missing IDs | | [ ] PASS [ ] FAIL |

---

## Test Phase 3: Error Handling (SHOULD PASS)

### 3.1 Network Errors

| Test Case | Steps | Expected Result | Actual Result | Pass/Fail |
|-----------|-------|-----------------|---------------|-----------|
| TC-200 | Disable network, click compare | Error alert shown with message | | [ ] PASS [ ] FAIL |
| TC-201 | Re-enable network, retry | Comparison succeeds | | [ ] PASS [ ] FAIL |
| TC-202 | Simulate 500 error (backend crash) | "Internal server error" alert | | [ ] PASS [ ] FAIL |
| TC-203 | Simulate timeout (slow network) | Request eventually fails with timeout message | | [ ] PASS [ ] FAIL |

### 3.2 Redis Degradation

| Test Case | Steps | Expected Result | Actual Result | Pass/Fail |
|-----------|-------|-----------------|---------------|-----------|
| TC-210 | Stop Redis server | Check server logs for warning | | [ ] PASS [ ] FAIL |
| TC-211 | Create comparison (Redis down) | Comparison succeeds, HTTP 200 | | [ ] PASS [ ] FAIL |
| TC-212 | GET cached comparison | Returns 404 (cache unavailable) | | [ ] PASS [ ] FAIL |
| TC-213 | Restart Redis | New comparisons cached normally | | [ ] PASS [ ] FAIL |

### 3.3 Data Edge Cases

| Test Case | Scenario Data | Expected Behavior | Actual Behavior | Pass/Fail |
|-----------|---------------|-------------------|-----------------|-----------|
| TC-220 | Investment = $0 | MOIC = null, percentage delta = null | | [ ] PASS [ ] FAIL |
| TC-221 | Exit proceeds = $0 | MOIC = 0x (loss), delta calculated | | [ ] PASS [ ] FAIL |
| TC-222 | Single case (probability=1.0) | Weighted summary = case values | | [ ] PASS [ ] FAIL |
| TC-223 | Large numbers ($10B+) | Formatted as "$10000M" or "$10B" | | [ ] PASS [ ] FAIL |
| TC-224 | Small numbers (<$1K) | Formatted with 2 decimals | | [ ] PASS [ ] FAIL |
| TC-225 | Identical scenarios | All deltas = 0, gray indicators | | [ ] PASS [ ] FAIL |
| TC-226 | Base value=0, comparison>0 | Percentage delta = null, absolute shown | | [ ] PASS [ ] FAIL |

---

## Test Phase 4: User Experience (NICE TO HAVE)

### 4.1 Loading & Disabled States

| Test Case | Steps | Expected Result | Actual Result | Pass/Fail |
|-----------|-------|-----------------|---------------|-----------|
| TC-300 | Click compare, immediately click again | Second click ignored (button disabled) | | [ ] PASS [ ] FAIL |
| TC-301 | During loading | Spinner shown, button text "Comparing..." | | [ ] PASS [ ] FAIL |
| TC-302 | Select <2 scenarios | Compare button disabled with opacity-50 | | [ ] PASS [ ] FAIL |
| TC-303 | Select >6 scenarios | Error message shown, compare disabled | | [ ] PASS [ ] FAIL |

### 4.2 Validation Messages

| Test Case | Trigger | Message Text | Display Style | Pass/Fail |
|-----------|---------|--------------|---------------|-----------|
| TC-310 | 1 scenario selected | "Please select at least one more scenario" | Alert (info) | [ ] PASS [ ] FAIL |
| TC-311 | >6 scenarios selected | "Maximum 6 scenarios allowed" | Alert (destructive) | [ ] PASS [ ] FAIL |
| TC-312 | API error | Error message from server | Alert (destructive) | [ ] PASS [ ] FAIL |
| TC-313 | Message appearance | Smooth fade-in transition | Visual | [ ] PASS [ ] FAIL |

### 4.3 Visual Feedback

| Test Case | Element | Expected Behavior | Actual Behavior | Pass/Fail |
|-----------|---------|-------------------|-----------------|-----------|
| TC-320 | Scenario badge X button | Hover shows red background | | [ ] PASS [ ] FAIL |
| TC-321 | Compare button | Hover shows primary color | | [ ] PASS [ ] FAIL |
| TC-322 | Disabled button | Cursor: not-allowed | | [ ] PASS [ ] FAIL |
| TC-323 | Popover transitions | Smooth slide-in animation | | [ ] PASS [ ] FAIL |
| TC-324 | Delta indicators | Icons visible and colored | | [ ] PASS [ ] FAIL |

---

## Test Phase 5: Security & Performance (MUST PASS)

### 5.1 Security Verification

| Test Case | Attack Vector | Expected Defense | Actual Defense | Pass/Fail |
|-----------|---------------|------------------|----------------|-----------|
| TC-400 | Scenario name: `<script>alert('XSS')</script>` | Rendered as text, not executed | | [ ] PASS [ ] FAIL |
| TC-401 | Scenario name: `'; DROP TABLE scenarios;--` | UUID validation prevents SQL injection | | [ ] PASS [ ] FAIL |
| TC-402 | Request with extra fields | 400 error (strict mode) | | [ ] PASS [ ] FAIL |
| TC-403 | Very long scenario name (10K chars) | Truncated in UI, no crash | | [ ] PASS [ ] FAIL |
| TC-404 | Invalid UUID injection | 400 "Invalid UUID format" | | [ ] PASS [ ] FAIL |

### 5.2 Performance Benchmarks

| Test Case | Scenario Count | Expected Time | Actual Time | Pass/Fail |
|-----------|----------------|---------------|-------------|-----------|
| TC-410 | 2 scenarios (min) | < 500ms | | [ ] PASS [ ] FAIL |
| TC-411 | 6 scenarios (max) | < 2s | | [ ] PASS [ ] FAIL |
| TC-412 | 6 scenarios, 10 cases each | < 3s | | [ ] PASS [ ] FAIL |
| TC-413 | Cached retrieval | < 100ms | | [ ] PASS [ ] FAIL |

### 5.3 Resource Limits

| Test Case | Limit | Expected Enforcement | Actual Enforcement | Pass/Fail |
|-----------|-------|----------------------|-------------------|-----------|
| TC-420 | Max scenarios | 6 total (1 base + 5 comparisons) | | [ ] PASS [ ] FAIL |
| TC-421 | Max metrics | 14 (all enum values) | | [ ] PASS [ ] FAIL |
| TC-422 | Cache TTL | Expires after 5 minutes | | [ ] PASS [ ] FAIL |
| TC-423 | Request body size | No explicit limit (relies on server config) | | [ ] PASS [ ] FAIL |

---

## Test Phase 6: Accessibility (SHOULD PASS)

### 6.1 Keyboard Navigation

| Test Case | Keys | Expected Behavior | Actual Behavior | Pass/Fail |
|-----------|------|-------------------|-----------------|-----------|
| TC-500 | Tab through page | Focus order: Base selector → Comparison selector → Compare button → Results | | [ ] PASS [ ] FAIL |
| TC-501 | Enter on popover trigger | Opens popover | | [ ] PASS [ ] FAIL |
| TC-502 | Escape in popover | Closes popover | | [ ] PASS [ ] FAIL |
| TC-503 | Space on checkbox | Toggles selection | | [ ] PASS [ ] FAIL |
| TC-504 | Tab in popover | Navigates through checkboxes | | [ ] PASS [ ] FAIL |

### 6.2 Screen Reader Support

| Test Case | Element | Expected Announcement | Actual Announcement | Pass/Fail |
|-----------|---------|----------------------|---------------------|-----------|
| TC-510 | Base selector button | "Base Scenario, button" | | [ ] PASS [ ] FAIL |
| TC-511 | Comparison selector | "Compare Against (X/Y), button" | | [ ] PASS [ ] FAIL |
| TC-512 | Validation alert | Announces message text | | [ ] PASS [ ] FAIL |
| TC-513 | Loading state | "Comparing..." or aria-live announcement | | [ ] PASS [ ] FAIL |
| TC-514 | Delta indicators | Arrow up/down with context | | [ ] PASS [ ] FAIL |

### 6.3 Visual Accessibility

| Test Case | Element | WCAG Standard | Measured Contrast | Pass/Fail |
|-----------|---------|---------------|-------------------|-----------|
| TC-520 | Green delta (better) | AA (4.5:1) | | [ ] PASS [ ] FAIL |
| TC-521 | Red delta (worse) | AA (4.5:1) | | [ ] PASS [ ] FAIL |
| TC-522 | Disabled button text | AA (4.5:1) | | [ ] PASS [ ] FAIL |
| TC-523 | Error alert text | AA (4.5:1) | | [ ] PASS [ ] FAIL |

---

## Known Limitations (Phase 1 MVP)

### Functional Limitations
- [ ] **VERIFIED:** No saved comparison configurations
- [ ] **VERIFIED:** No export functionality (CSV/PDF/XLSX)
- [ ] **VERIFIED:** No comparison history or saved searches
- [ ] **VERIFIED:** Comparisons expire after 5 minutes
- [ ] **VERIFIED:** Deal-level scenarios only (no portfolio-level)

### Metric Limitations
- [ ] **VERIFIED:** IRR not calculated (returns 0)
- [ ] **VERIFIED:** TVPI not calculated (returns 0)
- [ ] **VERIFIED:** DPI not calculated (returns 0)
- [ ] **VERIFIED:** Only 5 of 14 metrics functional

### UI Limitations
- [ ] **VERIFIED:** No scenario search/filter in selector
- [ ] **VERIFIED:** No drag-and-drop scenario reordering
- [ ] **VERIFIED:** No metric customization (fixed 5 metrics)
- [ ] **VERIFIED:** No sorting in results table
- [ ] **VERIFIED:** No keyboard shortcuts beyond defaults

---

## Sign-Off Checklist

### Pre-Deployment Verification

**Critical Functionality:**
- [ ] All TC-001 through TC-048 PASS (core functionality)
- [ ] All TC-050 through TC-063 PASS (delta calculations + cache)
- [ ] All TC-100 through TC-110 PASS (input validation)
- [ ] All TC-400 through TC-404 PASS (security)
- [ ] ISSUE #1 (ScenarioSelector props) RESOLVED or DOCUMENTED

**Important Functionality:**
- [ ] At least 80% of Phase 3 tests PASS (error handling)
- [ ] At least 70% of Phase 4 tests PASS (UX)
- [ ] At least 60% of Phase 6 tests PASS (accessibility)

**Performance:**
- [ ] Response times < 2s for 6 scenarios
- [ ] No memory leaks observed during 10+ comparisons
- [ ] Browser console shows no errors/warnings

**Documentation:**
- [ ] All FAIL items documented with screenshots
- [ ] All known limitations verified
- [ ] Deployment notes prepared for Phase 2

### Sign-Off

**Tested By:** _______________
**Date:** _______________
**Environment:** _______________
**Overall Status:** [ ] PASS [ ] CONDITIONAL PASS [ ] FAIL

**Notes:**
```
[Space for tester notes, issues found, workarounds, etc.]




```

**Approver:** _______________
**Date:** _______________

---

## Appendix A: Test Data Templates

### Scenario Data for Manual Tests

```sql
-- Test Scenario 1 (Base): Conservative
INSERT INTO scenarios (id, company_id, name, is_default)
VALUES ('00000000-0000-0000-0000-000000000001', 1, 'Conservative Scenario', false);

INSERT INTO scenario_cases (scenario_id, case_name, probability, investment, follow_ons, exit_proceeds, exit_valuation)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Downside', 0.3, 1000000, 200000, 1500000, 2500000),
  ('00000000-0000-0000-0000-000000000001', 'Base', 0.5, 1000000, 300000, 3000000, 5000000),
  ('00000000-0000-0000-0000-000000000001', 'Upside', 0.2, 1000000, 500000, 5000000, 8000000);

-- Test Scenario 2: Aggressive
-- (repeat pattern with different values)
```

### API Test Requests (Postman/cURL)

```bash
# Valid Comparison Request
curl -X POST http://localhost:5000/api/portfolio/comparisons \
  -H "Content-Type: application/json" \
  -d '{
    "fundId": 1,
    "baseScenarioId": "00000000-0000-0000-0000-000000000001",
    "comparisonScenarioIds": ["00000000-0000-0000-0000-000000000002"],
    "comparisonMetrics": ["moic", "total_investment", "exit_proceeds"]
  }'

# Invalid Request (empty body)
curl -X POST http://localhost:5000/api/portfolio/comparisons \
  -H "Content-Type: application/json" \
  -d '{}'

# Retrieve Cached Comparison
curl http://localhost:5000/api/portfolio/comparisons/{comparison-id}
```

---

## Appendix B: Bug Report Template

**Title:** [Component] - [Short description]

**Severity:** Critical / High / Medium / Low

**Environment:**
- OS: Windows/Mac/Linux
- Browser: Chrome/Firefox/Safari
- Version: _______________

**Test Case:** TC-XXX

**Steps to Reproduce:**
1. Navigate to...
2. Click on...
3. Enter...
4. Observe...

**Expected Result:**
[What should happen]

**Actual Result:**
[What actually happened]

**Screenshots:**
[Attach if applicable]

**Console Errors:**
```
[Paste console output]
```

**Network Tab:**
```
[Paste request/response if relevant]
```

**Workaround:**
[If any]

---

## Appendix C: Quick Reference

### HTTP Status Codes
- **200 OK:** Comparison created/retrieved successfully
- **400 Bad Request:** Validation error (check response.details for field errors)
- **404 Not Found:** Scenarios not found or comparison expired
- **500 Internal Server Error:** Server crash (check logs)

### Cache Behavior
- **TTL:** 5 minutes (300 seconds)
- **Key Format:** `comparison:{uuid}`
- **Miss Behavior:** Returns 404 (not regenerated)
- **Redis Optional:** Degrades gracefully if unavailable

### Metric Trends
- **Higher is Better:** MOIC, IRR, TVPI, DPI, exit proceeds, exit valuation
- **Lower is Better:** Total investment, follow-ons

### Supported Browsers
- Chrome 90+ (recommended)
- Firefox 88+
- Safari 14+
- Edge 90+

---

**END OF RUBRIC**
