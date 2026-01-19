---
status: ACTIVE
last_updated: 2026-01-19
---

# Cross-Cutting Concerns Testing Rubric

**Domain:** Security, performance, accessibility, error handling, browser compatibility
**Estimated Time:** 55 minutes
**Prerequisites:** Multiple browsers, accessibility tools, performance monitoring

---

## Overview

This rubric covers cross-cutting concerns that apply across all platform features. These are non-functional requirements critical to production readiness.

**Key Areas:**
- **Security:** Authentication, authorization, input validation, data protection
- **Performance:** Page load times, API response times, background job execution
- **Accessibility:** WCAG 2.1 AA compliance, keyboard navigation, screen readers
- **Error Handling:** Global error boundaries, graceful degradation
- **Browser Compatibility:** Chrome, Firefox, Safari, Edge
- **Mobile Responsiveness:** Tablet and mobile support

---

## Test Cases

### TC-CC-001: Security - Authentication Flows
**Objective:** Verify secure authentication and session management
**Steps:**

**Test 1a: Login Flow**
1. Navigate to login page
2. Enter credentials (GP user)
3. Submit login form
4. Verify JWT token stored in secure httpOnly cookie (not localStorage)
5. Verify redirect to dashboard
6. Verify no token visible in browser console/local storage

**Test 1b: Logout Flow**
1. Click "Logout" button
2. Verify session cleared
3. Verify redirect to login page
4. Verify attempt to access protected route → redirect to login

**Test 1c: Session Expiry**
1. Login successfully
2. Wait for token expiration (or manually set short expiry for testing)
3. Attempt to navigate to protected page
4. Verify redirect to login with message: "Session expired"

**Test 1d: Remember Me**
1. Login with "Remember Me" checked
2. Close browser completely
3. Reopen browser
4. Navigate to app
5. Verify user still logged in (refresh token used)

**Time:** 6 minutes

---

### TC-CC-002: Security - Authorization (RBAC)
**Objective:** Verify role-based access control across UI and API
**Steps:**

**Test 2a: GP Role - Full Access**
1. Login as GP user
2. Verify visible menu items:
   - Dashboard, Funds, Portfolio, Analytics, LP Portal Admin, Settings
3. Navigate to Fund Setup
4. Verify "Create Fund" button visible and functional

**Test 2b: LP Role - Restricted Access**
1. Login as LP user
2. Verify visible menu items:
   - LP Dashboard, Capital Calls, Distributions, Documents only
3. Verify NO access to:
   - Fund Setup, Portfolio Management, Analytics (GP features)
4. Attempt to navigate to `/funds/new` manually
5. Verify redirect to LP Dashboard or 403 page

**Test 2c: Read-Only User (Future Role)**
1. Login as read-only user
2. Verify can view all pages
3. Verify all "Edit" and "Delete" buttons disabled or hidden
4. Attempt to submit edit form (via DevTools manipulation)
5. Verify API returns 403 Forbidden

**Time:** 5 minutes

---

### TC-CC-003: Security - Input Validation and Sanitization
**Objective:** Verify all user inputs validated and sanitized
**Steps:**

**Test 3a: Form Validation (Client-Side)**
1. Navigate to company creation form
2. Enter invalid email: "not-an-email"
3. Click submit
4. Verify error message before API call
5. Verify cannot submit until valid

**Test 3b: XSS Prevention**
1. Enter malicious script in text field:
   ```
   <script>alert('XSS')</script>
   ```
2. Submit form
3. Verify script escaped/sanitized on display
4. Verify no alert popup appears

**Test 3c: SQL Injection Prevention**
1. Enter SQL injection attempt in search:
   ```
   '; DROP TABLE funds; --
   ```
2. Submit search
3. Verify no SQL execution (results empty or sanitized)
4. Verify database tables intact

**Test 3d: File Upload Validation**
1. Attempt to upload .exe file (not allowed)
2. Verify error: "File type not allowed"
3. Attempt to upload 100MB file (exceeds limit)
4. Verify error: "File size exceeds 20MB limit"

**Time:** 6 minutes

---

### TC-CC-004: Security - Data Protection
**Objective:** Verify sensitive data encrypted and protected
**Steps:**

**Test 4a: HTTPS Enforcement**
1. Attempt to access app via HTTP: `http://app.example.com`
2. Verify automatic redirect to HTTPS
3. Verify browser padlock icon (secure connection)

**Test 4b: Sensitive Data in URLs**
1. Navigate through app
2. Verify NO sensitive data in URLs:
   - NO tokens in query params
   - NO passwords in URLs
   - NO credit card numbers

