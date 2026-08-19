import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { expect, request, test, type APIRequestContext, type APIResponse } from '@playwright/test';

import { COMMON_API_ROUTE_MANIFEST } from '../../shared/routes/api-route-manifest';

type JsonObject = Record<string, unknown>;
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface JsonRequestOptions {
  data?: JsonObject;
  headers?: Record<string, string>;
}

// Local runs without a target skip the suite (matching
// production-boundaries.spec.ts); the release workflow's non-skippable
// credential step is the fail-closed layer that guarantees these are set.
// A PARTIALLY configured environment (target set, canary credentials
// missing) is a misconfiguration and hard-fails at collection.
const PRODUCTION_URL = process.env['PRODUCTION_URL']?.trim() ?? '';

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    if (!PRODUCTION_URL) return '';
    throw new Error(`[release-canaries] ${name} is required; refusing to skip canaries`);
  }
  return value;
}

const EXPECTED_SHA = requiredEnvironment('EXPECTED_SHA');
const CANARY_USERNAME = requiredEnvironment('CANARY_USERNAME');
const CANARY_PASSWORD = requiredEnvironment('CANARY_PASSWORD');
const VERCEL_AUTOMATION_BYPASS_SECRET = requiredEnvironment('VERCEL_AUTOMATION_BYPASS_SECRET');
// The exact current workflow execution identity and the recovery-handle result
// path are as mandatory as the credentials: without them a cancelled run could
// never be recovered by exact identity.
const RELEASE_CANARY_RESULT_PATH = requiredEnvironment('RELEASE_CANARY_RESULT_PATH');
const GITHUB_RUN_ID = requiredEnvironment('GITHUB_RUN_ID');
const GITHUB_RUN_ATTEMPT = requiredEnvironment('GITHUB_RUN_ATTEMPT');

if (PRODUCTION_URL) {
  if (!/^[0-9a-f]{40}$/.test(EXPECTED_SHA)) {
    throw new Error('[release-canaries] EXPECTED_SHA must be a 40-character lowercase SHA');
  }
  try {
    new URL(PRODUCTION_URL);
  } catch {
    throw new Error('[release-canaries] PRODUCTION_URL must be an absolute URL');
  }
  if (!/^[1-9][0-9]{0,31}$/.test(GITHUB_RUN_ID)) {
    throw new Error('[release-canaries] GITHUB_RUN_ID must be a decimal GitHub run ID');
  }
  if (!/^[1-9][0-9]{0,8}$/.test(GITHUB_RUN_ATTEMPT)) {
    throw new Error('[release-canaries] GITHUB_RUN_ATTEMPT must be a positive integer');
  }
}

type ManifestEntry = (typeof COMMON_API_ROUTE_MANIFEST)[number];

function requireManifestRoute(
  id: string,
  sourceModule: string,
  mountPath: string | null
): ManifestEntry {
  const entry = COMMON_API_ROUTE_MANIFEST.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(`[release-canaries] required API route manifest entry is missing: ${id}`);
  }
  if (entry.sourceModule !== sourceModule || entry.mountPath !== mountPath) {
    throw new Error(
      `[release-canaries] API route manifest entry ${id} does not match ${sourceModule} mounted at ${String(mountPath)}`
    );
  }
  return entry;
}

function mountedRoute(entry: ManifestEntry, declaredPath: string): string {
  if (entry.mountPath === null || entry.mountPath === '/') {
    return declaredPath;
  }
  return `${entry.mountPath.replace(/\/$/, '')}/${declaredPath.replace(/^\//, '')}`;
}

const authRoute = requireManifestRoute('auth', './routes/auth.js', null);
const fundsRoute = requireManifestRoute('funds', './routes/funds.js', '/api');
const fundConfigRoute = requireManifestRoute('fund-config', './routes/fund-config.js', null);
const portfolioCompaniesRoute = requireManifestRoute(
  'portfolio-companies',
  './routes/portfolio-companies.js',
  '/api'
);
const fundScenarioSetsRoute = requireManifestRoute(
  'fund-scenario-sets',
  './routes/fund-scenario-sets.js',
  '/api'
);

