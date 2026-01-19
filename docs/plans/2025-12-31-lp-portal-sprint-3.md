---
status: HISTORICAL
last_updated: 2026-01-19
---

# LP Portal Sprint 3 - Capital Calls, Distributions & Dashboard

**Created:** 2025-12-31
**Status:** PLANNING
**Rubric:** `.claude/testing/rubric-lp-portal.md`
**Duration:** 2 weeks

---

## Executive Summary

Sprint 3 builds on the Sprint 2 infrastructure (storage, email, PDF/XLSX generation, report queues) to deliver the core LP-facing functionality: capital call tracking, distribution history with tax breakdowns, and an enhanced dashboard with performance metrics and activity feeds.

## Sprint 2 Completion Status

The following infrastructure was delivered in Sprint 2 (PR #324):

| Component | Status | Location |
|-----------|--------|----------|
| Storage Service (S3/local/memory) | COMPLETE | `server/services/storage-service.ts` |
| Email Service (SMTP/SendGrid) | COMPLETE | `server/services/email-service.ts` |
| PDF Generation (K-1, quarterly, capital account) | COMPLETE | `server/services/pdf-generation-service.ts` |
| XLSX Generation (exports) | COMPLETE | `server/services/xlsx-generation-service.ts` |
| Report Queue (BullMQ) | COMPLETE | `server/queues/report-generation-queue.ts` |
| LP Notification Service | COMPLETE | `server/services/lp-notification-service.ts` |
| LP API (11 endpoints) | COMPLETE | `server/routes/lp-api.ts` |
| Test Fixtures | COMPLETE | `tests/fixtures/lp-data.ts` |
| Integration Tests | COMPLETE | `tests/api/lp-portal.test.ts` |

---

## Sprint 3 Scope

### Week 1: Capital Calls & Distributions

#### 1.1 Capital Call History API (TC-LP-003)

**Priority:** P0
**Test Cases:** TC-LP-003a through TC-LP-003d

**New Endpoints:**

```typescript
// Capital call endpoints
GET  /api/lp/capital-calls                    // List all capital calls
GET  /api/lp/capital-calls/:callId            // Get capital call details
POST /api/lp/capital-calls/:callId/payment    // Submit payment confirmation
GET  /api/lp/capital-calls/pending            // Get pending/due capital calls
```

**Schema:**

```typescript
// shared/types/lp-capital-calls.ts
export interface CapitalCall {
  id: string;
  lpId: number;
  fundId: number;
  fundName: string;
  callNumber: number;
  callAmount: number;          // In cents
  dueDate: string;             // ISO date
  status: 'pending' | 'due' | 'overdue' | 'paid' | 'partial';
  purpose: string;
  callDate: string;            // When the call was issued
  paidAmount?: number;         // Amount paid (if partial/paid)
  paidDate?: string;           // When payment was received
  wireInstructions: {
    bankName: string;
    accountName: string;
    accountNumber: string;     // Masked: ****1234
    routingNumber: string;     // Masked: ****5678
    reference: string;
  };
  daysUntilDue?: number;       // Computed field
  daysOverdue?: number;        // Computed field
}

export interface PaymentSubmission {
  callId: string;
  amount: number;
  paymentDate: string;
  referenceNumber: string;
  wireReceiptUrl?: string;     // Uploaded receipt
}
```

**Database Changes:**

```sql
-- Migration: 0007_capital_calls.sql
CREATE TABLE lp_capital_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_id INTEGER NOT NULL REFERENCES limited_partners(id),
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  call_number INTEGER NOT NULL,
  call_amount_cents BIGINT NOT NULL,
  due_date DATE NOT NULL,
  call_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  purpose TEXT,
  paid_amount_cents BIGINT,
  paid_date DATE,
  wire_instructions JSONB NOT NULL,
  idempotency_key VARCHAR(255) UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(lp_id, fund_id, call_number)
);

CREATE INDEX idx_capital_calls_lp_status ON lp_capital_calls(lp_id, status);
CREATE INDEX idx_capital_calls_due_date ON lp_capital_calls(due_date);

CREATE TABLE lp_payment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES lp_capital_calls(id),
  amount_cents BIGINT NOT NULL,
  payment_date DATE NOT NULL,
  reference_number VARCHAR(100) NOT NULL,
  receipt_url VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, confirmed, rejected
  submitted_by INTEGER REFERENCES users(id),
  confirmed_by INTEGER REFERENCES users(id),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Implementation Files:**

- `server/routes/lp-capital-calls.ts` - New route module
- `shared/schemas/lp-capital-calls.ts` - Zod validation schemas
- `shared/types/lp-capital-calls.ts` - TypeScript types
- `tests/api/lp-capital-calls.test.ts` - Integration tests

---

#### 1.2 Distribution History API (TC-LP-004)

**Priority:** P0
**Test Cases:** TC-LP-004a through TC-LP-004d

**New Endpoints:**

```typescript
// Distribution endpoints
GET  /api/lp/distributions                    // List all distributions
GET  /api/lp/distributions/:distId            // Get distribution details with breakdown
GET  /api/lp/distributions/summary            // YTD summary with tax categorization
GET  /api/lp/distributions/tax-export/:year   // Export tax summary CSV
```

**Schema:**

```typescript
// shared/types/lp-distributions.ts
export interface Distribution {
  id: string;
  lpId: number;
  fundId: number;
  fundName: string;
  distributionNumber: number;
  totalAmount: number;         // In cents
  distributionDate: string;
  distributionType: 'return_of_capital' | 'capital_gains' | 'dividend' | 'mixed';

  // Waterfall breakdown
  breakdown: {
    returnOfCapital: number;   // Non-taxable
    preferredReturn: number;   // Taxable
    carriedInterest: number;   // Taxable (carried interest tier)
    catchUp: number;           // GP catch-up (not LP portion)
  };

  // Tax categorization
  taxBreakdown: {
    nonTaxable: number;        // ROC
    ordinaryIncome: number;    // Short-term gains
    longTermCapitalGains: number;
    qualifiedDividends: number;
  };

  status: 'pending' | 'processing' | 'completed';
  wireDate?: string;           // When wire was sent
}

export interface DistributionSummary {
  year: number;
  totalDistributed: number;
  returnOfCapital: number;
  taxableIncome: number;
  byQuarter: {
    quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
    amount: number;
    breakdown: Distribution['breakdown'];
  }[];
}
```

**Database Changes:**

```sql
-- Migration: 0008_distributions.sql
CREATE TABLE lp_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_id INTEGER NOT NULL REFERENCES limited_partners(id),
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  distribution_number INTEGER NOT NULL,
  total_amount_cents BIGINT NOT NULL,
  distribution_date DATE NOT NULL,
  distribution_type VARCHAR(30) NOT NULL,

  -- Waterfall breakdown (stored in cents)
  return_of_capital_cents BIGINT NOT NULL DEFAULT 0,
  preferred_return_cents BIGINT NOT NULL DEFAULT 0,
  carried_interest_cents BIGINT NOT NULL DEFAULT 0,
  catch_up_cents BIGINT NOT NULL DEFAULT 0,

  -- Tax breakdown (stored in cents)
  non_taxable_cents BIGINT NOT NULL DEFAULT 0,
  ordinary_income_cents BIGINT NOT NULL DEFAULT 0,
  long_term_gains_cents BIGINT NOT NULL DEFAULT 0,
  qualified_dividends_cents BIGINT NOT NULL DEFAULT 0,

  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  wire_date DATE,
  wire_reference VARCHAR(100),
  notes TEXT,

  idempotency_key VARCHAR(255) UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(lp_id, fund_id, distribution_number)
);

