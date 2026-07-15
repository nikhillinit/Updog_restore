import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';

// Authoritative post-#800/#801 deployed boundary gate.
const PRODUCTION_URL =
  process.env.PRODUCTION_URL ?? process.env.PROD_URL ?? process.env.BASE_URL ?? '';
const HEALTH_KEY = process.env.HEALTH_KEY ?? '';
const METRICS_KEY = process.env.METRICS_KEY ?? '';
const PROD_SMOKE_USERNAME = process.env.PROD_SMOKE_USERNAME ?? '';
const PROD_SMOKE_PASSWORD = process.env.PROD_SMOKE_PASSWORD ?? '';
const PROD_SMOKE_UNGRANTED_FUND_ID = process.env.PROD_SMOKE_UNGRANTED_FUND_ID ?? '';
const RUM_ALLOWED_ORIGIN = process.env.RUM_ALLOWED_ORIGIN ?? '';
const RUM_BODY = {
  name: 'LCP',
  value: 123,
  pathname: '/',
};

type JsonObject = Record<string, unknown>;

function expectNotSpaRewrite(response: APIResponse): void {
  const contentType = response.headers()['content-type'] ?? '';

  expect(contentType).not.toMatch(/^text\/html\b/i);
}

function expectContentTypeStartsWith(response: APIResponse, expectedType: string): void {
  const contentType = response.headers()['content-type'] ?? '';

  expect(contentType.toLowerCase()).toMatch(new RegExp(`^${expectedType}`));
}

async function expectJsonObject(response: APIResponse): Promise<JsonObject> {
  const body = (await response.json()) as unknown;

  expect(body).toEqual(expect.any(Object));
  expect(Array.isArray(body)).toBe(false);

  return body as JsonObject;
}

function productionOrigin(): string {
  return new URL(PRODUCTION_URL).origin;
}

// Origin used to probe the RUM allow-list layers. Against a staged deployment
// the deployment's own ephemeral *.vercel.app origin is correctly NOT in the
// allow-list, so staged runs pass the canonical production origin via
// RUM_ALLOWED_ORIGIN — probing the exact allow-list the promoted domain uses.
function rumProbeOrigin(): string {
  return RUM_ALLOWED_ORIGIN ? new URL(RUM_ALLOWED_ORIGIN).origin : productionOrigin();
}

