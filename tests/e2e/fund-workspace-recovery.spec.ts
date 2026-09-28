import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

import {
  expect,
  request,
  test as base,
  type APIResponse,
  type Page,
  type Request,
  type Route,
  type TestInfo,
} from '@playwright/test';
import { Pool } from 'pg';
import {
  advanceToReview,
  clickPublish,
  countFinalizeReceipts,
  countFundsByName,
  countPublishedConfigs,
  createDraftThroughStepOne,
  forwardOutOfBand,
  loadRuntime,
  logOut,
  openWorkspace,
  readSessionEnvelope,
  signIn,
  type Runtime,
} from './support/batch-b-journey';

const FINALIZE_PATH = '/api/funds/finalize';
const FINALIZE_ROUTE = `**${FINALIZE_PATH}`;
const SESSION_COOKIE = 'updog.session';
const STALE_PUBLISH_MESSAGE =
  'A newer draft is available. Review the saved draft before publishing.';
const UNCERTAIN_PUBLISH_MESSAGE = 'Could not confirm publication; it may have completed.';
// Two autosave debounce periods (600 ms each), plus scheduling margin.
const QUIET_WINDOW_MS = 1_500;

const test = base.extend<{
  runtime: Runtime;
  pool: Pool;
  monitorPage: (page: Page) => void;
}>({
  runtime: async ({ baseURL }, provide) => {
    expect(baseURL, 'Recovery cases require the Batch B baseURL').toBeTruthy();
    await provide(await loadRuntime());
  },
  pool: async ({ runtime }, provide) => {
    const pool = new Pool({ connectionString: runtime.databaseUrl, max: 1 });
    try {
      await provide(pool);
    } finally {
      await pool.end();
    }
  },
  monitorPage: [
    async ({ context }, provide) => {
      const pageErrors: string[] = [];
      const monitored = new Set<Page>();
      const monitorPage = (page: Page) => {
        if (monitored.has(page)) return;
        monitored.add(page);
        page.on('pageerror', (error) => pageErrors.push(error.message));
      };
      context.pages().forEach(monitorPage);
      context.on('page', monitorPage);
      try {
        await provide(monitorPage);
      } finally {
        context.off('page', monitorPage);
        expect(pageErrors, 'No uncaught page errors in any page used by this case').toEqual([]);
      }
    },
    { auto: true },
  ],
});

test.describe.configure({ mode: 'serial' });

function isRequest(req: Request, method: string, path: string) {
  return req.method() === method && new URL(req.url()).pathname === path;
}

async function startDraft(page: Page, caseId: string) {
  const fund = {
    name: `Recovery ${caseId} ${randomUUID()}`,
    capital: '72',
    asOfDate: '2026-06-30',
  };
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
  await expect(page.getByTestId('fund-workspace')).toBeVisible();
  await page.getByTestId('workspace-new-fund').click();
  await expect(page).toHaveURL(/\/fund-setup\?step=1$/);
  const id = await createDraftThroughStepOne(page, fund);
  return { ...fund, id };
}

async function readyToPublish(page: Page) {
  await advanceToReview(page);
  await expect(page.getByTestId('draft-sync-status')).toContainText('Latest draft saved');
  await expect(page.getByTestId('create-fund-button')).toBeEnabled();
}

async function openDraft(page: Page, fundId: number) {
  await page.goto(`/fund-setup?fundId=${fundId}&step=1`);
  await expect(page.getByTestId('draft-sync-status')).toContainText('Latest draft saved');
}

async function saveDate(page: Page, fundId: number, asOfDate: string) {
  const saved = page.waitForResponse((response) =>
    isRequest(response.request(), 'PUT', `/api/funds/${fundId}/draft`)
  );
  await page.getByTestId('model-inputs-as-of-date').fill(asOfDate);
  const response = await saved;
  expect(response.status()).toBe(200);
  await expect(page.getByTestId('draft-sync-status')).toContainText('Latest draft saved');
  return response;
}

async function holdFinalizes(page: Page) {
  const routes: Route[] = [];
  const handler = (route: Route) => {
    if (!isRequest(route.request(), 'POST', FINALIZE_PATH)) return route.continue();
    routes.push(route);
  };
  await page.route(FINALIZE_ROUTE, handler);
  return { routes, handler };
}

