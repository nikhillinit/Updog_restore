# Epic J: Advanced Reporting + Sharing Audit

**Status:** IMPLEMENTATION COMPLETE (J.1-J.6)
**Date:** 2026-01-23 (updated)

---

## Infrastructure Assessment

### PDF Generation
**File:** `server/services/pdf-generation-service.ts` (1,181 lines)
**Library:** `@react-pdf/renderer`

**Report Types Supported:**
- K-1 Tax Summary
- Quarterly Reports
- Capital Account Statements
- Annual Reports

**Issues:**
1. Fonts from Google CDN (lines 122-133) - adds latency, non-deterministic
2. Placeholder tax allocations (lines 1018-1031) - hardcoded 30%
3. Placeholder IRR (line 1086) - hardcoded 15%
4. Placeholder portfolio companies (lines 1096-1102)

### XLSX Export
**File:** `server/services/xlsx-generation-service.ts`
**Library:** ExcelJS
**Status:** PRODUCTION-READY

### Report Queue
**File:** `server/queues/report-generation-queue.ts` (468 lines)
**Status:** PRODUCTION-READY
- BullMQ with 2 concurrent workers
- SSE progress streaming
- 5-minute timeout, 2 retries

### Print Styles
**File:** `client/src/styles/print.css` (400 lines)
**Status:** COMPREHENSIVE
- Press On brand colors
- Page breaks, orphan control
- KPI grids, table styling

### Sharing Schema
**File:** `shared/sharing-schema.ts` (81 lines)
**Status:** DEFINED, NOT IMPLEMENTED

---

## Implementation Plan

### J.1 Font Bundling (PDF Determinism)
- Bundle Inter font WOFF2 in `assets/fonts/`
- Update pdf-generation-service.ts to use local path
- Remove CDN dependency

### J.2 Report View (Newspaper Mode)
- Create `client/src/pages/report-view.tsx`
- Styled for reading, uses print.css classes
- Header, body sections, page breaks
- Share button integration

### J.3 Export Strategy
- CSV export exists (needs completion)
- XLSX export ready
- Add JSON export option

### J.4 Sharing Backend
**Endpoints to create:**
```
POST   /api/shares              - Create share link
GET    /api/shares/:shareId     - Get share (public)
PATCH  /api/shares/:shareId     - Update share config
DELETE /api/shares/:shareId     - Revoke share
POST   /api/shares/:shareId/verify - Verify passkey
GET    /api/shares/:shareId/analytics - View stats
```

**Database table needed:** `shares` (from sharing-schema.ts)

### J.5 Financial Accuracy

**Status:** DOCUMENTED - Deferred to fund metrics integration

**Placeholder Values Identified (pdf-generation-service.ts):**

| Value | Location | Current | Should Be |
|-------|----------|---------|-----------|
| Tax allocations | :1025-1035 | 30% of distributions, fixed ratios | Real K-1 data from fund admin |
| Beginning balance | :1045 | 50% income bump | Prior period ending balance |
| NAV multiplier | :1087 | 1.15x | Actual fund NAV via fundMetrics |
| IRR | :1091 | 15% hardcoded | Calculated via XIRR |
| Portfolio companies | :1102-1106 | Hardcoded names/MOICs | Real holdings from investments |
| CA beginning balance | :1178 | 0 | Prior period balance |
| CA net income | :1181 | 0 | Performance allocation |

**Calculation Correctness Issues:**
- Quarterly report ignores quarter/year params (uses all transactions)
- Cash flows capped at 10 most recent (not filtered to period)
- TVPI/DPI formulas correct but fed placeholder NAV
- IRR not calculated (constant 0.15)
- XLSX "Unfunded Commitment" uses ending balance vs called

**Data Integration Needed:**
1. `lp_performance_snapshots` for NAV/TVPI/DPI
2. `fundMetrics` for calculated performance
3. Portfolio holdings/valuations for company list
4. Tax/K-1 allocations from distribution breakdowns

**Golden Dataset Recommendation:**
- Create `tests/fixtures/golden-datasets/lp-reporting-financials/`
- Include inputs.csv (cash flows, NAV snapshots)
- Include expected.csv (contributions, distributions, NAV, DPI, TVPI)
- Wire to existing `tests/utils/golden-dataset.ts` infrastructure
- Add K-1 allocation fixtures for tax accuracy tests

**Deferred:** This requires fund metrics service integration (Epic K+)

### J.6 Testing
- E2E test for report generation
- Test share link creation/access
- Test PDF consistency

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `assets/fonts/Inter-*.woff2` | CREATE - Bundled fonts |
| `server/services/pdf-generation-service.ts` | MODIFY - Local fonts |
| `client/src/pages/report-view.tsx` | CREATE - Newspaper mode |
| `server/routes/shares.ts` | CREATE - Share endpoints |
| `shared/schema.ts` | MODIFY - Add shares table |
| `tests/e2e/report-sharing.spec.ts` | CREATE - E2E tests |

---

## Scope for This Epic

**COMPLETE:**
1. [x] Audit complete (this document)
2. [x] J.1 PDF Determinism - Removed remote fonts, added UTC dates, generatedAt fields
3. [x] J.2 Report View - Updated `shared-dashboard.tsx` with real API + print button
4. [x] J.3 Export Strategy - ADR-017 documenting BullMQ pipeline decision
5. [x] J.4 Share endpoints - `server/routes/shares.ts`, `shared/schema/shares.ts`
6. [x] J.5 Financial Accuracy - Documented all placeholders, deferred to metrics integration
7. [x] J.6 E2E tests - `tests/e2e/report-sharing.spec.ts`

**DEFERRED to future:**
- Font bundling (using system Helvetica instead - sufficient for determinism)
- Placeholder value replacement (requires fund calculation service integration)
- SSE progress exposure (infrastructure exists, needs wiring)