**Test 4c: Sensitive Data in Browser Storage**
1. Open browser DevTools → Application tab
2. Check localStorage, sessionStorage, cookies
3. Verify NO plain-text passwords
4. Verify NO unencrypted API tokens visible
5. Verify JWT token in httpOnly cookie (not accessible via JavaScript)

**Test 4d: Password Field Security**
1. Navigate to password change form
2. Verify password field has `type="password"` (masked input)
3. Verify password not visible in DOM (inspect element)
4. Verify autocomplete="new-password" (no browser auto-fill)

**Time:** 5 minutes

---

### TC-CC-005: Performance - Page Load Times
**Objective:** Verify pages load within performance budgets
**Steps:**

**Test 5a: Initial Page Load (Cold Start)**
1. Clear browser cache
2. Navigate to dashboard
3. Measure page load time (DevTools → Network → Load time)
4. Verify load time <3 seconds (target: <2s)

**Test 5b: Subsequent Navigation (Cached)**
1. Navigate to Portfolio page
2. Measure navigation time
3. Verify <1 second (SPA routing)

**Test 5c: Largest Contentful Paint (LCP)**
1. Load dashboard
2. Measure LCP in DevTools → Performance
3. Verify LCP <2.5 seconds (Core Web Vital)

**Test 5d: First Input Delay (FID)**
1. Load page
2. Click first interactive element
3. Measure delay
4. Verify FID <100ms (Core Web Vital)

**Test 5e: Cumulative Layout Shift (CLS)**
1. Load page
2. Observe layout shifts
3. Measure CLS in DevTools
4. Verify CLS <0.1 (Core Web Vital)

**Time:** 8 minutes

---

### TC-CC-006: Performance - API Response Times
**Objective:** Verify API endpoints respond within targets
**Steps:**

**Test 6a: Fast Endpoints (<200ms)**
1. GET `/api/funds`
2. Measure response time (Network tab)
3. Verify <200ms
4. Repeat for: `/api/portfolio/companies`, `/api/lp/capital-account`

**Test 6b: Medium Endpoints (<500ms)**
1. GET `/api/reports/performance`
2. Verify <500ms (complex aggregation)

**Test 6c: Slow Endpoints (<5s)**
1. POST `/api/monte-carlo/run` (10k simulations)
2. Verify <5 seconds
3. Verify background job processing (not blocking)

**Test 6d: Concurrent Requests**
1. Open 10 browser tabs
2. Load dashboard in each simultaneously
3. Verify all load successfully (no server overload)
4. Verify response times remain <3s

**Time:** 6 minutes

---

### TC-CC-007: Performance - Background Job Processing
**Objective:** Verify BullMQ jobs execute within timeout
**Steps:**

**Test 7a: Monte Carlo Job**
1. Queue Monte Carlo simulation (10k runs)
2. Monitor job status
3. Verify job completes <30 seconds
4. Verify job has timeout configured (not infinite)

**Test 7b: Report Generation Job**
1. Queue quarterly report generation
2. Verify job completes <60 seconds
3. Verify job result stored in database

**Test 7c: Job Failure Handling**
1. Queue job that will fail (e.g., invalid data)
2. Verify job retries 3 times
3. After 3 failures, verify job marked as "Failed"
4. Verify error logged
5. Verify no infinite retry loop

**Test 7d: Job Queue Dashboard**
1. Navigate to `/admin/jobs` (if exists)
2. View pending, active, completed, failed jobs
3. Verify queue metrics display (throughput, latency)

**Time:** 7 minutes

---

### TC-CC-008: Accessibility - Keyboard Navigation
**Objective:** Verify full keyboard accessibility (WCAG 2.1 AA)
**Steps:**

**Test 8a: Tab Navigation**
1. Navigate to dashboard (mouse disconnected)
2. Press Tab key
3. Verify focus moves to first interactive element
4. Continue tabbing through all elements
5. Verify focus visible (outline or highlight)
6. Verify tab order logical (top-to-bottom, left-to-right)

**Test 8b: Enter/Space Activation**
1. Tab to "Create Fund" button
2. Press Enter key
3. Verify button activates (opens modal/navigates)
4. Tab to checkbox
5. Press Space
6. Verify checkbox toggles

**Test 8c: Escape Key (Modal Close)**
1. Open modal dialog
2. Press Escape key
3. Verify modal closes
4. Verify focus returns to trigger element

**Test 8d: Arrow Key Navigation (Dropdowns)**
1. Tab to dropdown
2. Press Enter to open
3. Press Arrow Down to navigate options
4. Press Enter to select
5. Verify selection made

**Test 8e: Skip Links**
1. Load page
2. Press Tab (first focus)
3. Verify "Skip to main content" link appears
4. Press Enter
5. Verify focus jumps to main content (skips nav)

