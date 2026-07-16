import fs from 'node:fs';
import path from 'node:path';

import request, { type Test } from 'supertest';
import * as ts from 'typescript';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Route = readonly ['GET' | 'POST', string];

const actionabilityState = vi.hoisted(() => ({
  resolveForFund: vi.fn(),
}));

vi.mock('../../../server/services/fund-calculation-mode-service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../server/services/fund-calculation-mode-service')
  >()),
  createMoicActionabilityResolver: () => ({
    resolveForFund: actionabilityState.resolveForFund,
  }),
}));

/**
 * Data-layer fake (repo pattern). The production LP-reporting routes, services,
 * workflow gate, and H9 export gates all execute for real through makeApp;
 * only the database rows they read and write are supplied by this table-keyed
 * stub. The MOIC actionability resolver above is the only other mocked seam
 * because it is a DB-heavy resolver input.
 */
const dbState = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  exportInsertAttempts: 0,
  insertedExportRows: [] as Array<Record<string, unknown>>,
  metricRunStatusUpdates: [] as Array<Record<string, unknown>>,
  nextId: 9000,
}));

vi.mock('../../../server/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/db')>();
  const { getTableName } = await import('drizzle-orm');

  function rowsFor(table: unknown): Array<Record<string, unknown>> {
    return dbState.tables[getTableName(table as never)] ?? [];
  }

  function queryResult(rows: Array<Record<string, unknown>>) {
    const promise = Promise.resolve(rows) as Promise<Array<Record<string, unknown>>> & {
      limit: (count: number) => Promise<Array<Record<string, unknown>>>;
    };
    promise.limit = () => Promise.resolve(rows);
    return promise;
  }

  const fakeDb = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => queryResult(rowsFor(table)),
      }),
    }),
    insert: (table: unknown) => ({
      values: (row: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            const name = getTableName(table as never);
            if (name !== 'lp_report_package_exports') return [];
            dbState.exportInsertAttempts += 1;
            const rows = rowsFor(table);
            const duplicate = rows.find(
              (candidate) =>
                candidate['reportPackageId'] === row['reportPackageId'] &&
                candidate['format'] === row['format'] &&
                candidate['exportVersion'] === row['exportVersion']
            );
            if (duplicate) return [];
            const stored = { id: dbState.nextId++, ...row };
            rows.push(stored);
            dbState.insertedExportRows.push(stored);
            return [stored];
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            const name = getTableName(table as never);
            if (name !== 'lp_metric_runs') return [];
            const current = rowsFor(table).find((candidate) => candidate['status'] === 'locked');
            if (!current) return [];
            Object.assign(current, values);
            dbState.metricRunStatusUpdates.push(values);
            return [current];
          },
        }),
      }),
    }),
    execute: async () => [],
  };

  return { ...actual, db: fakeDb as never };
});

import { createHash } from 'node:crypto';

import { buildReportPackageCsv } from '../../../server/services/lp-reporting/report-package-csv-stored-export-service';
import { sha256CanonicalJson } from '../../../server/services/lp-reporting/report-package-json-export-service';
import { ReportPackageJsonExportArtifactSchema } from '@shared/contracts/lp-reporting';

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
    expectedBody: { record: { reportPackageId: 501, metricRunId: 11, status: 'assembled' } },
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

/**
 * A stored export row created BEFORE per-metric provenance existed:
 * render-model version 1 metric sections without provenance fields. Its
 * content hash is the real hash of its own bytes, so replays must succeed
 * against the stored row even though the current renderer output differs.
 */
const legacyJsonArtifact = ReportPackageJsonExportArtifactSchema.parse({
  exportVersion: 1,
  format: 'json',
  source,
  renderModel,
});
const STORED_JSON_CONTENT_HASH = sha256CanonicalJson(legacyJsonArtifact);
const STORED_CSV_STRING = buildReportPackageCsv(legacyJsonArtifact);
const STORED_CSV_CONTENT_HASH = createHash('sha256')
  .update(STORED_CSV_STRING, 'utf8')
  .digest('hex');
