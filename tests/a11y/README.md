# Accessibility Testing

Accessibility coverage currently lives in two places:

- `tests/a11y/wizard.a11y.test.ts` - standalone Playwright + `axe-playwright`
  wizard checks
- `tests/e2e/accessibility.spec.ts` - Playwright `accessibility` project for
  broader route coverage

Do not rely on `--grep a11y`; the repo does not tag tests that way.

## Commands

```bash
# Wizard-specific accessibility suite
npx playwright test tests/a11y/wizard.a11y.test.ts

# E2E accessibility project
npx playwright test tests/e2e/accessibility.spec.ts --project=accessibility

# Headed or debug runs
npx playwright test tests/a11y/wizard.a11y.test.ts --headed
npx playwright test tests/e2e/accessibility.spec.ts --project=accessibility --debug

# HTML report
npx playwright test tests/a11y/wizard.a11y.test.ts --reporter=html
npx playwright show-report
```

## Current tooling

- Standard checked: WCAG 2.1 AA tags in the test code
- Libraries in use: `@axe-core/playwright` and `axe-playwright`
- Browser runner: Playwright via `playwright.config.ts`

## Notes

- The `accessibility` Playwright project targets
  `tests/e2e/accessibility.spec.ts`.
- The dedicated wizard suite is outside the project matrix, so run it by file
  path.
- Playwright uses the same preview/bootstrap behavior described in
  `tests/e2e/README.md`.
