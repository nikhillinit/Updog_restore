import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const ACTIVE_SURFACE_IDS = [
  'cohort',
  'portfolio-optimization',
  'lp-reporting',
  'shares',
  'sensitivity',
  'snapshots',
] as const;

export type ActiveSurfaceId = (typeof ACTIVE_SURFACE_IDS)[number];

export type SurfaceLayer = 'manifest' | 'drizzle' | 'migration' | 'contract-or-zod' | 'test';

export type FindingSeverity = 'info' | 'warning' | 'error';

export type FindingStatus = 'pass' | 'fail' | 'warn';

export interface RequiredFile {
  readonly path: string;
  readonly layer: Exclude<SurfaceLayer, 'manifest' | 'migration'>;
  readonly description: string;
}

export interface RequiredExport {
  readonly path: string;
  readonly layer: Exclude<SurfaceLayer, 'manifest' | 'migration' | 'test'>;
  readonly names: readonly string[];
}

export interface MigrationEvidence {
  readonly pattern: string;
  readonly required: boolean;
  readonly description: string;
}

export interface ActiveSchemaSurface {
  readonly id: ActiveSurfaceId;
  readonly label: string;
  readonly requiredFiles: readonly RequiredFile[];
  readonly requiredExports: readonly RequiredExport[];
  readonly migrationEvidence: readonly MigrationEvidence[];
  readonly tests: readonly string[];
  readonly notes?: string;
}

export interface SchemaDriftFinding {
  readonly surfaceId: ActiveSurfaceId | 'manifest';
  readonly layer: SurfaceLayer;
  readonly severity: FindingSeverity;
  readonly status: FindingStatus;
  readonly expected: string;
  readonly actual?: string;
  readonly path?: string;
  readonly message: string;
  readonly nextAction?: string;
}

export interface SchemaDriftValidationResult {
  readonly ok: boolean;
  readonly summary: {
    readonly surfaces: number;
    readonly errors: number;
    readonly warnings: number;
    readonly passes: number;
  };
  readonly findings: readonly SchemaDriftFinding[];
}

export interface ValidateOptions {
  readonly rootDir?: string;
  readonly surfaces?: readonly ActiveSchemaSurface[];
  readonly expectedSurfaceIds?: readonly ActiveSurfaceId[];
}

const currentModulePath = fileURLToPath(import.meta.url);