const METRIC_RUN_INPUTS_HASH = '0123456789abcdef'.repeat(4);

const validXirrDiagnostic = {
  convergence: 'converged',
  iterations: 5,
  method: 'newton',
  boundHit: null,
  failureReason: null,
} as const;

function reportPackagePayload() {
  const narratives = [
    ['no_dpi', 100, 'Approved no DPI copy.'],
    ['methodology', 101, 'Approved methodology copy.'],
    ['portfolio_update', 102, 'Approved portfolio update copy.'],
    ['risk_disclosure', 103, 'Approved risk disclosure copy.'],
  ] as const;

  return {
    payloadVersion: 1,
    results: {
      asOfDate: '2026-03-31',
      currency: 'USD',
      dpi: '0.450000',
      rvpi: '1.250000',
      tvpi: '1.700000',
      moic: '1.700000',
      netIrr: '0.150000',
      grossIrr: '0.180000',
      xirrDiagnostic: {
        net: validXirrDiagnostic,
        gross: validXirrDiagnostic,
      },
      contributionsTotal: '50000000.000000',
      distributionsTotal: '22500000.000000',
      currentNav: '62500000.000000',
      markConfidenceMix: { high: 8, medium: 3, low: 1 },
    },
    diagnostics: {
      engineVersion: 'lp-reporting-engine@1.2.0',
      decimalPrecision: 6,
      excludedFutureMarks: [],
      warnings: [],
    },
    sourceEventIds: [101, 102],
    sourceMarkIds: [201],
    evidenceRecordIds: [300, 301],
    narratives: narratives.map(([narrativeType, narrativeRunId, effectiveText]) => ({
      narrativeType,
      narrativeRunId,
      narrativeVersion: 3,
      approvedBy: 7,
      approvedAt: '2026-05-10T02:30:00.000Z',
      textHash: 'a'.repeat(64),
      effectiveText,
    })),
  };
}

function metricRunRow(): Record<string, unknown> {
  return {
    id: 11,
    fundId: 1,
    vehicleId: null,
    asOfDate: '2026-03-31',
    runType: 'quarterly_report',
    perspective: 'lp_net',
    status: 'locked',
    inputsHash: METRIC_RUN_INPUTS_HASH,
    sourceEventIds: [101, 102],
    sourceMarkIds: [201],
    sourceEvidenceIds: [300, 301],
    resultsJson: {},
    diagnosticsJson: {},
    methodologyVersion: 'lp-reporting-methodology-v1',
    calculationVersion: 'lp-reporting-metrics-engine-1.0.0',
    generatedBy: 7,
    approvedBy: 7,
    approvedAt: new Date('2026-05-10T01:00:00Z'),
    lockedBy: 7,
    lockedAt: new Date('2026-05-10T02:00:00Z'),
    exportedAt: null,
    version: 4,
    createdAt: new Date('2026-05-10T00:00:00Z'),
    updatedAt: new Date('2026-05-10T02:00:00Z'),
  };
}