function commandIdentity(req: Request) {
  const headers = req.headers();
  const key = headers['idempotency-key'];
  const ifMatch = headers['if-match'];
  const body = req.postData();
  expect(key, 'Finalize must carry Idempotency-Key').toBeTruthy();
  expect(ifMatch, 'Finalize must carry If-Match').toBeTruthy();
  expect(body, 'Finalize must carry its original body').not.toBeNull();
  return { key: key!, ifMatch: ifMatch!, body };
}

function renewedSessionToken(response: APIResponse): string {
  const sessionCookies = response
    .headersArray()
    .filter(
      ({ name, value }) =>
        name.toLowerCase() === 'set-cookie' && value.startsWith(`${SESSION_COOKIE}=`)
    );
  expect(sessionCookies, 'Held finalize must carry one session Set-Cookie').toHaveLength(1);
  const cookiePair = sessionCookies[0]!.value.split(';', 1)[0]!;
  const token = cookiePair.slice(`${SESSION_COOKIE}=`.length);
  expect(token, 'Session Set-Cookie must not clear the session').not.toBe('');
  return token;
}

async function assertPublishedOnce(pool: Pool, fund: { id: number; name: string }, key: string) {
  expect(await countFundsByName(pool, [fund.name])).toBe(1);
  expect(await countFinalizeReceipts(pool, 'finalize', key)).toBe(1);
  expect(await countPublishedConfigs(pool, fund.id)).toBe(1);
}

async function assertActorWithoutPending(page: Page, userId: number) {
  await expect
    .poll(() => readSessionEnvelope(page))
    .toMatchObject({ state: { workspaceActorId: String(userId), pendingCommand: null } });
}

