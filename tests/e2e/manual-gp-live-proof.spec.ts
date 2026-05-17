import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';
import jwt from 'jsonwebtoken';

import { verifyManualProfile } from '../../scripts/verify-demo-profile';
import { FundSetupPage } from './page-objects/FundSetupPage';

declare global {
  interface Window {
    __MANUAL_GP_E2E_AUTH_TOKEN__?: string;
  }
}

type ProofEndpoint =
  | '/api/funds'
  | '/api/funds/finalize'
  | '/api/portfolio-companies'
  | '/api/funds/:id'
  | '/api/funds/:id/draft';

interface ProofRequest {
  method: string;
  endpoint: ProofEndpoint;
  authorization: string | null;
}

function requireManualProofEnvironment(baseURL: string | undefined): string {
  if (!baseURL) {
    throw new Error('Manual GP live proof requires MANUAL_GP_BASE_URL or BASE_URL.');
  }

  if (process.env['VITE_E2E_DEMO_ENABLED'] === '1') {
    throw new Error('Manual GP live proof cannot run with VITE_E2E_DEMO_ENABLED=1.');
  }

  return baseURL;
}

function signProofToken(fundIds: number[]): string {
  const jwtSecret =
    process.env['MANUAL_GP_JWT_SECRET'] ??
    process.env['JWT_SECRET'] ??
    'test-jwt-secret-must-be-at-least-32-characters-long-for-hs256-validation';
  const orgId = process.env['TEST_ORG_ID'] ?? '00000000-0000-0000-0000-000000000001';

  return jwt.sign(
    {
      sub: `manual-gp-proof-${fundIds.join('-') || 'creator'}`,
      email: 'manual-gp-proof@example.com',
      role: 'user',
      orgId,
      org_id: orgId,
      fundIds,
    },
    jwtSecret,
    {
      algorithm: 'HS256',
      issuer: process.env['JWT_ISSUER'] ?? 'updog-api',
      audience: process.env['JWT_AUDIENCE'] ?? 'updog-client',
      expiresIn: '1h',
    }
  );
}

function extractFundId(payload: unknown): number {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Fund response was not an object.');
  }

  const record = payload as Record<string, unknown>;
  const data =
    typeof record['data'] === 'object' && record['data'] !== null
      ? (record['data'] as Record<string, unknown>)
      : undefined;
  const candidate = record['fundId'] ?? record['id'] ?? data?.['fundId'] ?? data?.['id'];

  if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) {
    return candidate;
  }

  throw new Error(
    `Fund response did not expose a positive numeric fund ID: ${JSON.stringify(payload)}`
  );
}

function normalizeProofEndpoint(url: string): ProofEndpoint | null {
  const path = new URL(url).pathname;
  if (path === '/api/funds') return '/api/funds';
  if (/^\/api\/funds\/\d+$/.test(path)) return '/api/funds/:id';
  if (/^\/api\/funds\/\d+\/draft$/.test(path)) return '/api/funds/:id/draft';
  if (path === '/api/funds/finalize') return '/api/funds/finalize';
  if (path === '/api/portfolio-companies') return '/api/portfolio-companies';
  return null;
}

