# Accessibility Testing

Automated accessibility testing ensures WCAG 2.1 AA compliance across the application.

## Overview

- **Standard**: WCAG 2.1 Level AA
- **Tools**: axe-playwright, Playwright
- **Coverage**: Wizard, Forms, Navigation, Charts
- **Target**: 0 violations for Level A and AA criteria

## Running Tests

### Run Accessibility Tests
```bash
# Run all a11y tests
npx playwright test --grep a11y

# Run specific test
npx playwright test tests/a11y/wizard.a11y.test.ts

# Run with detailed reporting
npx playwright test --grep a11y --reporter=html

# Debug mode
npx playwright test --grep a11y --debug
```

### Generate Reports
```bash
# HTML report with violations
npx playwright test --grep a11y --reporter=html

# JSON report for CI
npx playwright test --grep a11y --reporter=json > a11y-report.json

# Console output with details
npx playwright test --grep a11y --reporter=list
```

## Test Coverage

### Core Components
- **Wizard**: Form labels, keyboard navigation, ARIA attributes
- **Navigation**: Skip links, focus management, menu accessibility
- **Forms**: Input labels, error messages, validation feedback
- **Charts**: Alternative text, data tables, keyboard interaction
- **Modals**: Focus trap, escape key, screen reader announcements

### WCAG Criteria Tested

#### Level A
- **1.1.1** Non-text Content
- **1.3.1** Info and Relationships
- **1.4.1** Use of Color
- **2.1.1** Keyboard
- **2.1.2** No Keyboard Trap
- **2.4.1** Bypass Blocks
- **3.1.1** Language of Page
- **4.1.2** Name, Role, Value

#### Level AA
- **1.4.3** Contrast (Minimum)
- **1.4.5** Images of Text
- **2.4.6** Headings and Labels
- **2.4.7** Focus Visible
- **3.2.3** Consistent Navigation
- **3.2.4** Consistent Identification
- **3.3.3** Error Suggestion
- **3.3.4** Error Prevention

## Configuration

### axe-core Rules
```typescript
// Test specific WCAG levels
await checkA11y(page, null, {
  axeOptions: {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
    }
  }
});

// Test specific rules
await checkA11y(page, null, {
  axeOptions: {
    rules: {
      'color-contrast': { enabled: true },
      'label': { enabled: true },
      'aria-valid-attr': { enabled: true }
    }
  }
});
```

### Violation Reporting
```typescript
// Detailed HTML report
await checkA11y(page, null, {
  detailedReport: true,
  detailedReportOptions: {
    html: true
  }
});

// Custom violation handler
const violations = await getViolations(page);
reportViolations(violations, 'Component Name');
```

## Common Issues and Fixes

### 1. Color Contrast
**Issue**: Insufficient contrast between text and background
```css
/* Bad */
.text { color: #777; background: #fff; } /* 4.48:1 ratio */

/* Good */
.text { color: #595959; background: #fff; } /* 7:1 ratio */
```

### 2. Missing Labels
**Issue**: Form inputs without labels
```html
<!-- Bad -->
<input type="text" placeholder="Enter name">

<!-- Good -->
<label for="name">Name</label>
<input id="name" type="text">

<!-- Alternative -->
<input type="text" aria-label="Name">
```

### 3. Focus Indicators
**Issue**: No visible focus indicator
```css
/* Bad */
button:focus { outline: none; }

/* Good */
button:focus { 
  outline: 2px solid #0066cc;
  outline-offset: 2px;
}
```

### 4. ARIA Attributes
**Issue**: Invalid or missing ARIA
```html
<!-- Bad -->
<div role="button">Click me</div>

<!-- Good -->
<button>Click me</button>

<!-- If div is necessary -->
<div role="button" tabindex="0" 
     onkeydown="if(event.key==='Enter') handleClick()">
  Click me
</div>
```

### 5. Skip Links
**Issue**: No way to skip navigation
```html
<!-- Add skip link -->
<a href="#main" class="skip-link">Skip to main content</a>

<style>
.skip-link {
  position: absolute;
  left: -9999px;
}
.skip-link:focus {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 999;
}
</style>
```

## Testing Patterns

### Keyboard Navigation
```typescript
test('keyboard navigation', async ({ page }) => {
  // Tab through elements
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(focused).toBeTruthy();
  
  // Check tab order
  const tabOrder = [];
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    const element = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      text: document.activeElement?.textContent
    }));
    tabOrder.push(element);
  }
  
  // Verify logical order
  expect(tabOrder).toMatchSnapshot();
});
```

### Screen Reader Announcements
```typescript
test('live regions', async ({ page }) => {
  // Check for ARIA live regions
  const liveRegions = page.locator('[aria-live], [role="alert"], [role="status"]');
  expect(await liveRegions.count()).toBeGreaterThan(0);
  
  // Trigger action that should announce
  await page.click('button[type="submit"]');
  
  // Verify announcement region updated
  const alert = page.locator('[role="alert"]');
  await expect(alert).toContainText(/success|error/i);
});
```

### Focus Management
```typescript
test('modal focus trap', async ({ page }) => {
  // Open modal
  await page.click('button[data-opens-modal]');
  
  // Focus should be in modal
  const focusedInModal = await page.evaluate(() => {
    const modal = document.querySelector('[role="dialog"]');
    return modal?.contains(document.activeElement);
  });
  expect(focusedInModal).toBeTruthy();
  
  // Tab should cycle within modal
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  
  // Escape should close modal
  await page.keyboard.press('Escape');
  const modalVisible = await page.locator('[role="dialog"]').isVisible();
  expect(modalVisible).toBeFalsy();
});
```

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run A11y Tests
  run: npx playwright test --grep a11y
  
- name: Upload A11y Report
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: a11y-report
    path: playwright-report/
    
- name: Comment PR with Results
  if: failure()
  uses: actions/github-script@v6
  with:
    script: |
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        body: '❌ Accessibility tests failed. Check artifacts for details.'
      })
```

### Pre-commit Hook
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npx playwright test --grep a11y tests/a11y/wizard.a11y.test.ts"
    }
  }
}
```

## Manual Testing

While automated tests catch many issues, manual testing is still needed for:

1. **Screen Reader Testing**
   - NVDA (Windows)
   - JAWS (Windows)
   - VoiceOver (macOS/iOS)
   - TalkBack (Android)

2. **Keyboard Testing**
   - Tab order logic
   - Custom keyboard shortcuts
   - Focus management in SPAs

3. **Zoom Testing**
   - 200% zoom functionality
   - Reflow at 400% zoom
   - No horizontal scrolling at 320px

4. **Motion and Animation**
   - Respect prefers-reduced-motion
   - Pause/stop animations
   - No seizure-inducing content

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [axe-core Rules](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM Color Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [WAVE Browser Extension](https://wave.webaim.org/extension/)

## Metrics

### Success Criteria
- 0 Level A violations
- 0 Level AA violations
- <5 best practice warnings
- 100% keyboard navigable
- All images have alt text
- All forms have labels

### Monitoring
- Track violation count over time
- Monitor violation severity
- Measure fix time for violations
- Coverage percentage of components