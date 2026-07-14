import fs from 'node:fs';
import path from 'node:path';

import request, { type Test } from 'supertest';
import * as ts from 'typescript';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Route = readonly ['GET' | 'POST', string];

const actionabilityState = vi.hoisted(() => ({
  resolveForFund: vi.fn(),
}));

const reportServiceState = vi.hoisted(() => ({
  getReportPackage: vi.fn(),
  assembleReportPackage: vi.fn(),
  getRenderModel: vi.fn(),
  getJsonExport: vi.fn(),
  createStoredJsonExport: vi.fn(),
  getStoredJsonExport: vi.fn(),
  getStoredJsonArtifact: vi.fn(),
  createStoredCsvExport: vi.fn(),
  getStoredCsvExport: vi.fn(),
  getStoredCsvArtifact: vi.fn(),
}));

vi.mock('../../../server/services/fund-calculation-mode-service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../server/services/fund-calculation-mode-service')
  >()),
  createMoicActionabilityResolver: () => ({
    resolveForFund: actionabilityState.resolveForFund,
  }),
}));

vi.mock('../../../server/services/lp-reporting/report-package-service', () => ({
  getMetricRunReportPackage: reportServiceState.getReportPackage,
  assembleMetricRunReportPackage: reportServiceState.assembleReportPackage,
}));

vi.mock('../../../server/services/lp-reporting/report-package-render-model-service', () => ({
  getMetricRunReportPackageRenderModel: reportServiceState.getRenderModel,
}));

vi.mock('../../../server/services/lp-reporting/report-package-json-export-service', () => ({
  getMetricRunReportPackageJsonExport: reportServiceState.getJsonExport,
  ReportPackageJsonExportBlockedError: class ReportPackageJsonExportBlockedError extends Error {},
}));

vi.mock('../../../server/services/lp-reporting/report-package-json-stored-export-service', () => ({
  createMetricRunReportPackageStoredJsonExport: reportServiceState.createStoredJsonExport,
  getMetricRunReportPackageStoredJsonExport: reportServiceState.getStoredJsonExport,
  getMetricRunReportPackageStoredJsonArtifact: reportServiceState.getStoredJsonArtifact,
  reportPackageExportContentHashConflictBody: vi.fn(),
  reportPackageExportNotFoundBody: vi.fn(),
  ReportPackageExportContentHashConflictError: class ReportPackageExportContentHashConflictError extends Error {},
  ReportPackageExportNotFoundError: class ReportPackageExportNotFoundError extends Error {},
}));

vi.mock('../../../server/services/lp-reporting/report-package-csv-stored-export-service', () => ({
  createMetricRunReportPackageStoredCsvExport: reportServiceState.createStoredCsvExport,
  getMetricRunReportPackageStoredCsvExport: reportServiceState.getStoredCsvExport,
  getMetricRunReportPackageStoredCsvArtifact: reportServiceState.getStoredCsvArtifact,
  reportPackageCsvExportContentHashConflictBody: vi.fn(),
  reportPackageCsvExportNotFoundBody: vi.fn(),
  reportPackageCsvSourceJsonExportRequiredBody: vi.fn(),
  ReportPackageCsvExportContentHashConflictError: class ReportPackageCsvExportContentHashConflictError extends Error {},
  ReportPackageCsvExportNotFoundError: class ReportPackageCsvExportNotFoundError extends Error {},
  ReportPackageCsvSourceJsonExportRequiredError: class ReportPackageCsvSourceJsonExportRequiredError extends Error {},
}));

import { assertH9ExportActionable } from '../../../server/services/lp-reporting/h9-export-gate';

const EXPORT_ROUTES = [
  ['GET', '/api/funds/1/metric-runs/11/report-package/render-model'],
  ['GET', '/api/funds/1/metric-runs/11/report-package/export/json'],
  ['POST', '/api/funds/1/metric-runs/11/report-package/exports/json'],
  ['GET', '/api/funds/1/metric-runs/11/report-package/exports/json'],
  ['GET', '/api/funds/1/metric-runs/11/report-package/exports/json/artifact'],
  ['POST', '/api/funds/1/metric-runs/11/report-package/exports/csv'],
  ['GET', '/api/funds/1/metric-runs/11/report-package/exports/csv'],
  ['GET', '/api/funds/1/metric-runs/11/report-package/exports/csv/artifact'],
] as const;