if (authRoute.probe.path !== '/api/auth/csrf') {
  throw new Error('[release-canaries] CSRF route manifest probe changed unexpectedly');
}
if (fundsRoute.probe.path !== '/api/funds/abc') {
  throw new Error('[release-canaries] fund route manifest probe changed unexpectedly');
}
if (fundConfigRoute.probe.path !== '/api/funds/abc/results') {
  throw new Error('[release-canaries] fund-config route manifest probe changed unexpectedly');
}
if (portfolioCompaniesRoute.probe.path !== '/api/portfolio-companies') {
  throw new Error('[release-canaries] portfolio route manifest probe changed unexpectedly');
}
if (fundScenarioSetsRoute.probe.path !== '/api/funds/abc/scenario-sets') {
  throw new Error('[release-canaries] scenario-set route manifest probe changed unexpectedly');
}

// These paths mirror the declarations in the owning route files. The manifest
// checks above make a missing or remounted route a collection-time failure.
const ROUTES = {
  authCsrf: authRoute.probe.path,
  authLogin: '/api/auth/login',
  fundCreate: mountedRoute(fundsRoute, '/funds'),
  fundFinalize: '/api/funds/finalize',
  fundById: (fundId: number) => mountedRoute(fundsRoute, `/funds/${fundId}`),
  portfolioCompanyById: (companyId: number, fundId: number) =>
    `${mountedRoute(portfolioCompaniesRoute, `/portfolio-companies/${companyId}`)}?fundId=${fundId}`,
  portfolioCompanyPatch: (companyId: number, fundId: number) =>
    `${mountedRoute(portfolioCompaniesRoute, `/portfolio-companies/${companyId}`)}?fundId=${fundId}`,
  fundResults: (fundId: number) => `/api/funds/${fundId}/results`,
  scenarioReserveOptimization: (fundId: number) =>
    mountedRoute(fundScenarioSetsRoute, `/funds/${fundId}/scenario-sets/reserve-optimization`),
  scenarioCalculateReserve: (fundId: number, scenarioSetId: string) =>
    mountedRoute(
      fundScenarioSetsRoute,
      `/funds/${fundId}/scenario-sets/${encodeURIComponent(scenarioSetId)}/calculate-reserve`
    ),
  scenarioCalculationStatus: (fundId: number, scenarioSetId: string) =>
    mountedRoute(
      fundScenarioSetsRoute,
      `/funds/${fundId}/scenario-sets/${encodeURIComponent(scenarioSetId)}/calculation-status`
    ),
} as const;

function requiredObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`[release-canaries] ${label} must be a JSON object`);
  }
  return value as JsonObject;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`[release-canaries] ${label} must be a non-empty string`);
  }
  return value;
}

function requiredUuid(value: unknown, label: string): string {
  const uuid = requiredString(value, label);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)
  ) {
    throw new Error(`[release-canaries] ${label} must be a UUID`);
  }
  return uuid;
}

function requiredPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`[release-canaries] ${label} must be a positive integer`);
  }
  return value;
}

function requiredNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`[release-canaries] ${label} must be a non-negative integer`);
  }
  return value;
}

async function readJsonObject(response: APIResponse, label: string): Promise<JsonObject> {
  const contentType = response.headers()['content-type'] ?? '';
  expect(contentType, `${label} must not be an SPA rewrite`).toMatch(/^application\/json\b/i);
  return requiredObject(await response.json(), label);
}

function isUnsafeMethod(method: HttpMethod): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

class ReleaseCanaryClient {
  private csrfToken: string | null = null;

  public constructor(private readonly context: APIRequestContext) {}

  public async close(): Promise<void> {
    await this.context.dispose();
  }

  public async call(
    method: HttpMethod,
    path: string,
    label: string,
    options: JsonRequestOptions = {}
  ): Promise<APIResponse> {
    const correlationId = randomUUID();
    const headers: Record<string, string> = {
      'x-vercel-protection-bypass': VERCEL_AUTOMATION_BYPASS_SECRET,
      ...(options.headers ?? {}),
      'x-correlation-id': correlationId,
    };

    if (isUnsafeMethod(method) && !headers['X-CSRF-Token']) {
      if (!this.csrfToken) {
        throw new Error(`[release-canaries] CSRF token unavailable for ${method} ${path}`);
      }
      headers['X-CSRF-Token'] = this.csrfToken;
    }

    const response = await this.context.fetch(path, {
      method,
      headers,
      ...(options.data === undefined ? {} : { data: options.data }),
    });

    console.warn(
      `[release-canaries] ${label} ${method} ${path} status=${response.status()} correlation=${correlationId}`
    );
    return response;
  }

