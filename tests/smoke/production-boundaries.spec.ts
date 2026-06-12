import { expect, test, type APIResponse } from '@playwright/test';

// Authoritative post-#800/#801 deployed boundary gate.
const PRODUCTION_URL =
  process.env.PRODUCTION_URL ?? process.env.PROD_URL ?? process.env.BASE_URL ?? '';
const HEALTH_KEY = process.env.HEALTH_KEY ?? '';
const METRICS_KEY = process.env.METRICS_KEY ?? '';
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

test.describe('production boundary smoke', () => {
  // SKIP: deployed boundary smoke requires an explicit production target URL.
  test.skip(!PRODUCTION_URL, 'Set PRODUCTION_URL to run deployed boundary smoke tests');

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

  test('rum lookalike origin is rejected', async ({ request }) => {
    const response = await request.post(`${PRODUCTION_URL}/api/metrics/rum`, {
      headers: {
        Origin: `${productionOrigin()}.evil.example`,
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
        Origin: productionOrigin(),
      },
      data: RUM_BODY,
    });

    expectNotSpaRewrite(response);

    // The exact deployed origin must never be rejected by any origin layer
    // (strict-CORS perimeter or rumOriginGuard). Non-403 schema/validation
    // responses are acceptable; verified live as 204 on 2026-06-12.
    expect(response.status()).not.toBe(403);
  });
});