CREATE INDEX idx_distributions_lp_date ON lp_distributions(lp_id, distribution_date DESC);
CREATE INDEX idx_distributions_year ON lp_distributions(EXTRACT(YEAR FROM distribution_date));
```

**Implementation Files:**

- `server/routes/lp-distributions.ts` - New route module
- `shared/schemas/lp-distributions.ts` - Zod validation schemas
- `shared/types/lp-distributions.ts` - TypeScript types
- `server/services/distribution-calculator.ts` - Tax categorization logic
- `tests/api/lp-distributions.test.ts` - Integration tests

---

### Week 2: LP Dashboard & Performance

#### 2.1 Enhanced LP Dashboard (TC-LP-002)

**Priority:** P0
**Test Cases:** TC-LP-002a through TC-LP-002c

**Enhanced Endpoint:**

```typescript
// Enhance existing /api/lp/summary
GET /api/lp/dashboard                         // Full dashboard data
GET /api/lp/activity                          // Recent activity feed
```

**Schema:**

```typescript
// Enhanced dashboard response
export interface LPDashboard {
  // Existing summary
  lpId: number;
  lpName: string;
  totalCommitted: string;      // Bigint as string
  totalCalled: string;
  totalDistributed: string;
  totalNAV: string;
  totalUnfunded: string;
  fundCount: number;