export const ACTIVE_SCHEMA_SURFACES: readonly ActiveSchemaSurface[] = [
  {
    id: 'cohort',
    label: 'Cohort analysis normalization',
    requiredFiles: [
      {
        path: 'shared/schema.ts',
        layer: 'drizzle',
        description: 'cohort Drizzle table and insert schema live in the schema barrel',
      },
      {
        path: 'server/routes/cohort-analysis.ts',
        layer: 'contract-or-zod',
        description: 'active route surface that consumes cohort definitions',
      },
    ],
    requiredExports: [
      {
        path: 'shared/schema.ts',
        layer: 'drizzle',
        names: ['cohortUnitEnum', 'cohortDefinitions', 'insertCohortDefinitionSchema'],
      },
    ],
    migrationEvidence: [
      {
        pattern: 'server/migrations/*cohort*.sql',
        required: false,
        description: 'no cohort-specific migration is currently present; keep this visible',
      },
    ],
    tests: [
      'tests/unit/contract/cohort-analysis-boundary.test.ts',
      'tests/unit/contract/funds-boundary-guard.test.ts',
      'tests/unit/server/cohort-routes-registration.test.ts',
    ],
    notes: 'Cohort has active routes and shared-core boundaries but no obvious source migration.',
  },
  {
    id: 'portfolio-optimization',
    label: 'Portfolio optimization persistence',
    requiredFiles: [
      {
        path: 'shared/schema.ts',
        layer: 'drizzle',
        description: 'job outbox, scenario matrix, and optimization session tables',
      },
      {
        path: 'shared/schemas/portfolio-optimization.ts',
        layer: 'contract-or-zod',
        description: 'Zod validation schemas for optimization inputs',
      },
    ],
    requiredExports: [
      {
        path: 'shared/schema.ts',
        layer: 'drizzle',
        names: [
          'jobOutbox',
          'scenarioMatrices',
          'optimizationSessions',
          'insertJobOutboxSchema',
          'insertScenarioMatrixSchema',
          'insertOptimizationSessionSchema',
        ],
      },
      {
        path: 'shared/schemas/portfolio-optimization.ts',
        layer: 'contract-or-zod',
        names: [
          'insertJobOutboxSchema',
          'insertScenarioMatrixSchema',
          'insertOptimizationSessionSchema',
        ],
      },
    ],
    migrationEvidence: [
      {
        pattern: 'server/migrations/*optimization*.sql',
        required: false,
        description: 'no portfolio-optimization migration is currently present; keep this visible',
      },
    ],
    tests: ['tests/unit/schema/portfolio-optimization-schema.test.ts'],
  },
  {
    id: 'lp-reporting',
    label: 'LP reporting evidence and packages',
    requiredFiles: [
      {
        path: 'shared/schema/lp-reporting-evidence.ts',
        layer: 'drizzle',
        description: 'LP reporting Drizzle tables',
      },
      {
        path: 'shared/contracts/lp-reporting/index.ts',
        layer: 'contract-or-zod',
        description: 'LP reporting contract barrel',
      },
    ],
    requiredExports: [
      {
        path: 'shared/schema/lp-reporting-evidence.ts',
        layer: 'drizzle',
        names: [
          'vehicles',
          'cashFlowEvents',
          'valuationMarks',
          'lpMetricRuns',
          'narrativeRuns',
          'evidenceRecords',
          'lpReportPackages',
          'lpReportPackageExports',
          'lpVehicleParticipation',
          'lpVehicleParticipationHistory',
        ],
      },
      {
        path: 'shared/contracts/lp-reporting/index.ts',
        layer: 'contract-or-zod',
        names: [
          'LpMetricRunCreateSchema',
          'MetricRunDetailResponseSchema',
          'ReportPackageRecordSchema',
          'ReportPackageGetResponseSchema',
        ],
      },
    ],
    migrationEvidence: [
      {
        pattern: 'server/migrations/*lp_reporting*.sql',
        required: true,
        description: 'LP reporting migration family',
      },
    ],
    tests: [
      'tests/unit/schema/lp-reporting-evidence-schema.test.ts',
      'tests/unit/schema/lp-reporting-import-indexes.test.ts',
      'tests/unit/contract/lp-reporting/lp-metric-run.contract.test.ts',
      'tests/unit/contract/lp-reporting/lp-report-package.contract.test.ts',
    ],
  },
  {
    id: 'shares',
    label: 'Public share links and immutable snapshots',
    requiredFiles: [
      {
        path: 'shared/schema/shares.ts',
        layer: 'drizzle',
        description: 'share, share snapshot, and share analytics tables',
      },
      {
        path: 'shared/contracts/public-share-snapshot.contract.ts',
        layer: 'contract-or-zod',
        description: 'public share snapshot payload contract',
      },
    ],
    requiredExports: [
      {
        path: 'shared/schema/shares.ts',
        layer: 'drizzle',
        names: [
          'shares',
          'shareSnapshots',
          'shareAnalytics',
          'insertShareSchema',
          'insertShareSnapshotSchema',
        ],
      },
      {
        path: 'shared/contracts/public-share-snapshot.contract.ts',
        layer: 'contract-or-zod',
        names: ['PublicShareSnapshotPayloadSchema'],
      },
    ],
    migrationEvidence: [
      {
        pattern: 'server/migrations/20260427_public_share_snapshots.*.sql',
        required: true,
        description: 'public share snapshot and idempotency migration',
      },
    ],
    tests: [
      'tests/unit/server/share-snapshot-service.test.ts',
      'tests/unit/server/share-routes-error-paths.test.ts',
      'tests/unit/server/public-route-boundary.test.ts',
    ],
  },
  {
    id: 'sensitivity',
    label: 'Sensitivity run persistence and contracts',
    requiredFiles: [
      {
        path: 'shared/schema.ts',
        layer: 'drizzle',
        description: 'sensitivity run table',
      },
      {
        path: 'shared/contracts/sensitivity-run-v1.contract.ts',
        layer: 'contract-or-zod',
        description: 'sensitivity run read/write contract',
      },
      {
        path: 'shared/contracts/sensitivity-variables-v1.ts',
        layer: 'contract-or-zod',
        description: 'sensitivity variable and metric contracts',
      },
    ],
    requiredExports: [
      {
        path: 'shared/schema.ts',
        layer: 'drizzle',
        names: ['sensitivityRuns'],
      },
      {
        path: 'shared/contracts/sensitivity-run-v1.contract.ts',
        layer: 'contract-or-zod',
        names: ['SensitivityRunV1Schema', 'SensitivityRunKindSchema', 'SensitivityRunStatusSchema'],
      },
      {
        path: 'shared/contracts/sensitivity-variables-v1.ts',
        layer: 'contract-or-zod',
        names: ['SensitivityVariableIdSchema', 'SensitivityMetricIdSchema'],
      },
    ],
    migrationEvidence: [
      {
        pattern: 'server/migrations/20260406_create_sensitivity_runs_v1.*.sql',
        required: true,
        description: 'sensitivity run persistence migration',
      },
    ],
    tests: [
      'tests/unit/contract/sensitivity-run-v1.test.ts',
      'tests/unit/contract/one-way-sensitivity.test.ts',
    ],
  },
  {
    id: 'snapshots',
    label: 'Forecast snapshots and fund-state read contract',
    requiredFiles: [
      {
        path: 'shared/schema.ts',
        layer: 'drizzle',
        description: 'forecast, versioned snapshot, and fund-state snapshot tables',
      },
      {
        path: 'shared/contracts/fund-state-read-v1.contract.ts',
        layer: 'contract-or-zod',
        description: 'canonical fund-state read contract',
      },
    ],
    requiredExports: [
      {
        path: 'shared/schema.ts',
        layer: 'drizzle',
        names: [
          'forecastSnapshots',
          'snapshotVersions',
          'fundStateSnapshots',
          'insertFundStateSnapshotSchema',
        ],
      },
      {
        path: 'shared/contracts/fund-state-read-v1.contract.ts',
        layer: 'contract-or-zod',
        names: ['FundStateReadV1Schema'],
      },
    ],
    migrationEvidence: [
      {
        pattern: 'server/migrations/*forecast_snapshot*.sql',
        required: false,
        description: 'no forecast snapshot migration is currently present; keep this visible',
      },
      {
        pattern: 'server/migrations/*fund_state_snapshot*.sql',
        required: false,
        description: 'no fund-state snapshot migration is currently present; keep this visible',
      },
      {
        pattern: 'server/migrations/*snapshot_version*.sql',
        required: false,
        description: 'no snapshot version migration is currently present; keep this visible',
      },
    ],
    tests: [
      'tests/unit/contract/fund-state-route.test.ts',
      'tests/unit/contract/funds-endpoint-snapshots.test.ts',
      'tests/unit/phase2b/fund-state-contract.test.ts',
    ],
    notes: 'The fund-state route contract is covered, but migration evidence is fragmented.',
  },
];

