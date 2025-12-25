# Platform-Wide Manual Testing Rubric - Index

**Purpose:** Comprehensive manual testing guide for the Press On Ventures portfolio management platform
**Version:** 1.0
**Last Updated:** 2025-12-23
**Test Environment:** Development (localhost:5000)

---

## Overview

This modular testing rubric provides structured manual test cases across all platform features. Each domain is documented in a separate file for easier navigation and maintenance.

**Test Coverage:**
- 7 domain-specific rubrics
- 1 cross-cutting concerns rubric
- 1 quick-reference checklist
- Estimated total testing time: 6-8 hours (comprehensive pass)

**Testing Principles:**
- Test against realistic data scenarios
- Verify Excel parity for calculations
- Validate error handling and edge cases
- Check accessibility and performance
- Ensure security controls

---

## Rubric Files

### 1. Fund Setup & Configuration
**File:** [rubric-fund-setup.md](rubric-fund-setup.md)
**Estimated Time:** 45 minutes
**Coverage:**
- 7-step fund setup wizard (Fund Details → Carry Waterfall → Review)
- Fund parameters validation (size, vintage, duration)
- Carry structure configuration (American waterfall, hurdle rates)
- GP commitment and management fees
- Fund duplication and editing

**Key Test Areas:**
- Wizard navigation and state persistence
- Form validation (required fields, ranges, dependencies)
- Waterfall configuration (GP/LP splits, hurdle rates, catch-up)
- Data persistence across steps
- Preview and summary accuracy

---

### 2. Portfolio Management
**File:** [rubric-portfolio-management.md](rubric-portfolio-management.md)
**Estimated Time:** 60 minutes
**Coverage:**
- Portfolio company creation and editing
- Investment tracking (initial, follow-ons, exits)
- Cap table management (ownership, dilution)
- Company status lifecycle (active, exited, written-off)
- Document attachments and notes

**Key Test Areas:**
- Company CRUD operations
- Investment event tracking
- Cap table calculations (ownership %, dilution)
- Valuation updates
- Data integrity across related entities

---

### 3. Calculation Engines
**File:** [rubric-calculation-engines.md](rubric-calculation-engines.md)
**Estimated Time:** 75 minutes
**Coverage:**
- XIRR/IRR calculations (51 Excel parity tests)
- Waterfall distributions (American waterfall, 53 tests)
- Monte Carlo simulations (10k runs, probabilistic outcomes)
- Reserve allocation engine (rule-based + ML)
- Pacing strategies (deployment schedules)
- Cohort analytics (vintage, sector, stage)

**Key Test Areas:**
- Excel parity verification (XIRR, waterfall)
- Precision and rounding (28-digit Decimal.js)
- Edge cases (zero investment, 100% loss, partial exits)
- Performance (Monte Carlo <5s for 10k runs)
- Scenario comparison (delta metrics, trend analysis)

---

### 4. Analytics & Reporting
**File:** [rubric-analytics-reporting.md](rubric-analytics-reporting.md)
**Estimated Time:** 50 minutes
**Coverage:**
- Performance dashboards (fund-level, portfolio-level)
- Variance analysis (budget vs actual)
- Time-travel reporting (historical snapshots)
- Custom report generation
- Data export (CSV, Excel, PDF)

**Key Test Areas:**
- Dashboard metric accuracy
- Chart rendering (Recharts/Nivo)
- Filter interactions
- Report parameterization
- Export format integrity

---

### 5. LP Portal
**File:** [rubric-lp-portal.md](rubric-lp-portal.md)
**Estimated Time:** 40 minutes
**Coverage:**
- LP dashboard (capital accounts, distributions)
- Capital call tracking
- Distribution history
- Performance reporting (LP-specific metrics)
- Document access (quarterly reports, K-1s)

**Key Test Areas:**
- LP authentication and authorization
- Capital account calculations
- Distribution waterfall (LP view)
- Document permissions
- Data privacy (LP can only see their own data)

---

### 6. API Integration
**File:** [rubric-api-integration.md](rubric-api-integration.md)
**Estimated Time:** 60 minutes
**Coverage:**
- 48 backend API routes
- Request validation (Zod schemas)
- Response formats (success/error structures)
- Authentication/authorization
- Rate limiting and throttling
- Cursor pagination