const CURRENT_H9_GATED_EXPORT_ROUTES = [
  EXPORT_ROUTES[0],
  EXPORT_ROUTES[1],
  EXPORT_ROUTES[2],
  EXPORT_ROUTES[4],
  EXPORT_ROUTES[5],
  EXPORT_ROUTES[7],
] as const;

const H9_INDEPENDENT_STATUS_ROUTES = [EXPORT_ROUTES[3], EXPORT_ROUTES[6]] as const;

const READ_AND_LIFECYCLE_PROBES = [
  {
    route: ['POST', '/api/funds/1/metric-runs/dry-run'],
    expectedStatus: 400,
    expectedBody: { error: 'INVALID_REQUEST_BODY', issues: true },
  },
  {
    route: ['POST', '/api/funds/1/metric-runs/commit'],
    expectedStatus: 400,
    expectedBody: { error: 'INVALID_REQUEST_BODY', issues: true },
  },
  {
    route: ['GET', '/api/funds/1/metric-runs/latest'],
    expectedStatus: 400,
    expectedBody: { error: 'INVALID_REQUEST_QUERY', issues: true },
  },
  {
    route: ['GET', '/api/funds/1/metric-runs/not-a-number'],
    expectedStatus: 400,
    expectedBody: {
      error: 'INVALID_METRIC_RUN_ID',
      message: 'metricRunId must be a positive integer.',
    },
  },
  {
    route: ['POST', '/api/funds/1/metric-runs/11/approve'],
    expectedStatus: 400,
    expectedBody: { error: 'INVALID_REQUEST_BODY', issues: true },
  },
  {
    route: ['POST', '/api/funds/1/metric-runs/11/lock'],
    expectedStatus: 400,
    expectedBody: { error: 'INVALID_REQUEST_BODY', issues: true },
  },
  {
    route: ['GET', '/api/funds/1/metric-runs/11/report-package'],
    expectedStatus: 200,
    expectedBody: { record: null },
  },
] as const;

const ENV_KEYS = [
  'NODE_ENV',
  '_EXPLICIT_NODE_ENV',
  'VITEST',
  'ALLOW_MEMORY_STORAGE',
  'DATABASE_URL',
  'NEON_DATABASE_URL',
  'REDIS_URL',
  '_EXPLICIT_REDIS_URL',
  'RATE_LIMIT_REDIS_URL',
  'QUEUE_REDIS_URL',
  'SESSION_REDIS_URL',
  'ENABLE_QUEUES',
  'RATE_LIMIT_MAX',
  'REQUIRE_AUTH',
  'DEFAULT_USER_ID',
  'JWT_ALG',
  '_EXPLICIT_JWT_ALG',
  'JWT_SECRET',
  '_EXPLICIT_JWT_SECRET',
  'JWT_AUDIENCE',
  '_EXPLICIT_JWT_AUDIENCE',
  'JWT_ISSUER',
  '_EXPLICIT_JWT_ISSUER',
  'JWT_JWKS_URL',
  '_EXPLICIT_JWT_JWKS_URL',
  'SESSION_SECRET',
] as const;

const originalEnv = new Map<string, string | undefined>();
const H9_FINGERPRINT = 'd'.repeat(64);
const H9_POLICY_VERSION = 'h9-policy-v1';

const source = {
  reportPackageId: 501,
  fundId: 1,
  metricRunId: 11,
  reportPackageStatus: 'assembled',
  asOfDate: '2026-03-31',
  metricRunVersion: 4,
  metricRunLockedBy: 7,
  metricRunLockedAt: '2026-05-10T02:00:00.000Z',
  assembledBy: 7,
  assembledAt: '2026-05-10T03:00:00.000Z',
  packageVersion: 1,
  payloadVersion: 1,
  h9Stamp: {
    fingerprintHash: H9_FINGERPRINT,
    policyVersion: H9_POLICY_VERSION,
    actionabilityStatus: 'actionable',
  },
} as const;

const renderModel = {
  renderModelVersion: 1,
  source,
  fundDisplay: {
    fundId: 1,
    name: 'Qualification Test Fund',
    vintageYear: 2024,
    size: '100000000.000000',
  },
  metricSections: [
    {
      sectionId: 'performance',
      title: 'Performance',
      rows: [
        {
          metricId: 'moic',
          label: 'MOIC',
          value: '1.500000',
          valueKind: 'multiple',
          currency: null,
        },
      ],
    },
  ],
  narrativeSections: [],
  diagnostics: {
    engineVersion: 'lp-reporting-engine@1.2.0',
    decimalPrecision: 6,
    excludedFutureMarks: [],
    warnings: [],
    xirr: {
      net: {
        convergence: 'converged',
        iterations: 5,
        method: 'newton',
        boundHit: null,
        failureReason: null,
      },
      gross: {
        convergence: 'converged',
        iterations: 4,
        method: 'newton',
        boundHit: null,
        failureReason: null,
      },
    },
  },
  references: {
    sourceEventIds: [],
    sourceMarkIds: [],
    evidenceRecordIds: [],
    narrativeRunIds: [],
  },
} as const;