export function validateActiveSchemaSurfaces(
  options: ValidateOptions = {}
): SchemaDriftValidationResult {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const surfaces = options.surfaces ?? ACTIVE_SCHEMA_SURFACES;
  const expectedSurfaceIds = options.expectedSurfaceIds ?? ACTIVE_SURFACE_IDS;
  const findings: SchemaDriftFinding[] = [];

  findings.push(...validateSurfaceIds(surfaces, expectedSurfaceIds));

  for (const surface of surfaces) {
    findings.push(...validateRequiredFiles(rootDir, surface));
    findings.push(...validateRequiredExports(rootDir, surface));
    findings.push(...validateMigrationEvidence(rootDir, surface));
    findings.push(...validateTests(rootDir, surface));
  }

  const errors = findings.filter((finding) => finding.severity === 'error').length;
  const warnings = findings.filter((finding) => finding.severity === 'warning').length;
  const passes = findings.filter((finding) => finding.status === 'pass').length;

  return {
    ok: errors === 0,
    summary: {
      surfaces: surfaces.length,
      errors,
      warnings,
      passes,
    },
    findings,
  };
}

export function formatSchemaDriftReport(result: SchemaDriftValidationResult): string {
  const lines = [
    'Schema Drift Active Surface Report',
    `surfaces=${result.summary.surfaces} passes=${result.summary.passes} warnings=${result.summary.warnings} errors=${result.summary.errors}`,
    '',
  ];

  for (const finding of result.findings) {
    const status = finding.status.toUpperCase();
    const location = finding.path ? ` path=${finding.path}` : '';
    const actual = finding.actual ? ` actual=${finding.actual}` : '';
    lines.push(
      `${status} surface=${finding.surfaceId} layer=${finding.layer} expected=${finding.expected}${location}${actual}`
    );
    lines.push(`  ${finding.message}`);
    if (finding.nextAction) {
      lines.push(`  next=${finding.nextAction}`);
    }
  }

  return lines.join('\n');
}

