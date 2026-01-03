# LP Portal Testing Rubric

**Domain:** Limited Partner (LP) access, capital accounts, distributions
**Estimated Time:** 40 minutes
**Prerequisites:** Test fund with LP accounts, capital calls, distributions

---

## Overview

This rubric covers the LP Portal, a dedicated interface for limited partners to view their investments, capital accounts, and fund performance. LPs have **restricted access** - they can only see their own data, not other LPs' information.

**Key Features:**
- LP authentication and authorization
- LP dashboard (account summary)
- Capital account tracking (contributions, distributions, balance)
- Capital call history
- Distribution history
- Performance reporting (LP-specific metrics)
- Document access (quarterly reports, K-1 tax forms)
- Data privacy enforcement

---

## Test Cases

### TC-LP-001: LP Authentication
**Objective:** Verify LP login and session management
**Steps:**

**Test 1a: LP Login**
1. Navigate to LP Portal login page (`/lp/login`)
2. Enter LP credentials:
   - Email: `lp1@example.com`
   - Password: `test_password`
3. Click "Sign In"
4. Verify redirect to LP dashboard (`/lp/dashboard`)
5. Verify welcome message: "Welcome, [LP Name]"

**Test 1b: Invalid Credentials**
1. Attempt login with wrong password
2. Verify error message: "Invalid email or password"
3. Verify no access granted
4. Verify login form remains visible

**Test 1c: Account Lockout**
1. Attempt login with wrong password 5 times
2. Verify account locked after 5 failed attempts
3. Verify error: "Account locked due to too many failed login attempts. Contact support."
4. Verify lockout duration: 30 minutes

**Test 1d: Password Reset**
1. Click "Forgot Password?" link
2. Enter email: `lp1@example.com`
3. Verify reset email sent
4. Click reset link in email
5. Enter new password
6. Verify password updated
7. Login with new password

**Time:** 7 minutes

---

### TC-LP-002: LP Dashboard Overview
**Objective:** Verify LP dashboard displays correct account summary
**Steps:**

**Test 2a: Capital Account Summary**
1. After login, view dashboard
2. Verify capital account summary displays:
   - Total Commitment: $5,000,000
   - Called Capital: $3,000,000 (60%)
   - Uncalled Commitment: $2,000,000 (40%)
   - Distributions Received: $1,200,000
   - Current Net Investment: $1,800,000
   - Account Balance: $3,200,000 (Called - Distributions + Gains)

**Test 2b: Performance Metrics**
1. Verify performance section displays:
   - Net MOIC: 1.67x
   - Net IRR: 15.2%
   - Distributed to Paid-In (DPI): 0.40x
   - Total Value to Paid-In (TVPI): 1.67x
2. Verify these are LP-specific (not fund-wide)

**Test 2c: Recent Activity**
1. Verify recent activity feed shows:
   - Latest capital call: $500K on 2024-11-15
   - Latest distribution: $200K on 2024-10-30
   - Latest quarterly report: Q3 2024 published
2. Verify chronological order (newest first)

**Time:** 5 minutes

---

### TC-LP-003: Capital Call History
**Objective:** Verify capital call tracking and notifications
**Steps:**

**Test 3a: View Capital Call History**
1. Navigate to "Capital Calls" tab
2. Verify table displays all capital calls:
   - Call #1: $1M on 2024-01-15 (Status: Paid)
   - Call #2: $1M on 2024-06-01 (Status: Paid)
   - Call #3: $500K on 2024-09-15 (Status: Paid)
   - Call #4: $500K on 2024-11-15 (Status: Due 2024-12-01)
3. Verify total called capital: $3M

**Test 3b: Capital Call Details**
1. Click on Call #4 (most recent)
2. Verify detail modal displays:
   - Call amount: $500,000
   - Due date: 2024-12-01
   - Purpose: "Follow-on investments in Series A rounds"
   - Payment instructions (wire details)
   - Status: "Due"
   - Days remaining: 8 days

**Test 3c: Capital Call Status**
1. Verify status indicators:
   - Paid: Green checkmark
   - Due: Yellow clock icon
   - Overdue: Red exclamation
2. Click on overdue call (if any)
3. Verify warning message: "Payment overdue by X days"

