import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { readJournaledMigrationFiles } from '../../scripts/migration-ledger';

const APP_SOURCE_FILE = path.resolve(process.cwd(), 'server', 'app.ts');
const PROD_SCHEMA_MANIFEST_DIR = path.resolve(process.cwd(), 'scripts', 'prod-schema-manifests');

const C1_MOUNTED_TABLES = [
  'cohort_definitions',
  'sector_taxonomy',
  'sector_mappings',
  'company_overrides',
  'investment_overrides',
  'reconciliation_runs',
  'fund_calculation_modes',
  'tasks',
  'vehicles',
  'cash_flow_events',
  'valuation_marks',
  'planning_fmv_override_requests',
  'lp_metric_runs',
  'evidence_records',
  'narrative_runs',
  'lp_report_packages',
  'lp_report_package_exports',
  'allocation_scenarios',
  'allocation_scenario_items',
  'allocation_scenario_ic_decisions',
  'allocation_scenario_events',
  // s8.2 slice 3: deferred domain-locked exemption retired — both rounds tables are
  // journaled (migrations/0027) and read by mounted routes (investmentsRouter rounds
  // endpoints; fundMoicRouter via rounds-to-model-evidence-service).
  'investment_rounds',
  'investment_round_model_overrides',
] as const;

type MountKind = 'c1' | 'non-table' | 'other-table';

interface ProdSchemaExpectedTable {
  name: string;
  sharedTable?: boolean;
}

interface ProdSchemaManifest {
  name: string;
  expectedTables?: ProdSchemaExpectedTable[];
}

const MAKEAPP_ROUTE_INVENTORY: Record<string, { kind: MountKind; tables?: string[] }> = {
  reservesV1Router: { kind: 'other-table' },
  flagsRouter: { kind: 'other-table' },
  cashflowRouter: { kind: 'other-table' },
  healthRouter: { kind: 'non-table' },
  calculationsRouter: { kind: 'other-table' },
  aiRouter: { kind: 'non-table' },
  scenarioAnalysisRouter: { kind: 'other-table' },
  dualForecastRouter: { kind: 'other-table' },
  // Reads fund_metrics/portfolio_companies/activities via IStorage (no direct DB
  // writes, none in C1_MOUNTED_TABLES) — same posture as fundMetricsRouter (#1032).
  dashboardSummaryRouter: { kind: 'other-table' },
  allocationsRouter: { kind: 'other-table' },
  allocationScenariosRouter: {
    kind: 'c1',
    tables: [
      'allocation_scenarios',
      'allocation_scenario_items',
      'allocation_scenario_ic_decisions',
      'allocation_scenario_events',
    ],
  },
  planningFmvOverridesRouter: {
    kind: 'c1',
    tables: ['valuation_marks', 'planning_fmv_override_requests'],
  },
  fundScenarioSetsRouter: { kind: 'other-table' },
  fundMoicRouter: {
    kind: 'c1',
    tables: [
      'fund_calculation_modes',
      'reconciliation_runs',
      // via rounds-to-model-evidence-service (buildRoundsToModelEvidence)
      'investment_rounds',
      'investment_round_model_overrides',
    ],
  },
  fundActualsRouter: {
    kind: 'c1',
    tables: ['valuation_marks', 'investment_rounds', 'investment_round_model_overrides'],
  },
  reallocationRouter: { kind: 'other-table' },
  cashFlowEventsRouter: { kind: 'c1', tables: ['cash_flow_events'] },
  operatingObjectTasksRouter: { kind: 'c1', tables: ['tasks'] },
  backtestingRouter: { kind: 'other-table' },
  fundsRouter: { kind: 'other-table' },
  fundMetricsRouter: { kind: 'other-table' },
  // TimeTravelAnalyticsService reads fund_events, fund_snapshots, funds; also
  // funds in POST /:fundId/snapshot. None are in C1_MOUNTED_TABLES.
  timelineRouter: { kind: 'other-table' },
  // Shares management + anonymous public snapshot. Reads/writes shares, shareAnalytics, and share
  // snapshots -- none are in C1_MOUNTED_TABLES.
  sharesRouter: { kind: 'other-table' },
  publicSharesRouter: { kind: 'other-table' },
  capitalAllocationRouter: { kind: 'non-table' },
  liquidityRouter: { kind: 'non-table' },
  graduationRouter: { kind: 'non-table' },
  portfolioCompaniesRouter: { kind: 'other-table' },
  portfolioOverviewRouter: { kind: 'other-table' },
  investmentsRouter: { kind: 'c1', tables: ['investment_rounds'] },
  varianceRouter: { kind: 'other-table' },
  registerFundConfigRoutes: { kind: 'other-table' },
  dealPipelineRouter: { kind: 'other-table' },
  cohortAnalysisRouter: {
    kind: 'c1',
    tables: [
      'cohort_definitions',
      'sector_taxonomy',
      'sector_mappings',
      'company_overrides',
      'investment_overrides',
    ],
  },
  sensitivityRouter: { kind: 'other-table' },
  portfolioLotsRouter: { kind: 'other-table' },
  performanceApiRouter: { kind: 'other-table' },
  lpApiRouter: { kind: 'c1', tables: ['vehicles', 'valuation_marks'] },
  lpCapitalCallsRouter: { kind: 'other-table' },
  lpDistributionsRouter: { kind: 'other-table' },
  lpDocumentsRouter: { kind: 'other-table' },
  lpNotificationsRouter: { kind: 'other-table' },
  lpReportingImportsRouter: {
    kind: 'c1',
    tables: ['evidence_records', 'lp_report_packages', 'lp_report_package_exports'],
  },
  lpReportingMetricRunsRouter: { kind: 'c1', tables: ['lp_metric_runs'] },
  metricsRouter: { kind: 'non-table' },
  metricsRumRouter: { kind: 'non-table' },
  installRumIngressGuards: { kind: 'non-table' },
  // Login endpoint. Reads the `users` table via verifyCredentials -> storage.getUserByUsername.
  // `users` is not in C1_MOUNTED_TABLES, so other-table (same posture as fundsRouter).
  authRouter: { kind: 'other-table' },
};