const jsonExport = {
  exportVersion: 1,
  format: 'json',
  source,
  renderModel,
  contentHashAlgorithm: 'sha256',
  contentHash: 'a'.repeat(64),
} as const;

const exportRecord = {
  reportPackageExportId: 601,
  fundId: 1,
  metricRunId: 11,
  reportPackageId: 501,
  format: 'json',
  exportVersion: 1,
  status: 'ready',
  contentHashAlgorithm: 'sha256',
  contentHash: 'a'.repeat(64),
  artifactSizeBytes: 512,
  createdBy: 7,
  readyAt: '2026-05-10T04:00:00.000Z',
  createdAt: '2026-05-10T04:00:00.000Z',
  updatedAt: '2026-05-10T04:00:00.000Z',
} as const;

const csvExport = {
  exportVersion: 1,
  format: 'csv',
  sourceJsonExportId: 601,
  sourceJsonContentHash: jsonExport.contentHash,
  contentType: 'text/csv; charset=utf-8',
  filename: 'lp-report-package-1-11-csv-v1.csv',
  csv: 'section,field,value\nperformance,moic,1.500000\n',
} as const;

function configureTestEnv(): void {
  for (const key of ENV_KEYS) originalEnv.set(key, process.env[key]);

  process.env.NODE_ENV = 'test';
  process.env._EXPLICIT_NODE_ENV = 'test';
  process.env.VITEST = 'true';
  process.env.ALLOW_MEMORY_STORAGE = '1';
  delete process.env.DATABASE_URL;
  delete process.env.NEON_DATABASE_URL;
  process.env.REDIS_URL = 'memory://';
  process.env._EXPLICIT_REDIS_URL = 'memory://';
  delete process.env.RATE_LIMIT_REDIS_URL;
  delete process.env.QUEUE_REDIS_URL;
  delete process.env.SESSION_REDIS_URL;
  process.env.ENABLE_QUEUES = '0';
  process.env.RATE_LIMIT_MAX = '1000';
  process.env.REQUIRE_AUTH = '1';
  process.env.DEFAULT_USER_ID = '1';
  process.env.JWT_ALG = 'HS256';
  process.env._EXPLICIT_JWT_ALG = 'HS256';
  process.env.JWT_SECRET = 'report-qualification-test-secret-32-chars';
  process.env._EXPLICIT_JWT_SECRET = process.env.JWT_SECRET;
  process.env.JWT_AUDIENCE = 'updog-test';
  process.env._EXPLICIT_JWT_AUDIENCE = process.env.JWT_AUDIENCE;
  process.env.JWT_ISSUER = 'updog-test';
  process.env._EXPLICIT_JWT_ISSUER = process.env.JWT_ISSUER;
  delete process.env.JWT_JWKS_URL;
  delete process.env._EXPLICIT_JWT_JWKS_URL;
  process.env.SESSION_SECRET = 'report-qualification-session-secret-32-chars';
}

function restoreTestEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  originalEnv.clear();
}

function configureReportServiceFixtures(): void {
  reportServiceState.getReportPackage.mockResolvedValue({ record: null });
  reportServiceState.getRenderModel.mockImplementation(async () => {
    await assertFixtureH9('render_model');
    return { renderModel };
  });
  reportServiceState.getJsonExport.mockImplementation(async () => {
    await assertFixtureH9('live_json_export');
    return { export: jsonExport };
  });
  reportServiceState.createStoredJsonExport.mockImplementation(async () => {
    await assertFixtureH9('live_json_export');
    return {
      record: exportRecord,
      inserted: false,
    };
  });
  reportServiceState.getStoredJsonExport.mockResolvedValue({ record: exportRecord });
  reportServiceState.getStoredJsonArtifact.mockImplementation(async () => {
    await assertFixtureH9('stored_json_export');
    return {
      record: exportRecord,
      export: jsonExport,
    };
  });

  const csvRecord = {
    ...exportRecord,
    reportPackageExportId: 602,
    format: 'csv',
    contentHash: 'b'.repeat(64),
  } as const;
  const csvMetadata = {
    sourceJsonExportId: csvExport.sourceJsonExportId,
    sourceJsonContentHash: csvExport.sourceJsonContentHash,
    contentType: csvExport.contentType,
    filename: csvExport.filename,
  } as const;
  reportServiceState.createStoredCsvExport.mockImplementation(async () => {
    await assertFixtureH9('stored_csv_export');
    return {
      record: csvRecord,
      inserted: false,
      ...csvMetadata,
    };
  });
  reportServiceState.getStoredCsvExport.mockResolvedValue({
    record: csvRecord,
    ...csvMetadata,
  });
  reportServiceState.getStoredCsvArtifact.mockImplementation(async () => {
    await assertFixtureH9('stored_csv_export');
    return {
      record: csvRecord,
      csv: csvExport,
    };
  });
}