**Test 3d: Payment Submission**
1. Click "Submit Payment Confirmation" on due call
2. Upload wire receipt: `wire_confirmation.pdf`
3. Enter payment details:
   - Amount: $500,000
   - Date: 2024-11-28
   - Reference number: REF123456
4. Click "Submit"
5. Verify status changes to "Payment Pending"
6. Verify GP receives notification to confirm

**Time:** 7 minutes

---

### TC-LP-004: Distribution History
**Objective:** Verify distribution tracking and tax reporting
**Steps:**

**Test 4a: View Distribution History**
1. Navigate to "Distributions" tab
2. Verify table displays all distributions:
   - Dist #1: $400K on 2024-03-31 (Q1 distribution)
   - Dist #2: $500K on 2024-06-30 (Q2 distribution)
   - Dist #3: $300K on 2024-09-30 (Q3 distribution)
3. Verify total distributions: $1.2M

**Test 4b: Distribution Breakdown**
1. Click on Dist #3
2. Verify breakdown displays:
   - Return of Capital: $200K
   - Preferred Return: $50K
   - Carried Interest: $50K
   - Total: $300K
3. Verify waterfall tier labels
4. Verify tax categorization:
   - Return of Capital: Non-taxable
   - Preferred + Carry: Taxable income

**Test 4c: Year-to-Date Summary**
1. View YTD summary widget
2. Verify displays:
   - Total distributions 2024: $1.2M
   - Return of Capital: $800K
   - Taxable Income: $400K
3. Verify can filter by year (dropdown: 2024, 2023, etc.)

**Test 4d: Export for Tax Preparation**
1. Click "Export Tax Summary"
2. Verify CSV downloads: `lp-tax-summary-2024.csv`
3. Open CSV
4. Verify includes:
   - Distribution date
   - Amount
   - Tax category (ROC vs Taxable)
5. Verify totals match K-1 preview

**Time:** 7 minutes

---

### TC-LP-005: Performance Reporting
**Objective:** Verify LP-specific performance metrics
**Steps:**

**Test 5a: Account Performance Chart**
1. Navigate to "Performance" tab
2. Verify line chart displays:
   - X-axis: Time (months since first call)
   - Y-axis: Account value
   - Line 1: Cumulative capital called
   - Line 2: Cumulative distributions
   - Line 3: Current account value
3. Verify shaded area shows unrealized gains

**Test 5b: MOIC Calculation Verification**
1. Verify MOIC formula displayed:
   - MOIC = (Distributions + Current Value) / Capital Called
   - MOIC = ($1.2M + $3.8M) / $3M = 1.67x
2. Verify calculation matches dashboard
3. Verify tooltip explains MOIC metric

**Test 5c: IRR Calculation Transparency**
1. Verify IRR methodology note:
   - "Net IRR calculated using XIRR function"
   - "Includes management fees and carried interest"
   - "Based on actual cash flows (calls and distributions)"
2. Verify "View Cash Flow Detail" link
3. Click link, verify cash flow timeline displays

**Test 5d: Benchmark Comparison (If Available)**
1. If benchmarks enabled, verify chart shows:
   - LP account performance: 1.67x MOIC
   - Median VC benchmark: 1.5x MOIC
   - LP relative performance: +11.3%
2. Verify disclaimer: "Benchmarks for informational purposes only"

**Time:** 6 minutes

---

### TC-LP-006: Document Access
**Objective:** Verify LPs can access authorized documents
**Steps:**

**Test 6a: Quarterly Reports**
1. Navigate to "Documents" tab
2. Verify quarterly reports listed:
   - Q4 2024 Report (PDF, 2.5 MB) - Published 2025-01-15
   - Q3 2024 Report (PDF, 2.3 MB) - Published 2024-10-15
   - Q2 2024 Report (PDF, 2.1 MB) - Published 2024-07-15
3. Click Q4 2024 Report
4. Verify PDF downloads
5. Verify PDF opens correctly

**Test 6b: K-1 Tax Forms**
1. Navigate to "Tax Documents" section
2. Verify K-1 forms listed:
   - 2023 K-1 (PDF) - Published 2024-03-15
   - 2022 K-1 (PDF) - Published 2023-03-15