function validateSurfaceIds(
  surfaces: readonly ActiveSchemaSurface[],
  expectedSurfaceIds: readonly ActiveSurfaceId[]
): SchemaDriftFinding[] {
  const findings: SchemaDriftFinding[] = [];
  const actualIds = surfaces.map((surface) => surface.id);
  const actualSet = new Set(actualIds);
  const expectedSet = new Set(expectedSurfaceIds);

  for (const expectedId of expectedSurfaceIds) {
    findings.push(
      actualSet.has(expectedId)
        ? pass('manifest', 'manifest', expectedId, 'surface is present exactly once')
        : fail(
            'manifest',
            'manifest',
            expectedId,
            'required active surface is missing from the manifest',
            'Add the surface to ACTIVE_SCHEMA_SURFACES before changing schema behavior.'
          )
    );
  }

  for (const actualId of actualSet) {
    if (!expectedSet.has(actualId)) {
      findings.push(
        fail(
          'manifest',
          'manifest',
          actualId,
          'unexpected active surface is present in the manifest',
          'Either remove it or update ACTIVE_SURFACE_IDS and the B1 plan.'
        )
      );
    }
  }

  for (const expectedId of expectedSurfaceIds) {
    const count = actualIds.filter((id) => id === expectedId).length;
    if (count > 1) {
      findings.push(
        fail(
          'manifest',
          'manifest',
          expectedId,
          'active surface is duplicated in the manifest',
          'Collapse duplicate manifest entries so each surface has one owner.'
        )
      );
    }
  }

  return findings;
}

function validateRequiredFiles(
  rootDir: string,
  surface: ActiveSchemaSurface
): SchemaDriftFinding[] {
  return surface.requiredFiles.map((requiredFile) => {
    const exists = fileExists(rootDir, requiredFile.path);
    return exists
      ? pass(
          surface.id,
          requiredFile.layer,
          requiredFile.description,
          'required file exists',
          requiredFile.path
        )
      : fail(
          surface.id,
          requiredFile.layer,
          requiredFile.description,
          'required file is missing',
          'Restore the file or update the manifest with the new authoritative path.',
          requiredFile.path
        );
  });
}