async function installBrowserAuth(page: Page, initialToken: string): Promise<void> {
  const jwtSecret =
    process.env['MANUAL_GP_JWT_SECRET'] ??
    process.env['JWT_SECRET'] ??
    'test-jwt-secret-must-be-at-least-32-characters-long-for-hs256-validation';
  const issuer = process.env['JWT_ISSUER'] ?? 'updog-api';
  const audience = process.env['JWT_AUDIENCE'] ?? 'updog-client';
  const orgId = process.env['TEST_ORG_ID'] ?? '00000000-0000-0000-0000-000000000001';

  await page.addInitScript(
    ({ token, secret, tokenIssuer, tokenAudience, tokenOrgId }) => {
      const tokenStorageKey = 'MANUAL_GP_E2E_AUTH_TOKEN';
      window.__MANUAL_GP_E2E_AUTH_TOKEN__ = window.sessionStorage.getItem(tokenStorageKey) ?? token;
      const nativeFetch = window.fetch.bind(window);

      const base64Url = (value: ArrayBuffer | string) => {
        const bytes =
          typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
        let binary = '';
        bytes.forEach((byte) => {
          binary += String.fromCharCode(byte);
        });
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      };

      const extractCreatedFundId = (payload: unknown) => {
        if (typeof payload !== 'object' || payload === null) return null;
        const record = payload as Record<string, unknown>;
        const data =
          typeof record['data'] === 'object' && record['data'] !== null
            ? (record['data'] as Record<string, unknown>)
            : undefined;
        const candidate = record['fundId'] ?? record['id'] ?? data?.['fundId'] ?? data?.['id'];
        return typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0
          ? candidate
          : null;
      };

      const signScopedToken = async (fundId: number) => {
        const now = Math.floor(Date.now() / 1000);
        const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
        const payload = base64Url(
          JSON.stringify({
            sub: `manual-gp-proof-${fundId}`,
            email: 'manual-gp-proof@example.com',
            role: 'user',
            orgId: tokenOrgId,
            org_id: tokenOrgId,
            fundIds: [fundId],
            iss: tokenIssuer,
            aud: tokenAudience,
            iat: now,
            exp: now + 60 * 60,
          })
        );
        const signingInput = `${header}.${payload}`;
        const key = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const signature = await crypto.subtle.sign(
          'HMAC',
          key,
          new TextEncoder().encode(signingInput)
        );
        return `${signingInput}.${base64Url(signature)}`;
      };

      window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const requestHeaders = input instanceof Request ? input.headers : undefined;
        const headers = new Headers(init.headers ?? requestHeaders);
        const currentToken = window.__MANUAL_GP_E2E_AUTH_TOKEN__;
        if (currentToken) {
          headers.set('Authorization', `Bearer ${currentToken}`);
        }

        const response = await nativeFetch(input, {
          ...init,
          headers,
        });

        const requestUrl =
          input instanceof Request
            ? input.url
            : typeof input === 'string'
              ? input
              : input.toString();
        const url = new URL(requestUrl, window.location.origin);
        const method = init.method ?? (input instanceof Request ? input.method : 'GET');
        if (response.ok && method.toUpperCase() === 'POST' && url.pathname === '/api/funds') {
          const fundId = extractCreatedFundId(
            await response
              .clone()
              .json()
              .catch(() => null)
          );
          if (fundId !== null) {
            const nextToken = await signScopedToken(fundId);
            // eslint-disable-next-line require-atomic-updates -- this is the intentional token handoff after the create response.
            window.__MANUAL_GP_E2E_AUTH_TOKEN__ = nextToken;
            window.sessionStorage.setItem(tokenStorageKey, nextToken);
          }
        }

        return response;
      };
    },
    {
      token: initialToken,
      secret: jwtSecret,
      tokenIssuer: issuer,
      tokenAudience: audience,
      tokenOrgId: orgId,
    }
  );
}

async function assertNoDemoOrAuthRedirect(page: Page): Promise<void> {
  expect(page.url()).not.toContain('/login');
  expect(page.url()).not.toContain('/auth');
  expect(page.url()).not.toContain('?demo');

  const demoStorageValues = await page.evaluate(() => ({
    demoToolbar: window.localStorage.getItem('DEMO_TOOLBAR'),
    demoPersona: window.localStorage.getItem('DEMO_PERSONA'),
    demoMode: window.localStorage.getItem('DEMO_MODE'),
  }));

  expect(demoStorageValues).toEqual({
    demoToolbar: null,
    demoPersona: null,
    demoMode: null,
  });
}

