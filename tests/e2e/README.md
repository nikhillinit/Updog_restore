# E2E Tests Setup and Usage

## Overview

This directory contains end-to-end tests for the fund management application using **Playwright** as the testing framework.

**Target Framework:** Playwright  
**Test Location:** `tests/e2e/`  
**Test Pattern:** `*.spec.ts`

## Prerequisites

1. **Node.js** (v16+) - ✅ Installed (v22.16.0)
2. **Application Dependencies** - Run `npm install`
3. **Playwright Browsers** - Install with commands below
4. **Application Infrastructure** - PostgreSQL and Redis (see main README)

## Quick Setup

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Set up environment variables (create .env file)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/povc_fund"
REDIS_URL="redis://localhost:6379"

# Start infrastructure (PostgreSQL + Redis)
docker compose up -d postgres redis

# Start the application
npm run dev
```

## Running Tests

### Basic Commands

```bash
# Run all E2E tests
npm run test:e2e

# Run tests with browser visible (headed mode)
npm run test:e2e:headed

# Run tests in debug mode
npm run test:e2e:debug

# Run specific test file
npx playwright test tests/e2e/basic-smoke.spec.ts

# Run with specific browser
npx playwright test --project=chromium
```

### Advanced Options

```bash
# Run tests with trace recording
npx playwright test --trace on

# Run tests with video recording
npx playwright test --video on

# Generate HTML report
npx playwright test --reporter=html

# Run tests in parallel
npx playwright test --workers=4
```

## Test Structure

### Created Tests

1. **basic-smoke.spec.ts** - Basic connectivity and routing tests
2. **basic-navigation.spec.ts** - Application navigation and responsiveness tests

### Planned Tests (Templates Created)

- **fund-setup-workflow.spec.ts** - Complete fund setup wizard flow
- **dashboard-functionality.spec.ts** - Dashboard features and metrics
- **navigation-and-routing.spec.ts** - Advanced navigation scenarios

### Page Object Models

- **BasePage.ts** - Common page functionality
- **FundSetupPage.ts** - Fund setup wizard interactions
- **DashboardPage.ts** - Dashboard-specific actions
- **NavigationPage.ts** - Navigation and routing helpers

## Test Scenarios Covered

### 1. Fund Setup Workflow
- Complete wizard flow (Fund Basics → Capital → Strategy → Review)
- Navigation between wizard steps
- Data persistence across steps
- Form validation
- Successful fund creation

### 2. Navigation & Routing
- Homepage redirection logic (setup vs. dashboard)
- Navigation between modules
- Active navigation state
- Direct URL navigation
- 404 handling
- Responsive navigation (mobile/tablet/desktop)

### 3. Dashboard Functionality
- Fund overview display
- Performance metrics
- Portfolio summary
- Recent investments
- Chart visualizations
- Navigation to other modules

### 4. Application Health
- Basic connectivity
- Error handling
- Loading states
- Browser compatibility
- Page refresh handling

## Configuration

The tests are configured via `playwright.config.ts`:

- **Base URL:** `http://localhost:5000`
- **Browsers:** Chromium (primary), Firefox, WebKit
- **Mobile Testing:** Enabled for Pixel 5 and iPhone 12
- **Screenshots:** On failure
- **Videos:** On failure
- **Traces:** On retry

## Troubleshooting

### Common Issues

1. **Server Not Running**
   ```
   Error: page.goto: NS_ERROR_CONNECTION_REFUSED
   ```
   **Solution:** Start the dev server with `npm run dev`

2. **Database Connection**
   ```
   Database connection error
   ```
   **Solution:** Start PostgreSQL with `docker compose up -d postgres`

3. **Playwright Not Installed**
   ```
   Error: browserType.launch: Executable doesn't exist
   ```
   **Solution:** Run `npx playwright install`

4. **Tests Timing Out**
   - Increase timeout in test configuration
   - Check if application is fully loaded
   - Verify all services are running

### Debug Mode

To debug failing tests:

```bash
# Run in debug mode (opens browser inspector)
npm run test:e2e:debug

# Run specific test in debug mode
npx playwright test tests/e2e/fund-setup-workflow.spec.ts --debug

# Generate trace for analysis
npx playwright test --trace on
npx playwright show-trace trace.zip
```

## Infrastructure Requirements

The application requires the following services to be running:

1. **PostgreSQL** (port 5432)
2. **Redis** (port 6379)
3. **Application Server** (port 5000)

Start with:
```bash
docker compose up -d postgres redis
npm run dev
```

## Reporting

Test results are available in multiple formats:

- **Console Output:** Real-time results during test execution
- **HTML Report:** `npx playwright show-report`
- **Screenshots:** `test-results/` directory
- **Videos:** `test-results/` directory (on failure)
- **Traces:** For detailed debugging

## Best Practices

1. **Page Object Model:** Use page objects for maintainable test code
2. **Stable Selectors:** Prefer `data-testid` attributes over CSS selectors
3. **Wait Strategies:** Use proper waits instead of hard timeouts
4. **Test Independence:** Each test should be isolated and repeatable
5. **Error Handling:** Tests should handle various application states gracefully

## Next Steps

1. **Complete Infrastructure Setup:** Ensure PostgreSQL and Redis are running
2. **Install Browsers:** Run `npx playwright install`
3. **Run Smoke Tests:** Verify basic connectivity
4. **Execute Full Test Suite:** Run all E2E scenarios
5. **CI/CD Integration:** Add to deployment pipeline

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Playwright documentation: https://playwright.dev/
3. Verify application setup in main README.md