3. Click 2023 K-1
4. Verify download requires re-authentication (sensitive doc)
5. Enter password
6. Verify K-1 downloads

**Test 6c: Fund Documents**
1. Navigate to "Fund Documents" section
2. Verify access to:
   - Limited Partnership Agreement (PDF)
   - Side Letter (if applicable)
   - Fund Overview Deck (PDF)
3. Verify cannot access GP-only documents (e.g., internal memos)

**Test 6d: Document Search**
1. Enter search: "Q3"
2. Verify only Q3 2024 Report displays
3. Enter search: "K-1"
4. Verify both K-1 forms display
5. Clear search, verify all documents return

**Time:** 6 minutes

---

### TC-LP-007: Data Privacy and Authorization
**Objective:** Verify LPs can only access their own data
**Steps:**

**Test 7a: LP Data Isolation**
1. Login as LP1 (`lp1@example.com`)
2. Note LP1's commitment: $5M
3. Logout
4. Login as LP2 (`lp2@example.com`)
5. Verify LP2's dashboard shows LP2's commitment: $3M (different)
6. Verify LP2 cannot see LP1's data

**Test 7b: Attempt Unauthorized Access**
1. While logged in as LP2
2. Manually navigate to: `/lp/accounts/{LP1-account-id}`
3. Verify redirect to LP2's dashboard or 403 Forbidden error
4. Verify error: "You do not have permission to access this account"

**Test 7c: API Endpoint Authorization**
1. While logged in as LP2
2. Open browser DevTools → Network tab
3. Attempt API call: `GET /api/lp/accounts/{LP1-account-id}`
4. Verify response: 403 Forbidden
5. Verify error message: "Unauthorized access"

**Test 7d: Role-Based Access Control (RBAC)**
1. Verify LP role restrictions:
   - CAN view: Own capital account, distributions, documents
   - CANNOT view: Other LPs' data, GP internal data, fund-wide sensitive metrics
   - CANNOT edit: Any data (read-only access)
2. Verify no "Edit" buttons visible in LP portal

**Time:** 5 minutes

---

### TC-LP-008: Notifications and Alerts
**Objective:** Verify LPs receive timely notifications
**Steps:**

**Test 8a: Capital Call Notification**
1. GP creates new capital call for LP1: $500K
2. Verify LP1 receives email notification:
   - Subject: "Capital Call Notice - $500,000 due [Date]"
   - Body includes: Amount, due date, payment instructions
3. Login to LP portal
4. Verify in-app notification badge: "1 new notification"
5. Click notification
6. Verify navigates to capital call detail

**Test 8b: Distribution Notification**
1. GP processes distribution for LP1: $200K
2. Verify LP1 receives email:
   - Subject: "Distribution Notice - $200,000"
   - Body includes: Amount, distribution date, tax breakdown
3. Verify in-app notification
4. Verify notification links to distribution detail

**Test 8c: Document Publication Notification**
1. GP publishes Q4 2024 Quarterly Report
2. Verify all LPs receive email:
   - Subject: "Q4 2024 Quarterly Report Available"
3. Login to LP portal
4. Verify notification: "New quarterly report available"
5. Click notification
6. Verify navigates to document

**Test 8d: Notification Preferences**
1. Navigate to LP account settings
2. Click "Notification Preferences"
3. Verify toggle options:
   - Capital calls: Email + In-app (default ON)
   - Distributions: Email + In-app (default ON)
   - Quarterly reports: Email only (default ON)
   - Marketing updates: Email (default OFF)
4. Toggle "Quarterly reports" to OFF
5. Save preferences
6. Verify next quarterly report does NOT trigger email

**Time:** 6 minutes

---

### TC-LP-009: Mobile Responsiveness
**Objective:** Verify LP Portal works on mobile devices
**Steps:**

**Test 9a: Mobile Login**
1. Open LP Portal on mobile device (or browser dev tools mobile view)
2. Verify login form renders correctly
3. Enter credentials
4. Login successfully
5. Verify dashboard responsive (no horizontal scroll)

**Test 9b: Mobile Dashboard Layout**
1. Verify dashboard cards stack vertically
2. Verify metrics readable (font size appropriate)
3. Verify charts resize to fit screen width
4. Verify no layout breaks or overlapping elements