async function switchActorWithHeldFinalize(page: Page, runtime: Runtime, caseId: string) {
  const held = await holdFinalizes(page);
  let forwarded: Awaited<ReturnType<typeof forwardOutOfBand>> | undefined;
  const startedAt = performance.now();
  const deadlineMessage =
    `${caseId}_ACTOR_SWITCH_EXCEEDED_8_SECONDS: B sign-in must complete within 8 seconds ` +
    'of the publish click, before the 10-second FUND_WORKFLOW_TIMEOUT_MS path';
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(new Error(deadlineMessage));
    }, 8_000);
  });
  try {
    return await Promise.race([
      deadline,
      (async () => {
        await page.getByRole('button', { name: 'Create, Publish, and View Results' }).click();
        await expect.poll(() => held.routes.length).toBe(1);
        const route = held.routes[0]!;
        const command = commandIdentity(route.request());
        const headers = await route.request().allHeaders();
        expect(headers['cookie']).toContain(`${SESSION_COOKIE}=`);
        expect(headers['cookie']).toContain('updog.csrf=');
        expect(headers['x-csrf-token']).toBeTruthy();
        let failed = false;
        page.on('requestfailed', (req) => {
          if (req === route.request()) failed = true;
        });
        // Never route.fetch(): that would install A's cookies before A logs out.
        forwarded = await forwardOutOfBand(route);
        if (expired) {
          // The deadline may have won before the isolated context was returned.
          await forwarded.context.dispose();
          throw new Error(deadlineMessage);
        }
        expect(forwarded.response.status()).toBe(201);
        const token = renewedSessionToken(forwarded.response);
        expect(await readSessionEnvelope(page)).toMatchObject({
          state: {
            workspaceActorId: String(runtime.userId),
            pendingCommand: { operation: 'finalize', key: command.key },
          },
        });

        expect((await logOut(page)).status()).toBe(204);
        await expect(page).toHaveURL(/\/login$/);
        // Stay in this document: signIn() calls page.goto(), which would discard
        // the unresolved fetch and test navigation teardown instead of the fence.
        await page.getByLabel('Username').fill(runtime.bUsername);
        await page.getByLabel('Password').fill(runtime.bPassword);
        const loggedIn = page.waitForResponse((response) =>
          isRequest(response.request(), 'POST', '/api/auth/login')
        );
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        const loginResponse = await loggedIn;
        expect(loginResponse.status()).toBe(200);
        expect((await loginResponse.json()).user.id).toBe(String(runtime.bUserId));
        await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
        await expect(page.getByTestId('fund-workspace')).toBeVisible();
        await assertActorWithoutPending(page, runtime.bUserId);
        expect(performance.now() - startedAt, deadlineMessage).toBeLessThan(8_000);
        expect(failed, `${caseId}: A's finalize must still be unresolved at B's sign-in`).toBe(
          false
        );
        expect(held.routes).toHaveLength(1);
        return { ...forwarded, route, command, token };
      })(),
    ]);
  } catch (error) {
    await forwarded?.context.dispose();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

test('C5b: a late finalize installs only a revoked session; B can sign in again', async ({
  page,
  runtime,
  pool,
}, testInfo) => {
  testInfo.annotations.push({ type: 'c5b-path', description: 'browser' });
  await signIn(page, runtime.username, runtime.password);
  const fund = await startDraft(page, 'C5b');
  await readyToPublish(page);
  const held = await switchActorWithHeldFinalize(page, runtime, 'C5b');
  try {
    // The helper has asserted 201 + session Set-Cookie, then B's completed sign-in.
    const delivered = page.waitForResponse(
      (response) => response.request() === held.route.request()
    );
    await held.route.fulfill({ response: held.response });
    expect((await delivered).status()).toBe(201);
    await expect
      .poll(
        async () =>
          (await page.context().cookies()).find((cookie) => cookie.name === SESSION_COOKIE)?.value
      )
      .toBe(held.token);

    const rejected = await page.request.get('/api/auth/session');
    expect(rejected.status()).toBe(401);
    expect(await rejected.json()).not.toHaveProperty('user');

    // A document navigation is deliberate here: refetch session, then let the
    // login CSRF endpoint clear the revoked cookie before B authenticates again.
    await page.goto('/login');
    await signIn(page, runtime.bUsername, runtime.bPassword);
    const recovered = await page.request.get('/api/auth/session');
    expect(recovered.status()).toBe(200);
    expect((await recovered.json()).user.id).toBe(String(runtime.bUserId));
    await assertActorWithoutPending(page, runtime.bUserId);
    await assertPublishedOnce(pool, fund, held.command.key);
  } finally {
    await held.context.dispose();
  }
});

test('C1: a stale draft save preserves local edits without an automatic overwrite', async ({
  page,
  browser,
  runtime,
  pool,
  monitorPage,
}) => {
  await signIn(page, runtime.username, runtime.password);
  const fund = await startDraft(page, 'C1');
  await openDraft(page, fund.id);
  const otherContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const other = await otherContext.newPage();
    monitorPage(other);
    await signIn(other, runtime.username, runtime.password);
    await openDraft(other, fund.id);
    const oldETag = (await readSessionEnvelope(other)).state.draftETag;
    expect(oldETag).toBeTruthy();
    const winnerDate = '2026-07-01';
    const localDate = '2026-07-02';
    const winner = await saveDate(page, fund.id, winnerDate);
    expect(winner.headers()['etag']).not.toBe(oldETag);

    const puts: Request[] = [];
    const draftPath = `/api/funds/${fund.id}/draft`;
    other.on('request', (req) => {
      if (isRequest(req, 'PUT', draftPath)) puts.push(req);
    });
    const conflict = other.waitForResponse((response) =>
      isRequest(response.request(), 'PUT', draftPath)
    );
    await other.getByTestId('model-inputs-as-of-date').fill(localDate);
    const rejected = await conflict;
    expect(rejected.status()).toBe(412);
    expect(rejected.request().headers()['if-match']).toBe(oldETag);
    await expect(other.getByTestId('draft-stale')).toContainText('A newer draft is available');
    await expect(other.getByTestId('model-inputs-as-of-date')).toHaveValue(localDate);
    // No user action during this interval; a retry after the debounce is a defect.
    await delay(QUIET_WINDOW_MS);
    expect(puts, 'C1 must not retry a stale PUT without an explicit user action').toHaveLength(1);
    await expect(other.getByTestId('model-inputs-as-of-date')).toHaveValue(localDate);
    const saved = await pool.query<{ config: { modelInputsAsOfDate: string } }>(
      `SELECT config FROM fundconfigs WHERE fund_id = $1 AND is_draft = true
         ORDER BY version DESC LIMIT 1`,
      [fund.id]
    );
    expect(saved.rows).toHaveLength(1);
    expect(saved.rows[0]!.config.modelInputsAsOfDate).toBe(winnerDate);
    expect(await countFundsByName(pool, [fund.name])).toBe(1);
  } finally {
    await otherContext.close();
  }
});