**Time:** 7 minutes

---

### TC-CC-009: Accessibility - Screen Reader Compatibility
**Objective:** Verify screen reader announces all content
**Steps:**

**Test 9a: Page Title and Headings**
1. Enable screen reader (NVDA, JAWS, or VoiceOver)
2. Navigate to dashboard
3. Verify page title announced: "Dashboard - Press On Ventures"
4. Verify H1 announced: "Fund Performance"
5. Navigate by headings (H key in NVDA)
6. Verify all headings in logical hierarchy (H1 → H2 → H3)

**Test 9b: Form Labels**
1. Navigate to company creation form
2. Tab to "Company Name" field
3. Verify screen reader announces: "Company Name, edit, required"
4. Verify all form fields have associated labels

**Test 9c: Button Descriptions**
1. Tab to icon-only button (e.g., delete icon)
2. Verify aria-label announced: "Delete company"
3. Verify button purpose clear without visual context

**Test 9d: Dynamic Content Updates**
1. Submit form (e.g., create company)
2. Verify success toast announced: "Company created successfully"
3. Verify aria-live region used for dynamic updates

**Test 9e: Table Accessibility**
1. Navigate to portfolio table
2. Verify table headers announced
3. Navigate cells with Ctrl+Alt+Arrow keys
4. Verify row/column headers associated with cells

**Time:** 8 minutes

---

### TC-CC-010: Accessibility - Visual Accessibility
**Objective:** Verify visual accessibility (contrast, font size, color)
**Steps:**

**Test 10a: Color Contrast**
1. Use browser extension (e.g., axe DevTools)
2. Run contrast checker on dashboard
3. Verify all text meets WCAG AA contrast ratio:
   - Normal text: 4.5:1
   - Large text (18pt+): 3:1
4. Verify no contrast failures

**Test 10b: Font Size and Zoom**
1. Set browser zoom to 200%
2. Navigate app
3. Verify all content readable (no overlap or cutoff)
4. Verify horizontal scrolling minimal

**Test 10c: Color Independence**
1. View chart with red/green indicators
2. Enable browser color blindness simulation (or use tool)
3. Verify meaning not conveyed by color alone
4. Verify icons/patterns used in addition to color

**Test 10d: Focus Indicators**
1. Tab through interactive elements
2. Verify focus indicator visible on all elements
3. Verify focus indicator has sufficient contrast
4. Verify focus not obscured by other elements

**Time:** 5 minutes

---

### TC-CC-011: Error Handling - Global Error Boundary
**Objective:** Verify errors caught and displayed gracefully
**Steps:**

**Test 11a: Component Error Boundary**
1. Trigger component error (e.g., invalid prop causing crash)
2. Verify error boundary catches error
3. Verify fallback UI displays: "Something went wrong. Please refresh the page."
4. Verify error logged to console
5. Verify rest of app remains functional

**Test 11b: Network Error Handling**
1. Disconnect internet
2. Attempt API call (e.g., load dashboard)
3. Verify user-friendly error: "Unable to connect. Please check your internet connection."
4. Verify retry button available
5. Reconnect internet, click retry
6. Verify data loads successfully

**Test 11c: API Error Responses**
1. Trigger API error (e.g., 500 Internal Server Error)
2. Verify error toast displays: "An error occurred. Please try again."
3. Verify error details NOT exposed to user (no stack trace)
4. Verify error logged to server for debugging

**Test 11d: Graceful Degradation (Redis Down)**
1. Stop Redis service
2. Attempt scenario comparison (uses Redis cache)
3. Verify feature degrades gracefully:
   - Comparison still works (slower, no cache)
   - OR user notified: "Caching unavailable. Performance may be slower."
4. Verify no app crash

**Time:** 6 minutes

---

### TC-CC-012: Browser Compatibility
**Objective:** Verify app works in all major browsers
**Steps:**

**Test 12a: Chrome (Latest)**
1. Open app in Chrome
2. Navigate through all major features
3. Verify no console errors
4. Verify all features functional
5. Verify layout renders correctly

**Test 12b: Firefox (Latest)**
1. Open app in Firefox
2. Test all features
3. Verify no Firefox-specific issues
4. Verify CSS renders correctly (no missing styles)

**Test 12c: Safari (Latest)**
1. Open app in Safari
2. Test all features
3. Verify no Safari-specific JavaScript errors
4. Verify date pickers work (Safari sometimes has issues)

**Test 12d: Edge (Latest)**
1. Open app in Edge
2. Test all features
3. Verify no Edge-specific issues

**Test 12e: Mobile Safari (iOS)**
1. Open app on iPhone/iPad
2. Verify responsive layout
3. Verify touch interactions work
4. Verify no viewport issues