**Test 9c: Mobile Navigation**
1. Verify hamburger menu icon displays
2. Click menu icon
3. Verify navigation drawer opens
4. Verify can navigate to: Dashboard, Capital Calls, Distributions, Performance, Documents
5. Verify menu closes after selection

**Test 9d: Mobile Chart Interactions**
1. View performance chart on mobile
2. Verify chart renders (may be simplified)
3. Tap chart data point
4. Verify tooltip displays
5. Verify pinch-to-zoom disabled (by design)

**Time:** 4 minutes

---

### TC-LP-010: Session Management and Security
**Objective:** Verify session timeout and security controls
**Steps:**

**Test 10a: Session Timeout**
1. Login to LP Portal
2. Leave browser idle for 30 minutes
3. Attempt to navigate to another page
4. Verify redirect to login with message: "Session expired. Please log in again."

**Test 10b: Multi-Device Sessions**
1. Login on Device 1 (desktop)
2. Login on Device 2 (mobile) with same credentials
3. Verify both sessions remain active (concurrent allowed)
4. Logout on Device 1
5. Verify Device 2 session still active

**Test 10c: Secure Connection (HTTPS)**
1. Verify LP Portal URL uses HTTPS
2. Check browser security indicator (padlock icon)
3. Attempt to access via HTTP (http://...)
4. Verify automatic redirect to HTTPS

**Test 10d: Password Complexity**
1. Navigate to "Change Password"
2. Attempt weak password: "123456"
3. Verify error: "Password must be at least 8 characters with uppercase, lowercase, number, and symbol"
4. Enter strong password: "Test@Pass123"
5. Verify password change succeeds

**Time:** 5 minutes

---

## Summary Checklist

After completing all test cases, verify:

- [ ] LP authentication works (login, logout, password reset)
- [ ] LP dashboard displays accurate account summary
- [ ] Capital call history tracked correctly
- [ ] Distribution history with tax breakdown
- [ ] LP-specific performance metrics calculated
- [ ] Document access restricted to authorized docs
- [ ] Data privacy enforced (LP sees only own data)
- [ ] Notifications sent for capital calls, distributions, reports
- [ ] Mobile responsive design works
- [ ] Session timeout and security controls active

---

## Known Issues

Document any LP Portal bugs:

| Test Case | Issue Description | Severity | GitHub Issue |
|-----------|-------------------|----------|--------------|
| TC-LP-XXX | [Description]     | [Level]  | #XXX         |

---

## Test Data

**Sample LP Account:**
```json
{
  "lpId": "lp1",
  "name": "Institutional Investor LP",
  "email": "lp1@example.com",
  "commitment": 5000000,
  "calledCapital": 3000000,
  "distributions": 1200000,
  "currentValue": 5000000
}
```

**Sample Capital Call:**
```json
{
  "callId": "call-001",
  "lpId": "lp1",
  "amount": 500000,
  "dueDate": "2024-12-01",
  "status": "Due",
  "purpose": "Follow-on investments"
}
```

---

## Security Requirements

**CRITICAL:** LP Portal must enforce strict data privacy.

**Privacy Controls:**
- [ ] LPs can only view their own data (enforced at API level)
- [ ] LP cannot access other LPs' accounts
- [ ] LP cannot access GP-only internal data
- [ ] Session timeout: 30 minutes idle
- [ ] HTTPS required (no HTTP access)
- [ ] Password complexity enforced
- [ ] Account lockout after 5 failed login attempts
- [ ] Audit log all LP access (who viewed what when)

**Testing Privacy:**
- Verify API returns 403 for unauthorized access
- Verify URL manipulation does not bypass auth
- Verify SQL injection prevention (parameterized queries)
- Verify XSS prevention (sanitized inputs)

---

## Related Documentation

- [cheatsheets/lp-portal-architecture.md](../../cheatsheets/lp-portal-architecture.md) - LP Portal design
- [server/routes/lp-portal.ts](../../server/routes/lp-portal.ts) - LP API endpoints
- [client/src/pages/LPDashboard.tsx](../../client/src/pages/LPDashboard.tsx) - LP UI components
