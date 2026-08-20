import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { expect, request, test, type APIRequestContext, type APIResponse } from '@playwright/test';

import { COMMON_API_ROUTE_MANIFEST } from '../../shared/routes/api-route-manifest';
import {
  FundResultsReadV1Schema,
  type FundResultsReadV1,
} from '../../shared/contracts/fund-results-v1.contract';
// The stored-JSON report canary recomputes the artifact content hash with the
// PURE shared helper only -- never the server service graph.
import { sha256CanonicalJson } from '../../shared/lib/canonical-json';
import { PlanningFmvOverrideCreateResponseSchema } from '../../shared/contracts/lp-reporting/planning-fmv-override.contract';
import { FundCompanyActualsFactsResponseSchema } from '../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import {
  MetricRunCommitResponseSchema,
  MetricRunDryRunResponseSchema,
  MetricRunLifecycleResponseSchema,
} from '../../shared/contracts/lp-reporting/lp-metric-run.contract';
import { MetricRunEvidenceCreateResponseSchema } from '../../shared/contracts/lp-reporting/evidence-record.contract';
import {
  NarrativeRunCreateResponseSchema,
  NarrativeRunLifecycleResponseSchema,
} from '../../shared/contracts/lp-reporting/lp-narrative-run.contract';
import { ReportPackageAssembleResponseSchema } from '../../shared/contracts/lp-reporting/lp-report-package.contract';
import {
  ReportPackageJsonStoredArtifactResponseSchema,
  ReportPackageJsonStoredExportResponseSchema,
} from '../../shared/contracts/lp-reporting/lp-report-package-json-export.contract';
import {
  pollReleaseCanaryWorkerStatus,
  RELEASE_CANARY_WORKER_POLL_DEADLINE_MS,
} from './support/release-canary-polling';

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
// Dedicated nonhuman admin automation account for the financial-truth report
// canary. Distinct from the release-canary principal and from all human
// accounts; used only around planning-FMV creation/replay and reconciliation.
const CANARY_RECONCILER_USERNAME = requiredEnvironment('CANARY_RECONCILER_USERNAME');
const CANARY_RECONCILER_PASSWORD = requiredEnvironment('CANARY_RECONCILER_PASSWORD');
const VERCEL_AUTOMATION_BYPASS_SECRET = requiredEnvironment('VERCEL_AUTOMATION_BYPASS_SECRET');
// The exact current workflow execution identity and the recovery-handle result
// path are as mandatory as the credentials: without them a cancelled run could
// never be recovered by exact identity.
const RELEASE_CANARY_RESULT_PATH = requiredEnvironment('RELEASE_CANARY_RESULT_PATH');
const GITHUB_RUN_ID = requiredEnvironment('GITHUB_RUN_ID');
const GITHUB_RUN_ATTEMPT = requiredEnvironment('GITHUB_RUN_ATTEMPT');
// Pinned report as-of date: derived once from the workflow's canary execution
// window so retries within one workflow attempt use one deterministic date.
const CANARY_STARTED_AT = requiredEnvironment('CANARY_STARTED_AT');

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
  if (CANARY_RECONCILER_USERNAME === CANARY_USERNAME) {
    throw new Error(
      '[release-canaries] CANARY_RECONCILER_USERNAME must differ from the release-canary principal'
    );
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(CANARY_STARTED_AT) ||
    Number.isNaN(Date.parse(CANARY_STARTED_AT))
  ) {
    throw new Error('[release-canaries] CANARY_STARTED_AT must be a UTC ISO-8601 instant');
  }
}