**Time:** 10 minutes (testing across browsers)

---

### TC-CC-013: Mobile Responsiveness
**Objective:** Verify app responsive on mobile/tablet
**Steps:**

**Test 13a: Mobile Viewport (375px width)**
1. Set browser to mobile viewport (DevTools)
2. Navigate to dashboard
3. Verify layout stacks vertically
4. Verify no horizontal scroll
5. Verify all content accessible

**Test 13b: Tablet Viewport (768px width)**
1. Set browser to tablet viewport
2. Verify layout adapts (2-column grid)
3. Verify charts resize appropriately

**Test 13c: Touch Targets**
1. On mobile viewport
2. Verify all buttons/links at least 44x44px (WCAG guideline)
3. Verify adequate spacing between touch targets (no accidental clicks)

**Test 13d: Mobile Navigation**
1. On mobile viewport
2. Verify hamburger menu icon displays
3. Tap menu icon
4. Verify drawer/menu opens
5. Verify can navigate to all pages

**Time:** 5 minutes

---

## Summary Checklist

After completing all test cases, verify:

- [ ] Authentication secure (httpOnly cookies, no token leakage)
- [ ] RBAC enforces role permissions
- [ ] All inputs validated and sanitized
- [ ] HTTPS enforced, sensitive data protected
- [ ] Page load times <3s, Core Web Vitals met
- [ ] API response times within targets
- [ ] Background jobs complete with timeouts
- [ ] Full keyboard navigation works
- [ ] Screen reader announces all content
- [ ] Color contrast meets WCAG AA (4.5:1)
- [ ] Global error boundary catches errors
- [ ] App works in Chrome, Firefox, Safari, Edge
- [ ] Mobile responsive (375px, 768px, 1024px)

---

## WCAG 2.1 AA Compliance Checklist

**Perceivable:**
- [ ] Text alternatives for images (alt text)
- [ ] Captions for videos (if applicable)
- [ ] Color contrast 4.5:1 (normal text), 3:1 (large text)
- [ ] Resize text to 200% without loss of content
- [ ] Meaning not conveyed by color alone

**Operable:**
- [ ] All functionality keyboard accessible
- [ ] No keyboard traps
- [ ] Skip navigation links
- [ ] Page titles descriptive
- [ ] Focus order logical
- [ ] Link purpose clear from text

**Understandable:**
- [ ] Language of page identified (lang="en")
- [ ] Consistent navigation across pages
- [ ] Input error suggestions provided
- [ ] Error prevention (confirmation for irreversible actions)

**Robust:**
- [ ] Valid HTML (no parsing errors)
- [ ] Name, role, value for all components (ARIA)
- [ ] Status messages announced (aria-live)

---

## Performance Budgets

| Metric              | Target     | Current | Pass/Fail |
|---------------------|------------|---------|-----------|
| Page Load Time      | <3s        | TBD     | TBD       |
| Time to Interactive | <3.5s      | TBD     | TBD       |
| LCP                 | <2.5s      | TBD     | TBD       |
| FID                 | <100ms     | TBD     | TBD       |
| CLS                 | <0.1       | TBD     | TBD       |
| API Response (fast) | <200ms     | TBD     | TBD       |
| API Response (med)  | <500ms     | TBD     | TBD       |
| Bundle Size (JS)    | <500KB     | TBD     | TBD       |
| Bundle Size (CSS)   | <100KB     | TBD     | TBD       |

---

## Testing Tools

**Accessibility:**
- **axe DevTools** - Automated accessibility testing (browser extension)
- **NVDA / JAWS / VoiceOver** - Screen readers
- **Lighthouse** - Accessibility audit (Chrome DevTools)
- **WAVE** - Web accessibility evaluation tool

**Performance:**
- **Lighthouse** - Performance audit
- **WebPageTest** - Real-world performance testing
- **Chrome DevTools → Performance** - Profiling

**Security:**
- **OWASP ZAP** - Security scanning
- **Burp Suite** - Penetration testing
- **npm audit** - Dependency vulnerability scanning

**Browser Testing:**
- **BrowserStack** - Cross-browser testing
- **Chrome DevTools Device Mode** - Mobile emulation

---

## Related Documentation

- [cheatsheets/accessibility.md](../../cheatsheets/accessibility.md) - Accessibility patterns
- [cheatsheets/security-best-practices.md](../../cheatsheets/security-best-practices.md) - Security guidelines
- [cheatsheets/performance-optimization.md](../../cheatsheets/performance-optimization.md) - Performance tips
- [DECISIONS.md](../../DECISIONS.md) - Architecture decisions impacting cross-cutting concerns