  // Performance metrics (TC-LP-002b)
  performance: {
    netMOIC: number;           // e.g., 1.67
    netIRR: number;            // e.g., 0.152 (15.2%)
    dpi: number;               // Distributed to Paid-In
    tvpi: number;              // Total Value to Paid-In
    rvpi: number;              // Residual Value to Paid-In
  };

  // Recent activity (TC-LP-002c)
  recentActivity: ActivityItem[];

  // Pending items requiring attention
  pendingItems: {
    capitalCalls: number;      // Count of due/overdue calls
    reportsReady: number;      // Count of new reports
    unreadNotifications: number;
  };
}

export interface ActivityItem {
  id: string;
  type: 'capital_call' | 'distribution' | 'report' | 'notification';
  title: string;
  description: string;
  amount?: number;
  date: string;
  fundName?: string;
  status?: string;
  actionUrl?: string;
}
```

**Implementation Files:**

- `server/routes/lp-dashboard.ts` - Enhanced dashboard endpoint
- `server/services/lp-activity-service.ts` - Activity feed generation
- `tests/api/lp-dashboard.test.ts` - Integration tests

---

#### 2.2 Performance Reporting Enhancements (TC-LP-005)

**Priority:** P1
**Test Cases:** TC-LP-005a through TC-LP-005d

**Enhanced Endpoints:**

```typescript
// Performance endpoints (enhance existing)
GET /api/lp/performance/chart-data           // Chart-ready time series
GET /api/lp/performance/moic-detail          // MOIC calculation breakdown
GET /api/lp/performance/irr-cashflows        // Cash flow timeline for IRR
GET /api/lp/performance/benchmark            // Benchmark comparison (already exists, enhance)
```

**Schema:**

```typescript
// Chart-ready performance data
export interface PerformanceChartData {
  periods: {
    date: string;
    cumulativeCalledCapital: number;
    cumulativeDistributions: number;
    currentValue: number;
    unrealizedGains: number;   // Shaded area
  }[];

  // Latest metrics with methodology notes
  metrics: {
    moic: {
      value: number;
      formula: 'MOIC = (Distributions + Current Value) / Capital Called';
      components: {
        distributions: number;
        currentValue: number;
        capitalCalled: number;
      };
    };
    irr: {
      value: number;
      methodology: 'Net IRR calculated using XIRR function';
      notes: string[];         // e.g., 'Includes management fees and carried interest'
    };
    dpi: number;
    tvpi: number;
    rvpi: number;
  };
}

export interface CashFlowDetail {
  date: string;
  type: 'call' | 'distribution';
  amount: number;
  description: string;
  runningContributions: number;
  runningDistributions: number;
}
```

**Implementation Files:**

- `server/services/lp-performance-calculator.ts` - Enhanced performance calculations
- `server/routes/lp-performance.ts` - Performance chart endpoints
- `tests/api/lp-performance.test.ts` - Integration tests

---

#### 2.3 Document Access API (TC-LP-006)

**Priority:** P1
**Test Cases:** TC-LP-006a through TC-LP-006d

**New Endpoints:**

```typescript
// Document management endpoints
GET  /api/lp/documents                        // List all documents
GET  /api/lp/documents/:docId                 // Get document details
GET  /api/lp/documents/:docId/download        // Download with re-auth for sensitive
GET  /api/lp/documents/search                 // Search documents
```

**Schema:**

```typescript
export interface LPDocument {
  id: string;
  lpId: number;
  fundId?: number;
  fundName?: string;

