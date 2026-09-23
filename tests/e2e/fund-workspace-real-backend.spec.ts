import { readFile, writeFile } from 'node:fs/promises';

import { expect, request, test, type Page, type Response, type TestInfo } from '@playwright/test';
import { Pool } from 'pg';

type Runtime = {
  databaseUrl: string;
  username: string;
  password: string;
  userId: number;
};

type MutationSummary = {
  method: string;
  path: string;
  status: number;
  csrf: boolean;
  idempotency: boolean;
  optimisticLock: boolean;
};

type FundBasics = {
  name: string;
  capital: string;
  asOfDate: string;
};

const FIRST_FUND = {
  name: 'Batch B Published Fund',
  capital: '72',
  asOfDate: '2026-06-30',
};

const SECOND_FUND = {
  name: 'Batch B Persisted Draft',
  capital: '4.1',
  asOfDate: '2026-07-31',
};

function runtimePath(): string {
  const path = process.env['BATCH_B_RUNTIME_FILE'];
  if (!path) throw new Error('BATCH_B_RUNTIME_FILE must point to the real-backend runtime JSON');
  return path;
}

async function loadRuntime(): Promise<Runtime> {
  const value = JSON.parse(await readFile(runtimePath(), 'utf8')) as Partial<Runtime>;
  if (
    typeof value.databaseUrl !== 'string' ||
    typeof value.username !== 'string' ||
    typeof value.password !== 'string' ||
    typeof value.userId !== 'number'
  ) {
    throw new Error('BATCH_B_RUNTIME_FILE is missing databaseUrl, username, password, or userId');
  }
  return value as Runtime;
}

function responseFundId(responseBody: unknown): number {
  const id = (responseBody as { data?: { id?: unknown } })?.data?.id;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw new Error(
      `Create response did not contain a valid fund ID: ${JSON.stringify(responseBody)}`
    );
  }
  return id;
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, {
    path,
    contentType: 'image/png',
  });
}

async function openWorkspace(page: Page) {
  const workspaceLink = page
    .getByRole('link', { name: /^(Dashboard|Open fund workspace)$/i })
    .first();
  await expect(workspaceLink).toBeVisible();
  await workspaceLink.click();
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
  await expect(page.getByTestId('fund-workspace')).toBeVisible();
}

async function fillBasics(page: Page, fund: FundBasics) {
  await page.getByTestId('fund-name').fill(fund.name);
  await page.getByLabel('Capital Committed ($M)').fill(fund.capital);
  await page.getByTestId('model-inputs-as-of-date').fill(fund.asOfDate);
}

async function createDraftThroughStepOne(page: Page, fund: FundBasics) {
  await fillBasics(page, fund);
  const createResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/funds' && response.request().method() === 'POST'
  );
  const draftResponsePromise = page.waitForResponse(
    (response) =>
      /\/api\/funds\/\d+\/draft$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'PUT'
  );

  await page.getByTestId('next-step').click();
  const [createResponse, draftResponse] = await Promise.all([
    createResponsePromise,
    draftResponsePromise,
  ]);
  expect(createResponse.status()).toBe(201);
  expect(draftResponse.ok()).toBe(true);
  await expect(page).toHaveURL(/\/fund-setup\?step=2$/);
  await expect(page.getByTestId('draft-sync-status')).toContainText('Latest draft saved');

  return responseFundId(await createResponse.json());
}

async function publishCurrentFund(page: Page): Promise<Response> {
  for (const step of [2, 3, 4, 5] as const) {
    await expect(page).toHaveURL(new RegExp(`/fund-setup\\?step=${step}$`));
    await page.getByTestId('next-step').click();
  }
  await expect(page).toHaveURL(/\/fund-setup\?step=6$/);
  await page.getByTestId('finish-setup').click();
  await expect(page).toHaveURL(/\/fund-setup\?step=7$/);

  const finalizeResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/funds/finalize' &&
      response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Create, Publish, and View Results' }).click();
  return finalizeResponsePromise;
}

test.describe.configure({ mode: 'serial' });

