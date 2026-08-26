import { expect, test } from '@playwright/test';

const USER = { id: '7', email: 'admin@example.com', role: 'admin', fundIds: [] };
const FUND = {
  id: 1,
  name: 'Browser Proof Fund',
  size: 50_000_000,
  managementFee: 0.02,
  carryPercentage: 0.2,
  vintageYear: 2026,
  deployedCapital: 0,
  status: 'active',
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
};

test('browser completes the cookie session and CSRF lifecycle without localStorage JWTs', async ({
  context,
  page,
}) => {
  let sessionActive = false;
  let csrfBootstrapCount = 0;
  let sessionReadCount = 0;
  let loginHeaders: Record<string, string> | undefined;
  let mutationHeaders: Record<string, string> | undefined;
  let logoutHeaders: Record<string, string> | undefined;

  await context.addInitScript(() => {
    window.localStorage.setItem('updog.authToken', 'legacy-browser-jwt');
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const origin = url.origin;

    if (url.pathname === '/api/auth/csrf') {
      csrfBootstrapCount += 1;
      await context.addCookies([
        {
          name: 'updog.csrf',
          value: 'preauth-csrf-token',
          url: origin,
          sameSite: 'Lax',
        },
      ]);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ csrfToken: 'preauth-csrf-token' }),
      });
      return;
    }

    if (url.pathname === '/api/auth/login') {
      loginHeaders = await request.allHeaders();
      sessionActive = true;
      await context.addCookies([
        {
          name: 'updog.session',
          value: 'browser-session-jwt',
          url: origin,
          httpOnly: true,
          sameSite: 'Lax',
        },
        {
          name: 'updog.csrf',
          value: 'session-csrf-token',
          url: origin,
          sameSite: 'Lax',
        },
      ]);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: USER }),
      });
      return;
    }

    if (url.pathname === '/api/auth/session') {
      sessionReadCount += 1;
      await route.fulfill({
        status: sessionActive ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify(sessionActive ? { user: USER } : { error: 'invalid_credentials' }),
      });
      return;
    }

    if (url.pathname === '/api/d4-browser-mutation') {
      mutationHeaders = await request.allHeaders();
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (url.pathname === '/api/auth/logout') {
      logoutHeaders = await request.allHeaders();
      sessionActive = false;
      await context.clearCookies();
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (url.pathname === '/api/funds') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([FUND]),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/login');
  await expect(page.getByText('Sign in', { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('updog.authToken'))).toBeNull();

  await page.getByLabel('Username').fill('admin@example.com');
  await page.getByLabel('Password').fill('correct-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  expect(csrfBootstrapCount).toBe(1);
  expect(loginHeaders?.['x-csrf-token']).toBe('preauth-csrf-token');
  expect(loginHeaders?.cookie).toContain('updog.csrf=preauth-csrf-token');

  const issuedCookies = await context.cookies();
  expect(issuedCookies.find((cookie) => cookie.name === 'updog.session')).toMatchObject({
    value: 'browser-session-jwt',
    httpOnly: true,
    sameSite: 'Lax',
  });
  expect(await page.evaluate(() => document.cookie)).not.toContain('updog.session');
  expect(await page.evaluate(() => document.cookie)).toContain('updog.csrf=session-csrf-token');

  await page.goto('/help');
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  expect(sessionReadCount).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.localStorage.getItem('updog.authToken'))).toBeNull();

  const mutationStatus = await page.evaluate(async () => {
    const response = await fetch('/api/d4-browser-mutation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return response.status;
  });
  expect(mutationStatus).toBe(204);
  expect(mutationHeaders?.['x-csrf-token']).toBe('session-csrf-token');
  expect(mutationHeaders?.cookie).toContain('updog.session=browser-session-jwt');

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Sign in', { exact: true }).first()).toBeVisible();
  expect(logoutHeaders?.['x-csrf-token']).toBe('session-csrf-token');
  expect(logoutHeaders?.cookie).toContain('updog.session=browser-session-jwt');
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => window.localStorage.getItem('updog.authToken'))).toBeNull();
});
