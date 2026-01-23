# Epic J: Advanced Reporting + Sharing Audit

**Status:** AUDIT COMPLETE
**Date:** 2026-01-22

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
- Replace placeholder tax allocations
- Connect actual fund metrics (NAV, TVPI, DPI, IRR)
- Validate against golden datasets

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

Given complexity, focus on:
1. [x] Audit complete (this document)
2. [x] Create share endpoints (J.4) - `server/routes/shares.ts`, `shared/schema/shares.ts`
3. [x] Create report view page (J.2) - Updated `shared-dashboard.tsx` with real API
4. [x] E2E test for sharing - `tests/e2e/report-sharing.spec.ts`

Defer to future:
- Font bundling (requires asset pipeline work)
- Placeholder value replacement (requires fund calculation integration)
