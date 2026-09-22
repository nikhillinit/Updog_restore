import { test, expect, type Page } from '@playwright/test';

import { FundSetupPage } from './page-objects/FundSetupPage';

const DRAFT_FUND_ID = 77;
const FINALIZE_CORRELATION_ID = '00000000-0000-4000-8000-000000000077';

type ApiRequests = {
  create: Array<{ body: unknown; idempotencyKey: string | null }>;
  drafts: Array<{ body: unknown; idempotencyKey: string | null; ifMatch: string | null }>;
  finalize: Array<{ body: unknown; idempotencyKey: string | null; ifMatch: string | null }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CREATE_ETAG = '"0000000000000001"';
let draftRevision = 1;
const draftETag = () => `"${String(draftRevision).padStart(16, '0')}"`;

async function installFundSetupApiStubs(page: Page, apiRequests: ApiRequests) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'POST' && url.pathname === '/api/telemetry/wizard') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    // Cookie-session CSRF bootstrap precedes every unsafe request (install-auth-fetch.ts).
    if (request.method() === 'GET' && url.pathname === '/api/auth/csrf') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ csrfToken: 'wizard-smoke-csrf-token' }),
      });
      return;
    }

    // Production builds gate the shell on the session; answer it like the smoke specs do.
    if (request.method() === 'GET' && url.pathname === '/api/auth/session') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: '314', email: 'wizard@example.com', role: 'partner', fundIds: [] },
        }),
      });
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
      apiRequests.create.push({
        body: JSON.parse(request.postData() ?? '{}') as unknown,
        idempotencyKey: request.headers()['idempotency-key'] ?? null,
      });
      draftRevision = 1;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        headers: { ETag: CREATE_ETAG, 'Cache-Control': 'no-store' },
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
      apiRequests.drafts.push({
        body: draftPayload,
        idempotencyKey: request.headers()['idempotency-key'] ?? null,
        ifMatch: request.headers()['if-match'] ?? null,
      });
      draftRevision += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: draftETag(), 'Cache-Control': 'no-store' },
        body: JSON.stringify({ success: true, data: { config: draftPayload } }),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === `/api/funds/${DRAFT_FUND_ID}/draft`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: draftETag(), 'Cache-Control': 'no-store' },
        body: JSON.stringify({ config: apiRequests.drafts.at(-1)?.body ?? {} }),
      });
      return;
    }

    if (request.method() === 'POST' && url.pathname === '/api/funds/finalize') {
      apiRequests.finalize.push({
        body: JSON.parse(request.postData() ?? '{}') as unknown,
        idempotencyKey: request.headers()['idempotency-key'] ?? null,
        ifMatch: request.headers()['if-match'] ?? null,
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
    expect(apiRequests.finalize[0]?.idempotencyKey).toMatch(UUID_RE);
    // The reviewed revision is frozen into If-Match: the last acknowledged draft ETag.
    expect(apiRequests.finalize[0]?.ifMatch).toBe(draftETag());
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

    // An edit after the draft was hydrated back autosaves over the acknowledged revision.
    const revisionBeforeEdit = draftETag();
    const editResponsePromise = fundSetupPage.page.waitForResponse(
      (response) =>
        /\/api\/funds\/\d+\/draft$/.test(response.url()) && response.request().method() === 'PUT'
    );
    await fundSetupPage.fundNameInput.fill('Persisted Draft Fund Edited');
    await editResponsePromise;
    await expect(fundSetupPage.page.getByTestId('draft-sync-status')).toContainText(
      'Latest draft saved'
    );
    const editSave = apiRequests.drafts.at(-1);
    expect(editSave?.body).toMatchObject({ fundName: 'Persisted Draft Fund Edited' });
    expect(editSave?.ifMatch).toBe(revisionBeforeEdit);
    expect(editSave?.idempotencyKey).toMatch(UUID_RE);
    expect(editSave?.idempotencyKey).not.toBe(apiRequests.drafts[0]?.idempotencyKey);

    expect(apiRequests.create).toHaveLength(1);
    expect(apiRequests.create[0]?.idempotencyKey).toMatch(UUID_RE);
    expect(apiRequests.drafts.length).toBeGreaterThanOrEqual(1);
    expect(apiRequests.drafts[0]?.idempotencyKey).toMatch(UUID_RE);
    expect(apiRequests.drafts[0]?.ifMatch).toBe(CREATE_ETAG);
    expect(apiRequests.drafts[0]?.body).toMatchObject({
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