function fundRow(): Record<string, unknown> {
  return {
    id: 1,
    name: 'Qualification Test Fund',
    size: '100000000.000000',
    deployedCapital: '0',
    managementFee: '0.0200',
    carryPercentage: '0.2000',
    vintageYear: 2024,
    establishmentDate: null,
    status: 'active',
    isActive: true,
    engineResults: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function reportPackageRow(): Record<string, unknown> {
  const payload = reportPackagePayload();
  return {
    id: 501,
    fundId: 1,
    metricRunId: 11,
    status: 'assembled',
    asOfDate: '2026-03-31',
    metricRunVersion: 4,
    metricRunLockedBy: 7,
    metricRunLockedAt: new Date('2026-05-10T02:00:00Z'),
    narrativeRefs: payload.narratives.map((narrative) => ({
      narrativeType: narrative.narrativeType,
      narrativeRunId: narrative.narrativeRunId,
      narrativeVersion: narrative.narrativeVersion,
      approvedBy: narrative.approvedBy,
      approvedAt: narrative.approvedAt,
      textHash: narrative.textHash,
    })),
    payload,
    h9MoicSourceInputHash: 'a'.repeat(64),
    h9RoundEvidenceInputHash: 'b'.repeat(64),
    h9RoundEvidenceAssumptionsHash: 'c'.repeat(64),
    h9FingerprintHash: H9_FINGERPRINT,
    h9PolicyVersion: H9_POLICY_VERSION,
    h9ActionabilityStatus: 'actionable',
    assembledBy: 7,
    assembledAt: new Date('2026-05-10T03:00:00Z'),
    version: 1,
    createdAt: new Date('2026-05-10T03:00:00Z'),
    updatedAt: new Date('2026-05-10T03:00:00Z'),
  };
}

function evidenceRow(id: number): Record<string, unknown> {
  return {
    id,
    fundId: 1,
    metricRunId: 11,
    confidentiality: 'internal',
    redactionRequired: false,
  };
}

function storedJsonExportRow(): Record<string, unknown> {
  return {
    id: 601,
    fundId: 1,
    metricRunId: 11,
    reportPackageId: 501,
    format: 'json',
    exportVersion: 1,
    status: 'ready',
    contentHashAlgorithm: 'sha256',
    contentHash: STORED_JSON_CONTENT_HASH,
    artifactPayload: legacyJsonArtifact,
    artifactSizeBytes: 1000,
    createdBy: 7,
    readyAt: new Date('2026-05-10T04:00:00Z'),
    createdAt: new Date('2026-05-10T04:00:00Z'),
    updatedAt: new Date('2026-05-10T04:00:00Z'),
  };
}

function storedCsvExportRow(): Record<string, unknown> {
  return {
    id: 602,
    fundId: 1,
    metricRunId: 11,
    reportPackageId: 501,
    format: 'csv',
    exportVersion: 1,
    status: 'ready',
    contentHashAlgorithm: 'sha256',
    contentHash: STORED_CSV_CONTENT_HASH,
    artifactPayload: {
      exportVersion: 1,
      format: 'csv',
      sourceJsonExportId: 601,
      sourceJsonContentHash: STORED_JSON_CONTENT_HASH,
      contentType: 'text/csv; charset=utf-8',
      filename: 'lp-report-package-1-11-csv-v1.csv',
      csv: STORED_CSV_STRING,
    },
    artifactSizeBytes: Buffer.byteLength(STORED_CSV_STRING, 'utf8'),
    createdBy: 7,
    readyAt: new Date('2026-05-10T05:00:00Z'),
    createdAt: new Date('2026-05-10T05:00:00Z'),
    updatedAt: new Date('2026-05-10T05:00:00Z'),
  };
}

function seedDatabaseFixtures(): void {
  dbState.tables = {
    funds: [fundRow()],
    users: [{ id: 1 }, { id: 7 }],
    lp_metric_runs: [metricRunRow()],
    lp_report_packages: [reportPackageRow()],
    lp_report_package_exports: [storedJsonExportRow(), storedCsvExportRow()],
    evidence_records: [evidenceRow(300), evidenceRow(301)],
  };
  dbState.exportInsertAttempts = 0;
  dbState.insertedExportRows = [];
  dbState.metricRunStatusUpdates = [];
  dbState.nextId = 9000;
}

function setStoredPackageH9(overrides: Record<string, unknown>): void {
  const [pkg] = dbState.tables['lp_report_packages'] ?? [];
  if (!pkg) throw new Error('lp_report_packages fixture row is missing');
  Object.assign(pkg, overrides);
}

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
  const appModule = await import('../../../server/app');
  app = appModule.makeApp();
}, 60_000);

afterAll(() => {
  restoreTestEnv();
});

beforeEach(() => {
  seedDatabaseFixtures();
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
        expect(response.body, probe.route.join(' ')).toMatchObject(probe.expectedBody);
      }
    }
  });
});