test('C2: stale publication stays on review and creates neither config nor receipt', async ({
  page,
  browser,
  runtime,
  pool,
  monitorPage,
}) => {
  await signIn(page, runtime.username, runtime.password);
  const fund = await startDraft(page, 'C2');
  await readyToPublish(page);
  const oldETag = (await readSessionEnvelope(page)).state.draftETag;
  expect(oldETag).toBeTruthy();
  const otherContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const other = await otherContext.newPage();
    monitorPage(other);
    await signIn(other, runtime.username, runtime.password);
    await openDraft(other, fund.id);
    const updated = await saveDate(other, fund.id, '2026-07-03');
    expect(updated.headers()['etag']).not.toBe(oldETag);

    const rejected = await clickPublish(page);
    const command = commandIdentity(rejected.request());
    expect(command.ifMatch).toBe(oldETag);
    expect(rejected.status()).toBe(412);
    await expect(page.getByText(STALE_PUBLISH_MESSAGE, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/fund-setup\?step=7$/);
    expect(await countPublishedConfigs(pool, fund.id)).toBe(0);
    expect(await countFinalizeReceipts(pool, 'finalize', command.key)).toBe(0);
    await assertActorWithoutPending(page, runtime.userId);
  } finally {
    await otherContext.close();
  }
});

test('C3: a lost finalize response recovers the persisted command and replays it exactly', async ({
  page,
  runtime,
  pool,
}) => {
  // The dev client never gates on the session (AppRouter enforceAuth defaults to
  // import.meta.env.PROD, client/src/app/app-router.tsx:197), so after a reload no actor is
  // bound before the store persists its defaults over the envelope. Recovery after a
  // reload is a production-client behavior; only the built runtime can prove it.
  // SKIP: dev runtime only; CI runs the built runtime (F_1.19.0 D-B).
  test.skip(
    process.env['BATCH_B_RUNTIME'] !== 'built',
    'C3 reload recovery needs the built client (production auth gate)'
  );
  await signIn(page, runtime.username, runtime.password);
  const fund = await startDraft(page, 'C3');
  await readyToPublish(page);
  const held = await holdFinalizes(page);
  await page.getByRole('button', { name: 'Create, Publish, and View Results' }).click();
  await expect.poll(() => held.routes.length).toBe(1);
  const route = held.routes[0]!;
  const original = commandIdentity(route.request());
  const committed = await route.fetch();
  expect(committed.status()).toBe(201);
  // Independent SQL proves commit before the response is deliberately lost.
  await assertPublishedOnce(pool, fund, original.key);
  await route.abort('connectionreset');
  await expect(page.getByTestId('publish-uncertain-alert')).toContainText(
    UNCERTAIN_PUBLISH_MESSAGE
  );
  expect(await readSessionEnvelope(page)).toMatchObject({
    state: { pendingCommand: { operation: 'finalize', key: original.key } },
  });
  await page.unroute(FINALIZE_ROUTE, held.handler);

  // Read only: recovery must come from the app's persisted envelope, never a test write.
  await page.reload();
  await expect(page.getByTestId('publish-uncertain-alert')).toContainText(
    UNCERTAIN_PUBLISH_MESSAGE
  );
  expect(await readSessionEnvelope(page)).toMatchObject({
    state: { pendingCommand: { operation: 'finalize', key: original.key } },
  });
  const replayed = page.waitForResponse((response) =>
    isRequest(response.request(), 'POST', FINALIZE_PATH)
  );
  await page.getByRole('button', { name: 'Check publication status', exact: true }).click();
  const response = await replayed;
  expect(commandIdentity(response.request())).toEqual(original);
  expect(response.status()).toBe(201);
  expect(response.headers()['idempotency-replay']).toBe('true');
  await expect(page).toHaveURL(new RegExp(`/fund-model-results/${fund.id}$`));
  expect((await readSessionEnvelope(page))?.state.pendingCommand ?? null).toBeNull();
  await assertPublishedOnce(pool, fund, original.key);
});