test('authenticated user can publish one fund and persist a distinct second draft', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  const runtime = await loadRuntime();
  const pool = new Pool({ connectionString: runtime.databaseUrl, max: 1 });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const apiFailures: string[] = [];
  const expectedEmptyStates: string[] = [];
  const abortedGetRequests: string[] = [];
  const expectedConsoleErrors: string[] = [];
  let authenticated = false;
  const isExpectedEmptyState = (pathname: string, status: number) =>
    (!authenticated && pathname === '/api/auth/session' && status === 401) ||
    (/^\/api\/funds\/\d+\/financial-facts\/latest$/.test(pathname) && status === 404);
  const mutations: MutationSummary[] = [];
  const acceptance: Record<string, unknown> = {
    authenticatedUserId: runtime.userId,
    firstFundId: null,
    secondFundId: null,
    cookieSession: false,
    localStorageAuthTokens: [],
    unauthenticatedFundsStatus: null,
    mutations,
    consoleErrors,
    pageErrors,
    requestFailures,
    apiFailures,
    expectedEmptyStates,
    expectedConsoleErrors,
    abortedGetRequests,
  };

  function monitorPage(monitoredPage: Page) {
    monitoredPage.on('console', (message) => {
      if (message.type() !== 'error') return;
      const pathname = new URL(message.location().url || monitoredPage.url()).pathname;
      const status = Number(message.text().match(/status of (\d+)/)?.[1]);
      if (isExpectedEmptyState(pathname, status)) expectedConsoleErrors.push(message.text());
      else consoleErrors.push(message.text());
    });
    monitoredPage.on('pageerror', (error) => pageErrors.push(error.message));
    monitoredPage.on('requestfailed', (failedRequest) => {
      const url = new URL(failedRequest.url());
      const errorText = failedRequest.failure()?.errorText ?? 'unknown failure';
      if (errorText.includes('ERR_ABORTED') && failedRequest.method() === 'GET') {
        abortedGetRequests.push(url.pathname);
        return;
      }
      requestFailures.push(`${failedRequest.method()} ${url.pathname}: ${errorText}`);
    });
    monitoredPage.on('response', (response) => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith('/api/')) return;
      const method = response.request().method();
      if (
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
        !url.pathname.startsWith('/api/telemetry/')
      ) {
        const headers = response.request().headers();
        mutations.push({
          method,
          path: url.pathname,
          status: response.status(),
          csrf: !!headers['x-csrf-token'],
          idempotency: !!headers['idempotency-key'],
          optimisticLock: !!headers['if-match'],
        });
      }
      if (response.status() >= 400) {
        const target = isExpectedEmptyState(url.pathname, response.status())
          ? expectedEmptyStates
          : apiFailures;
        target.push(`${method} ${url.pathname}: ${response.status()}`);
      }
    });
  }
  monitorPage(page);

  try {
    await page.goto('/login');
    await page.getByLabel('Username').fill(runtime.username);
    await page.getByLabel('Password').fill(runtime.password);
    const loginResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/auth/login' &&
        response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Sign in' }).click();
    expect((await loginResponsePromise).ok()).toBe(true);
    await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
    await expect(page.getByTestId('fund-workspace')).toBeVisible();
    authenticated = true;
    const sessionResponse = await page.request.get('/api/auth/session');
    expect(sessionResponse.status()).toBe(200);
    expect((await sessionResponse.json()).user).toMatchObject({
      id: String(runtime.userId),
      role: 'partner',
    });
    acceptance['role'] = 'partner';

    expect(
      (await page.context().cookies()).find((cookie) => cookie.name === 'updog.session')
    ).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
    expect(await page.evaluate(() => document.cookie)).not.toContain('updog.session');
    acceptance['cookieSession'] = true;

    const localStorageAuthTokens = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(
          ([key, value]) =>
            /(?:auth.*token|access.?token|refresh.?token)/i.test(key) || /^Bearer\s+/i.test(value)
        )
        .map(([key]) => key)
    );
    expect(localStorageAuthTokens).toEqual([]);
    acceptance['localStorageAuthTokens'] = localStorageAuthTokens;

    const baseURL = new URL(page.url()).origin;
    const unauthenticated = await request.newContext({ baseURL });
    const unauthenticatedFunds = await unauthenticated.get('/api/funds');
    acceptance['unauthenticatedFundsStatus'] = unauthenticatedFunds.status();
    expect(unauthenticatedFunds.status()).toBe(401);
    await unauthenticated.dispose();

    const primaryNav = page.getByRole('navigation', { name: 'Primary', exact: true });
    const sidebar = page.locator('aside').filter({ has: primaryNav });
    await page.mouse.move(600, 400);
    await expect(sidebar).toHaveCSS('width', '64px');
    acceptance['collapsedNavigation'] = await primaryNav.evaluate((nav) => ({
      width: nav.clientWidth,
      scrollWidth: nav.scrollWidth,
      overflowX: getComputedStyle(nav).overflowX,
    }));
    await expect(primaryNav).toHaveCSS('overflow-x', 'hidden');
    const dashboardLink = primaryNav.getByRole('link', { name: 'Dashboard', exact: true });
    const collapsedTop = (await dashboardLink.boundingBox())!.y;
    await page.mouse.move(30, collapsedTop + 20);
    await expect(sidebar).toHaveCSS('width', '256px');
    await expect(primaryNav.getByText('Setup Required', { exact: true })).toBeVisible();
    expect(Math.abs((await dashboardLink.boundingBox())!.y - collapsedTop)).toBeLessThanOrEqual(1);
    await attachScreenshot(page, testInfo, 'batch-b-sidebar-expanded.png');
    await page.mouse.move(600, 400);
    await expect(sidebar).toHaveCSS('width', '64px');
    await attachScreenshot(page, testInfo, 'batch-b-sidebar-collapsed.png');

    // A separate tab keeps this fresh deep link independent of the workspace journey.
    const deepLinkPage = await page.context().newPage();
    monitorPage(deepLinkPage);
    const deepLinkWrites: string[] = [];
    deepLinkPage.on('request', (request) => {
      if (
        /\/api\/funds(?:\/|$)/.test(new URL(request.url()).pathname) &&
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
      ) {
        deepLinkWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
      }
    });
    await deepLinkPage.goto('/fund-setup?step=3');
    await expect(deepLinkPage).toHaveURL(/\/fund-setup\?step=2$/);
    expect(
      await deepLinkPage.evaluate(() => {
        const stored = sessionStorage.getItem('fund-workspace-session');
        return stored ? JSON.parse(stored).state.creationKey : null;
      })
    ).toBeNull();
    acceptance['freshDeepLinkRoute'] =
      new URL(deepLinkPage.url()).pathname + new URL(deepLinkPage.url()).search;
    await deepLinkPage.getByTestId('previous-step').click();
    await expect(deepLinkPage).toHaveURL(/\/fund-setup\?step=1$/);
    await expect(deepLinkPage.getByTestId('fund-name')).toBeVisible();
    expect(
      await deepLinkPage.evaluate(
        () => JSON.parse(sessionStorage.getItem('fund-workspace-session')!).state.creationKey
      )
    ).toMatch(/^[0-9a-f-]{36}$/);
    expect(deepLinkWrites).toEqual([]);
    acceptance['freshDeepLinkWrites'] = deepLinkWrites;
    await deepLinkPage.close();

    await page.getByTestId('workspace-new-fund').click();
    await expect(page).toHaveURL(/\/fund-setup\?step=1$/);
    const firstFundId = await createDraftThroughStepOne(page, FIRST_FUND);
    acceptance['firstFundId'] = firstFundId;

    const finalizeResponse = await publishCurrentFund(page);
    expect(finalizeResponse.status()).toBe(201);
    await expect(page).toHaveURL(new RegExp(`/fund-model-results/${firstFundId}$`));
    await expect(page.getByRole('heading', { name: FIRST_FUND.name, exact: true })).toBeVisible();
    await expect(page.getByText('Vintage 2026 | Fund size: $72M', { exact: true })).toBeVisible();
    await expect(page.getByText('Preferred Return', { exact: true }).locator('..')).toHaveText(
      'Preferred Return8%'
    );
    await expect(page.getByText('Catch-up', { exact: true }).locator('..')).toHaveText(
      'Catch-up100%'
    );

    await openWorkspace(page);
    const firstRow = page.getByTestId(`workspace-fund-${firstFundId}`);
    await expect(firstRow).toContainText(FIRST_FUND.name);
    await expect(firstRow.getByRole('button', { name: 'Open model' })).toBeVisible();
    await attachScreenshot(page, testInfo, 'batch-b-first-fund-workspace.png');

    await page.getByTestId('workspace-new-fund').click();
    await expect(page).toHaveURL(/\/fund-setup\?step=1$/);
    await expect(page.getByTestId('fund-name')).toHaveValue('');
    expect(mutations.filter((mutation) => mutation.path === '/api/funds')).toHaveLength(1);
    const secondFundId = await createDraftThroughStepOne(page, SECOND_FUND);
    acceptance['secondFundId'] = secondFundId;
    expect(secondFundId).not.toBe(firstFundId);

    await openWorkspace(page);
    await page.reload();
    await expect(page.getByTestId('fund-workspace')).toBeVisible();
    const secondRow = page.getByTestId(`workspace-fund-${secondFundId}`);
    await expect(secondRow).toContainText(SECOND_FUND.name);
    await expect(secondRow.getByRole('button', { name: 'Resume Draft' })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('workspace-new-fund')).toBeVisible();
    await attachScreenshot(page, testInfo, 'batch-b-two-fund-workspace-mobile.png');
    await page.setViewportSize({ width: 1440, height: 1000 });

    await secondRow.getByRole('button', { name: 'Resume Draft' }).click();
    await expect(page).toHaveURL(new RegExp(`/fund-setup\\?fundId=${secondFundId}&step=1$`));
    await expect(page.getByTestId('fund-name')).toHaveValue(SECOND_FUND.name);
    await expect(page.getByLabel('Capital Committed ($M)')).toHaveValue(SECOND_FUND.capital);
    await expect(page.getByTestId('model-inputs-as-of-date')).toHaveValue(SECOND_FUND.asOfDate);
    acceptance['resumedRoute'] = new URL(page.url()).pathname + new URL(page.url()).search;
    await page.reload();
    await expect(page.getByTestId('fund-name')).toHaveValue(SECOND_FUND.name);
    await expect(page.getByLabel('Capital Committed ($M)')).toHaveValue(SECOND_FUND.capital);
    await expect(page.getByTestId('model-inputs-as-of-date')).toHaveValue(SECOND_FUND.asOfDate);

    // A new tab has no local ETag: its first edit must save after server hydration.
    const resumedPage = await page.context().newPage();
    monitorPage(resumedPage);
    const resumedAsOfDate = '2026-09-20';
    await resumedPage.goto(`/fund-setup?fundId=${secondFundId}&step=1`);
    await expect(resumedPage.getByTestId('fund-name')).toHaveValue(SECOND_FUND.name);
    await expect(resumedPage.getByTestId('model-inputs-as-of-date')).toHaveValue(
      SECOND_FUND.asOfDate
    );
    await expect(resumedPage.getByTestId('draft-sync-status')).toContainText('Latest draft saved');
    const resumedSave = resumedPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/funds/${secondFundId}/draft` &&
        response.request().method() === 'PUT'
    );
    await resumedPage.getByTestId('model-inputs-as-of-date').fill(resumedAsOfDate);
    expect((await resumedSave).status()).toBe(200);
    await expect(resumedPage.getByTestId('draft-sync-status')).toContainText('Latest draft saved');
    await resumedPage.reload();
    await expect(resumedPage.getByTestId('model-inputs-as-of-date')).toHaveValue(resumedAsOfDate);
    await expect(resumedPage.getByTestId('fund-name')).toHaveValue(SECOND_FUND.name);
    await expect(resumedPage.getByTestId('draft-sync-status')).toContainText('Latest draft saved');
    acceptance['freshTabFirstEditPersisted'] = true;
    await resumedPage.evaluate(() => {
      const envelope = JSON.parse(sessionStorage.getItem('fund-workspace-session')!);
      envelope.state.fundSize = null;
      sessionStorage.setItem('fund-workspace-session', JSON.stringify(envelope));
    });
    await resumedPage.reload();
    await expect(resumedPage.getByTestId('fund-name')).toHaveValue(SECOND_FUND.name);
    await expect(resumedPage.getByLabel('Capital Committed ($M)')).toHaveValue(SECOND_FUND.capital);
    await expect(resumedPage.getByTestId('model-inputs-as-of-date')).toHaveValue(resumedAsOfDate);
    await expect(resumedPage.getByTestId('draft-sync-status')).toContainText('Latest draft saved');
    acceptance['invalidLocalValuesRecovered'] = true;
    await resumedPage.close();

    await openWorkspace(page);
    await page
      .getByTestId(`workspace-fund-${firstFundId}`)
      .getByRole('button', { name: 'Open model' })
      .click();
    await expect(page).toHaveURL(new RegExp(`/fund-model-results/${firstFundId}$`));
    await expect(page.getByRole('heading', { name: FIRST_FUND.name, exact: true })).toBeVisible();
    await expect(page.getByText('Vintage 2026 | Fund size: $72M', { exact: true })).toBeVisible();
    await attachScreenshot(page, testInfo, 'batch-b-first-fund-results.png');
    acceptance['publishedRoute'] = new URL(page.url()).pathname;

    const persisted = await pool.query<{
      id: number;
      name: string;
      size: string;
      is_draft: boolean;
      is_published: boolean;
      config: Record<string, unknown>;
    }>(
      `SELECT f.id, f.name, f.size, fc.is_draft, fc.is_published, fc.config
         FROM funds f
         JOIN fundconfigs fc ON fc.fund_id = f.id
        WHERE f.id = ANY($1::int[])
        ORDER BY f.id, fc.version`,
      [[firstFundId, secondFundId]]
    );
    const firstRows = persisted.rows.filter((row) => row.id === firstFundId);
    const secondRows = persisted.rows.filter((row) => row.id === secondFundId);
    expect(firstRows.some((row) => row.name === FIRST_FUND.name && row.is_published)).toBe(true);
    expect(secondRows.some((row) => row.name === SECOND_FUND.name && row.is_draft)).toBe(true);
    expect(Number(firstRows[0]?.size)).toBe(Number(FIRST_FUND.capital) * 1_000_000);
    expect(Number(secondRows[0]?.size)).toBe(4_100_000);
    expect(secondRows.find((row) => row.is_draft)?.config).toMatchObject({
      fundName: SECOND_FUND.name,
      fundSize: 4_100_000,
      modelInputsAsOfDate: resumedAsOfDate,
    });
    expect((await pool.query('SELECT count(*)::int AS count FROM funds')).rows[0].count).toBe(2);
    const fundMutations = mutations.filter((mutation) => mutation.path.startsWith('/api/funds'));
    expect(fundMutations.every((mutation) => mutation.csrf && mutation.idempotency)).toBe(true);
    expect(
      fundMutations
        .filter((mutation) => mutation.path !== '/api/funds')
        .every((mutation) => mutation.optimisticLock)
    ).toBe(true);
    acceptance['database'] = {
      first: firstRows.map(({ id, name, size, is_draft, is_published }) => ({
        id,
        name,
        size,
        isDraft: is_draft,
        isPublished: is_published,
      })),
      second: secondRows.map(({ id, name, size, is_draft, is_published }) => ({
        id,
        name,
        size,
        isDraft: is_draft,
        isPublished: is_published,
      })),
    };

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(requestFailures).toEqual([]);
    expect(apiFailures).toEqual([]);
  } catch (error) {
    await attachScreenshot(page, testInfo, 'batch-b-failure.png').catch(() => undefined);
    throw error;
  } finally {
    await pool.end();
    const acceptancePath = testInfo.outputPath('batch-b-acceptance.json');
    await writeFile(acceptancePath, JSON.stringify(acceptance, null, 2));
    await testInfo.attach('batch-b-acceptance.json', {
      path: acceptancePath,
      contentType: 'application/json',
    });
  }
});