  // Document metadata
  documentType: 'quarterly_report' | 'annual_report' | 'k1' | 'lpa' | 'side_letter' | 'fund_overview' | 'other';
  title: string;
  description?: string;

  // File info
  fileName: string;
  fileSize: number;            // Bytes
  mimeType: string;

  // Dates
  documentDate?: string;       // Date of the document content (e.g., Q4 2024)
  publishedAt: string;         // When uploaded/published

  // Access control
  accessLevel: 'standard' | 'sensitive'; // Sensitive requires re-auth

  // Status
  status: 'available' | 'archived';
}

export interface DocumentSearchParams {
  query?: string;              // Text search
  documentType?: string;
  fundId?: number;
  year?: number;
  quarter?: string;
}
```

**Database Changes:**

```sql
-- Migration: 0009_documents.sql
CREATE TABLE lp_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_id INTEGER NOT NULL REFERENCES limited_partners(id),
  fund_id INTEGER REFERENCES funds(id),
  document_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,

  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,

  document_date DATE,
  published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  access_level VARCHAR(20) NOT NULL DEFAULT 'standard',
  status VARCHAR(20) NOT NULL DEFAULT 'available',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_documents_lp ON lp_documents(lp_id);
CREATE INDEX idx_documents_type ON lp_documents(document_type);
CREATE INDEX idx_documents_search ON lp_documents USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));
```

**Implementation Files:**

- `server/routes/lp-documents.ts` - Document endpoints
- `shared/schemas/lp-documents.ts` - Zod validation schemas
- `tests/api/lp-documents.test.ts` - Integration tests

---

#### 2.4 In-App Notifications (TC-LP-008)

**Priority:** P1
**Test Cases:** TC-LP-008a through TC-LP-008d

**New Endpoints:**

```typescript
// Notification endpoints
GET  /api/lp/notifications                    // List notifications
GET  /api/lp/notifications/unread-count       // Badge count
POST /api/lp/notifications/:id/read           // Mark as read
POST /api/lp/notifications/read-all           // Mark all as read
```

**Schema:**

```typescript
export interface LPNotification {
  id: string;
  lpId: number;
  type: 'capital_call' | 'distribution' | 'report_ready' | 'document' | 'system';
  title: string;
  message: string;

  // Link to related entity
  relatedEntityType?: 'capital_call' | 'distribution' | 'report' | 'document';
  relatedEntityId?: string;
  actionUrl?: string;

  // Status
  read: boolean;
  readAt?: string;

  // Timestamps
  createdAt: string;
  expiresAt?: string;          // Optional expiration
}
```

**Database Changes:**

```sql
-- Migration: 0010_notifications.sql
CREATE TABLE lp_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_id INTEGER NOT NULL REFERENCES limited_partners(id),
  type VARCHAR(30) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,

  related_entity_type VARCHAR(30),
  related_entity_id UUID,
  action_url VARCHAR(500),

  read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,

  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_lp_unread ON lp_notifications(lp_id, read) WHERE read = FALSE;
