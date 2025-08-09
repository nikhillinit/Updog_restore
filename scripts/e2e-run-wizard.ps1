$env:E2E_WIZARD = "1"
$env:E2E_WIZARD_URL = "/fund-setup"
npx playwright test tests/e2e/reserves.smoke.spec.ts
