import { test, expect, type Page } from '@playwright/test';

import { FundSetupPage } from './page-objects/FundSetupPage';

const DRAFT_FUND_ID = 77;
const FINALIZE_CORRELATION_ID = '00000000-0000-4000-8000-000000000077';

type ApiRequests = {
  create: unknown[];
  drafts: unknown[];
  finalize: Array<{ body: unknown; idempotencyKey: string | null }>;
};

async function installFundSetupApiStubs(page: Page, apiRequests: ApiRequests) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'POST' && url.pathname === '/api/telemetry/wizard') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/funds') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (request.method() === 'POST' && url.pathname === '/api/funds') {
      apiRequests.create.push(JSON.parse(request.postData() ?? '{}') as unknown);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: DRAFT_FUND_ID,
          name: 'Persisted Draft Fund',
          size: 75_000_000,
          managementFee: 0.02,
          carryPercentage: 0.2,
          vintageYear: 2026,
          status: 'draft',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      });
      return;
    }

    if (request.method() === 'PUT' && url.pathname === `/api/funds/${DRAFT_FUND_ID}/draft`) {
      const draftPayload = JSON.parse(request.postData() ?? '{}') as unknown;
      apiRequests.drafts.push(draftPayload);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ config: draftPayload }),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === `/api/funds/${DRAFT_FUND_ID}/draft`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ config: apiRequests.drafts.at(-1) ?? {} }),
      });
      return;
    }

    if (request.method() === 'POST' && url.pathname === '/api/funds/finalize') {
      apiRequests.finalize.push({
        body: JSON.parse(request.postData() ?? '{}') as unknown,
        idempotencyKey: request.headers()['idempotency-key'] ?? null,
      });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            fundId: DRAFT_FUND_ID,
            configVersion: 1,
            correlationId: FINALIZE_CORRELATION_ID,
            published: true,
            dispatchState: 'pending',
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    });
  });
}

test.describe('Fund Setup Workflow', () => {
  let fundSetupPage: FundSetupPage;
  let apiRequests: ApiRequests;

  test.beforeEach(async ({ page }) => {
    apiRequests = { create: [], drafts: [], finalize: [] };
    await installFundSetupApiStubs(page, apiRequests);
    fundSetupPage = new FundSetupPage(page);
  });

  test('should complete the current 7-step fund setup flow', async () => {
    await fundSetupPage.gotoFundSetup(1);

    await fundSetupPage.completeFullFundSetup({
      name: 'Test Venture Fund',
      fundSize: '100',
    });

    await expect(fundSetupPage.page).toHaveURL(/\/fund-model-results\/\d+$/);
    expect(apiRequests.finalize).toHaveLength(1);
    expect(apiRequests.finalize[0]?.body).toMatchObject({ draftFundId: DRAFT_FUND_ID });
    expect(apiRequests.finalize[0]?.idempotencyKey).toEqual(expect.any(String));
  });

  test('should create and persist a server draft from step 1', async () => {
    await fundSetupPage.gotoFundSetup(1);
    await fundSetupPage.verifyWizardLoaded();

    await fundSetupPage.completeStepOneAndWaitForDraft({
      name: 'Persisted Draft Fund',
      fundSize: '75',
    });

    await fundSetupPage.goToStep(1);
    await expect(fundSetupPage.fundNameInput).toHaveValue('Persisted Draft Fund');
    await expect(fundSetupPage.capitalCommittedInput).toHaveValue('75');
    expect(apiRequests.create).toHaveLength(1);
    expect(apiRequests.drafts.length).toBeGreaterThanOrEqual(1);
    expect(apiRequests.drafts.at(-1)).toMatchObject({
      fundName: 'Persisted Draft Fund',
      fundSize: 75,
    });
  });

  test('should render the current wizard responsively', async () => {
    await fundSetupPage.gotoFundSetup(1);
    await fundSetupPage.verifyWizardLoaded();

    await fundSetupPage.page.setViewportSize({ width: 1200, height: 800 });
    await expect(fundSetupPage.wizardContainer).toBeVisible();

    await fundSetupPage.page.setViewportSize({ width: 768, height: 1024 });
    await expect(fundSetupPage.wizardContainer).toBeVisible();

    await fundSetupPage.page.setViewportSize({ width: 375, height: 667 });
    await expect(fundSetupPage.wizardContainer).toBeVisible();
  });
});