async function createScopedApiContext(baseURL: string, token: string): Promise<APIRequestContext> {
  return request.newContext({
    baseURL,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
}

test.describe('manual GP live proof', () => {
  test('creates a live fund and company without demo or route fulfillment', async ({
    page,
    baseURL,
  }) => {
    const liveBaseURL = requireManualProofEnvironment(baseURL);
    const createToken = process.env['MANUAL_GP_CREATE_AUTH_TOKEN'] ?? signProofToken([]);
    const proofRequests: ProofRequest[] = [];

    page.on('request', (proofRequest) => {
      const endpoint = normalizeProofEndpoint(proofRequest.url());
      if (endpoint === null) return;

      proofRequests.push({
        method: proofRequest.method(),
        endpoint,
        authorization: proofRequest.headers()['authorization'] ?? null,
      });
    });

    await installBrowserAuth(page, createToken);

    const fundSetupPage = new FundSetupPage(page);
    await fundSetupPage.gotoFundSetup(1);
    await assertNoDemoOrAuthRedirect(page);
    await fundSetupPage.verifyWizardLoaded();

    const fundName = `Manual GP Live Proof ${Date.now()}`;
    const { createResponse } = await fundSetupPage.completeStepOneAndWaitForDraft({
      name: fundName,
      fundSize: '75',
    });
    const createdFundPayload = await createResponse.json();
    const manualFundId = extractFundId(createdFundPayload);
    expect(manualFundId).not.toBe(1);

    const scopedToken = await page.evaluate(() => window.__MANUAL_GP_E2E_AUTH_TOKEN__);
    expect(typeof scopedToken).toBe('string');
    expect(jwt.decode(scopedToken!)).toMatchObject({ fundIds: [manualFundId] });

    await fundSetupPage.goToStep(3);
    await fundSetupPage.goToStep(4);
    await fundSetupPage.goToStep(5);
    await fundSetupPage.goToStep(6);
    await fundSetupPage.goToStep(7);
    await fundSetupPage.verifyReviewData({ name: fundName, fundSize: '75' });

    const finalizeResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/funds/finalize') && response.request().method() === 'POST'
    );
    await fundSetupPage.createFundButton.click();
    const finalizeResponse = await finalizeResponsePromise;
    expect(finalizeResponse.status()).toBe(201);
    expect(extractFundId(await finalizeResponse.json())).toBe(manualFundId);
    await expect(page).toHaveURL(new RegExp(`/fund-model-results/${manualFundId}$`));

    const scopedApi = await createScopedApiContext(liveBaseURL, scopedToken!);
    const fundReadback = await scopedApi.get(`/api/funds/${manualFundId}`);
    expect(fundReadback.status()).toBe(200);
    expect(extractFundId(await fundReadback.json())).toBe(manualFundId);

    await page.goto(`/portfolio?fundId=${manualFundId}`);
    await assertNoDemoOrAuthRedirect(page);

    const companyName = `Manual GP Company ${Date.now()}`;
    await page.getByTestId('portfolio-add-company-button').click();
    await page.getByLabel('Company name').fill(companyName);
    await page.getByLabel('Sector').fill('AI');
    await page.getByLabel('Initial investment ($)').fill('12');

    const createCompanyResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/portfolio-companies') &&
        response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: /create company/i }).click();
    const createCompanyResponse = await createCompanyResponsePromise;
    expect(createCompanyResponse.status()).toBe(201);
    const createdCompany = (await createCompanyResponse.json()) as Record<string, unknown>;
    expect(createdCompany['fundId']).toBe(manualFundId);

    const wrongFundToken = signProofToken([manualFundId + 100_000]);
    const wrongFundApi = await createScopedApiContext(liveBaseURL, wrongFundToken);
    const wrongFundReadback = await wrongFundApi.get(`/api/funds/${manualFundId}`);
    expect(wrongFundReadback.ok()).toBe(false);

    const verifierReport = await verifyManualProfile({
      fundId: manualFundId,
      expected: {
        datasetId: `manual-gp-live-proof-${manualFundId}`,
        countsByTable: {
          portfoliocompanies: 1,
          pacing_history: 8,
        },
        totalInvested: 12,
        currentNav: 0,
        activeCompanies: 1,
      },
      apiBaseUrl: liveBaseURL,
      authToken: scopedToken!,
      negativeControlAuthToken: wrongFundToken,
      requireNegativeControls: true,
      requireScopedAuth: true,
      requireApi: true,
      expectedFundSize: 75,
    });
    expect(verifierReport.issues).toEqual([]);
    expect(verifierReport.passed).toBe(true);
    expect(verifierReport.storage.ledgerRows).toBe(0);

    const observed = [...new Set(proofRequests.map((requestEntry) => requestEntry.endpoint))];
    expect(observed).toEqual(
      expect.arrayContaining([
        '/api/funds',
        '/api/funds/:id/draft',
        '/api/funds/finalize',
        '/api/portfolio-companies',
      ])
    );
    expect(
      proofRequests
        .filter((requestEntry) => requestEntry.endpoint !== '/api/funds')
        .every((requestEntry) => requestEntry.authorization === `Bearer ${scopedToken}`)
    ).toBe(true);

    await scopedApi.dispose();
    await wrongFundApi.dispose();
  });
});