  public async login(): Promise<void> {
    const csrfResponse = await this.call('GET', ROUTES.authCsrf, 'auth.csrf');
    expect(csrfResponse.status(), 'CSRF bootstrap must succeed').toBe(200);
    const csrfBody = await readJsonObject(csrfResponse, 'CSRF bootstrap response');
    const preAuthToken = requiredString(csrfBody['csrfToken'], 'pre-auth CSRF token');

    const loginResponse = await this.call('POST', ROUTES.authLogin, 'auth.login', {
      headers: { 'X-CSRF-Token': preAuthToken },
      data: { username: CANARY_USERNAME, password: CANARY_PASSWORD },
    });
    expect(loginResponse.status(), 'canary login must succeed').toBe(200);
    await readJsonObject(loginResponse, 'canary login response');

    await this.refreshCsrf();
  }

  public async refreshCsrf(): Promise<void> {
    const response = await this.call('GET', ROUTES.authCsrf, 'auth.csrf.refresh');
    expect(response.status(), 'authenticated CSRF refresh must succeed').toBe(200);
    const body = await readJsonObject(response, 'authenticated CSRF response');
    this.csrfToken = requiredString(body['csrfToken'], 'session CSRF token');
  }

  public async verifyReleaseIdentity(): Promise<void> {
    const response = await this.call('GET', '/api/version', 'release.identity');
    expect(response.status(), 'deployed version endpoint must succeed').toBe(200);
    const body = await readJsonObject(response, 'deployed version response');
    const deployedSha = requiredString(body['commit'], 'deployed API SHA');
    console.warn(`[release-canaries] deployed API SHA=${deployedSha}`);
    expect(deployedSha, 'deployed API SHA must equal EXPECTED_SHA').toBe(EXPECTED_SHA);
  }
}

function requireClient(client: ReleaseCanaryClient | undefined): ReleaseCanaryClient {
  if (!client) {
    throw new Error('[release-canaries] canary client was not initialized');
  }
  return client;
}

type ReleaseCanaryRecoveryHandleV1 = {
  schemaVersion: 'release-canary-recovery-handle-v1';
  githubRunId: string;
  githubRunAttempt: number;
  fundId: number;
  canaryRunId: string;
  releaseSha: string;
};

/**
 * Persist the exact-execution recovery handle before finalize so a hard
 * cancellation between fund creation and finalization stays recoverable by
 * exact workflow run/attempt. The handle carries no credentials or evidence.
 */