let nextAuthorizationUserId = 100;

async function authorizationHeader(role: string, fundIds: number[]): Promise<string> {
  const { signToken } = await import('../../../server/lib/auth/jwt');
  const userId = nextAuthorizationUserId++;
  return `Bearer ${signToken({
    sub: String(userId),
    email: `qualification-${role}-${userId}@example.com`,
    role,
    fundIds,
  })}`;
}

function sendRoute(
  app: Awaited<ReturnType<(typeof import('../../../server/app'))['makeApp']>>,
  route: Route
): Test {
  const [method, routePath] = route;
  return method === 'POST' ? request(app).post(routePath).send({}) : request(app).get(routePath);
}

function storedH9(overrides: Record<string, unknown> = {}) {
  return {
    h9MoicSourceInputHash: 'a'.repeat(64),
    h9RoundEvidenceInputHash: 'b'.repeat(64),
    h9RoundEvidenceAssumptionsHash: 'c'.repeat(64),
    h9FingerprintHash: H9_FINGERPRINT,
    h9PolicyVersion: H9_POLICY_VERSION,
    h9ActionabilityStatus: 'actionable',
    ...overrides,
  };
}

let storedH9Fixture = storedH9();

async function assertFixtureH9(
  surface: Parameters<typeof assertH9ExportActionable>[0]['surface']
): Promise<void> {
  await assertH9ExportActionable({
    surface,
    fundId: 1,
    stored: storedH9Fixture as never,
    database: {} as never,
  });
}

function productionSourceFile(relativePath: string): ts.SourceFile {
  const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
  return ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function productionFunctionBody(relativePath: string, functionName: string): string {
  const sourceFile = productionSourceFile(relativePath);
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === functionName &&
      ts
        .getModifiers(statement)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true
  );

  if (declaration?.body === undefined) {
    throw new Error(`Exported function ${functionName} not found in ${relativePath}`);
  }
  return declaration.body.getText(sourceFile);
}

function sourceFunctionBody(relativePath: string, functionName: string): string {
  const sourceFile = productionSourceFile(relativePath);
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === functionName
  );

  if (declaration?.body === undefined) {
    throw new Error(`Function ${functionName} not found in ${relativePath}`);
  }
  return declaration.body.getText(sourceFile);
}

