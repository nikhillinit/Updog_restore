# Repository Rules and Guidelines

## Testing Framework
- **Primary E2E Framework:** Playwright with TypeScript
- **Test Location:** `tests/e2e/`
- **Configuration:** `playwright.config.ts`
- **Base URL:** `http://localhost:5000`
- **Test Pattern:** `*.spec.ts`
- **Page Object Model:** Implemented in `tests/e2e/page-objects/`

## E2E Testing Standards
- Use TypeScript for all test files
- Follow Page Object Model pattern for reusable components
- Prefer stable selectors (`data-testid`, ARIA roles, text content)
- Implement proper wait strategies (avoid hard timeouts)
- Each test should be isolated and repeatable
- Include responsive testing for mobile/tablet/desktop
- Capture screenshots on failures
- Use proper error handling and graceful degradation

## Test Commands
- `npm run test:e2e` - Run all E2E tests
- `npm run test:e2e:headed` - Run with browser visible
- `npm run test:e2e:debug` - Run in debug mode
- `npx playwright test --project=chromium` - Run specific browser