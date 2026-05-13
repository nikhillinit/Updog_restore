import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  DemoProfileTargetTables,
  type DemoProfileImportBundle,
  type DemoProfileTargetTable,
} from '@shared/contracts/demo-profile-import.contract';
import { isUnifiedFundMetrics, type UnifiedFundMetrics } from '@shared/types/metrics';
import {
  DemoProfileImportError,
  DrizzleDemoProfileImportStore,
  assertDemoProfileImportPersistentStorage,
  loadDemoProfileBundleFromEnv,
  loadDemoProfileBundleFromPath,
  runDemoProfileDryRun,
  safeDemoProfileError,
  type DemoProfileImportDatabase,
  type DemoProfileImportStore,
} from '../server/services/demo-profile-import-service';
import { getProfessionalDemoRuntimeConfigurationError } from '../server/storage-runtime-policy';

type VerificationLayer = 'storage' | 'api' | 'config';

export interface DemoProfileVerificationIssue {
  layer: VerificationLayer;
  code: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

export interface DemoProfileExpectedFacts {
  datasetId: string;
  countsByTable: Record<DemoProfileTargetTable, number>;
  totalInvested: number;
  currentNav: number;
  activeCompanies: number;
  defaultBaselineExpected: boolean;
}

export interface DemoProfileStorageVerification {
  ledgerRows: number;
  countsByTable: Record<DemoProfileTargetTable, number>;
  missingTargets: Array<{
    targetTable: DemoProfileTargetTable;
    targetIdText: string;
    sourceKey: string;
  }>;
}

export interface DemoProfileApiVerification {
  url: string;
  metrics?: Pick<UnifiedFundMetrics, 'fundId' | 'fundName' | 'actual' | 'lastUpdated'>;
}

export interface DemoProfileVerificationReport {
  passed: boolean;
  fundId: number;
  expected: DemoProfileExpectedFacts;
  storage: DemoProfileStorageVerification;
  api?: DemoProfileApiVerification;
  issues: DemoProfileVerificationIssue[];
}

interface VerifyDemoProfileOptions {
  fundId?: number;
  inputPath?: string;
  envPayload?: string;
  apiBaseUrl?: string;
  authToken?: string;
  authTokenEnv?: string;
  requireApi: boolean;
  expectedFundSize?: number;
}

export interface VerifyDemoProfileCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface VerifyDemoProfileCliStreams {
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
}

interface VerifyDemoProfileCliProcess {
  exitCode?: number;
}

function emptyTableCounts(): Record<DemoProfileTargetTable, number> {
  return Object.fromEntries(DemoProfileTargetTables.map((table) => [table, 0])) as Record<
    DemoProfileTargetTable,
    number
  >;
}

function parseArgs(argv: string[]): VerifyDemoProfileOptions {
  const options: VerifyDemoProfileOptions = {
    requireApi: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    switch (arg) {
      case '--fund-id':
        options.fundId = Number.parseInt(requireValue(argv, ++index, arg), 10);
        break;
      case '--input':
        options.inputPath = requireValue(argv, ++index, arg);
        break;
      case '--env-payload':
        options.envPayload = requireValue(argv, ++index, arg);
        break;
      case '--api-base-url':
        options.apiBaseUrl = requireValue(argv, ++index, arg);
        break;
      case '--auth-token':
        options.authToken = requireValue(argv, ++index, arg);
        break;
      case '--auth-token-env':
        options.authTokenEnv = requireValue(argv, ++index, arg);
        break;
      case '--require-api':
        options.requireApi = true;
        break;
      case '--expected-fund-size':
        options.expectedFundSize = parsePositiveNumber(requireValue(argv, ++index, arg), arg);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parsePositiveNumber(value: string, flag: string): number {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (trimmed.length === 0 || !Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number`);
  }
  return parsed;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function requireFundId(options: VerifyDemoProfileOptions): number {
  if (options.fundId === undefined || !Number.isInteger(options.fundId) || options.fundId <= 0) {
    throw new Error('--fund-id must be a positive integer');
  }
  return options.fundId;
}

function loadBundle(options: VerifyDemoProfileOptions, env: NodeJS.ProcessEnv) {
  if (options.inputPath !== undefined && options.envPayload !== undefined) {
    throw new Error('Choose only one input source: --input or --env-payload');
  }
  if (options.inputPath !== undefined) {
    return loadDemoProfileBundleFromPath(options.inputPath);
  }
  if (options.envPayload !== undefined) {
    return loadDemoProfileBundleFromEnv(env, options.envPayload);
  }
  throw new Error('Missing input source: provide --input or --env-payload');
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? 'active')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

function isLiveCompanyStatus(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return ![
    'exited',
    'exit',
    'realized',
    'realised',
    'written-off',
    'write-off',
    'writtenoff',
    'failed',
    'lost',
    'inactive',
  ].includes(normalized);
}

export function buildExpectedDemoProfileFacts(
  bundle: DemoProfileImportBundle
): DemoProfileExpectedFacts {
  const preview = runDemoProfileDryRun(bundle);
  const countsByTable = emptyTableCounts();
  for (const row of preview.rows) {
    countsByTable[row.targetTable] += 1;
  }

  const companySourceKeysWithInvestments = new Set(
    bundle.sections.investments.map((investment) => investment.companySourceKey)
  );
  const directInvested = bundle.sections.investments.reduce(
    (sum, investment) => sum + toNumber(investment.amount),
    0
  );
  const legacyCompanyInvested = bundle.sections.portfolioCompanies
    .filter((company) => !companySourceKeysWithInvestments.has(company.sourceKey))
    .reduce((sum, company) => sum + toNumber(company.investmentAmount), 0);
  const totalInvested = directInvested + legacyCompanyInvested;
  const activeCompanies = bundle.sections.portfolioCompanies.filter((company) =>
    isLiveCompanyStatus(company.status)
  );
  const currentNav = activeCompanies.reduce(
    (sum, company) => sum + toNumber(company.currentValuation),
    0
  );

  return {
    datasetId: bundle.datasetId,
    countsByTable,
    totalInvested,
    currentNav,
    activeCompanies: activeCompanies.length,
    defaultBaselineExpected: bundle.sections.fundBaselines.some(
      (baseline) => baseline.isDefault === true
    ),
  };
}

function addIssue(
  issues: DemoProfileVerificationIssue[],
  issue: DemoProfileVerificationIssue
): void {
  issues.push(issue);
}

function assertClose(
  issues: DemoProfileVerificationIssue[],
  layer: VerificationLayer,
  code: string,
  label: string,
  actual: number,
  expected: number
): void {
  const tolerance = Math.max(1, Math.abs(expected) * 0.0001);
  if (Math.abs(actual - expected) > tolerance) {
    addIssue(issues, {
      layer,
      code,
      message: `${label} mismatch.`,
      expected,
      actual,
    });
  }
}

export async function verifyDemoProfileStorageWithStore(
  store: DemoProfileImportStore,
  input: { fundId: number; bundle: DemoProfileImportBundle }
): Promise<{
  expected: DemoProfileExpectedFacts;
  storage: DemoProfileStorageVerification;
  issues: DemoProfileVerificationIssue[];
}> {
  const expected = buildExpectedDemoProfileFacts(input.bundle);
  const issues: DemoProfileVerificationIssue[] = [];
  const fund = await store.getFund(input.fundId);
  if (fund === null) {
    addIssue(issues, {
      layer: 'storage',
      code: 'FUND_NOT_FOUND',
      message: 'Target fund was not found in storage.',
      expected: input.fundId,
      actual: null,
    });
  }

  const rows = await store.listLedgerRows(input.fundId, input.bundle.datasetId);
  const countsByTable = emptyTableCounts();
  const missingTargets: DemoProfileStorageVerification['missingTargets'] = [];

  for (const row of rows) {
    countsByTable[row.targetTable] += 1;
    if (!(await store.targetExists(row))) {
      missingTargets.push({
        targetTable: row.targetTable,
        targetIdText: row.targetIdText,
        sourceKey: row.sourceKey,
      });
    }
  }

  for (const table of DemoProfileTargetTables) {
    if (countsByTable[table] !== expected.countsByTable[table]) {
      addIssue(issues, {
        layer: 'storage',
        code: 'LEDGER_COUNT_MISMATCH',
        message: `Import ledger count mismatch for ${table}.`,
        expected: expected.countsByTable[table],
        actual: countsByTable[table],
      });
    }
  }

  if (missingTargets.length > 0) {
    addIssue(issues, {
      layer: 'storage',
      code: 'LEDGER_TARGETS_MISSING',
      message: 'One or more import ledger rows point to missing target records.',
      actual: missingTargets,
    });
  }

  return {
    expected,
    storage: {
      ledgerRows: rows.length,
      countsByTable,
      missingTargets,
    },
    issues,
  };
}

function readAuthToken(
  options: VerifyDemoProfileOptions,
  env: NodeJS.ProcessEnv
): string | undefined {
  if (options.authToken !== undefined) return options.authToken;
  const variableName = options.authTokenEnv ?? 'DEMO_PROFILE_VERIFY_AUTH_TOKEN';
  return env[variableName];
}

async function verifyApi(input: {
  fundId: number;
  expected: DemoProfileExpectedFacts;
  apiBaseUrl: string;
  authToken?: string;
  expectedFundSize?: number;
}): Promise<{
  api: DemoProfileApiVerification;
  issues: DemoProfileVerificationIssue[];
}> {
  const endpoint = new URL(`/api/funds/${input.fundId}/metrics`, input.apiBaseUrl);
  endpoint.searchParams.set('skipProjections', 'true');
  endpoint.searchParams.set('skipCache', 'true');
  endpoint.searchParams.set('reason', 'demo-profile-verify');

  const headers: Record<string, string> = {};
  if (input.authToken !== undefined && input.authToken.length > 0) {
    headers['authorization'] = `Bearer ${input.authToken}`;
  }

  const issues: DemoProfileVerificationIssue[] = [];
  const response = await fetch(endpoint, { headers });
  if (!response.ok) {
    addIssue(issues, {
      layer: 'api',
      code: 'API_READBACK_FAILED',
      message: `API readback failed with HTTP ${response.status}.`,
      actual: await response.text().catch(() => ''),
    });
    return { api: { url: endpoint.toString() }, issues };
  }

  const payload: unknown = await response.json();
  if (!isUnifiedFundMetrics(payload)) {
    addIssue(issues, {
      layer: 'api',
      code: 'API_METRICS_SHAPE_INVALID',
      message: 'API metrics payload did not match UnifiedFundMetrics shape.',
    });
    return { api: { url: endpoint.toString() }, issues };
  }

  if (payload.fundId !== input.fundId) {
    addIssue(issues, {
      layer: 'api',
      code: 'API_FUND_ID_MISMATCH',
      message: 'API metrics returned the wrong fund ID.',
      expected: input.fundId,
      actual: payload.fundId,
    });
  }

  if (input.expectedFundSize !== undefined) {
    assertClose(
      issues,
      'api',
      'API_FUND_SIZE_MISMATCH',
      'Fund size',
      payload.actual.totalCommitted,
      input.expectedFundSize
    );
  }

  assertClose(
    issues,
    'api',
    'API_TOTAL_INVESTED_MISMATCH',
    'Total invested',
    payload.actual.totalDeployed,
    input.expected.totalInvested
  );
  assertClose(
    issues,
    'api',
    'API_CURRENT_NAV_MISMATCH',
    'Current NAV',
    payload.actual.currentNAV,
    input.expected.currentNav
  );
  if (payload.actual.activeCompanies !== input.expected.activeCompanies) {
    addIssue(issues, {
      layer: 'api',
      code: 'API_ACTIVE_COMPANIES_MISMATCH',
      message: 'Active company count mismatch.',
      expected: input.expected.activeCompanies,
      actual: payload.actual.activeCompanies,
    });
  }

  const expectedDeploymentRate =
    payload.actual.totalCommitted > 0
      ? (payload.actual.totalDeployed / payload.actual.totalCommitted) * 100
      : 0;
  assertClose(
    issues,
    'api',
    'API_DEPLOYMENT_RATE_INVARIANT_FAILED',
    'Deployment rate',
    payload.actual.deploymentRate,
    expectedDeploymentRate
  );
  assertClose(
    issues,
    'api',
    'API_REMAINING_CAPITAL_INVARIANT_FAILED',
    'Remaining capital',
    payload.actual.totalUncalled,
    payload.actual.totalCommitted - payload.actual.totalCalled
  );

  if (payload.actual.totalDeployed <= 0 && payload.actual.currentNAV > 0) {
    addIssue(issues, {
      layer: 'api',
      code: 'API_ZERO_INVESTED_NONZERO_NAV',
      message: 'API returned nonzero current NAV with no deployed capital.',
      actual: {
        totalDeployed: payload.actual.totalDeployed,
        currentNAV: payload.actual.currentNAV,
      },
    });
  }

  return {
    api: {
      url: endpoint.toString(),
      metrics: {
        fundId: payload.fundId,
        fundName: payload.fundName,
        actual: payload.actual,
        lastUpdated: payload.lastUpdated,
      },
    },
    issues,
  };
}

export async function verifyDemoProfile(input: {
  fundId: number;
  bundle: DemoProfileImportBundle;
  apiBaseUrl?: string;
  authToken?: string;
  requireApi?: boolean;
  expectedFundSize?: number;
  env?: NodeJS.ProcessEnv;
  database?: DemoProfileImportDatabase;
}): Promise<DemoProfileVerificationReport> {
  const env = input.env ?? process.env;
  const professionalDemoError = getProfessionalDemoRuntimeConfigurationError(
    {
      ...env,
      ...(input.apiBaseUrl !== undefined ? { BASE_URL: input.apiBaseUrl } : {}),
    },
    { requireApiTarget: input.requireApi === true || input.apiBaseUrl !== undefined }
  );
  if (professionalDemoError !== null) {
    throw new DemoProfileImportError(
      409,
      'DEMO_PROFILE_PROFESSIONAL_RUNTIME_INVALID',
      professionalDemoError
    );
  }

  assertDemoProfileImportPersistentStorage(env);
  const database = await resolveDemoProfileImportDatabase(input.database);

  const storageResult = await database.transaction(async (tx) =>
    verifyDemoProfileStorageWithStore(new DrizzleDemoProfileImportStore(tx), {
      fundId: input.fundId,
      bundle: input.bundle,
    })
  );

  const issues = [...storageResult.issues];
  let api: DemoProfileApiVerification | undefined;

  if (input.apiBaseUrl !== undefined) {
    const apiResult = await verifyApi({
      fundId: input.fundId,
      expected: storageResult.expected,
      apiBaseUrl: input.apiBaseUrl,
      authToken: input.authToken,
      expectedFundSize: input.expectedFundSize,
    });
    api = apiResult.api;
    issues.push(...apiResult.issues);
  } else if (input.requireApi === true) {
    addIssue(issues, {
      layer: 'config',
      code: 'API_BASE_URL_REQUIRED',
      message: 'API verification requires --api-base-url when --require-api is set.',
    });
  }

  return {
    passed: issues.length === 0,
    fundId: input.fundId,
    expected: storageResult.expected,
    storage: storageResult.storage,
    ...(api !== undefined && { api }),
    issues,
  };
}

async function resolveDemoProfileImportDatabase(
  database: DemoProfileImportDatabase | undefined
): Promise<DemoProfileImportDatabase> {
  if (database !== undefined) {
    return database;
  }
  const dbModule = await import('../server/db');
  return dbModule.db;
}

function safeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function runVerifyDemoProfileCli(
  argv = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): Promise<VerifyDemoProfileCliResult> {
  try {
    const options = parseArgs(argv);
    const fundId = requireFundId(options);
    const bundle = loadBundle(options, env);
    const apiBaseUrl = options.apiBaseUrl ?? env.BASE_URL;
    const report = await verifyDemoProfile({
      fundId,
      bundle,
      apiBaseUrl,
      authToken: readAuthToken(options, env),
      requireApi: options.requireApi,
      expectedFundSize: options.expectedFundSize,
      env,
    });

    return {
      exitCode: report.passed ? 0 : 1,
      stdout: safeJson({ mode: 'verify', report }),
      stderr: '',
    };
  } catch (error) {
    const safeError =
      error instanceof Error && error.name === 'Error'
        ? { code: 'INVALID_CLI_ARGUMENTS', status: 400, message: error.message }
        : safeDemoProfileError(error);
    return {
      exitCode: safeError.status >= 500 ? 1 : 2,
      stdout: '',
      stderr: safeJson({ error: safeError }),
    };
  }
}

export async function runVerifyDemoProfileCliMain(
  argv = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  streams: VerifyDemoProfileCliStreams = process,
  processLike: VerifyDemoProfileCliProcess = process
): Promise<void> {
  try {
    const result = await runVerifyDemoProfileCli(argv, env);
    if (result.stdout.length > 0) {
      streams.stdout.write(result.stdout);
    }
    if (result.stderr.length > 0) {
      streams.stderr.write(result.stderr);
    }
    processLike.exitCode = result.exitCode;
  } catch {
    processLike.exitCode = 1;
    try {
      streams.stderr.write(
        safeJson({
          error: {
            code: 'VERIFY_BOOTSTRAP_FAILED',
            status: 500,
            message: 'Demo profile verification failed before producing a safe result.',
          },
        })
      );
    } catch {
      // If stderr is unavailable there is no safe fallback channel.
    }
  }
}

const invokedPath = process.argv[1] === undefined ? '' : path.resolve(process.argv[1]);
if (fileURLToPath(import.meta.url) === invokedPath) {
  void runVerifyDemoProfileCliMain();
}