function productionImportSpecifiers(relativePath: string): string[] {
  const sourceFile = productionSourceFile(relativePath);
  return [
    ...new Set(
      sourceFile.statements
        .filter(ts.isImportDeclaration)
        .map((declaration) => declaration.moduleSpecifier)
        .filter(ts.isStringLiteral)
        .map((moduleSpecifier) => moduleSpecifier.text)
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function productionImportBindings(relativePath: string, moduleSpecifier: string): string[] {
  const sourceFile = productionSourceFile(relativePath);
  const bindings: string[] = [];

  for (const declaration of sourceFile.statements.filter(ts.isImportDeclaration)) {
    if (!ts.isStringLiteral(declaration.moduleSpecifier)) continue;
    if (declaration.moduleSpecifier.text !== moduleSpecifier) continue;

    const importClause = declaration.importClause;
    if (importClause === undefined) continue;
    if (importClause.name !== undefined) {
      bindings.push(`default ${importClause.name.text}`);
    }

    const namedBindings = importClause.namedBindings;
    if (namedBindings === undefined) continue;
    if (ts.isNamespaceImport(namedBindings)) {
      bindings.push(`* as ${namedBindings.name.text}`);
      continue;
    }

    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      const localName = element.name.text;
      const bindingName =
        importedName === localName ? importedName : `${importedName} as ${localName}`;
      const typePrefix = importClause.isTypeOnly || element.isTypeOnly ? 'type ' : '';
      bindings.push(`${typePrefix}${bindingName}`);
    }
  }

  return bindings.sort((left, right) => left.localeCompare(right));
}

function productionZodObjectFields(relativePath: string, schemaName: string): string[] {
  const sourceFile = productionSourceFile(relativePath);

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const declaration = statement.declarationList.declarations.find(
      (candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === schemaName
    );
    if (declaration?.initializer === undefined || !ts.isCallExpression(declaration.initializer)) {
      continue;
    }

    const objectArgument = declaration.initializer.arguments[0];
    if (objectArgument === undefined || !ts.isObjectLiteralExpression(objectArgument)) continue;

    return objectArgument.properties.map((property) => {
      if (!ts.isPropertyAssignment(property)) {
        throw new Error(`Unsupported field in ${schemaName} from ${relativePath}`);
      }
      if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
        return property.name.text;
      }
      throw new Error(`Unsupported field name in ${schemaName} from ${relativePath}`);
    });
  }

  throw new Error(`Zod object ${schemaName} not found in ${relativePath}`);
}

function readTypeScriptSourcesRecursively(
  rootDirectory: string
): Array<{ relativePath: string; source: string }> {
  const sources: Array<{ relativePath: string; source: string }> = [];

  function visit(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        sources.push({
          relativePath: path.relative(rootDirectory, absolutePath).replaceAll('\\', '/'),
          source: fs.readFileSync(absolutePath, 'utf8'),
        });
      }
    }
  }

  visit(rootDirectory);
  return sources.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

let app: Awaited<ReturnType<(typeof import('../../../server/app'))['makeApp']>>;

beforeAll(async () => {
  configureTestEnv();
  configureReportServiceFixtures();
  const appModule = await import('../../../server/app');
  app = appModule.makeApp();
}, 60_000);

afterAll(() => {
  restoreTestEnv();
});

beforeEach(() => {
  storedH9Fixture = storedH9();
  actionabilityState.resolveForFund.mockReset();
  actionabilityState.resolveForFund.mockResolvedValue({
    actionability: 'actionable',
    sourceFingerprint: {
      fingerprintHash: H9_FINGERPRINT,
      policyVersion: H9_POLICY_VERSION,
    },
  });
});

describe('LP report export authorization', () => {
  it('returns 401 for anonymous requests across all eight export routes', async () => {
    for (const route of EXPORT_ROUTES) {
      const response = await sendRoute(app, route);
      expect(response.status, route.join(' ')).toBe(401);
    }
  });

  it.each(['viewer', 'analyst', 'operator'])(
    'returns 403 for the %s role across all eight export routes',
    async (role) => {
      const authorization = await authorizationHeader(role, [1]);
      for (const route of EXPORT_ROUTES) {
        const response = await sendRoute(app, route).set('Authorization', authorization);
        expect(response.status, `${role} ${route.join(' ')}`).toBe(403);
      }
    }
  );

  it('returns 403 for a partner without an explicit export fund grant', async () => {
    const authorization = await authorizationHeader('partner', []);
    for (const route of EXPORT_ROUTES) {
      const response = await sendRoute(app, route).set('Authorization', authorization);
      expect(response.status, route.join(' ')).toBe(403);
    }
  });

  it.each([
    ['partner', [1]],
    ['admin', []],
  ] as const)(
    'returns 200 for an authorized %s across all eight export routes',
    async (role, grants) => {
      const authorization = await authorizationHeader(role, [...grants]);
      for (const route of EXPORT_ROUTES) {
        const response = await sendRoute(app, route).set('Authorization', authorization);
        expect(response.status, route.join(' ')).toBe(200);
        expect(JSON.stringify(response.body)).not.toMatch(/marginal|non_actionable_shadow/i);
      }
    }
  );

  it('keeps read and lifecycle routes reachable with exact non-partner response contracts', async () => {
    const authorization = await authorizationHeader('analyst', [1]);
    for (const probe of READ_AND_LIFECYCLE_PROBES) {
      const response = await sendRoute(app, probe.route).set('Authorization', authorization);
      expect(response.status, probe.route.join(' ')).toBe(probe.expectedStatus);
      if ('issues' in probe.expectedBody) {
        expect(response.body, probe.route.join(' ')).toEqual({
          error: probe.expectedBody.error,
          issues: expect.any(Array),
        });
      } else {
        expect(response.body, probe.route.join(' ')).toEqual(probe.expectedBody);
      }
    }
  });
});