async function persistRecoveryHandle(fundId: number, canaryRunId: string): Promise<void> {
  if (!Number.isSafeInteger(fundId) || fundId < 1) {
    throw new Error('[release-canaries] recovery handle fund ID must be a positive integer');
  }
  requiredUuid(canaryRunId, 'recovery handle canary run ID');
  if (!/^[1-9][0-9]{0,31}$/.test(GITHUB_RUN_ID) || !/^[1-9][0-9]{0,8}$/.test(GITHUB_RUN_ATTEMPT)) {
    throw new Error('[release-canaries] recovery handle workflow execution identity is malformed');
  }
  if (!/^[0-9a-f]{40}$/.test(EXPECTED_SHA)) {
    throw new Error('[release-canaries] recovery handle release SHA must be 40 lowercase hex');
  }

  const handle: ReleaseCanaryRecoveryHandleV1 = {
    schemaVersion: 'release-canary-recovery-handle-v1',
    githubRunId: GITHUB_RUN_ID,
    githubRunAttempt: Number(GITHUB_RUN_ATTEMPT),
    fundId,
    canaryRunId,
    releaseSha: EXPECTED_SHA,
  };

  const temporaryPath = join(
    dirname(RELEASE_CANARY_RESULT_PATH),
    `.release-canary-recovery-${randomUUID()}.tmp`
  );
  await writeFile(temporaryPath, `${JSON.stringify(handle)}\n`, { mode: 0o600 });
  try {
    await rename(temporaryPath, RELEASE_CANARY_RESULT_PATH);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  console.warn(`RELEASE_CANARY_RECOVERY_V1 ${JSON.stringify(handle)}`);
}

async function waitForAuthoritativeResults(
  client: ReleaseCanaryClient,
  fundId: number
): Promise<JsonObject> {
  const deadline = Date.now() + 120_000;
  let lastBody: JsonObject | null = null;

  while (Date.now() < deadline) {
    const response = await client.call('GET', ROUTES.fundResults(fundId), 'canary3.results');
    if (response.status() !== 200) {
      const detail = await response.text();
      throw new Error(
        `[release-canaries] results route returned ${response.status()} for fund ${fundId}: ${detail}`
      );
    }

    const body = await readJsonObject(response, 'fund results response');
    lastBody = body;
    const sections = body['sections'];
    const lifecycle = body['lifecycle'];
    if (body['status'] === 'ready' && sections && lifecycle) {
      const sectionRecord = requiredObject(sections, 'fund results sections');
      const reserve = sectionRecord['reserve'];
      const pacing = sectionRecord['pacing'];
      const lifecycleRecord = requiredObject(lifecycle, 'fund results lifecycle');
      const calculationState = lifecycleRecord['calculationState'];
      const calculationRecord = requiredObject(calculationState, 'fund calculation state');

      if (
        calculationRecord['legacyEvidence'] === false &&
        reserve &&
        pacing &&
        requiredObject(reserve, 'reserve results section')['status'] === 'available' &&
        requiredObject(pacing, 'pacing results section')['status'] === 'available'
      ) {
        return body;
      }
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(
    `[release-canaries] authoritative results did not become ready within 120s: ${JSON.stringify(lastBody)}`
  );
}

type ScenarioLifecycleStatus = 'queued' | 'calculating' | 'succeeded';

function parseScenarioLifecycleStatus(value: unknown, body: JsonObject): ScenarioLifecycleStatus {
  if (value === 'queued' || value === 'calculating' || value === 'succeeded') {
    return value;
  }
  if (value === 'failed') {
    throw new Error(
      `[release-canaries] canary5 scenario calculation failed: ${JSON.stringify(body)}`
    );
  }
  throw new Error(
    `[release-canaries] canary5 scenario calculation returned unexpected status: ${JSON.stringify(body)}`
  );
}

async function waitForScenarioCalculation(
  client: ReleaseCanaryClient,
  fundId: number,
  scenarioSetId: string,
  calculationCorrelationId: string
): Promise<JsonObject> {
  // 'queued' is seeded by the enqueue response. 'calculating' is useful live
  // evidence, but a fast worker may complete before any poll sees it; the
  // terminal response carries durable calculationStartedAt evidence instead.
  const observedStatuses: ScenarioLifecycleStatus[] = ['queued'];
  const deadline = Date.now() + 120_000;
  let lastBody: JsonObject | null = null;

  while (Date.now() < deadline) {
    const response = await client.call(
      'GET',
      ROUTES.scenarioCalculationStatus(fundId, scenarioSetId),
      'canary5.calculation-status'
    );
    if (response.status() !== 200) {
      const detail = await response.text();
      throw new Error(
        `[release-canaries] canary5 calculation status route returned ${response.status()}: ${detail}`
      );
    }

    const body = await readJsonObject(response, 'canary5 calculation status response');
    lastBody = body;
    const status = parseScenarioLifecycleStatus(body['status'], body);
    expect(body['fundId']).toBe(fundId);
    expect(requiredUuid(body['scenarioSetId'], 'canary5 scenario set ID')).toBe(scenarioSetId);
    expect(requiredUuid(body['correlationId'], 'canary5 calculation correlation ID')).toBe(
      calculationCorrelationId
    );

    if (!observedStatuses.includes(status)) {
      observedStatuses.push(status);
      console.warn(`[release-canaries] canary5 observed status=${status}`);
    }

    if (status === 'succeeded') {
      const calculationStartedAt = requiredString(
        body['calculationStartedAt'],
        'canary5 durable calculation start'
      );
      expect(Number.isNaN(Date.parse(calculationStartedAt))).toBe(false);
      return body;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `[release-canaries] canary5 scenario calculation did not reach succeeded within 120s; observed=${JSON.stringify(observedStatuses)} last=${JSON.stringify(lastBody)}`
  );
}

test.describe('release mutation canaries', () => {
  // SKIP: release canaries only run against a deployed target; the release
  // workflow's non-skippable credential step fail-closes missing env there.
  test.skip(
    !PRODUCTION_URL,
    'PRODUCTION_URL not set; release canaries run only against a deployed target'
  );
  test.describe.configure({ mode: 'serial', timeout: 10 * 60 * 1000 });

  let client: ReleaseCanaryClient | undefined;
  let canaryFundId: number | undefined;

  test.beforeAll(async () => {
    const context = await request.newContext({
      baseURL: PRODUCTION_URL,
      extraHTTPHeaders: {
        'x-vercel-protection-bypass': VERCEL_AUTOMATION_BYPASS_SECRET,
      },
    });
    client = new ReleaseCanaryClient(context);
    await client.verifyReleaseIdentity();
    await client.login();
  });

  test.afterAll(async () => {
    await client?.close();
  });

  test('canary 1 creates, finalizes, and reloads a fund', async () => {
    const api = requireClient(client);
    const fundName = `G4 Release Canary ${Date.now()}-${randomUUID().slice(0, 8)}`;
    const fundSize = 1_000_000;
    const vintageYear = new Date().getUTCFullYear();
    const createResponse = await api.call('POST', ROUTES.fundCreate, 'canary1.create-fund', {
      headers: {
        'Idempotency-Key': `g4-release-canary-create-${randomUUID()}`,
        'Release-Canary-Workflow-Run-Id': GITHUB_RUN_ID,
        'Release-Canary-Workflow-Run-Attempt': GITHUB_RUN_ATTEMPT,
      },
      data: {
        name: fundName,
        size: fundSize,
        managementFee: 0.02,
        carryPercentage: 0.2,
        vintageYear,
      },
    });
    expect(createResponse.status(), 'fund creation must succeed').toBe(201);
    const createBody = await readJsonObject(createResponse, 'fund creation response');
    expect(createBody['success']).toBe(true);
    const createdFund = requiredObject(createBody['data'], 'created fund data');
    const createdFundId = requiredPositiveInteger(createdFund['id'], 'created fund ID');
    const canaryRunId = requiredUuid(
      createResponse.headers()['release-canary-run-id'],
      'release canary run ID response header'
    );

    // Persist the exact-execution recovery handle before finalize; a hard
    // cancellation from here on is recoverable by exact workflow run/attempt.
    await persistRecoveryHandle(createdFundId, canaryRunId);

    // Creation renews the session credential with the new creator grant.
    await api.refreshCsrf();

    const finalizeResponse = await api.call('POST', ROUTES.fundFinalize, 'canary1.finalize-fund', {
      headers: { 'Idempotency-Key': `g4-release-canary-finalize-${randomUUID()}` },
      data: {
        draftFundId: createdFundId,
        name: fundName,
        size: fundSize,
        managementFee: 0.02,
        carryPercentage: 0.2,
        vintageYear,
        modelInputsAsOfDate: new Date().toISOString().slice(0, 10),
      },
    });
    expect(finalizeResponse.status(), 'fund finalize must publish').toBe(201);
    const finalizeBody = await readJsonObject(finalizeResponse, 'fund finalize response');
    expect(finalizeBody['success']).toBe(true);
    const finalizeData = requiredObject(finalizeBody['data'], 'fund finalize data');
    const fundId = requiredPositiveInteger(finalizeData['fundId'], 'finalized fund ID');
    expect(fundId).toBe(createdFundId);
    expect(finalizeData['published']).toBe(true);
    expect(finalizeData['configVersion']).toEqual(expect.any(Number));
    expect(finalizeData['runId']).toEqual(expect.any(Number));
    canaryFundId = fundId;

    // Finalize can renew the browser session cookie and its session-bound CSRF
    // cookie. Refresh the token before the next unsafe request.
    await api.refreshCsrf();

    const reloadResponse = await api.call(
      'GET',
      ROUTES.fundById(fundId),
      'canary1.reload-fund'
    );
    expect(reloadResponse.status(), 'created fund must be readable').toBe(200);
    const reloadedFund = await readJsonObject(reloadResponse, 'reloaded fund response');
    expect(reloadedFund['id']).toBe(fundId);
    expect(reloadedFund['name']).toBe(fundName);
    expect(reloadedFund['size']).toBe(fundSize);
    expect(reloadedFund['vintageYear']).toBe(vintageYear);
  });

  test('canary 2 edits portfolio metadata with idempotency and optimistic locking', async () => {
    const api = requireClient(client);
    const fundId = canaryFundId;
    if (fundId === undefined) {
      throw new Error('[release-canaries] canary 1 did not provide a fund ID');
    }

    const companyName = `G4 Canary Company ${Date.now()}`;
    const createCompanyResponse = await api.call(
      'POST',
      mountedRoute(portfolioCompaniesRoute, '/portfolio-companies'),
      'canary2.create-company',
      {
        headers: { 'Idempotency-Key': `g4-release-canary-company-${randomUUID()}` },
        data: {
          fundId,
          name: companyName,
          sector: 'AI / ML',
          stage: 'Seed',
          investmentAmount: '1000000.00',
          status: 'active',
        },
      }
    );
    expect(createCompanyResponse.status(), 'canary portfolio company creation must succeed').toBe(
      201
    );
    const createdCompany = await readJsonObject(
      createCompanyResponse,
      'created portfolio company response'
    );
    const companyId = requiredPositiveInteger(createdCompany['id'], 'canary company ID');
    let expectedVersion =
      typeof createdCompany['rowVersion'] === 'number'
        ? requiredNonNegativeInteger(createdCompany['rowVersion'], 'created company row version')
        : undefined;

    if (expectedVersion === undefined) {
      const detailResponse = await api.call(
        'GET',
        ROUTES.portfolioCompanyById(companyId, fundId),
        'canary2.read-company-version'
      );
      expect(detailResponse.status(), 'created company must be readable').toBe(200);
      const detail = await readJsonObject(detailResponse, 'created company detail response');
      expectedVersion = requiredNonNegativeInteger(detail['rowVersion'], 'company row version');
    }

    const updatedDescription = `release-canary-description-${randomUUID()}`;
    const patchResponse = await api.call(
      'PATCH',
      ROUTES.portfolioCompanyPatch(companyId, fundId),
      'canary2.patch-company',
      {
        headers: { 'Idempotency-Key': `g4-release-canary-patch-${randomUUID()}` },
        data: {
          expectedVersion,
          patch: { description: updatedDescription },
        },
      }
    );
    expect(patchResponse.status(), 'portfolio metadata patch must succeed').toBe(200);
    const patchedCompany = await readJsonObject(patchResponse, 'patched company response');
    expect(patchedCompany['id']).toBe(companyId);
    expect(patchedCompany['fundId']).toBe(fundId);
    expect(patchedCompany['description']).toBe(updatedDescription);
    expect(patchedCompany['rowVersion']).toBe(expectedVersion + 1);

    const persistedResponse = await api.call(
      'GET',
      ROUTES.portfolioCompanyById(companyId, fundId),
      'canary2.reload-company'
    );
    expect(persistedResponse.status(), 'portfolio metadata patch must persist').toBe(200);
    const persistedCompany = await readJsonObject(
      persistedResponse,
      'persisted company response'
    );
    expect(persistedCompany['description']).toBe(updatedDescription);
    expect(persistedCompany['rowVersion']).toBe(expectedVersion + 1);
  });

  test('canary 3 exposes authoritative non-fallback modeling results', async () => {
    const api = requireClient(client);
    const fundId = canaryFundId;
    if (fundId === undefined) {
      throw new Error('[release-canaries] canary 1 did not provide a fund ID');
    }

    const results = await waitForAuthoritativeResults(api, fundId);
    expect(results['status']).toBe('ready');

    const lifecycle = requiredObject(results['lifecycle'], 'results lifecycle');
    const calculationState = requiredObject(lifecycle['calculationState'], 'calculation state');
    expect(calculationState['legacyEvidence']).toBe(false);

    const sections = requiredObject(results['sections'], 'results sections');
    for (const sectionName of ['reserve', 'pacing']) {
      const section = requiredObject(sections[sectionName], `${sectionName} results section`);
      expect(section['status']).toBe('available');
      expect(section['source']).toBe('fund_snapshots');
      expect(section['legacyEvidence']).toBe(false);
    }
  });

  test('canary 4 reloads a non-empty snapshot-backed results payload', async () => {
    const api = requireClient(client);
    const fundId = canaryFundId;
    if (fundId === undefined) {
      throw new Error('[release-canaries] canary 1 did not provide a fund ID');
    }

    // fund-config's manifest-backed results read model is mounted by makeApp
    // and serves persisted fund_snapshots after canary 3 reaches ready.
    const resultsResponse = await api.call(
      'GET',
      ROUTES.fundResults(fundId),
      'canary4.read-snapshot-results'
    );
    expect(resultsResponse.status(), 'snapshot-backed results must be readable').toBe(200);
    const resultsBody = await readJsonObject(resultsResponse, 'snapshot-backed results response');
    expect(Object.keys(resultsBody).length).toBeGreaterThan(0);
    expect(resultsBody['fundId']).toBe(fundId);
    const resultsSections = requiredObject(resultsBody['sections'], 'results sections');
    expect(Object.keys(resultsSections).length).toBeGreaterThan(0);
    for (const sectionName of ['reserve', 'pacing']) {
      const section = requiredObject(resultsSections[sectionName], `${sectionName} results section`);
      expect(section['source']).toBe('fund_snapshots');
    }

    const reloadResponse = await api.call(
      'GET',
      ROUTES.fundResults(fundId),
      'canary4.reload-snapshot-results'
    );
    expect(reloadResponse.status(), 'snapshot-backed results reload must succeed').toBe(200);
    const reloadedBody = await readJsonObject(reloadResponse, 'reloaded results response');
    expect(Object.keys(reloadedBody).length).toBeGreaterThan(0);
    expect(reloadedBody['fundId']).toBe(fundId);
    expect(reloadedBody['status']).toBe(resultsBody['status']);
  });

  test('canary 5 verifies durable scenario calculation start and success', async () => {
    const api = requireClient(client);
    const fundId = canaryFundId;
    if (fundId === undefined) {
      throw new Error('[release-canaries] canary 1 did not provide a fund ID');
    }

    const scenarioSetResponse = await api.call(
      'POST',
      ROUTES.scenarioReserveOptimization(fundId),
      'canary5.create-scenario-set',
      {
        headers: { 'Idempotency-Key': `g4-release-canary-scenario-${randomUUID()}` },
        data: {
          name: `G4 Release Canary Scenario ${Date.now()}`,
          variantName: 'Release canary reserve plan',
        },
      }
    );
    expect(scenarioSetResponse.status(), 'scenario set creation must succeed').toBe(201);
    const scenarioSet = await readJsonObject(
      scenarioSetResponse,
      'canary5 scenario set response'
    );
    const scenarioSetId = requiredUuid(scenarioSet['id'], 'canary5 scenario set ID');
    expect(scenarioSet['fundId']).toBe(fundId);

    const enqueueResponse = await api.call(
      'POST',
      ROUTES.scenarioCalculateReserve(fundId, scenarioSetId),
      'canary5.enqueue-scenario-calculation',
      { data: { calculationMode: 'async_reserve_allocation' } }
    );
    expect(enqueueResponse.status(), 'scenario calculation enqueue must succeed').toBe(202);
    const enqueueBody = await readJsonObject(enqueueResponse, 'canary5 enqueue response');
    expect(enqueueBody['fundId']).toBe(fundId);
    expect(enqueueBody['scenarioSetId']).toBe(scenarioSetId);
    expect(enqueueBody['calculationMode']).toBe('async_reserve_allocation');
    expect(enqueueBody['status']).toBe('queued');
    const jobId = requiredString(enqueueBody['jobId'], 'canary5 job ID');
    const calculationCorrelationId = requiredUuid(
      enqueueBody['correlationId'],
      'canary5 enqueue correlation ID'
    );
    console.warn(
      `[release-canaries] canary5 calculation correlation=${calculationCorrelationId} job=${jobId}`
    );

    const completed = await waitForScenarioCalculation(
      api,
      fundId,
      scenarioSetId,
      calculationCorrelationId
    );
    expect(completed['status']).toBe('succeeded');
    expect(completed['jobId']).toBe(jobId);
    expect(completed['snapshotId']).toEqual(expect.any(Number));
    expect(completed['calculationStartedAt']).toEqual(expect.any(String));
  });
});
