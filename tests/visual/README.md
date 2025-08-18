# Visual Regression Testing

Visual regression tests ensure UI consistency across changes by capturing and comparing screenshots.

## Overview

- **Threshold**: ≤0.1% pixel difference allowed
- **Viewports**: Desktop (1920x1080), Tablet (768x1024), Mobile (375x667)
- **Browsers**: Chrome, Firefox, Safari
- **Modes**: Light and Dark themes

## Running Tests

### Initial Baseline Capture
```bash
# Capture baseline screenshots
npx playwright test --grep @visual --update-snapshots

# Capture for specific viewport
npx playwright test --grep @visual --project="Desktop Chrome" --update-snapshots
```

### Run Visual Tests
```bash
# Run all visual tests
npx playwright test --grep visual

# Run specific test file
npx playwright test tests/visual/wizard.visual.test.ts

# Run with UI mode for debugging
npx playwright test --grep visual --ui
```

### Update Baselines
```bash
# Update all baselines
npx playwright test --grep visual --update-snapshots

# Update specific test
npx playwright test tests/visual/charts.visual.test.ts --update-snapshots

# Update with approval workflow
npx playwright test --grep visual --update-snapshots --reporter=html
```

## Test Coverage

### Wizard Component
- Initial state
- Step navigation
- Form validation states
- Progress indicators
- Success/error states
- Responsive layouts
- Dark mode

### Charts
- Portfolio overview
- Performance metrics
- Fund allocation
- Cash flow timeline
- IRR distribution
- Monte Carlo results
- Interactive states (hover, click)
- Loading/empty/error states

## Configuration

### Threshold Settings
```typescript
// Strict comparison (0.1% difference)
const VISUAL_THRESHOLD = 0.001;

// Adjust for specific tests
await expect(page).toHaveScreenshot('name.png', {
  threshold: 0.002, // 0.2% for this test
  maxDiffPixels: 100, // Max 100 pixels can differ
});
```

### Animation Handling
```typescript
// Disable animations globally
await expect(page).toHaveScreenshot('name.png', {
  animations: 'disabled',
});

// Wait for specific animations
await page.waitForTimeout(500);
```

### Viewport Testing
```typescript
// Desktop
await page.setViewportSize({ width: 1920, height: 1080 });

// Tablet
await page.setViewportSize({ width: 768, height: 1024 });

// Mobile
await page.setViewportSize({ width: 375, height: 667 });
```

## Best Practices

### 1. Consistent Environment
- Use fixed viewport sizes
- Disable animations
- Wait for network idle
- Use consistent test data

### 2. Selective Screenshots
- Focus on critical UI components
- Avoid full-page screenshots when possible
- Capture specific elements
- Group related visual tests

### 3. Baseline Management
- Review baseline updates carefully
- Document intentional UI changes
- Use version control for baselines
- Clean up obsolete baselines

### 4. Performance
- Run visual tests separately from unit tests
- Use parallel execution wisely
- Cache browser instances
- Optimize image sizes

## Troubleshooting

### Flaky Tests
1. **Problem**: Tests fail intermittently
   - Add explicit waits: `await page.waitForLoadState('networkidle')`
   - Disable animations: `animations: 'disabled'`
   - Increase threshold slightly

2. **Problem**: Font rendering differences
   - Use web fonts with consistent loading
   - Wait for fonts: `await page.waitForLoadState('domcontentloaded')`
   - Consider font subsetting

3. **Problem**: Dynamic content
   - Mock dynamic data
   - Use fixed timestamps
   - Hide dynamic elements

### Cross-Platform Issues
1. **Problem**: Different OS rendering
   - Use Docker for consistent environment
   - Increase threshold for cross-platform tests
   - Maintain separate baselines per OS

2. **Problem**: Browser differences
   - Test critical paths in all browsers
   - Accept minor rendering differences
   - Focus on functional visual correctness

## CI/CD Integration

### GitHub Actions
```yaml
- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run Visual Tests
  run: npx playwright test --grep visual

- name: Upload Screenshots
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: visual-test-failures
    path: test-results/
```

### Baseline Updates
1. Developer updates locally
2. Commits new baselines
3. PR review includes visual diff
4. Merge updates baselines

## Directory Structure
```
tests/visual/
├── README.md                 # This file
├── wizard.visual.test.ts     # Wizard screenshots
├── charts.visual.test.ts     # Chart screenshots
└── __screenshots__/          # Baseline images (auto-generated)
    ├── wizard-initial.png
    ├── wizard-step1-filled.png
    ├── chart-portfolio-overview.png
    └── ...
```

## Metrics

### Target Metrics
- Visual test pass rate: >99%
- Threshold violations: <1%
- Baseline update frequency: <5% per sprint
- Test execution time: <5 minutes

### Monitoring
- Track visual diff percentages
- Monitor baseline churn
- Identify flaky visual tests
- Measure screenshot sizes

## Future Improvements
- Percy.io integration for visual review
- AI-powered visual validation
- Automated baseline approval workflow
- Cross-browser visual testing grid
- Performance impact analysis