function validateRequiredExports(
  rootDir: string,
  surface: ActiveSchemaSurface
): SchemaDriftFinding[] {
  const findings: SchemaDriftFinding[] = [];

  for (const requiredExport of surface.requiredExports) {
    const absolutePath = resolveRepoPath(rootDir, requiredExport.path);
    if (!fs.existsSync(absolutePath)) {
      findings.push(
        fail(
          surface.id,
          requiredExport.layer,
          requiredExport.names.join(', '),
          'export source file is missing',
          'Restore the file or update the manifest with the new authoritative path.',
          requiredExport.path
        )
      );
      continue;
    }

    for (const name of requiredExport.names) {
      findings.push(
        hasNamedExportAtPath(rootDir, requiredExport.path, name)
          ? pass(
              surface.id,
              requiredExport.layer,
              name,
              'required export exists',
              requiredExport.path
            )
          : fail(
              surface.id,
              requiredExport.layer,
              name,
              'required export is missing',
              'Restore the export or update downstream contract/tests before changing schema behavior.',
              requiredExport.path
            )
      );
    }
  }

  return findings;
}

function validateMigrationEvidence(
  rootDir: string,
  surface: ActiveSchemaSurface
): SchemaDriftFinding[] {
  if (surface.migrationEvidence.length === 0) {
    return [
      fail(
        surface.id,
        'migration',
        'migration evidence entry',
        'surface has no migration evidence entry',
        'Add a required migration glob or a documented optional gap.'
      ),
    ];
  }

  return surface.migrationEvidence.map((evidence) => {
    const matches = findPatternMatches(rootDir, evidence.pattern);
    if (matches.length > 0) {
      return pass(
        surface.id,
        'migration',
        evidence.description,
        'migration evidence found',
        evidence.pattern,
        matches.join(', ')
      );
    }

    if (evidence.required) {
      return fail(
        surface.id,
        'migration',
        evidence.description,
        'required migration evidence is missing',
        'Add the missing migration evidence or document why this surface is intentionally schema-push only.',
        evidence.pattern
      );
    }

    return warn(
      surface.id,
      'migration',
      evidence.description,
      'optional migration evidence is absent',
      'If this is true drift, open a narrow surface-specific B1 follow-up.',
      evidence.pattern
    );
  });
}

function validateTests(rootDir: string, surface: ActiveSchemaSurface): SchemaDriftFinding[] {
  if (surface.tests.length === 0) {
    return [
      fail(
        surface.id,
        'test',
        'focused schema or contract test',
        'surface has no focused test source',
        'Add or identify a focused test before editing this surface.'
      ),
    ];
  }

  return surface.tests.map((testPath) =>
    fileExists(rootDir, testPath)
      ? pass(surface.id, 'test', testPath, 'focused test exists', testPath)
      : fail(
          surface.id,
          'test',
          testPath,
          'focused test is missing',
          'Restore the test or update the manifest with the new verification path.',
          testPath
        )
  );
}

function hasNamedExportAtPath(
  rootDir: string,
  relativePath: string,
  name: string,
  visitedPaths: ReadonlySet<string> = new Set()
): boolean {
  const absolutePath = resolveRepoPath(rootDir, relativePath);
  const normalizedPath = normalizeRepoPath(path.relative(rootDir, absolutePath));
  if (visitedPaths.has(normalizedPath) || !fs.existsSync(absolutePath)) {
    return false;
  }

  const nextVisitedPaths = new Set(visitedPaths);
  nextVisitedPaths.add(normalizedPath);
  const source = fs.readFileSync(absolutePath, 'utf8');

  if (hasNamedExport(source, name)) {
    return true;
  }

  return exportStarSources(source)
    .map((exportPath) => resolveExportPath(rootDir, normalizedPath, exportPath))
    .some((exportPath) => hasNamedExportAtPath(rootDir, exportPath, name, nextVisitedPaths));
}

function hasNamedExport(source: string, name: string): boolean {
  const escapedName = escapeRegExp(name);
  const declarationPattern = new RegExp(
    String.raw`export\s+(?:const|let|var|type|interface|enum|class|function)\s+${escapedName}\b`
  );
  const namedExportPattern = new RegExp(String.raw`export\s*\{[^}]*\b${escapedName}\b[^}]*\}`);
  return declarationPattern.test(source) || namedExportPattern.test(source);
}

function exportStarSources(source: string): string[] {
  return Array.from(
    source.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g),
    (match) => match[1]
  ).filter((exportPath): exportPath is string => typeof exportPath === 'string');
}

