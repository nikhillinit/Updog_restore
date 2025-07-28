# Repository Testing Framework Configuration

## E2E Testing Framework
**Target Framework:** Playwright

## Rationale
- No specific E2E testing framework was previously configured
- Defaulting to Playwright as per testing assistant guidelines
- Playwright provides excellent support for modern web applications with TypeScript
- Suitable for testing complex React applications with multiple routes and interactive components

## Test Structure
- E2E tests located in: `tests/e2e/`
- Test files follow pattern: `*.spec.ts`
- Page object model pattern for maintainable test code

## Application Overview
This is a fund management application with the following key modules:
- Fund Setup (onboarding wizard)
- Dashboard
- Portfolio Management
- Investment Tracking
- Financial Modeling
- Performance Analysis
- Analytics & Reporting

## Testing Priority Areas
1. Fund setup workflow (critical path)
2. Investment creation and management
3. Navigation between modules
4. Data persistence and retrieval
5. Dashboard functionality