test.describe('production boundary smoke', () => {
  // SKIP: deployed boundary smoke requires an explicit production target URL.
  test.skip(!PRODUCTION_URL, 'Set PRODUCTION_URL to run deployed boundary smoke tests');

  async function loginProdSmoke(request: APIRequestContext): Promise<void> {
    const csrfResponse = await request.get(`${PRODUCTION_URL}/api/auth/csrf`);
    expectNotSpaRewrite(csrfResponse);
    expect(csrfResponse.status()).toBe(200);
    const csrfBody = await expectJsonObject(csrfResponse);
    expect(csrfBody['csrfToken']).toEqual(expect.any(String));

    const loginResponse = await request.post(`${PRODUCTION_URL}/api/auth/login`, {
      headers: { 'X-CSRF-Token': String(csrfBody['csrfToken']) },
      data: { username: PROD_SMOKE_USERNAME, password: PROD_SMOKE_PASSWORD },
    });
    expectNotSpaRewrite(loginResponse);
    expect(loginResponse.status()).toBe(200);
  }

  test('public probe uses the real api health handler', async ({ request }) => {
    const response = await request.get(`${PRODUCTION_URL}/api/health`);

    expectNotSpaRewrite(response);
    expect(response.status()).toBe(200);
    expectContentTypeStartsWith(response, 'application/json');

    const body = await expectJsonObject(response);
    expect(body['status']).toBe('ok');
  });

  test('metrics api denies unauthenticated requests by default', async ({ request }) => {
    const response = await request.get(`${PRODUCTION_URL}/api/metrics`);

    expectNotSpaRewrite(response);
    expect(response.status()).toBe(403);
    expectContentTypeStartsWith(response, 'application/json');
  });

  test('bare metrics path is not exposed as the production boundary', async ({ request }) => {
    const response = await request.get(`${PRODUCTION_URL}/metrics`);

    expectNotSpaRewrite(response);
    expect(response.status()).not.toBe(200);
  });

  test('metrics api accepts the configured bearer key', async ({ request }) => {
    // SKIP: authenticated metrics proof requires the deployed METRICS_KEY.
    test.skip(!METRICS_KEY, 'Set METRICS_KEY to verify authenticated metrics access');

    const response = await request.get(`${PRODUCTION_URL}/api/metrics`, {
      headers: {
        Authorization: `Bearer ${METRICS_KEY}`,
      },
    });

    expectNotSpaRewrite(response);
    expect(response.status()).toBe(200);
    expectContentTypeStartsWith(response, 'text/plain');
    await expect(response.text()).resolves.toContain('# HELP');
  });

  test('protected database health denies unauthenticated requests', async ({ request }) => {
    const response = await request.get(`${PRODUCTION_URL}/api/health/db`);

    expectNotSpaRewrite(response);
    expect(response.status()).toBe(401);
  });

  test('protected database health accepts the configured health key', async ({ request }) => {
    // SKIP: authenticated health diagnostics proof requires the deployed HEALTH_KEY.
    test.skip(!HEALTH_KEY, 'Set HEALTH_KEY to verify authenticated health diagnostics');

    const response = await request.get(`${PRODUCTION_URL}/api/health/db`, {
      headers: {
        'X-Health-Key': HEALTH_KEY,
      },
    });

    expectNotSpaRewrite(response);
    expect(response.status()).toBe(200);
    expectContentTypeStartsWith(response, 'application/json');
  });

  test('protected schema diagnostics are not public', async ({ request }) => {
    const response = await request.get(`${PRODUCTION_URL}/api/health/schema`);

    expectNotSpaRewrite(response);
    expect([401, 403]).toContain(response.status());
  });

  test('production login reaches an authenticated read-only fund route', async ({ request }) => {
    // SKIP: authenticated login proof requires dedicated production smoke credentials.
    test.skip(
      !PROD_SMOKE_USERNAME || !PROD_SMOKE_PASSWORD,
      'Set PROD_SMOKE_USERNAME and PROD_SMOKE_PASSWORD to verify production login'
    );

    const csrfResponse = await request.get(`${PRODUCTION_URL}/api/auth/csrf`);
    expectNotSpaRewrite(csrfResponse);
    expect(csrfResponse.status()).toBe(200);
    const csrfBody = await expectJsonObject(csrfResponse);
    expect(csrfBody['csrfToken']).toEqual(expect.any(String));

    const loginResponse = await request.post(`${PRODUCTION_URL}/api/auth/login`, {
      headers: {
        'X-CSRF-Token': String(csrfBody['csrfToken']),
      },
      data: {
        username: PROD_SMOKE_USERNAME,
        password: PROD_SMOKE_PASSWORD,
      },
    });
    expectNotSpaRewrite(loginResponse);
    expect(loginResponse.status()).toBe(200);

    const guardedResponse = await request.get(`${PRODUCTION_URL}/api/timeline/1`);
    expectNotSpaRewrite(guardedResponse);
    expect(guardedResponse.status()).toBe(200);
    expectContentTypeStartsWith(guardedResponse, 'application/json');
  });

  test('rum lookalike origin is rejected', async ({ request }) => {
    const response = await request.post(`${PRODUCTION_URL}/api/metrics/rum`, {
      headers: {
        Origin: `${rumProbeOrigin()}.evil.example`,
      },
      data: RUM_BODY,
    });

    expectNotSpaRewrite(response);
    expect(response.status()).toBe(403);

    // Rejection may come from the strict-CORS perimeter (text/plain Forbidden)
    // or from rumOriginGuard (application/json forbidden_origin). Both prove
    // the lookalike-origin boundary; the origin must simply never be accepted.
    const contentType = response.headers()['content-type'] ?? '';
    if (contentType.toLowerCase().startsWith('application/json')) {
      const body = await expectJsonObject(response);
      expect(body['error']).toBe('forbidden_origin');
    }
  });

  test('rum exact origin is not origin-blocked', async ({ request }) => {
    const response = await request.post(`${PRODUCTION_URL}/api/metrics/rum`, {
      headers: {
        Origin: rumProbeOrigin(),
      },
      data: RUM_BODY,
    });

    expectNotSpaRewrite(response);

    // The canonical allowed origin must never be rejected by any origin layer
    // (strict-CORS perimeter or rumOriginGuard). Non-403 schema/validation
    // responses are acceptable; verified live as 204 on 2026-06-12.
    expect(response.status()).not.toBe(403);
  });

  test('authenticated GP surface returns fund-scoped reserves evidence', async ({ request }) => {
    // SKIP: authenticated GP canary requires dedicated production smoke credentials.
    test.skip(
      !PROD_SMOKE_USERNAME || !PROD_SMOKE_PASSWORD,
      'Set PROD_SMOKE_USERNAME and PROD_SMOKE_PASSWORD to verify the GP surface canary'
    );

    await loginProdSmoke(request);

    const grantedResponse = await request.get(`${PRODUCTION_URL}/api/funds/1/moic/rankings`);
    expectNotSpaRewrite(grantedResponse);
    expect(grantedResponse.status()).toBe(200);
    expectContentTypeStartsWith(grantedResponse, 'application/json');
    const grantedBody = await expectJsonObject(grantedResponse);
    expect(grantedBody['fundId']).toBe(1);
    // Evidence field: the reserves-MOIC provenance basis is a response literal present regardless of
    // fund 1's data state, proving the real GP handler answered (not a SPA/error rewrite).
    const provenance = grantedBody['provenance'] as Record<string, unknown> | undefined;
    expect(provenance?.['metricBasis']).toBe('planned_reserves');
  });

  test('authenticated GP surface denies cross-fund access', async ({ request }) => {
    // SKIP: cross-fund probe requires creds AND a real fund the smoke partner is not granted.
    test.skip(
      !PROD_SMOKE_USERNAME || !PROD_SMOKE_PASSWORD || !PROD_SMOKE_UNGRANTED_FUND_ID,
      'Set PROD_SMOKE_USERNAME, PROD_SMOKE_PASSWORD, and PROD_SMOKE_UNGRANTED_FUND_ID (a real fund the smoke partner is not granted)'
    );

    await loginProdSmoke(request);

    const ungrantedResponse = await request.get(
      `${PRODUCTION_URL}/api/funds/${PROD_SMOKE_UNGRANTED_FUND_ID}/moic/rankings`
    );
    expectNotSpaRewrite(ungrantedResponse);
    expect(ungrantedResponse.status()).toBe(403);
    expectContentTypeStartsWith(ungrantedResponse, 'application/json');
    const ungrantedBody = await expectJsonObject(ungrantedResponse);
    expect(ungrantedBody['error']).toBe('Forbidden');
    expect(String(ungrantedBody['message'])).toContain('do not have access to fund');
  });
});