**Key Test Areas:**
- HTTP status codes (200, 201, 400, 404, 409, 429, 500)
- Request body validation (required fields, types, constraints)
- Error response consistency
- Idempotency (POST operations)
- Optimistic locking (version conflicts)
- Cursor validation (UUID format, existence)

---

### 7. Cross-Cutting Concerns
**File:** [rubric-cross-cutting.md](rubric-cross-cutting.md)
**Estimated Time:** 55 minutes
**Coverage:**
- Security (authentication, authorization, input validation)
- Performance (page load, API response times, worker jobs)
- Accessibility (WCAG 2.1 AA, keyboard navigation, screen readers)
- Error handling (global error boundaries, graceful degradation)
- Browser compatibility (Chrome, Firefox, Safari, Edge)
- Mobile responsiveness

**Key Test Areas:**
- Authentication flows (login, logout, session expiry)
- Role-based access control
- XSS/SQL injection prevention
- Performance budgets (page load <3s, API <1s)
- Keyboard-only navigation
- Screen reader compatibility
- Error recovery mechanisms

---

## Quick Reference

**File:** [platform-test-checklist.md](platform-test-checklist.md)
**Purpose:** Fast pre-release smoke test checklist
**Estimated Time:** 20 minutes
**Coverage:** Critical path testing for all major features

---

## Test Data Requirements

### Prerequisite Database State

Before running any manual tests, ensure the following test data exists:

1. **Test Fund:**
   - ID: 1
   - Name: "Test Fund I"
   - Size: $50M
   - Vintage: 2024
   - Status: Active

2. **Portfolio Companies:**
   - At least 3 companies with different statuses (active, exited, written-off)
   - At least 1 company with multiple investment rounds

3. **Scenarios:**
   - Base scenario for Monte Carlo testing
   - At least 2 alternative scenarios for comparison testing

4. **LP Accounts:**
   - At least 2 LP accounts with different commitment amounts
   - Capital call and distribution history

### Database Seeding

Run the following command to seed test data:
```bash
npm run db:seed:test
```

---

## Test Execution Guidelines

### 1. Pre-Test Setup
- [ ] Verify test database is seeded
- [ ] Clear browser cache and localStorage
- [ ] Ensure Redis is running (for caching tests)
- [ ] Start development server (`npm run dev`)
- [ ] Open browser DevTools (Console + Network tabs)

### 2. During Testing
- [ ] Record all bugs in GitHub Issues with `bug` label
- [ ] Screenshot errors and unexpected behavior
- [ ] Note console warnings/errors
- [ ] Check Network tab for failed API requests
- [ ] Test both happy path and error scenarios

### 3. Post-Test Reporting
- [ ] Summarize pass/fail rate by rubric section
- [ ] Prioritize bugs by severity (blocker, critical, major, minor)
- [ ] Document any test data issues
- [ ] Note any rubric gaps or unclear test cases

### Bug Severity Levels

- **Blocker:** Application crashes, data loss, security vulnerability
- **Critical:** Core functionality broken, no workaround
- **Major:** Functionality broken, workaround exists
- **Minor:** UI/UX issue, cosmetic defect, typo

---

## Version History

| Version | Date       | Changes                                    |
|---------|------------|--------------------------------------------|
| 1.0     | 2025-12-23 | Initial modular rubric structure           |

---

## Related Documentation

- [Scenario Comparison MVP Rubric](scenario-comparison-manual-test-rubric.md) - Detailed testing for scenario comparison feature
- [cheatsheets/anti-pattern-prevention.md](../../cheatsheets/anti-pattern-prevention.md) - 24 cataloged anti-patterns to verify
- [cheatsheets/pr-merge-verification.md](../../cheatsheets/pr-merge-verification.md) - PR verification guidelines
- [SIDECAR_GUIDE.md](../../SIDECAR_GUIDE.md) - Windows development troubleshooting

---

## Contact

For questions or issues with this rubric, contact the development team or file a GitHub Issue with the `testing` label.