function resolveExportPath(rootDir: string, importerPath: string, exportPath: string): string {
  if (!exportPath.startsWith('.')) {
    return exportPath;
  }

  const importerDirectory = path.posix.dirname(importerPath);
  const withoutExtension = path.posix.normalize(path.posix.join(importerDirectory, exportPath));
  const candidates = [
    withoutExtension,
    `${withoutExtension}.ts`,
    path.posix.join(withoutExtension, 'index.ts'),
  ];

  return (
    candidates.find((candidate) => fs.existsSync(resolveRepoPath(rootDir, candidate))) ??
    `${withoutExtension}.ts`
  );
}

function findPatternMatches(rootDir: string, pattern: string): string[] {
  const normalizedPattern = normalizeRepoPath(pattern);
  const baseDir = baseDirForPattern(normalizedPattern);
  const absoluteBaseDir = resolveRepoPath(rootDir, baseDir);

  if (!fs.existsSync(absoluteBaseDir)) {
    return [];
  }

  const matcher = patternToRegExp(normalizedPattern);
  return listFiles(absoluteBaseDir)
    .map((absolutePath) => normalizeRepoPath(path.relative(rootDir, absolutePath)))
    .filter((relativePath) => matcher.test(relativePath))
    .sort();
}

function listFiles(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(absolutePath));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function baseDirForPattern(pattern: string): string {
  const firstWildcardIndex = pattern.indexOf('*');
  if (firstWildcardIndex === -1) {
    return path.posix.dirname(pattern);
  }

  const prefix = pattern.slice(0, firstWildcardIndex);
  const slashIndex = prefix.lastIndexOf('/');
  return slashIndex === -1 ? '.' : prefix.slice(0, slashIndex);
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.split('*').map(escapeRegExp).join('[^/]*');
  return new RegExp(`^${escaped}$`);
}

function fileExists(rootDir: string, relativePath: string): boolean {
  const absolutePath = resolveRepoPath(rootDir, relativePath);
  return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
}

function resolveRepoPath(rootDir: string, relativePath: string): string {
  return path.resolve(rootDir, ...normalizeRepoPath(relativePath).split('/'));
}

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function pass(
  surfaceId: ActiveSurfaceId | 'manifest',
  layer: SurfaceLayer,
  expected: string,
  message: string,
  filePath?: string,
  actual?: string
): SchemaDriftFinding {
  return {
    surfaceId,
    layer,
    severity: 'info',
    status: 'pass',
    expected,
    actual,
    path: filePath,
    message,
  };
}

function warn(
  surfaceId: ActiveSurfaceId,
  layer: SurfaceLayer,
  expected: string,
  message: string,
  nextAction: string,
  filePath?: string
): SchemaDriftFinding {
  return {
    surfaceId,
    layer,
    severity: 'warning',
    status: 'warn',
    expected,
    path: filePath,
    message,
    nextAction,
  };
}

function fail(
  surfaceId: ActiveSurfaceId | 'manifest',
  layer: SurfaceLayer,
  expected: string,
  message: string,
  nextAction: string,
  filePath?: string
): SchemaDriftFinding {
  return {
    surfaceId,
    layer,
    severity: 'error',
    status: 'fail',
    expected,
    path: filePath,
    message,
    nextAction,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseFormat(args: readonly string[]): 'text' | 'json' {
  return args.includes('--json') ? 'json' : 'text';
}

function isCliInvocation(): boolean {
  const invokedPath = process.argv[1];
  return typeof invokedPath === 'string' && path.resolve(invokedPath) === currentModulePath;
}

if (isCliInvocation()) {
  const result = validateActiveSchemaSurfaces();
  const format = parseFormat(process.argv.slice(2));
  const output =
    format === 'json' ? JSON.stringify(result, null, 2) : formatSchemaDriftReport(result);

  if (result.ok) {
    console.log(output);
  } else {
    console.error(output);
  }

  process.exit(result.ok ? 0 : 1);
}