test('C4: two synchronous publish activations reuse one command and navigate once', async ({
  page,
  runtime,
  pool,
}) => {
  await signIn(page, runtime.username, runtime.password);
  const fund = await startDraft(page, 'C4');
  await readyToPublish(page);
  const held = await holdFinalizes(page);
  const resultNavigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (
      frame === page.mainFrame() &&
      new URL(frame.url()).pathname === `/fund-model-results/${fund.id}`
    ) {
      resultNavigations.push(frame.url());
    }
  });
  await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>('[data-testid="create-fund-button"]');
    if (!button) throw new Error('C4: publish button is missing');
    button.click();
    button.click();
  });
  await expect.poll(() => held.routes.length).toBe(2);
  const first = held.routes[0]!;
  const second = held.routes[1]!;
  const command = commandIdentity(first.request());
  expect(commandIdentity(second.request())).toEqual(command);

  // A real double click sends both requests with click-time credentials. A held request
  // would pick up the cookies the first response renews, so capture the second's now.
  const secondHeaders = await second.request().allHeaders();
  const firstDelivered = page.waitForResponse((response) => response.request() === first.request());
  await first.continue();
  expect((await firstDelivered).status()).toBe(201);
  const secondDelivered = page.waitForResponse(
    (response) => response.request() === second.request()
  );
  const forwarded = await forwardOutOfBand(second, secondHeaders);
  try {
    expect(forwarded.response.status(), `C4 replay body: ${await forwarded.response.text()}`).toBe(
      201
    );
    expect(forwarded.response.headers()['idempotency-replay']).toBe('true');
    await second.fulfill({ response: forwarded.response });
  } finally {
    await forwarded.context.dispose();
  }
  const replayed = await secondDelivered;
  expect(replayed.status()).toBe(201);
  expect(await replayed.finished()).toBeNull();
  await expect(page).toHaveURL(new RegExp(`/fund-model-results/${fund.id}$`));
  await delay(QUIET_WINDOW_MS);
  expect(held.routes).toHaveLength(2);
  expect(resultNavigations, 'C4 must navigate to this fund results page exactly once').toHaveLength(
    1
  );
  await assertPublishedOnce(pool, fund, command.key);
});

test('C5a: an old actor result cannot navigate or restore its pending command after logout', async ({
  page,
  runtime,
  pool,
}) => {
  await signIn(page, runtime.username, runtime.password);
  const fund = await startDraft(page, 'C5a');
  await readyToPublish(page);
  const held = await switchActorWithHeldFinalize(page, runtime, 'C5a');
  try {
    const laterRequestsWithAKey: string[] = [];
    const resultNavigations: string[] = [];
    page.on('request', (req) => {
      if (req.headers()['idempotency-key'] === held.command.key) {
        laterRequestsWithAKey.push(`${req.method()} ${new URL(req.url()).pathname}`);
      }
    });
    page.on('framenavigated', (frame) => {
      if (
        frame === page.mainFrame() &&
        new URL(frame.url()).pathname === `/fund-model-results/${fund.id}`
      ) {
        resultNavigations.push(frame.url());
      }
    });
    const headers = Object.fromEntries(
      Object.entries(held.response.headers()).filter(
        ([name]) => name.toLowerCase() !== 'set-cookie'
      )
    );
    expect(Object.keys(headers).some((name) => name.toLowerCase() === 'set-cookie')).toBe(false);
    const delivered = page.waitForResponse(
      (response) => response.request() === held.route.request()
    );
    await held.route.fulfill({ response: held.response, headers });
    const response = await delivered;
    expect(response.status()).toBe(201);
    expect(await response.finished()).toBeNull();
    // Give late response handlers and any unintended retry/navigation time to run.
    await delay(QUIET_WINDOW_MS);
    await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
    const session = await page.request.get('/api/auth/session');
    expect(session.status()).toBe(200);
    expect((await session.json()).user.id).toBe(String(runtime.bUserId));
    await assertActorWithoutPending(page, runtime.bUserId);
    expect(laterRequestsWithAKey).toEqual([]);
    expect(resultNavigations).toEqual([]);
    await assertPublishedOnce(pool, fund, held.command.key);
  } finally {
    await held.context.dispose();
  }
});

