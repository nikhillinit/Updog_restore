# Epic H: E2E Test Strategy

**Status:** IN PROGRESS
**Date:** 2026-01-22

---

## Current State Assessment

| Metric | Value |
|--------|-------|
| Framework | Playwright v1.54.2 |
| Test Files | 24 |
| Test Cases | ~254 |
| Page Objects | 8 |
| CI Integration | GitHub Actions (retries: 2) |

**Strengths:** POM patterns, accessibility tests, multi-browser support
**Gaps:** Error paths, MSW mocking, flake detection, Phase 1 feature coverage

---

## H.1 Selector Strategy

### Priority Order
1. **Role + Name** (accessibility-first, most stable)
   ```typescript
   page.getByRole('button', { name: 'Save Changes' })
   page.getByRole('heading', { name: /dashboard/i })
   page.getByRole('textbox', { name: 'Fund Name' })
   ```

2. **data-testid** (for complex components without clear roles)
   ```typescript
   page.getByTestId('investment-editor-dialog')
   page.getByTestId('timeline-item')
   page.getByTestId('kpi-preview')
   ```

3. **Label/Placeholder** (for form fields)
   ```typescript
   page.getByLabel('Email')
   page.getByPlaceholder('Enter fund name')
   ```

4. **Text Content** (last resort, fragile)
   ```typescript
   page.getByText('No investments found')
   ```

### Naming Convention
```
data-testid="<component>-<element>[-<modifier>]"

Examples:
- data-testid="guided-tour-step-1"
- data-testid="split-pane-left"
- data-testid="kpi-card-net-irr"
- data-testid="timeline-item"
```

### Required Test IDs (Phase 1 Components)
| Component | Test IDs |
|-----------|----------|
| GuidedTour | `guided-tour`, `tour-step-{n}`, `tour-next`, `tour-skip` |
| SplitPane | `split-pane`, `split-pane-left`, `split-pane-right` |
| InvestmentTimeline | `timeline`, `timeline-item`, `timeline-empty` |
| InvestmentEditorDialog | `investment-editor-dialog`, `kpi-preview`, `context-panel-toggle` |
| KpiCard | `kpi-card-{metric}` |
| CollapsibleSection | `collapsible-{id}`, `collapsible-trigger-{id}` |

---

## H.2 Tiered Data Strategy

### Tier 1: MSW Mocks (Fast, Isolated)
- Unit/component tests
- Predictable responses
- Error state simulation

### Tier 2: Seeded Backend (Realistic)
- E2E happy paths
- API fixture creates test fund
- Cleanup after test

### Tier 3: Contract Validation (Confidence)
- Schema validation against OpenAPI
- Response shape assertions

### MSW Setup (New)
```typescript
// tests/e2e/mocks/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/api/timeline/:fundId', () => {
    return HttpResponse.json({
      events: [
        { id: '1', eventType: 'investment_created', timestamp: '2026-01-22' }
      ]
    })
  }),

  http.get('/api/funds/:fundId/metrics', () => {
    return HttpResponse.json({
      totalValue: 10000000,
      netIrr: 0.25,
      tvpi: 1.5,
      dpi: 0.8
    })
  })
]
```

---

## H.3-H.6 Test Coverage Plan

### H.3 Onboarding Tour Tests
```typescript
// tests/e2e/onboarding-tour.spec.ts
test.describe('Onboarding Tour', () => {
  test('completes 5-step tour', async ({ page }) => {
    // Enable flag, trigger tour
    // Verify each step appears
    // Complete tour, verify completion state
  })

  test('can skip tour', async ({ page }) => {
    // Click skip, verify dismissal
    // Tour should not reappear
  })

  test('remembers tour completion', async ({ page }) => {
    // Complete tour, refresh
    // Verify tour does not restart
  })
})
```

### H.4 Split-Screen Workflow Tests
```typescript
// tests/e2e/investment-editor.spec.ts
test.describe('Investment Editor Dialog', () => {
  test('shows KPIs in desktop view', async ({ page }) => {
    // Open dialog at desktop viewport
    // Verify split pane visible
    // Verify 4 KPI cards present
  })

  test('collapses KPIs in mobile view', async ({ page }) => {
    // Set mobile viewport
    // Verify context panel collapsed
    // Tap toggle, verify expansion
  })

  test('updates timeline after save', async ({ page }) => {
    // Create investment
    // Verify timeline shows new event
  })
})
```

### H.5 Responsive Overview Tests
```typescript
// tests/e2e/responsive-overview.spec.ts
test.describe('Responsive Overview', () => {
  test('KPI cards swipe on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    // Verify SwipeableMetricCards renders
    // Verify swipe gesture works
  })

  test('DataTable scrolls horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    // Verify table is scrollable
    // Verify all columns accessible
  })
})
```

### H.6 Telemetry Tests
```typescript
// tests/e2e/telemetry.spec.ts
test.describe('Telemetry System', () => {
  test('tracks tour events', async ({ page }) => {
    // Start tour, check localStorage for events
    // Verify event structure: { event, timestamp, properties }
  })

  test('respects ring buffer limit', async ({ page }) => {
    // Generate 600 events
    // Verify buffer capped at 500
  })

  test('validates event allowlist', async ({ page }) => {
    // Inject invalid event type
    // Verify it's rejected
  })
})
```

---

## H.7 Visual Regression (Scoped)

### Scope: UI Catalog Only
- Snapshot each component variant in catalog
- Run on Chrome only (cross-browser diff noise)
- Update snapshots explicitly (`--update-snapshots`)

### Implementation
```typescript
// tests/e2e/visual-regression.spec.ts
test.describe('UI Catalog Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/ui-catalog')
  })

  test('KpiCard variants', async ({ page }) => {
    await expect(page.getByTestId('kpi-card-demo')).toHaveScreenshot()
  })

  test('CollapsibleSection states', async ({ page }) => {
    await expect(page.getByTestId('collapsible-demo')).toHaveScreenshot()
  })
})
```

---

## H.8 Flake Policy

### Detection
- Parse Playwright JSON reporter output
- Flag tests with >1 retry as "flaky"
- Track flake rate per test over 7 days

### Response Protocol
| Flake Rate | Action |
|------------|--------|
| <5% | Monitor |
| 5-15% | Add to watchlist, investigate within sprint |
| >15% | Quarantine (skip in CI), fix within 48h |

### CI Configuration
```yaml
# .github/workflows/e2e.yml
- name: Run E2E Tests
  run: npx playwright test --reporter=json,html

- name: Check Flake Rate
  run: node scripts/check-flake-rate.js
  if: always()
```

### Quarantine File
```typescript
// tests/e2e/quarantine.skip.ts
export const quarantinedTests = [
  // 'test-name': { reason: 'flaky network', ticket: 'GH-123', date: '2026-01-22' }
]
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `tests/e2e/onboarding-tour.spec.ts` | Tour flow tests |
| `tests/e2e/investment-editor.spec.ts` | Split-screen tests |
| `tests/e2e/responsive-overview.spec.ts` | Mobile viewport tests |
| `tests/e2e/telemetry.spec.ts` | Telemetry validation |
| `tests/e2e/visual-regression.spec.ts` | UI Catalog snapshots |
| `tests/e2e/mocks/handlers.ts` | MSW mock handlers |
| `scripts/check-flake-rate.js` | Flake detection script |

---

## Verification Checklist

- [ ] All Phase 1 components have data-testid attributes
- [ ] MSW handlers cover critical API endpoints
- [ ] 4 new test files pass locally
- [ ] Visual regression snapshots generated
- [ ] Flake policy documented and CI integrated
