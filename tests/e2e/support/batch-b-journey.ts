import { readFile } from 'node:fs/promises';

import {
  expect,
  request,
  type Page,
  type Response,
  type Route,
  type TestInfo,
} from '@playwright/test';
import type { Pool } from 'pg';

export type Runtime = {
  databaseUrl: string;
  username: string;
  password: string;
  userId: number;
  bUsername: string;
  bPassword: string;
  bUserId: number;
};

export type FundBasics = {
  name: string;
  capital: string;
  asOfDate: string;
};

export function runtimePath(): string {
  const path = process.env['BATCH_B_RUNTIME_FILE'];
  if (!path) throw new Error('BATCH_B_RUNTIME_FILE must point to the real-backend runtime JSON');
  return path;
}

export async function loadRuntime(): Promise<Runtime> {
  const value = JSON.parse(await readFile(runtimePath(), 'utf8')) as Partial<Runtime>;
  if (
    typeof value.databaseUrl !== 'string' ||
    typeof value.username !== 'string' ||
    typeof value.password !== 'string' ||
    typeof value.userId !== 'number' ||
    typeof value.bUsername !== 'string' ||
    typeof value.bPassword !== 'string' ||
    typeof value.bUserId !== 'number'
  ) {
    throw new Error(
      'BATCH_B_RUNTIME_FILE is missing databaseUrl, username, password, userId, bUsername, bPassword, or bUserId'
    );
  }
  return value as Runtime;
}

/**
 * Draft revision as the client reads it: Fund-Draft-Revision, else ETag. Behind
 * a compressing edge (Vercel) the ETag arrives weakened as W/"...", so reading
 * ETag directly would compare the wrong representation.
 */
export function draftRevision(headers: Record<string, string>): string | undefined {
  return headers['fund-draft-revision'] ?? headers['etag'];
}

export function responseFundId(responseBody: unknown): number {
  const id = (responseBody as { data?: { id?: unknown } })?.data?.id;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw new Error(
      `Create response did not contain a valid fund ID: ${JSON.stringify(responseBody)}`
    );
  }
  return id;
}

export async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, {
    path,
    contentType: 'image/png',
  });
}

export async function openWorkspace(page: Page) {
  const workspaceLink = page
    .getByRole('link', { name: /^(Dashboard|Open fund workspace)$/i })
    .first();
  await expect(workspaceLink).toBeVisible();
  await workspaceLink.click();
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
  await expect(page.getByTestId('fund-workspace')).toBeVisible();
}

export async function fillBasics(page: Page, fund: FundBasics) {
  await page.getByTestId('fund-name').fill(fund.name);
  await page.getByLabel('Capital Committed ($M)').fill(fund.capital);
  await page.getByTestId('model-inputs-as-of-date').fill(fund.asOfDate);
}

export async function createDraftThroughStepOne(page: Page, fund: FundBasics) {
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

export async function advanceToReview(page: Page) {
  for (const step of [2, 3, 4, 5] as const) {
    await expect(page).toHaveURL(new RegExp(`/fund-setup\\?step=${step}$`));
    await page.getByTestId('next-step').click();
  }
  await expect(page).toHaveURL(/\/fund-setup\?step=6$/);
  await page.getByTestId('finish-setup').click();
  await expect(page).toHaveURL(/\/fund-setup\?step=7$/);
}

export async function clickPublish(page: Page): Promise<Response> {
  const finalizeResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/funds/finalize' &&
      response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Create, Publish, and View Results' }).click();
  return finalizeResponsePromise;
}

export async function publishCurrentFund(page: Page): Promise<Response> {
  await advanceToReview(page);
  return clickPublish(page);
}

export async function signIn(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth/login' &&
      response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Sign in' }).click();
  expect((await loginResponsePromise).ok()).toBe(true);
}

export async function logOut(page: Page) {
  const logoutResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth/logout' &&
      response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  return logoutResponsePromise;
}

export async function readSessionEnvelope(page: Page) {
  return page.evaluate(() => {
    const stored = sessionStorage.getItem('fund-workspace-session');
    return stored ? JSON.parse(stored) : null;
  });
}

export async function countFinalizeReceipts(pool: Pool, operation: string, idempotencyKey: string) {
  const result = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM fund_workflow_commands
      WHERE operation = $1 AND idempotency_key = $2`,
    [operation, idempotencyKey]
  );
  return result.rows[0]!.count;
}

export async function countPublishedConfigs(pool: Pool, fundId: number) {
  const result = await pool.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM fundconfigs WHERE fund_id = $1 AND is_published = true',
    [fundId]
  );
  return result.rows[0]!.count;
}

export async function countFundsByName(pool: Pool, names: string[]) {
  const result = await pool.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM funds WHERE name = ANY($1::text[])',
    [names]
  );
  return result.rows[0]!.count;
}

/** Pass `capturedHeaders` to send with credentials read earlier (a held request otherwise
 * picks up the cookies current at release time). */
export async function forwardOutOfBand(route: Route, capturedHeaders?: Record<string, string>) {
  const original = route.request();
  const headers = { ...(capturedHeaders ?? (await original.allHeaders())) };
  delete headers['host'];
  delete headers['content-length'];
  delete headers['connection'];
  const context = await request.newContext();
  try {
    const body = original.postDataBuffer();
    const response = await context.fetch(original.url(), {
      method: original.method(),
      headers,
      ...(body !== null ? { data: body } : {}),
    });
    return { response, context };
  } catch (error) {
    await context.dispose();
    throw error;
  }
}