// One pinned as-of date for the whole report canary; retries within one
// workflow attempt reuse the same date because the workflow computes
// CANARY_STARTED_AT once per attempt.
const REPORT_AS_OF_DATE = CANARY_STARTED_AT ? CANARY_STARTED_AT.slice(0, 10) : '';

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
const fundActualsRoute = requireManifestRoute('fund-actuals', './routes/fund-actuals.js', '/api');
const planningFmvRoute = requireManifestRoute(
  'planning-fmv-overrides',
  './routes/planning-fmv-overrides.js',
  '/api'
);
const fundMoicRoute = requireManifestRoute('fund-moic', './routes/fund-moic.js', '/api');
const metricRunsRoute = requireManifestRoute(
  'lp-reporting-metric-runs',
  './routes/lp-reporting/metric-runs.js',
  null
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
if (fundActualsRoute.probe.path !== '/api/funds/abc/actuals/facts') {
  throw new Error('[release-canaries] fund-actuals route manifest probe changed unexpectedly');
}
if (planningFmvRoute.probe.path !== '/api/funds/abc/planning/fmv-overrides/latest') {
  throw new Error('[release-canaries] planning-fmv route manifest probe changed unexpectedly');
}
if (fundMoicRoute.probe.path !== '/api/funds/abc/moic/rankings') {
  throw new Error('[release-canaries] fund-moic route manifest probe changed unexpectedly');
}
if (metricRunsRoute.probe.path !== '/api/funds/abc/metric-runs/dry-run') {
  throw new Error('[release-canaries] metric-runs route manifest probe changed unexpectedly');
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
  planningFmvOverrides: (fundId: number) =>
    mountedRoute(planningFmvRoute, `/funds/${fundId}/planning/fmv-overrides`),
  actualsFacts: (fundId: number, asOfDate: string) =>
    `${mountedRoute(fundActualsRoute, `/funds/${fundId}/actuals/facts`)}?asOfDate=${asOfDate}`,
  moicReconciliations: (fundId: number) =>
    mountedRoute(fundMoicRoute, `/admin/funds/${fundId}/moic/reconciliations`),
  metricDryRun: (fundId: number) =>
    mountedRoute(metricRunsRoute, `/api/funds/${fundId}/metric-runs/dry-run`),
  metricCommit: (fundId: number) =>
    mountedRoute(metricRunsRoute, `/api/funds/${fundId}/metric-runs/commit`),
  metricEvidenceRecords: (fundId: number, metricRunId: number) =>
    mountedRoute(
      metricRunsRoute,
      `/api/funds/${fundId}/metric-runs/${metricRunId}/evidence-records`
    ),
  metricApprove: (fundId: number, metricRunId: number) =>
    mountedRoute(metricRunsRoute, `/api/funds/${fundId}/metric-runs/${metricRunId}/approve`),
  metricLock: (fundId: number, metricRunId: number) =>
    mountedRoute(metricRunsRoute, `/api/funds/${fundId}/metric-runs/${metricRunId}/lock`),
  narrativeRuns: (fundId: number, metricRunId: number) =>
    mountedRoute(metricRunsRoute, `/api/funds/${fundId}/metric-runs/${metricRunId}/narrative-runs`),
  narrativeRunById: (fundId: number, metricRunId: number, narrativeRunId: number) =>
    mountedRoute(
      metricRunsRoute,
      `/api/funds/${fundId}/metric-runs/${metricRunId}/narrative-runs/${narrativeRunId}`
    ),
  narrativeReview: (fundId: number, metricRunId: number, narrativeRunId: number) =>
    mountedRoute(
      metricRunsRoute,
      `/api/funds/${fundId}/metric-runs/${metricRunId}/narrative-runs/${narrativeRunId}/review`
    ),
  narrativeApprove: (fundId: number, metricRunId: number, narrativeRunId: number) =>
    mountedRoute(
      metricRunsRoute,
      `/api/funds/${fundId}/metric-runs/${metricRunId}/narrative-runs/${narrativeRunId}/approve`
    ),
  reportPackage: (fundId: number, metricRunId: number) =>
    mountedRoute(metricRunsRoute, `/api/funds/${fundId}/metric-runs/${metricRunId}/report-package`),
  storedJsonExport: (fundId: number, metricRunId: number) =>
    mountedRoute(
      metricRunsRoute,
      `/api/funds/${fundId}/metric-runs/${metricRunId}/report-package/exports/json`
    ),
  storedJsonArtifact: (fundId: number, metricRunId: number) =>
    mountedRoute(
      metricRunsRoute,
      `/api/funds/${fundId}/metric-runs/${metricRunId}/report-package/exports/json/artifact`
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
  private closed = false;

  public constructor(private readonly context: APIRequestContext) {}

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
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

  // Credentials are used for the login POST only and are never logged; the
  // call() logger prints method/path/status/correlation, not bodies.
  public async login(username: string, password: string): Promise<void> {
    const csrfResponse = await this.call('GET', ROUTES.authCsrf, 'auth.csrf');
    expect(csrfResponse.status(), 'CSRF bootstrap must succeed').toBe(200);
    const csrfBody = await readJsonObject(csrfResponse, 'CSRF bootstrap response');
    const preAuthToken = requiredString(csrfBody['csrfToken'], 'pre-auth CSRF token');

    const loginResponse = await this.call('POST', ROUTES.authLogin, 'auth.login', {
      headers: { 'X-CSRF-Token': preAuthToken },
      data: { username, password },
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

/**
 * Poll the results route until the authoritative shape is ready, then parse
 * with the owning shared contract (strict). The schema parse -- not ad hoc
 * object checks -- is the acceptance gate for the response shape.
 */
async function waitForAuthoritativeResults(
  client: ReleaseCanaryClient,
  fundId: number
): Promise<FundResultsReadV1> {
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
        return FundResultsReadV1Schema.parse(body);
      }
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(
    `[release-canaries] authoritative results did not become ready within 120s: ${JSON.stringify(lastBody)}`
  );
}

/**
 * Bounded canary status fetch for the shared polling module. Enforces the
 * JSON (non-SPA-rewrite) content type on 200 responses.
 */
function canaryStatusFetch(
  client: ReleaseCanaryClient,
  fundId: number,
  scenarioSetId: string
): () => Promise<{ status: number; body: unknown }> {
  return async () => {
    const response = await client.call(
      'GET',
      ROUTES.scenarioCalculationStatus(fundId, scenarioSetId),
      'canary5.calculation-status'
    );
    if (response.status() !== 200) {
      return { status: response.status(), body: await response.text() };
    }
    return { status: 200, body: await readJsonObject(response, 'canary5 status response') };
  };
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
  let adminClient: ReleaseCanaryClient | undefined;
  let canaryFundId: number | undefined;
  let canaryCompanyId: number | undefined;
  let canary3Results: FundResultsReadV1 | undefined;

  test.beforeAll(async () => {
    const context = await request.newContext({
      baseURL: PRODUCTION_URL,
      extraHTTPHeaders: {
        'x-vercel-protection-bypass': VERCEL_AUTOMATION_BYPASS_SECRET,
      },
    });
    client = new ReleaseCanaryClient(context);
    await client.verifyReleaseIdentity();
    await client.login(CANARY_USERNAME, CANARY_PASSWORD);
  });

  test.afterAll(async () => {
    await client?.close();
    await adminClient?.close();
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
    canaryCompanyId = companyId;
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
    const patchIdempotencyKey = `g4-release-canary-patch-${randomUUID()}`;
    const patchBody = {
      expectedVersion,
      patch: { description: updatedDescription },
    };
    const patchResponse = await api.call(
      'PATCH',
      ROUTES.portfolioCompanyPatch(companyId, fundId),
      'canary2.patch-company',
      {
        headers: { 'Idempotency-Key': patchIdempotencyKey },
        data: patchBody,
      }
    );
    expect(patchResponse.status(), 'portfolio metadata patch must succeed').toBe(200);
    const patchedCompany = await readJsonObject(patchResponse, 'patched company response');
    expect(patchedCompany['id']).toBe(companyId);
    expect(patchedCompany['fundId']).toBe(fundId);
    expect(patchedCompany['description']).toBe(updatedDescription);
    expect(patchedCompany['rowVersion']).toBe(expectedVersion + 1);

    // Idempotent replay: the identical PATCH with the same key and body must
    // return the stored 200 response byte-for-byte, not re-execute.
    const replayResponse = await api.call(
      'PATCH',
      ROUTES.portfolioCompanyPatch(companyId, fundId),
      'canary2.replay-patch-company',
      {
        headers: { 'Idempotency-Key': patchIdempotencyKey },
        data: patchBody,
      }
    );
    expect(replayResponse.status(), 'idempotent patch replay must succeed').toBe(200);
    const replayedCompany = await readJsonObject(replayResponse, 'replayed company response');
    expect(replayedCompany, 'replay body must deep-equal the first response').toEqual(
      patchedCompany
    );

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

    // Stale optimistic-lock rejection: same semantic patch with a NEW
    // idempotency key, the original stale expectedVersion, and a distinct
    // description must 409 with VERSION_CONFLICT and change nothing.
    const staleResponse = await api.call(
      'PATCH',
      ROUTES.portfolioCompanyPatch(companyId, fundId),
      'canary2.stale-patch-company',
      {
        headers: { 'Idempotency-Key': `g4-release-canary-stale-${randomUUID()}` },
        data: {
          expectedVersion,
          patch: { description: `release-canary-stale-${randomUUID()}` },
        },
      }
    );
    expect(staleResponse.status(), 'stale optimistic-lock patch must be rejected').toBe(409);
    const staleBody = await readJsonObject(staleResponse, 'stale patch rejection response');
    expect(staleBody['code']).toBe('VERSION_CONFLICT');

    const afterConflictResponse = await api.call(
      'GET',
      ROUTES.portfolioCompanyById(companyId, fundId),
      'canary2.reload-after-conflict'
    );
    expect(afterConflictResponse.status(), 'company must remain readable after conflict').toBe(
      200
    );
    const afterConflict = await readJsonObject(
      afterConflictResponse,
      'post-conflict company response'
    );
    expect(
      afterConflict,
      'rejected stale patch must not change the persisted replay state'
    ).toEqual(persistedCompany);
  });

  test('canary 3 exposes authoritative non-fallback modeling results', async () => {
    const api = requireClient(client);
    const fundId = canaryFundId;
    if (fundId === undefined) {
      throw new Error('[release-canaries] canary 1 did not provide a fund ID');
    }

    // waitForAuthoritativeResults strict-parses the response with the owning
    // shared contract; every assertion below runs against the parsed shape.
    const results = await waitForAuthoritativeResults(api, fundId);
    canary3Results = results;

    expect(results.fundId).toBe(fundId);
    expect(results.status).toBe('ready');

    const calculationState = results.lifecycle.calculationState;
    expect(calculationState.status).toBe('ready');
    expect(calculationState.configVersion).not.toBeNull();
    expect(calculationState.configVersion!).toBeGreaterThan(0);
    expect(calculationState.runId).not.toBeNull();
    expect(calculationState.runId!).toBeGreaterThan(0);
    requiredUuid(calculationState.correlationId, 'canary3 calculation correlation ID');
    expect(calculationState.dispatchState).not.toBeNull();
    expect(calculationState.expectedSnapshotTypes.length).toBeGreaterThan(0);
    for (const snapshotType of calculationState.expectedSnapshotTypes) {
      expect(
        calculationState.availableSnapshotTypes,
        `expected snapshot type ${snapshotType} must be available when ready`
      ).toContain(snapshotType);
    }
    const lastCalculatedAt = requiredString(
      calculationState.lastCalculatedAt,
      'canary3 lastCalculatedAt'
    );
    expect(Number.isNaN(Date.parse(lastCalculatedAt))).toBe(false);
    expect(calculationState.legacyEvidence).toBe(false);

    for (const sectionName of ['reserve', 'pacing'] as const) {
      const section = results.sections[sectionName];
      if (section.status !== 'available') {
        throw new Error(`[release-canaries] ${sectionName} section must be available`);
      }
      expect(section.source).toBe('fund_snapshots');
      expect(section.legacyEvidence).toBe(false);
    }
    // Typed payload spot checks on top of the schema parse (the parse itself
    // guarantees every contract-required payload field).
    if (results.sections.reserve.status === 'available') {
      expect(typeof results.sections.reserve.payload.totalAllocation).toBe('number');
      expect(Array.isArray(results.sections.reserve.payload.allocations)).toBe(true);
    }
    if (results.sections.pacing.status === 'available') {
      expect(typeof results.sections.pacing.payload.deploymentRate).toBe('number');
      expect(Array.isArray(results.sections.pacing.payload.deployments)).toBe(true);
    }
  });

  test('canary 4 reloads stable snapshot-backed results evidence', async () => {
    const api = requireClient(client);
    const fundId = canaryFundId;
    if (fundId === undefined) {
      throw new Error('[release-canaries] canary 1 did not provide a fund ID');
    }
    const firstRead = canary3Results;
    if (firstRead === undefined) {
      throw new Error('[release-canaries] canary 3 did not provide parsed results');
    }

    // fund-config's manifest-backed results read model is mounted by makeApp
    // and serves persisted fund_snapshots after canary 3 reaches ready.
    const reloadResponse = await api.call(
      'GET',
      ROUTES.fundResults(fundId),
      'canary4.reload-snapshot-results'
    );
    expect(reloadResponse.status(), 'snapshot-backed results reload must succeed').toBe(200);
    const reloaded = FundResultsReadV1Schema.parse(
      await readJsonObject(reloadResponse, 'reloaded results response')
    );

    // Stable projection: fund identity/status, the identity-bearing
    // calculation-state fields, and the persisted reserve and pacing sections
    // must reload identically. Documented exclusions (legitimately volatile
    // between the two reads, NOT stability failures):
    // - snapshot-type ARRAY ORDER: the producing query has no ORDER BY, so
    //   arrays compare as sets;
    // - availableSnapshotTypes MEMBERSHIP may grow and lastCalculatedAt may
    //   advance if a post-ready engine (e.g. flag-gated economics) lands a
    //   later snapshot -- compared as superset/monotonic instead;
    // - dispatchState may legitimately advance (partial -> dispatched);
    // - configState timestamps and scorecard/scenarios/waterfall/economics
    //   sections, which other canaries and later mutations may move.
    expect(reloaded.fundId).toBe(firstRead.fundId);
    expect(reloaded.status).toBe(firstRead.status);
    const firstState = firstRead.lifecycle.calculationState;
    const reloadedState = reloaded.lifecycle.calculationState;
    expect(reloadedState.status).toBe(firstState.status);
    expect(reloadedState.configVersion).toBe(firstState.configVersion);
    expect(reloadedState.runId).toBe(firstState.runId);
    expect(reloadedState.correlationId).toBe(firstState.correlationId);
    expect(reloadedState.legacyEvidence).toBe(firstState.legacyEvidence);
    expect(reloadedState.lastError).toBe(firstState.lastError);
    expect([...reloadedState.expectedSnapshotTypes].sort()).toEqual(
      [...firstState.expectedSnapshotTypes].sort()
    );
    for (const snapshotType of firstState.availableSnapshotTypes) {
      expect(
        reloadedState.availableSnapshotTypes,
        `previously available snapshot type ${snapshotType} must remain available`
      ).toContain(snapshotType);
    }
    const reloadedCalculatedAt = requiredString(
      reloadedState.lastCalculatedAt,
      'canary4 lastCalculatedAt'
    );
    const firstCalculatedAt = requiredString(
      firstState.lastCalculatedAt,
      'canary3 lastCalculatedAt'
    );
    expect(Date.parse(reloadedCalculatedAt)).toBeGreaterThanOrEqual(
      Date.parse(firstCalculatedAt)
    );
    expect(reloaded.sections.reserve).toEqual(firstRead.sections.reserve);
    expect(reloaded.sections.pacing).toEqual(firstRead.sections.pacing);
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

    // Replay the reserve calculation command under ONE idempotency key: the
    // identical second POST must return the exact stored 202 acknowledgement
    // with the same job and correlation identity, never a second run.
    const reserveIdempotencyKey = `g4-release-canary-reserve-${randomUUID()}`;
    const enqueueRequest = { data: { calculationMode: 'async_reserve_allocation' } } as const;
    const enqueueResponse = await api.call(
      'POST',
      ROUTES.scenarioCalculateReserve(fundId, scenarioSetId),
      'canary5.enqueue-scenario-calculation',
      {
        headers: { 'Idempotency-Key': reserveIdempotencyKey },
        ...enqueueRequest,
      }
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

    const replayEnqueueResponse = await api.call(
      'POST',
      ROUTES.scenarioCalculateReserve(fundId, scenarioSetId),
      'canary5.replay-enqueue-scenario-calculation',
      {
        headers: { 'Idempotency-Key': reserveIdempotencyKey },
        ...enqueueRequest,
      }
    );
    expect(replayEnqueueResponse.status(), 'replayed enqueue must return the stored 202').toBe(
      202
    );
    const replayEnqueueBody = await readJsonObject(
      replayEnqueueResponse,
      'canary5 replayed enqueue response'
    );
    expect(replayEnqueueBody, 'replayed 202 body must deep-equal the first').toEqual(enqueueBody);
    expect(replayEnqueueBody['jobId']).toBe(jobId);
    expect(replayEnqueueBody['correlationId']).toBe(calculationCorrelationId);

    // One bounded poll pass through the shared polling module, bound to the
    // exact enqueue identity; a typed timeout fails this canary and the
    // workflow finalizer then fails the exact current run.
    const pollResult = await pollReleaseCanaryWorkerStatus(
      { fundId, scenarioSetId, jobId, correlationId: calculationCorrelationId },
      {
        fetchStatus: canaryStatusFetch(api, fundId, scenarioSetId),
        deadlineMs: RELEASE_CANARY_WORKER_POLL_DEADLINE_MS,
      }
    );
    if (pollResult.kind !== 'succeeded') {
      throw new Error(
        `[release-canaries] canary5 worker poll timed out: ${JSON.stringify(pollResult)}`
      );
    }
    expect(pollResult.jobId).toBe(jobId);
    expect(pollResult.correlationId).toBe(calculationCorrelationId);
    expect(pollResult.snapshotId).toEqual(expect.any(Number));
    expect(Number.isNaN(Date.parse(pollResult.calculationStartedAt))).toBe(false);

    // Stable terminal evidence: a fresh status read must repeat the durable
    // success with the same job, correlation, and snapshot identity.
    const stableStatus = await canaryStatusFetch(api, fundId, scenarioSetId)();
    expect(stableStatus.status, 'terminal status must remain readable').toBe(200);
    const stableBody = requiredObject(stableStatus.body, 'canary5 stable status response');
    expect(stableBody['status']).toBe('succeeded');
    expect(stableBody['jobId']).toBe(jobId);
    expect(stableBody['correlationId']).toBe(calculationCorrelationId);
    expect(stableBody['snapshotId']).toBe(pollResult.snapshotId);
    expect(stableBody['calculationStartedAt']).toBe(pollResult.calculationStartedAt);
  });

  test('canary 6 proves an H9-qualified stored JSON report over a seeded financial truth', async () => {
    const api = requireClient(client);
    const fundId = canaryFundId;
    const companyId = canaryCompanyId;
    if (fundId === undefined || companyId === undefined) {
      throw new Error('[release-canaries] canaries 1-2 did not provide fund and company IDs');
    }
    if (canary3Results === undefined) {
      throw new Error('[release-canaries] canary 3 did not provide authoritative results');
    }
    const asOfDate = REPORT_AS_OF_DATE;

    // ---- Admin window: planning FMV mark + MOIC reconciliation only --------
    // The reconciler admin client exists exactly for this window. It never
    // touches any other route and is closed before the partner lifecycle runs.
    const adminContext = await request.newContext({
      baseURL: PRODUCTION_URL,
      extraHTTPHeaders: {
        'x-vercel-protection-bypass': VERCEL_AUTOMATION_BYPASS_SECRET,
      },
    });
    adminClient = new ReleaseCanaryClient(adminContext);
    const admin = adminClient;
    await admin.verifyReleaseIdentity();
    await admin.login(CANARY_RECONCILER_USERNAME, CANARY_RECONCILER_PASSWORD);

    // Negative authorization probe: the partner release-canary principal must
    // NOT hold planning-FMV approval authority -- the role boundary the
    // dedicated reconciler account exists for.
    const forbiddenFmvResponse = await api.call(
      'POST',
      ROUTES.planningFmvOverrides(fundId),
      'canary6.partner-fmv-forbidden',
      {
        headers: { 'Idempotency-Key': `g4-release-canary-forbidden-${randomUUID()}` },
        data: {
          companyId,
          markDate: asOfDate,
          fairValue: '1.000000',
          reason: 'Release canary negative authorization probe',
          source: {},
        },
      }
    );
    expect(
      forbiddenFmvResponse.status(),
      'partner principal must be denied planning-FMV authority'
    ).toBe(403);
    const forbiddenFmvBody = await readJsonObject(
      forbiddenFmvResponse,
      'partner planning-FMV denial response'
    );
    expect(
      forbiddenFmvBody['code'],
      'the denial must be the role boundary, not fund scope'
    ).toBe('planning_fmv_approval_forbidden');

    const fmvIdempotencyKey = `g4-release-canary-fmv-${randomUUID()}`;
    const fmvBody = {
      companyId,
      markDate: asOfDate,
      asOfDate,
      fairValue: '1250000.000000',
      currency: 'USD',
      confidenceLevel: 'medium',
      reason: 'Release canary financial-truth basis',
      methodologyNotes: 'Deterministic approved planning FMV for release canary',
      source: {},
    };
    const fmvResponse = await admin.call(
      'POST',
      ROUTES.planningFmvOverrides(fundId),
      'canary6.create-planning-fmv',
      { headers: { 'Idempotency-Key': fmvIdempotencyKey }, data: fmvBody }
    );
    expect(fmvResponse.status(), 'planning FMV creation must succeed').toBe(201);
    const fmvCreated = PlanningFmvOverrideCreateResponseSchema.parse(
      await readJsonObject(fmvResponse, 'planning FMV creation response')
    );
    expect(fmvCreated.replayed).toBe(false);
    expect(fmvCreated.valuationMark.companyId).toBe(companyId);
    expect(fmvCreated.valuationMark.fundId).toBe(fundId);
    expect(fmvCreated.valuationMark.status).toBe('approved');
    expect(fmvCreated.valuationMark.fairValue).toBe('1250000.000000');
    expect(Number(fmvCreated.valuationMark.fairValue)).toBeGreaterThan(0);
    const planningMarkId = fmvCreated.valuationMark.id;

    // Idempotent replay: identical key and body must return the stored mark
    // with no additive residue -- same request ID, same valuation-mark ID.
    const fmvReplayResponse = await admin.call(
      'POST',
      ROUTES.planningFmvOverrides(fundId),
      'canary6.replay-planning-fmv',
      { headers: { 'Idempotency-Key': fmvIdempotencyKey }, data: fmvBody }
    );
    expect(fmvReplayResponse.status(), 'planning FMV replay must return the stored mark').toBe(200);
    const fmvReplayed = PlanningFmvOverrideCreateResponseSchema.parse(
      await readJsonObject(fmvReplayResponse, 'planning FMV replay response')
    );
    expect(fmvReplayed.replayed).toBe(true);
    expect(fmvReplayed.requestId).toBe(fmvCreated.requestId);
    expect(fmvReplayed.valuationMark.id).toBe(planningMarkId);
    expect(fmvReplayed.valuationMark).toEqual(fmvCreated.valuationMark);

    // ---- Partner proves the seeded fact is served -------------------------
    const factsResponse = await api.call(
      'GET',
      ROUTES.actualsFacts(fundId, asOfDate),
      'canary6.actuals-facts'
    );
    expect(factsResponse.status(), 'actuals facts read must succeed').toBe(200);
    const facts = FundCompanyActualsFactsResponseSchema.parse(
      await readJsonObject(factsResponse, 'actuals facts response')
    );
    expect(facts.fundId).toBe(fundId);
    expect(facts.asOfDate).toBe(asOfDate);
    // Fail-closed gate: actuals facts must be nonempty before metric dry-run.
    if (facts.facts.length === 0) {
      throw new Error(
        '[release-canaries] actuals facts must be nonempty before metric dry-run can begin'
      );
    }
    expect(facts.facts, 'exactly one fact for the canary company').toHaveLength(1);
    const fact = facts.facts[0]!;
    expect(fact.companyId).toBe(companyId);
    expect(
      fact.approvedPlanningFmvMarkId,
      'the served fact must be bound to the exact created mark'
    ).toBe(planningMarkId);
    expect(fact.planningFmvStatus).toBe('active');
    expect(fact.latestPlanningFmvValue).toBe('1250000.000000');
    expect(fact.currency).toBe('USD');
    expect(fact.currencyStatus).toBe('base_currency');
    expect(Object.keys(fact.provenance).length).toBeGreaterThan(0);
    expect(fact.inputHash.length).toBeGreaterThan(0);

    // ---- Admin reconciliation, then the admin window closes ---------------
    // Deterministic key: scoped per fund (retries mint a fresh canary fund),
    // so one workflow attempt exercises create THEN replay under one key.
    const reconciliationIdempotencyKey = `g4-release-canary-reconciliation-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}`;
    const reconciliationResponse = await admin.call(
      'POST',
      ROUTES.moicReconciliations(fundId),
      'canary6.moic-reconciliation',
      { headers: { 'Idempotency-Key': reconciliationIdempotencyKey }, data: {} }
    );
    expect(reconciliationResponse.status(), 'MOIC reconciliation must succeed').toBe(201);
    const reconciliation = await readJsonObject(
      reconciliationResponse,
      'MOIC reconciliation response'
    );
    const reconciliationRunId = requiredString(reconciliation['runId'], 'reconciliation run ID');
    const reconciliationCreatedAt = requiredString(
      reconciliation['createdAt'],
      'reconciliation timestamp'
    );
    expect(Number.isNaN(Date.parse(reconciliationCreatedAt))).toBe(false);
    expect(reconciliation['replayed']).toBe(false);

    // Idempotent replay: the identical POST under the same key must return
    // the stored run, never mint a second reconciliation.
    const reconciliationReplayResponse = await admin.call(
      'POST',
      ROUTES.moicReconciliations(fundId),
      'canary6.replay-moic-reconciliation',
      { headers: { 'Idempotency-Key': reconciliationIdempotencyKey }, data: {} }
    );
    expect(
      reconciliationReplayResponse.status(),
      'reconciliation replay must return the stored run'
    ).toBe(200);
    const reconciliationReplayed = await readJsonObject(
      reconciliationReplayResponse,
      'MOIC reconciliation replay response'
    );
    expect(reconciliationReplayed['replayed']).toBe(true);
    expect(reconciliationReplayed['runId']).toBe(reconciliationRunId);
    // The admin client's work is done; close it before any report mutation.
    // close() is idempotent, so the afterAll sweep stays safe.
    await admin.close();

    // ---- Partner-owned report lifecycle -----------------------------------
    const metricRequest = {
      asOfDate,
      runType: 'quarterly_report',
      perspective: 'lp_net',
      sourceEventIds: [],
      sourceMarkIds: [planningMarkId],
      sourceMarkSelection: 'explicit',
    };
    const dryRunResponse = await api.call(
      'POST',
      ROUTES.metricDryRun(fundId),
      'canary6.metric-dry-run',
      { data: metricRequest }
    );
    expect(
      dryRunResponse.status(),
      dryRunResponse.status() === 429
        ? 'canary 6 hit the metric-run rate limit (120/hr/user); a release re-run within the hour exhausts the canary principal budget'
        : 'metric dry-run must succeed'
    ).toBe(200);
    const dryRun = MetricRunDryRunResponseSchema.parse(
      await readJsonObject(dryRunResponse, 'metric dry-run response')
    );
    // The preview must carry mark-derived, nonzero financial content -- not
    // actionability metadata alone. The canary company's approved FMV mark is
    // the fund's entire NAV basis at this as-of date.
    const previewNav = requiredString(dryRun.results.currentNav, 'dry-run current NAV');
    expect(Number(previewNav)).toBeGreaterThan(0);
    expect(
      dryRun.results.markConfidenceMix.medium,
      'the canary mark must be in the preview confidence mix'
    ).toBeGreaterThanOrEqual(1);

    const commitResponse = await api.call(
      'POST',
      ROUTES.metricCommit(fundId),
      'canary6.metric-commit',
      { data: { ...metricRequest, previewHash: dryRun.previewHash } }
    );
    expect(commitResponse.status(), 'metric commit must insert').toBe(201);
    const committed = MetricRunCommitResponseSchema.parse(
      await readJsonObject(commitResponse, 'metric commit response')
    );
    expect(committed.inserted).toBe(true);
    const metricRunId = committed.metricRunId;

    // Replay the commit under the identical natural key before advancing.
    const commitReplayResponse = await api.call(
      'POST',
      ROUTES.metricCommit(fundId),
      'canary6.replay-metric-commit',
      { data: { ...metricRequest, previewHash: dryRun.previewHash } }
    );
    expect(commitReplayResponse.status(), 'metric commit replay must return the stored run').toBe(
      200
    );
    const commitReplayed = MetricRunCommitResponseSchema.parse(
      await readJsonObject(commitReplayResponse, 'metric commit replay response')
    );
    expect(commitReplayed.inserted).toBe(false);
    expect(commitReplayed.metricRunId).toBe(metricRunId);
    expect(commitReplayed.inputsHash).toBe(committed.inputsHash);

    const evidenceBody = {
      idempotencyKey: `release-canary-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}-metric-evidence`,
      evidenceSource: 'gp_estimate',
      sourceDate: asOfDate,
      confidentiality: 'internal',
      redactionRequired: false,
    };
    const evidenceResponse = await api.call(
      'POST',
      ROUTES.metricEvidenceRecords(fundId, metricRunId),
      'canary6.create-evidence',
      { data: evidenceBody }
    );
    expect(evidenceResponse.status(), 'evidence creation must insert').toBe(201);
    const evidenceCreated = MetricRunEvidenceCreateResponseSchema.parse(
      await readJsonObject(evidenceResponse, 'evidence creation response')
    );
    expect(evidenceCreated.inserted).toBe(true);
    expect(evidenceCreated.record.confidentiality).toBe('internal');
    expect(evidenceCreated.record.redactionRequired).toBe(false);
    const evidenceRecordId = evidenceCreated.record.id;

    const evidenceReplayResponse = await api.call(
      'POST',
      ROUTES.metricEvidenceRecords(fundId, metricRunId),
      'canary6.replay-create-evidence',
      { data: evidenceBody }
    );
    expect(evidenceReplayResponse.status(), 'evidence replay must return the stored record').toBe(
      200
    );
    const evidenceReplayed = MetricRunEvidenceCreateResponseSchema.parse(
      await readJsonObject(evidenceReplayResponse, 'evidence replay response')
    );
    expect(evidenceReplayed.inserted).toBe(false);
    expect(evidenceReplayed.record).toEqual(evidenceCreated.record);

    const approveResponse = await api.call(
      'POST',
      ROUTES.metricApprove(fundId, metricRunId),
      'canary6.metric-approve',
      { data: { expectedVersion: 1 } }
    );
    expect(approveResponse.status(), 'metric approve must succeed').toBe(200);
    const approved = MetricRunLifecycleResponseSchema.parse(
      await readJsonObject(approveResponse, 'metric approve response')
    );
    expect(approved.metricRun.status).toBe('approved');
    expect(approved.metricRun.version).toBe(2);

    const lockResponse = await api.call(
      'POST',
      ROUTES.metricLock(fundId, metricRunId),
      'canary6.metric-lock',
      { data: { expectedVersion: 2 } }
    );
    expect(lockResponse.status(), 'metric lock must succeed').toBe(200);
    const locked = MetricRunLifecycleResponseSchema.parse(
      await readJsonObject(lockResponse, 'metric lock response')
    );
    expect(locked.metricRun.status).toBe('locked');
    expect(locked.metricRun.version).toBe(3);

    const narrativeTypes = ['no_dpi', 'methodology', 'portfolio_update', 'risk_disclosure'] as const;
    const narrativeRefs: Array<{
      narrativeType: (typeof narrativeTypes)[number];
      narrativeRunId: number;
      expectedVersion: number;
    }> = [];
    for (const narrativeType of narrativeTypes) {
      const createNarrativeResponse = await api.call(
        'POST',
        ROUTES.narrativeRuns(fundId, metricRunId),
        `canary6.create-narrative.${narrativeType}`,
        { data: { narrativeType } }
      );
      expect(
        createNarrativeResponse.status(),
        `narrative ${narrativeType} creation must insert`
      ).toBe(201);
      const createdNarrative = NarrativeRunCreateResponseSchema.parse(
        await readJsonObject(createNarrativeResponse, `narrative ${narrativeType} creation response`)
      );
      expect(createdNarrative.inserted).toBe(true);
      const narrativeRunId = createdNarrative.record.narrativeRunId;

      // Replay the create under the identical natural key before advancing.
      const narrativeReplayResponse = await api.call(
        'POST',
        ROUTES.narrativeRuns(fundId, metricRunId),
        `canary6.replay-create-narrative.${narrativeType}`,
        { data: { narrativeType } }
      );
      expect(
        narrativeReplayResponse.status(),
        `narrative ${narrativeType} replay must return the stored run`
      ).toBe(200);
      const replayedNarrative = NarrativeRunCreateResponseSchema.parse(
        await readJsonObject(narrativeReplayResponse, `narrative ${narrativeType} replay response`)
      );
      expect(replayedNarrative.inserted).toBe(false);
      expect(replayedNarrative.record.narrativeRunId).toBe(narrativeRunId);

      const editResponse = await api.call(
        'PATCH',
        ROUTES.narrativeRunById(fundId, metricRunId, narrativeRunId),
        `canary6.edit-narrative.${narrativeType}`,
        {
          data: {
            expectedVersion: 1,
            editedText: `Release canary ${narrativeType} narrative for workflow run ${GITHUB_RUN_ID} attempt ${GITHUB_RUN_ATTEMPT}.`,
          },
        }
      );
      expect(editResponse.status(), `narrative ${narrativeType} edit must succeed`).toBe(200);
      NarrativeRunLifecycleResponseSchema.parse(
        await readJsonObject(editResponse, `narrative ${narrativeType} edit response`)
      );

      const reviewResponse = await api.call(
        'POST',
        ROUTES.narrativeReview(fundId, metricRunId, narrativeRunId),
        `canary6.review-narrative.${narrativeType}`,
        { data: { expectedVersion: 2 } }
      );
      expect(reviewResponse.status(), `narrative ${narrativeType} review must succeed`).toBe(200);
      NarrativeRunLifecycleResponseSchema.parse(
        await readJsonObject(reviewResponse, `narrative ${narrativeType} review response`)
      );

      const approveNarrativeResponse = await api.call(
        'POST',
        ROUTES.narrativeApprove(fundId, metricRunId, narrativeRunId),
        `canary6.approve-narrative.${narrativeType}`,
        { data: { expectedVersion: 3 } }
      );
      expect(
        approveNarrativeResponse.status(),
        `narrative ${narrativeType} approve must succeed`
      ).toBe(200);
      const approvedNarrative = NarrativeRunLifecycleResponseSchema.parse(
        await readJsonObject(approveNarrativeResponse, `narrative ${narrativeType} approve response`)
      );
      expect(approvedNarrative.record.status).toBe('approved');
      expect(approvedNarrative.record.version).toBe(4);
      narrativeRefs.push({ narrativeType, narrativeRunId, expectedVersion: 4 });
    }

    const assembleBody = {
      expectedMetricRunVersion: 3,
      expectedNarratives: narrativeRefs,
    };
    const assembleResponse = await api.call(
      'POST',
      ROUTES.reportPackage(fundId, metricRunId),
      'canary6.assemble-package',
      { data: assembleBody }
    );
    expect(assembleResponse.status(), 'report package assembly must insert').toBe(201);
    const assembled = ReportPackageAssembleResponseSchema.parse(
      await readJsonObject(assembleResponse, 'report package assembly response')
    );
    expect(assembled.inserted).toBe(true);
    const reportPackageId = assembled.record.reportPackageId;
    const h9Metadata = assembled.record.h9Metadata;
    if (h9Metadata === null) {
      throw new Error('[release-canaries] assembled package must carry H9 metadata');
    }
    expect(h9Metadata.actionabilityStatus).toBe('actionable');
    expect(h9Metadata.fingerprintHash).toMatch(/^[a-f0-9]{64}$/);

    // Replay the assembly under the identical contract inputs before export.
    const assembleReplayResponse = await api.call(
      'POST',
      ROUTES.reportPackage(fundId, metricRunId),
      'canary6.replay-assemble-package',
      { data: assembleBody }
    );
    expect(
      assembleReplayResponse.status(),
      'package assembly replay must return the stored package'
    ).toBe(200);
    const assembleReplayed = ReportPackageAssembleResponseSchema.parse(
      await readJsonObject(assembleReplayResponse, 'package assembly replay response')
    );
    expect(assembleReplayed.inserted).toBe(false);
    expect(assembleReplayed.record.reportPackageId).toBe(reportPackageId);
    expect(assembleReplayed.record.version).toBe(assembled.record.version);

    const storedExportResponse = await api.call(
      'POST',
      ROUTES.storedJsonExport(fundId, metricRunId),
      'canary6.stored-json-export',
      { data: {} }
    );
    expect(storedExportResponse.status(), 'stored JSON export must insert').toBe(201);
    const storedExport = ReportPackageJsonStoredExportResponseSchema.parse(
      await readJsonObject(storedExportResponse, 'stored JSON export response')
    );
    expect(storedExport.inserted).toBe(true);
    expect(storedExport.record.status).toBe('ready');

    const storedExportReplayResponse = await api.call(
      'POST',
      ROUTES.storedJsonExport(fundId, metricRunId),
      'canary6.replay-stored-json-export',
      { data: {} }
    );
    expect(
      storedExportReplayResponse.status(),
      'stored export replay must return the stored artifact row'
    ).toBe(200);
    const storedExportReplayed = ReportPackageJsonStoredExportResponseSchema.parse(
      await readJsonObject(storedExportReplayResponse, 'stored JSON export replay response')
    );
    expect(storedExportReplayed.inserted).toBe(false);
    expect(storedExportReplayed.record.reportPackageExportId).toBe(
      storedExport.record.reportPackageExportId
    );
    expect(storedExportReplayed.record.contentHash).toBe(storedExport.record.contentHash);

    // ---- Authoritative artifact validation --------------------------------
    const artifactResponse = await api.call(
      'GET',
      ROUTES.storedJsonArtifact(fundId, metricRunId),
      'canary6.stored-json-artifact'
    );
    expect(artifactResponse.status(), 'stored JSON artifact read must succeed').toBe(200);
    const artifact = ReportPackageJsonStoredArtifactResponseSchema.parse(
      await readJsonObject(artifactResponse, 'stored JSON artifact response')
    );

    expect(artifact.record.fundId).toBe(fundId);
    expect(artifact.record.metricRunId).toBe(metricRunId);
    expect(artifact.record.reportPackageId).toBe(reportPackageId);
    expect(artifact.record.format).toBe('json');
    expect(artifact.record.status).toBe('ready');
    expect(artifact.record.contentHashAlgorithm).toBe('sha256');
    expect(artifact.record.artifactSizeBytes).toBeGreaterThan(0);
    expect(artifact.record.contentHash).toBe(artifact.export.contentHash);
    // The stored artifact GET must serve the exact stored document -- never a
    // latest-database substitution. Recomputing the canonical hash over the
    // exact served artifact fields with the pure shared helper proves it.
    const recomputedHash = sha256CanonicalJson({
      exportVersion: artifact.export.exportVersion,
      format: artifact.export.format,
      source: artifact.export.source,
      renderModel: artifact.export.renderModel,
    });
    expect(recomputedHash, 'recomputed canonical hash must equal the stored content hash').toBe(
      artifact.record.contentHash
    );

    expect(artifact.export.source.h9Stamp.actionabilityStatus).toBe('actionable');
    expect(artifact.export.source.h9Stamp.fingerprintHash).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.export.source.reportPackageStatus).toBe('assembled');
    expect(artifact.export.source.fundId).toBe(fundId);
    expect(artifact.export.source.metricRunId).toBe(metricRunId);
    expect(artifact.export.renderModel.source.fundId).toBe(fundId);
    expect(artifact.export.renderModel.source.metricRunId).toBe(metricRunId);

    // Metric sections must carry meaningful nonzero financial content
    // attributable to the exact source mark.
    expect(artifact.export.renderModel.metricSections.length).toBeGreaterThan(0);
    const nonzeroRows = artifact.export.renderModel.metricSections
      .flatMap((section) => section.rows)
      .filter((row) => row.value !== null && Number(row.value) > 0);
    expect(nonzeroRows.length, 'metric sections must contain nonzero financial content').
      toBeGreaterThan(0);
    expect(artifact.export.renderModel.references.sourceMarkIds).toEqual([planningMarkId]);

    const narrativeSections = artifact.export.renderModel.narrativeSections;
    expect(narrativeSections).toHaveLength(4);
    expect([...narrativeSections.map((section) => section.narrativeType)].sort()).toEqual(
      [...narrativeTypes].sort()
    );
    for (const ref of narrativeRefs) {
      const section = narrativeSections.find(
        (candidate) => candidate.narrativeType === ref.narrativeType
      );
      if (!section) {
        throw new Error(`[release-canaries] narrative section ${ref.narrativeType} is missing`);
      }
      expect(section.narrativeRunId).toBe(ref.narrativeRunId);
    }
    expect(artifact.export.renderModel.references.evidenceRecordIds).toContain(evidenceRecordId);
  });
});