describe('H9 export qualification', () => {
  // These tests execute the REAL production gates (assertH9ExportActionable /
  // assertH9PackageExportable) through real makeApp routes and real services;
  // only the database rows and the MOIC actionability resolver are stubbed.
  async function expectH9BlockAcrossCurrentExportRoutes(code: string): Promise<void> {
    const authorization = await authorizationHeader('partner', [1]);
    for (const route of CURRENT_H9_GATED_EXPORT_ROUTES) {
      const response = await sendRoute(app, route).set('Authorization', authorization);
      expect(response.status, route.join(' ')).toBe(409);
      expect(response.body, route.join(' ')).toMatchObject({ error: code });
    }
    // While the real gate blocks, neither export-creation POST may attempt a
    // persistence write (gate-before-insert ordering, proven behaviorally).
    expect(dbState.exportInsertAttempts).toBe(0);
    expect(dbState.insertedExportRows).toHaveLength(0);
  }

  it('blocks missing stored H9 metadata across every currently H9-gated export route', async () => {
    setStoredPackageH9({ h9ActionabilityStatus: null, h9FingerprintHash: null });
    await expectH9BlockAcrossCurrentExportRoutes('H9_METADATA_MISSING');
  });

  it('blocks stored H9 that is not actionable across every currently H9-gated export route', async () => {
    setStoredPackageH9({ h9ActionabilityStatus: 'non_actionable' });
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
    setStoredPackageH9({ h9ActionabilityStatus: null, h9FingerprintHash: null });
    actionabilityState.resolveForFund.mockRejectedValue(new Error('resolver unavailable'));
    const authorization = await authorizationHeader('partner', [1]);

    for (const route of H9_INDEPENDENT_STATUS_ROUTES) {
      const response = await sendRoute(app, route).set('Authorization', authorization);
      expect(response.status, route.join(' ')).toBe(200);
    }
    expect(actionabilityState.resolveForFund).not.toHaveBeenCalled();
  });

  it('serves per-metric provenance and render-model version 2 on live export surfaces', async () => {
    const authorization = await authorizationHeader('partner', [1]);

    const renderModelResponse = await sendRoute(app, EXPORT_ROUTES[0]).set(
      'Authorization',
      authorization
    );
    expect(renderModelResponse.status).toBe(200);
    const { renderModel: liveRenderModel } = renderModelResponse.body;
    expect(liveRenderModel.renderModelVersion).toBe(2);
    expect(liveRenderModel.metricSections.length).toBeGreaterThan(0);
    for (const section of liveRenderModel.metricSections) {
      expect(section.inputsHash).toBe(METRIC_RUN_INPUTS_HASH);
      expect(section.inputsHashShort).toBe(METRIC_RUN_INPUTS_HASH.slice(0, 12));
      expect(section.inputsHashShort).toHaveLength(12);
      expect(section.methodologyVersion).toBe('lp-reporting-methodology-v1');
      expect(section.calculationVersion).toBe('lp-reporting-metrics-engine-1.0.0');
    }

    const liveExportResponse = await sendRoute(app, EXPORT_ROUTES[1]).set(
      'Authorization',
      authorization
    );
    expect(liveExportResponse.status).toBe(200);
    expect(liveExportResponse.body.export.renderModel.renderModelVersion).toBe(2);
    for (const section of liveExportResponse.body.export.renderModel.metricSections) {
      expect(section.inputsHashShort).toHaveLength(12);
    }
  });

  it('replays a pre-provenance stored JSON export without a content-hash conflict', async () => {
    const authorization = await authorizationHeader('partner', [1]);

    const response = await sendRoute(app, EXPORT_ROUTES[2]).set('Authorization', authorization);

    expect(response.status).toBe(200);
    expect(response.body.inserted).toBe(false);
    expect(response.body.record.reportPackageExportId).toBe(601);
    expect(response.body.record.contentHash).toBe(STORED_JSON_CONTENT_HASH);
    expect(dbState.insertedExportRows).toHaveLength(0);
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
      '../lib/auth/fund-scope',
      '../lib/auth/principal',
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