describe('H9 export qualification', () => {
  async function expectH9BlockAcrossCurrentExportRoutes(code: string): Promise<void> {
    const authorization = await authorizationHeader('partner', [1]);
    for (const route of CURRENT_H9_GATED_EXPORT_ROUTES) {
      const response = await sendRoute(app, route).set('Authorization', authorization);
      expect(response.status, route.join(' ')).toBe(409);
      expect(response.body, route.join(' ')).toMatchObject({ error: code });
    }
  }

  it('blocks missing stored H9 metadata across every currently H9-gated export route', async () => {
    storedH9Fixture = storedH9({ h9ActionabilityStatus: null, h9FingerprintHash: null });
    await expectH9BlockAcrossCurrentExportRoutes('H9_METADATA_MISSING');
  });

  it('blocks stored H9 that is not actionable across every currently H9-gated export route', async () => {
    storedH9Fixture = storedH9({ h9ActionabilityStatus: 'non_actionable' });
    await expectH9BlockAcrossCurrentExportRoutes('H9_NOT_ACTIONABLE');
  });

  it('blocks a stale H9 fingerprint across every currently H9-gated export route', async () => {
    actionabilityState.resolveForFund.mockResolvedValue({
      actionability: 'actionable',
      sourceFingerprint: {
        fingerprintHash: 'e'.repeat(64),
        policyVersion: H9_POLICY_VERSION,
      },
    });
    await expectH9BlockAcrossCurrentExportRoutes('H9_FINGERPRINT_STALE');
  });

  it('fails closed across every currently H9-gated export route when revalidation is unavailable', async () => {
    actionabilityState.resolveForFund.mockRejectedValue(new Error('resolver unavailable'));
    await expectH9BlockAcrossCurrentExportRoutes('H9_REVALIDATION_UNAVAILABLE');
  });

  it('keeps stored-export status GETs role-and-grant gated without invoking H9', async () => {
    storedH9Fixture = storedH9({ h9ActionabilityStatus: null, h9FingerprintHash: null });
    actionabilityState.resolveForFund.mockRejectedValue(new Error('resolver unavailable'));
    const authorization = await authorizationHeader('partner', [1]);

    for (const route of H9_INDEPENDENT_STATUS_ROUTES) {
      const response = await sendRoute(app, route).set('Authorization', authorization);
      expect(response.status, route.join(' ')).toBe(200);
    }
    expect(actionabilityState.resolveForFund).not.toHaveBeenCalled();
  });

  it('pins the production service call chain for all six H9-gated routes', () => {
    const renderModelBody = productionFunctionBody(
      'server/services/lp-reporting/report-package-render-model-service.ts',
      'getMetricRunReportPackageRenderModel'
    );
    expect(renderModelBody).toContain('await assertH9ExportActionable({');
    expect(renderModelBody).toContain("surface: options.h9Surface ?? 'render_model'");

    const liveJsonBody = productionFunctionBody(
      'server/services/lp-reporting/report-package-json-export-service.ts',
      'getMetricRunReportPackageJsonExport'
    );
    expect(liveJsonBody).toContain(
      'options.renderModelService ?? getMetricRunReportPackageRenderModel'
    );
    expect(liveJsonBody).toContain("h9Surface: 'live_json_export'");

    const storedJsonCreateBody = productionFunctionBody(
      'server/services/lp-reporting/report-package-json-stored-export-service.ts',
      'createMetricRunReportPackageStoredJsonExport'
    );
    expect(storedJsonCreateBody).toContain(
      'options.jsonExportService ?? getMetricRunReportPackageJsonExport'
    );
    const liveGateCall = storedJsonCreateBody.indexOf('const live = await jsonExportService(');
    const firstPersistence = storedJsonCreateBody.indexOf('.insert(lpReportPackageExports)');
    expect(liveGateCall).toBeGreaterThanOrEqual(0);
    expect(firstPersistence).toBeGreaterThan(liveGateCall);

    const storedJsonArtifactBody = productionFunctionBody(
      'server/services/lp-reporting/report-package-json-stored-export-service.ts',
      'getMetricRunReportPackageStoredJsonArtifact'
    );
    expect(storedJsonArtifactBody).toContain('await assertH9PackageExportable({');
    expect(storedJsonArtifactBody).toContain("surface: 'stored_json_export'");

    const storedCsvCreateBody = productionFunctionBody(
      'server/services/lp-reporting/report-package-csv-stored-export-service.ts',
      'createMetricRunReportPackageStoredCsvExport'
    );
    const storedCsvCreateGate = storedCsvCreateBody.indexOf('await assertH9PackageExportable({');
    const storedCsvFirstPersistence = storedCsvCreateBody.indexOf(
      '.insert(lpReportPackageExports)'
    );
    expect(storedCsvCreateGate).toBeGreaterThanOrEqual(0);
    expect(storedCsvFirstPersistence).toBeGreaterThan(storedCsvCreateGate);

    const storedCsvArtifactBody = productionFunctionBody(
      'server/services/lp-reporting/report-package-csv-stored-export-service.ts',
      'getMetricRunReportPackageStoredCsvArtifact'
    );
    expect(storedCsvArtifactBody).toContain('await assertH9PackageExportable({');
    expect(storedCsvArtifactBody).toContain("surface: 'stored_csv_export'");
  });

  it('pins both production stored-export status functions as workflow-gated but H9-independent', () => {
    const statusFunctions = [
      productionFunctionBody(
        'server/services/lp-reporting/report-package-json-stored-export-service.ts',
        'getMetricRunReportPackageStoredJsonExport'
      ),
      productionFunctionBody(
        'server/services/lp-reporting/report-package-csv-stored-export-service.ts',
        'getMetricRunReportPackageStoredCsvExport'
      ),
    ];

    for (const functionBody of statusFunctions) {
      expect(functionBody).toContain('await assertMetricRunExportWorkflowState({');
      expect(functionBody).not.toMatch(/assertH9(?:ExportActionable|PackageExportable)/);
    }
  });
});