CREATE INDEX idx_notifications_created ON lp_notifications(created_at DESC);
```

**Implementation Files:**

- `server/routes/lp-notifications.ts` - Notification endpoints
- `server/services/lp-notification-dispatcher.ts` - Create notifications on events
- `tests/api/lp-notifications.test.ts` - Integration tests

---

## Anti-Pattern Compliance

All Sprint 3 implementations MUST comply with the 24 anti-patterns documented in `cheatsheets/anti-pattern-prevention.md`:

| Pattern ID | Requirement | Sprint 3 Application |
|------------|-------------|---------------------|
| AP-IDEMPOTENT-01 | Idempotency on mutations | Capital call payments, notification mark-read |
| AP-LOCK-03 | Optimistic locking | Payment submission updates |
| AP-CURSOR-01 | Cursor pagination | Capital calls, distributions, documents, notifications |
| AP-CURSOR-06 | Signed cursors | Prevent SQL injection via cursor tampering |
| AP-QUEUE-01 | BullMQ timeouts | Report generation queue (already implemented) |
| AP-VALIDATE-01 | Zod validation | All new endpoints |
| AP-LOG-01 | PII sanitization | All logging (already implemented) |
| AP-AUDIT-01 | Audit logging | All LP data access (already implemented) |

---

## Test Coverage Requirements

### Unit Tests
- `tests/unit/distribution-calculator.test.ts` - Tax categorization logic
- `tests/unit/activity-feed.test.ts` - Activity aggregation logic

### Integration Tests
- `tests/api/lp-capital-calls.test.ts` - 10+ test cases
- `tests/api/lp-distributions.test.ts` - 10+ test cases
- `tests/api/lp-dashboard.test.ts` - 8+ test cases
- `tests/api/lp-documents.test.ts` - 8+ test cases
- `tests/api/lp-notifications.test.ts` - 6+ test cases

### E2E Tests (Playwright)
- `tests/e2e/lp-capital-calls.spec.ts` - Capital call flow
- `tests/e2e/lp-distributions.spec.ts` - Distribution history view
- `tests/e2e/lp-dashboard.spec.ts` - Dashboard rendering (already exists, enhance)

---

## Implementation Order

### Week 1 (Days 1-5)

| Day | Task | Deliverable |
|-----|------|-------------|
| 1 | Database migrations (capital calls, distributions) | Migrations 0007, 0008 |
| 2 | Capital calls API endpoints | `lp-capital-calls.ts` |
| 2 | Capital calls tests | Integration tests |
| 3 | Distributions API endpoints | `lp-distributions.ts` |
| 3 | Distribution calculator service | Tax categorization |
| 4 | Distributions tests | Integration tests |
| 5 | Week 1 integration testing | End-to-end validation |

### Week 2 (Days 6-10)

| Day | Task | Deliverable |
|-----|------|-------------|
| 6 | Enhanced dashboard API | `lp-dashboard.ts` |
| 6 | Activity feed service | `lp-activity-service.ts` |
| 7 | Performance chart endpoints | Enhanced performance API |
| 8 | Documents API | `lp-documents.ts` |
| 8 | Notifications API | `lp-notifications.ts` |
| 9 | E2E tests | Playwright tests |
| 10 | Final integration testing | Sprint 3 complete |

---

## Success Criteria

Sprint 3 is complete when:

1. **All P0 test cases pass:**
   - TC-LP-002 (Dashboard) - All sub-tests
   - TC-LP-003 (Capital Calls) - All sub-tests
   - TC-LP-004 (Distributions) - All sub-tests

2. **All P1 test cases pass:**
   - TC-LP-005 (Performance) - All sub-tests
   - TC-LP-006 (Documents) - All sub-tests
   - TC-LP-008 (Notifications) - All sub-tests

3. **Quality gates:**
   - Integration test coverage > 80% for new endpoints
   - Zero new TypeScript errors (maintain baseline)
   - All anti-pattern compliance verified
   - Audit logging active on all endpoints

4. **Documentation:**
   - API documentation updated
   - CHANGELOG.md updated
   - Test rubric test cases marked complete

---

## Dependencies

### External Dependencies
- Sprint 2 infrastructure (COMPLETE)
- Database migrations applied
- Redis available for rate limiting

### Internal Dependencies
- `waterfall-specialist` agent for distribution waterfall logic
- `server/services/lp-calculator.ts` for performance calculations
- `server/services/lp-audit-logger.ts` for compliance logging

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Waterfall complexity | Use existing `waterfall-specialist` agent |
| Tax calculation accuracy | Validate against K-1 test fixtures |
| Performance with large datasets | Cursor pagination, database indexes |
| API rate limiting | Use existing `lpLimiter` (100 req/min) |

---

## Related Documentation

- [LP Portal Testing Rubric](.claude/testing/rubric-lp-portal.md)
- [Anti-Pattern Prevention](cheatsheets/anti-pattern-prevention.md)
- [Sprint 2 PR #324](../../CHANGELOG.md)
- [LP API Types](shared/types/lp-api.ts)