test('C6: reconnect rebinds a cross-tab actor change and invalidates the old funds list', async ({
  page,
  context,
  runtime,
  pool,
}) => {
  // The reconnect trigger is AppRouter's session observer, which exists only when
  // enforceAuth is on (import.meta.env.PROD, client/src/app/app-router.tsx:197-200).
  // SKIP: dev runtime only; CI runs the built runtime (F_1.19.0 D-B).
  test.skip(
    process.env['BATCH_B_RUNTIME'] !== 'built',
    'C6 needs the built client (production session observer)'
  );
  // The page fixture is still about:blank. This same clock covers page two.
  await context.clock.install();
  const cachedFunds = page.waitForResponse((response) =>
    isRequest(response.request(), 'GET', '/api/funds')
  );
  await signIn(page, runtime.username, runtime.password);
  expect((await cachedFunds).status()).toBe(200);
  await openWorkspace(page);
  const fund = await startDraft(page, 'C6');
  await expect(page.getByTestId('draft-sync-status')).toContainText('Latest draft saved');
  await assertActorWithoutPending(page, runtime.userId);
  expect(await countFundsByName(pool, [fund.name])).toBe(1);

  const gapRequests: string[] = [];
  const countGapRequest = (req: Request) => {
    gapRequests.push(`${req.method()} ${new URL(req.url()).pathname}`);
  };
  page.on('request', countGapRequest);
  // Count GET /api/funds from the reconnect on. The gap check proves none was sent before
  // the switch, and the list is only dropped when the bind effect sees B, so any such
  // request follows the rebind. The fix may refetch an active funds query at once, before
  // the workspace opens, so a listener attached after the rebind would miss it.
  const afterRebind: Request[] = [];
  const countFundsRequest = (req: Request) => {
    if (isRequest(req, 'GET', '/api/funds')) afterRebind.push(req);
  };
  const other = await context.newPage();
  try {
    await other.goto('/dashboard');
    await expect(other.getByTestId('fund-workspace')).toBeVisible();
    expect((await logOut(other)).status()).toBe(204);
    await expect(other).toHaveURL(/\/login$/);
    await signIn(other, runtime.bUsername, runtime.bPassword);
    await expect(other).toHaveURL(/\/dashboard(?:\?.*)?$/);
    await expect(other.getByTestId('fund-workspace')).toBeVisible();
    await assertActorWithoutPending(other, runtime.bUserId);
    // Page one has not learned about B yet; do not probe its session with a GET.
    await assertActorWithoutPending(page, runtime.userId);
    await context.clock.fastForward(61_000);
    expect(gapRequests, "C6 gap must send no page-one request that could clear A's cache").toEqual(
      []
    );
    page.off('request', countGapRequest);
    page.on('request', countFundsRequest);

    const rebound = page.waitForResponse((response) =>
      isRequest(response.request(), 'GET', '/api/auth/session')
    );
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
    });
    const session = await rebound;
    expect(session.status()).toBe(200);
    expect((await session.json()).user.id).toBe(String(runtime.bUserId));
    await assertActorWithoutPending(page, runtime.bUserId);

    // No reload or direct API fetch may mask the stale list.
    await openWorkspace(page);
    // Red on unmodified main: the list cached under A is never refetched.
    await expect
      .poll(() => afterRebind.length, {
        message: 'C6: a GET /api/funds must follow the cross-tab rebind',
        timeout: 10_000,
      })
      .toBeGreaterThan(0);
    const fundsResponse = await afterRebind[0]!.response();
    expect(fundsResponse?.status()).toBe(200);
    await assertActorWithoutPending(page, runtime.bUserId);
    expect(await countPublishedConfigs(pool, fund.id)).toBe(0);
  } finally {
    page.off('request', countGapRequest);
    page.off('request', countFundsRequest);
    await other.close();
  }
});

// C5b API fallback -- intentionally NOT called by any test. Switch only when a
// Chromium run proves route.fulfill does not install the session Set-Cookie.
// Keep the held 201/cookie and logout prerequisites; replace the browser-cookie
// assertions with this call AFTER A's logout, and remove the 'browser' annotation.
// Record that reason in the review. This isolated context never installs A's token
// into the browser, and does not replace the main browser-path qualification.
export async function c5bApiFallback(
  baseURL: string,
  renewedResponse: APIResponse,
  testInfo: TestInfo
) {
  testInfo.annotations.push({ type: 'c5b-path', description: 'api-fallback' });
  expect(renewedResponse.status()).toBe(201);
  const token = renewedSessionToken(renewedResponse);
  const isolated = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Cookie: `${SESSION_COOKIE}=${token}` },
  });
  try {
    const response = await isolated.get('/api/auth/session');
    expect(response.status()).toBe(401);
    expect(await response.json()).not.toHaveProperty('user');
  } finally {
    await isolated.dispose();
  }
}