describe('marginal MOIC and report-sharing boundaries', () => {
  it('keeps marginal MOIC contracts out of every LP reporting service', () => {
    const serviceDirectory = path.join(process.cwd(), 'server', 'services', 'lp-reporting');
    const serviceSource = fs
      .readdirSync(serviceDirectory)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => fs.readFileSync(path.join(serviceDirectory, file), 'utf8'))
      .join('\n');

    expect(serviceSource).not.toMatch(/marginal-reserve-moic|non_actionable_shadow/i);
  });

  it('pins public share delivery to immutable snapshots without LP-reporting dependencies', () => {
    expect(productionImportSpecifiers('server/routes/shares.ts')).toEqual([
      '../db',
      '../lib/http-preconditions',
      '../lib/logger.js',
      '../lib/request-values',
      '../lib/stable-json.js',
      '../services/share-snapshot-service',
      '@shared/schema/shares',
      '@shared/sharing-schema',
      'drizzle-orm',
      'express',
      'express-rate-limit',
      'node:crypto',
      'uuid',
      'zod',
    ]);
    expect(productionImportSpecifiers('server/services/share-snapshot-service.ts')).toEqual([
      '../db',
      '../lib/stable-json.js',
      '../storage',
      './dashboard-summary-read-service',
      '@shared/contracts/public-share-snapshot.contract',
      '@shared/schema/shares',
      'drizzle-orm',
      'node:crypto',
      'uuid',
    ]);
    expect(
      productionImportSpecifiers('shared/contracts/public-share-snapshot.contract.ts')
    ).toEqual(['zod']);
    expect(
      productionImportBindings('server/routes/shares.ts', '../services/share-snapshot-service')
    ).toEqual(['createShareSnapshot', 'getLatestShareSnapshot', 'markShareSnapshotsRevoked']);
    expect(
      productionImportBindings(
        'server/services/share-snapshot-service.ts',
        './dashboard-summary-read-service'
      )
    ).toEqual(['getDashboardSummaryReadModel']);
    expect(
      productionImportBindings(
        'server/services/share-snapshot-service.ts',
        '@shared/contracts/public-share-snapshot.contract'
      )
    ).toEqual([
      'type PublicMetricValue',
      'type PublicPortfolioCompany',
      'type PublicShareSnapshotPayload',
    ]);
    expect(
      productionImportBindings('server/services/share-snapshot-service.ts', '@shared/schema/shares')
    ).toEqual(['shareSnapshots', 'type Share', 'type ShareSnapshotRecord']);
    expect(
      productionImportBindings('shared/contracts/public-share-snapshot.contract.ts', 'zod')
    ).toEqual(['z']);
    expect(
      productionImportBindings(
        'shared/schema/shares.ts',
        '../contracts/public-share-snapshot.contract'
      )
    ).toEqual(['type PublicShareSnapshotPayload']);

    expect(
      productionZodObjectFields(
        'shared/contracts/public-share-snapshot.contract.ts',
        'PublicShareSnapshotPayloadSchema'
      )
    ).toEqual([
      'payloadVersion',
      'snapshotId',
      'shareId',
      'title',
      'message',
      'asOfDate',
      'generatedAt',
      'metrics',
      'portfolioCompanies',
      'hiddenMetricPolicy',
      'sourceCalculationRunIds',
    ]);

    const publicDelivery = sourceFunctionBody('server/routes/shares.ts', 'sendPublicSharePayload');
    expect(publicDelivery).toContain('await getLatestShareSnapshot(share.id)');
    expect(publicDelivery).toContain('snapshot: snapshot.payload');
    expect(publicDelivery).not.toMatch(
      /getDashboardSummaryReadModel|buildPublicShareSnapshotPayload/
    );

    const payloadBuilder = productionFunctionBody(
      'server/services/share-snapshot-service.ts',
      'buildPublicShareSnapshotPayload'
    );
    expect(payloadBuilder).toContain('await getDashboardSummaryReadModel(storage, fundId)');
    expect(payloadBuilder).toContain('const payload: PublicShareSnapshotPayload');
    expect(payloadBuilder).toContain('return { payload, payloadHash: hashPayload(payload) };');

    const snapshotCreation = productionFunctionBody(
      'server/services/share-snapshot-service.ts',
      'createShareSnapshot'
    );
    expect(snapshotCreation).toContain('await buildPublicShareSnapshotPayload');
    expect(snapshotCreation).toContain('.insert(shareSnapshots)');
    expect(snapshotCreation).toContain('payloadHash,');
    expect(snapshotCreation).toContain('payload,');

    const snapshotRead = productionFunctionBody(
      'server/services/share-snapshot-service.ts',
      'getLatestShareSnapshot'
    );
    expect(snapshotRead).toContain('.from(shareSnapshots)');
    expect(snapshotRead).toContain('.orderBy(desc(shareSnapshots.generatedAt))');

    const boundaryFiles = [
      'server/routes/shares.ts',
      'server/services/share-snapshot-service.ts',
      'shared/contracts/public-share-snapshot.contract.ts',
      'shared/schema/shares.ts',
    ];
    const forbiddenReportingDependency =
      /lp(?:[-_/]?reporting)|report(?:[-_/]?package)s?|metric(?:[-_/]?run)s?/i;

    for (const forbiddenSpelling of [
      'lpReporting',
      'LPReporting',
      'reportPackage',
      'ReportPackage',
      'metricRun',
      'MetricRun',
    ]) {
      expect(forbiddenSpelling).toMatch(forbiddenReportingDependency);
    }

    for (const relativePath of boundaryFiles) {
      const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(forbiddenReportingDependency);
    }

    const snapshotSchema = fs.readFileSync(
      path.join(process.cwd(), 'shared/schema/shares.ts'),
      'utf8'
    );
    expect(snapshotSchema).toContain("payload: jsonb('payload')");
    expect(snapshotSchema).toContain('$type<PublicShareSnapshotPayload>().notNull()');
  });

  it('confines every server report-package route to the fund and workflow scoped router', () => {
    const routeDirectory = path.join(process.cwd(), 'server', 'routes');
    const routeSources = readTypeScriptSourcesRecursively(routeDirectory);
    const filesMentioningReportPackages = routeSources
      .filter(({ source }) => source.includes('report-package'))
      .map(({ relativePath }) => relativePath);

    expect(filesMentioningReportPackages).toEqual(['lp-reporting/metric-runs.ts']);

    const routePattern =
      /\brouter\.(?:get|post|put|patch|delete)\(\s*['"`]([^'"`]*report-package[^'"`]*)['"`]/g;
    const reportPackageRoutes = routeSources.flatMap(({ relativePath, source }) =>
      [...source.matchAll(routePattern)].map((match) => ({
        relativePath,
        routePath: match[1] ?? '',
      }))
    );

    expect(reportPackageRoutes.length).toBeGreaterThan(0);
    for (const occurrence of reportPackageRoutes) {
      expect(occurrence.relativePath).toBe('lp-reporting/metric-runs.ts');
      expect(occurrence.routePath).toMatch(
        /^\/api\/funds\/:fundId\/metric-runs\/:metricRunId\/report-package(?:\/|$)/
      );
    }
  });
});
