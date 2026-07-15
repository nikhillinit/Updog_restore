import { expect, test, type Locator, type Page } from '@playwright/test';

const WORKSPACE_ITEMS = [
  'Summary',
  'Forecast',
  'Portfolio Actuals',
  'Reserves',
  'Scenarios',
  'Reports',
] as const;

type WorkspaceKey =
  'summary' | 'forecast' | 'portfolio-actuals' | 'reserves' | 'scenarios' | 'reports';

async function expectWorkspaceNav(page: Page, active: WorkspaceKey, basis: string) {
  const nav = page.getByTestId('workspace-nav');
  await expect(nav).toBeVisible();
  await expect(nav.getByTestId(`workspace-nav-${active}`)).toHaveAttribute('aria-current', 'page');
  for (const label of WORKSPACE_ITEMS) {
    await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  await expect(nav.getByText(basis, { exact: true })).toBeVisible();
  await expect(nav.getByText(/^Scenario:/)).toHaveCount(0);
}

async function expectReadinessState(row: Locator, expected: string) {
  await expect(row).toBeVisible();
  await expect(row.getByText(expected, { exact: true })).toBeVisible();
  await expect(row).not.toHaveText('');
}

test('partner completes the truthful GP decision spine with fail-closed gaps disclosed', async ({
  page,
}) => {
  test.setTimeout(240_000);

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Username').fill('partner');
  await page.getByLabel('Password').fill('partner-dev-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  const sessionCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'updog.session'
  );
  expect(sessionCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });

  const summaryResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/funds/1/results' &&
      response.request().method() === 'GET'
  );
  await page.goto('/fund-model-results/1', { waitUntil: 'domcontentloaded' });
  expect((await summaryResponse).status()).toBe(200);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Test Fund I', exact: true })
  ).toBeVisible();
  await expectWorkspaceNav(page, 'summary', 'Basis: Construction');

  const rollup = page.getByTestId('fund-readiness-rollup');
  await expect(
    rollup.getByRole('heading', { name: 'Readiness — what is blocked and where' })
  ).toBeVisible();
  await expectReadinessState(page.getByTestId('readiness-row-forecast'), 'Facts unavailable');
  await expectReadinessState(
    page.getByTestId('readiness-row-portfolio-actuals'),
    'Facts unavailable'
  );
  await expectReadinessState(page.getByTestId('readiness-row-reserves'), 'Not actionable');
  await expectReadinessState(page.getByTestId('readiness-row-scenarios'), 'Facts unavailable');
  await expectReadinessState(page.getByTestId('readiness-row-reports'), 'Not verified');
  await expect(rollup.locator('tbody > tr[data-testid^="readiness-row-"]')).toHaveCount(5);

  await page.goto('/financial-modeling?fundId=1', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Financial Modeling & Forecasting', exact: true })
  ).toBeVisible();
  await expectWorkspaceNav(page, 'forecast', 'Basis: Construction and Current — side by side');
  const fundValueForecastTitle = page.getByText('Fund Value Forecast', { exact: true });
  const fundValueForecastCard = fundValueForecastTitle.locator('..').locator('..');
  await expect(fundValueForecastTitle).toBeVisible();
  await expect(fundValueForecastCard.getByText('Construction Plan', { exact: true })).toBeVisible();
  await expect(fundValueForecastCard.getByText('Current Forecast', { exact: true })).toBeVisible();
  const allocationEvidence = page.getByRole('note', { name: 'Portfolio allocation evidence' });
  const allocationCard = allocationEvidence.locator('..').locator('..');
  await expect(allocationEvidence).toContainText('Valuation freshness unavailable:');
  await expect(allocationCard.getByText('Recorded valuations', { exact: true })).toBeVisible();
  for (const company of ['TechCorp', 'HealthAI', 'DataFlow']) {
    await expect(allocationCard.getByText(company, { exact: true })).toBeVisible();
  }

  await page.goto('/portfolio?tab=reserve-planning&fundId=1', {
    waitUntil: 'domcontentloaded',
  });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Portfolio', exact: true })
  ).toBeVisible();
  await expectWorkspaceNav(page, 'portfolio-actuals', 'Basis: Current');
  await expect(page.getByRole('alert')).toContainText(
    'We could not load reserve allocations. Retry in a moment or check that this fund is still available.'
  );
  await expect(page.getByRole('region', { name: 'Actuals drift summary' })).toHaveCount(0);
  await expect(page.getByTestId('reserve-planning-empty-state')).toHaveCount(0);
  await expect(page.locator('[data-testid^="allocation-seed-link-"]')).toHaveCount(0);

  await page.goto('/fund-model-results/1/moic-analysis', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { level: 1, name: 'MOIC Analysis', exact: true })
  ).toBeVisible();
  await expectWorkspaceNav(page, 'reserves', 'Basis: Construction');
  const emptyRankings = page.getByText('No rankings disclosed', { exact: true });
  await expect(emptyRankings).toBeVisible();
  await expect(page.getByTestId('moic-planned-marginal-crossref')).toHaveCount(0);
  await expect(page.getByText(/currency blocked/i)).toHaveCount(0);

  await page.goto('/fund-model-results/1/scenarios?seedPicker=1&seedCompany=1', {
    waitUntil: 'domcontentloaded',
  });
  await expectWorkspaceNav(page, 'scenarios', 'Basis: Construction');
  await expect(page.getByRole('alert')).toContainText(
    'Scenario workspace data could not be loaded.'
  );
  await expect(page.getByRole('dialog', { name: 'Start case from portfolio actuals' })).toHaveCount(
    0
  );
  await expect(page.getByRole('button', { name: 'Create case' })).toHaveCount(0);

  await page.goto('/fund-model-results/1/reports', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Reports', exact: true })).toBeVisible();
  await expectWorkspaceNav(page, 'reports', 'Basis: Current');
  const qualification = page.getByTestId('gp-qualification-strip');
  await expect(qualification).toContainText('Not export-ready');
  await expect(qualification).toContainText(
    'No metric run disclosed on this surface yet. Run and qualify metrics below.'
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Metrics', exact: true })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Metric-run dry-run form' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run metrics', exact: true })).toBeVisible();

  await page.goto('/fund-model-results/1', { waitUntil: 'domcontentloaded' });
  const evidenceTrigger = page.getByTestId('scenario-evidence-trigger');
  await expect(evidenceTrigger).toBeVisible();
  await evidenceTrigger.click();
  const evidencePanel = page.getByRole('dialog', { name: 'Scenario comparison' });
  await expect(evidencePanel).toBeVisible();
  await expect(evidencePanel).toContainText('No scenario comparisons disclosed');
  await page.keyboard.press('Escape');
  await expect(evidencePanel).toBeHidden();
  await expect(evidenceTrigger).toBeFocused();

  const ungrantedResponse = await page.context().request.get('/api/funds/2');
  expect(ungrantedResponse.status()).toBe(403);
  const ungrantedResultsResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/funds/2/results' &&
      response.request().method() === 'GET'
  );
  await page.goto('/fund-model-results/2', { waitUntil: 'domcontentloaded' });
  expect((await ungrantedResultsResponse).status()).toBe(403);
  await expect(page.getByText('Error loading results', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('alert').getByText('Server error (403)', { exact: true })
  ).toBeVisible();
  await expect(page.getByTestId('workspace-nav-fund')).toHaveText('Fund 2');

  const healthResponse = await page.context().request.get('/healthz');
  expect(healthResponse.ok()).toBe(true);
  const health = (await healthResponse.json()) as { commit_sha?: unknown };
  expect(health.commit_sha).toBe(process.env.COMMIT_REF);
});