function migrationSql(): string {
  return readJournaledMigrationFiles(process.cwd())
    .map((migrationFile) => migrationFile.sql)
    .join('\n');
}

function hasCreateTable(sql: string, tableName: string): boolean {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    String.raw`CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"?${escaped}"?\b`,
    'i'
  ).test(sql);
}

function makeAppSource(): string {
  return fs.readFileSync(APP_SOURCE_FILE, 'utf8');
}

function loadProdSchemaManifestFiles(): Array<{ file: string; manifest: ProdSchemaManifest }> {
  return fs
    .readdirSync(PROD_SCHEMA_MANIFEST_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      file,
      manifest: JSON.parse(
        fs.readFileSync(path.join(PROD_SCHEMA_MANIFEST_DIR, file), 'utf8')
      ) as ProdSchemaManifest,
    }));
}

function extractMakeAppRouteImportIdentifiers(appSource: string): string[] {
  const identifiers = new Set<string>();
  const importPattern = /^\s*import\s+(.+?)\s+from\s+['"](\.\/routes\/[^'"]+)['"];?/gm;

  for (const match of appSource.matchAll(importPattern)) {
    const importClause = match[1]?.trim();
    if (!importClause) continue;

    for (const identifier of parseImportClauseIdentifiers(importClause)) {
      identifiers.add(identifier);
    }
  }

  return [...identifiers].sort();
}

function parseImportClauseIdentifiers(importClause: string): string[] {
  const identifiers: string[] = [];
  const namedImportMatch = /\{([^}]+)\}/.exec(importClause);
  const defaultImport = importClause
    .replace(/\{[^}]*\}/, '')
    .replace(/,\s*$/, '')
    .trim();

  if (defaultImport && !defaultImport.startsWith('*')) {
    identifiers.push(defaultImport);
  }

  if (namedImportMatch) {
    for (const specifier of namedImportMatch[1].split(',')) {
      const localIdentifier = specifier
        .replace(/^\s*type\s+/, '')
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (localIdentifier) {
        identifiers.push(localIdentifier);
      }
    }
  }

  return identifiers;
}

describe('makeApp mount parity with journaled migrations', () => {
  it('every C1 mounted table is covered by at least one prod-schema manifest expectedTables', () => {
    const manifests = loadProdSchemaManifestFiles();
    const covered = new Set<string>();

    for (const { manifest } of manifests) {
      for (const table of manifest.expectedTables ?? []) {
        covered.add(table.name);
      }
    }

    const missing = C1_MOUNTED_TABLES.filter((tableName) => !covered.has(tableName));

    expect(missing).toEqual([]);
  });

  it('no table is owned by more than one manifest unless marked sharedTable', () => {
    const manifests = loadProdSchemaManifestFiles();
    const ownership = new Map<string, string[]>();

    for (const { file, manifest } of manifests) {
      const ownedTableNames = new Set(
        (manifest.expectedTables ?? [])
          .filter((table) => table.sharedTable !== true)
          .map((table) => table.name)
      );

      for (const tableName of [...ownedTableNames].sort()) {
        const owners = ownership.get(tableName) ?? [];
        owners.push(file);
        ownership.set(tableName, owners);
      }
    }

    const collisions = [...ownership.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([tableName, files]) => `${tableName} in ${files.join(',')}`);

    expect(collisions).toEqual([]);
  });

  it('has CREATE TABLE coverage for every C1 mounted table', () => {
    const sql = migrationSql();
    const missingCreateTables = C1_MOUNTED_TABLES.filter(
      (tableName) => !hasCreateTable(sql, tableName)
    );

    expect(missingCreateTables).toEqual([]);
  });

  it('keeps the formerly deferred rounds tables inside the C1 parity set (exemption retired)', () => {
    // Journal coverage itself is asserted by the C1 parity test above; this pin
    // guards against a silent re-exemption of either table.
    expect(C1_MOUNTED_TABLES).toContain('investment_rounds');
    expect(C1_MOUNTED_TABLES).toContain('investment_round_model_overrides');
  });

  it('classifies every makeApp route mount (D6 recurrence guard)', () => {
    const routeImportIdentifiers = extractMakeAppRouteImportIdentifiers(makeAppSource());
    const missingRouteClassifications = routeImportIdentifiers.filter(
      (identifier) => !Object.hasOwn(MAKEAPP_ROUTE_INVENTORY, identifier)
    );

    expect(missingRouteClassifications).toEqual([]);
  });

  it('keeps C1 route-table classifications inside the C1 parity set', () => {
    const c1MountedTables = new Set<string>(C1_MOUNTED_TABLES);
    const c1TablesOutsideParitySet = Object.entries(MAKEAPP_ROUTE_INVENTORY).flatMap(
      ([mount, entry]) =>
        entry.kind === 'c1'
          ? (entry.tables ?? [])
              .filter((tableName) => !c1MountedTables.has(tableName))
              .map((tableName) => `${mount}:${tableName}`)
          : []
    );

    expect(c1TablesOutsideParitySet).toEqual([]);
  });
});
