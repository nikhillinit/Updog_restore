import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface JournalFile {
  version?: string;
  dialect?: string;
  entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
}

export interface JournaledMigrationFile {
  tag: string;
  file: string;
  absPath: string;
  sql: string;
}

export type MigrationClass =
  | 'journaled-generated'
  | 'journaled-drift-patch'
  | 'legacy-journaled-unmarked'
  | 'loose-rollback'
  | 'loose-materialized-view'
  | 'loose-rls'
  | 'loose-shared-ledger-candidate'
  | 'loose-server-ledger-candidate'
  | 'loose-legacy-drift'
  | 'unknown-loose';

export interface LedgerFinding {
  severity: 'error' | 'warning' | 'info';
  code: string;
  file?: string;
  message: string;
}

export const MIGRATION_MARKER_PATTERN = /^\s*--\s*@(generated|drift-patch)\b/m;

export const LEGACY_JOURNALED_UNMARKED_ALLOWLIST: { tag: string; sha256: string }[] = [
  {
    tag: '0000_quick_vivisector',
    sha256: '6a7e7a6109cbaef773301ba939f899ee5f28362b142e84e9d1b3ae2e021b7b41',
  },
  {
    tag: '0001_certain_miracleman',
    sha256: '3092cab7d3eca160576cdd2f4a8b78a9f6c34148e53fae6443ae2a13abe59d6a',
  },
  {
    tag: '0002_phase0_variance_automation',
    sha256: '6510b66bba8bd57e58505422234c1835c472a6ac9725e0786515cf9dde7bea13',
  },
  {
    tag: '0003_phase0_runtime_alignment',
    sha256: 'f6d9f536f69cc1c61ff74cf07e93e0b837c57cb71b9e29d2f2a906d60b7291cf',
  },
  {
    tag: '0004_phase1a1c_company_snapshots',
    sha256: 'afd1bf394d94c2d426daf6a66e264499f0f917e6eea982f2b14badb07c669164',
  },
  {
    tag: '0005_phase1c2_alert_automation',
    sha256: '0ec2b6103b64f63d37e995d6b05d4343526008f9e762a62d8f2fc4b660eccce9',
  },
  {
    tag: '0005b_create_backtest_results',
    sha256: 'e4ae8a9f5f2695b82d61ba515ebc954f27c3751f46cfd4e9f55769fb19376c43',
  },
  {
    tag: '0006_phase2_backtest_scenario_comparison_summary',
    sha256: '70bf1de42bb322005ab71778d66d5e3cd109c5fc01a4b0ae444270086b1e6483',
  },
  {
    tag: '0007_phase2_retire_dormant_saved_comparison_persistence',
    sha256: '4f29f9b7329664c283954b9a92f461afd9a6b78b2c821fae1038519342612e92',
  },
  {
    tag: '0008_demo_profile_import_rows',
    sha256: '0493d1e7ea4eb2dd75257345255159856988599fe221cdc8c572c86b0c9e8772',
  },
  {
    tag: '0009_fund_snapshots_scenario_set_id',
    sha256: '6d4460542e249fedf963ce87d294c3a3bba9c407bf17e73efebc7130a88eade9',
  },
  {
    tag: '0010_fund_scenario_sets',
    sha256: '07965dc1d621e4bcda00eb599a6f308b4b594420576cfccabeaa33ecfcc1ae5a',
  },
  {
    tag: '0011_scenario_share_sensitivity_drift',
    sha256: '31aaacc07bcc9b070e109bf6b97fa30d5c86d268b8d6a37e2fc9f5cfa41b9054',
  },
  {
    tag: '0013_lp_reporting_core_drift',
    sha256: '22546f7bfc76fd4e3a2c9e50c6dccfde2f35cf416acb3d6a706979704e6e5149',
  },
  {
    tag: '0015_funds_base_currency',
    sha256: '82f989cbee1c5f36c00ac42668936bc7df842489b80af52cbde9aaab7b73adbd',
  },
  {
    tag: '0018_h9_actionability_snapshot_columns',
    sha256: '6be3b5e5afe7e328a98b7670baa0a62c20460572473f0d6cfbada57e3de69efc',
  },
  {
    tag: '0019_investments_id_fund_unique',
    sha256: 'c69d2a2498f48314d858922bbfd53c5896cfc9e64d55c662f3034c6cf3543879',
  },
];

const LEGACY_DRIFT_PATCH_REASON_ALLOWLIST = new Set([
  '0012_sector_variance_drift',
  '0014_lp_evidence_sprint3_drift',
  '0016_reconciliation_runs',
  '0017_moic_exit_probability_modes',
  '0020_operating_tasks_drift',
]);

const SHARED_LEDGER_TABLES = new Set([
  'alert_evaluation_executions',
  'backtest_results',
  'job_outbox',
  'optimization_sessions',
  'scenario_matrices',
]);

const SERVER_LEDGER_TABLES = new Set([
  'activities',
  'agent_memories',
  'allocation_scenario_decisions',
  'allocation_scenario_events',
  'allocation_scenario_ic_decisions',
  'allocation_scenario_items',
  'allocation_scenarios',
  'audit_log',
  'cash_flow_events',
  'deal_opportunities',
  'due_diligence_items',
  'evidence_records',
  'financial_projections',
  'fund_configs',
  'fund_events',
  'fund_metrics',
  'fund_models',
  'fund_nav_snapshots',
  'fund_snapshots',
  'funds',
  'investment_lots',
  'investment_round_model_overrides',
  'investment_rounds',
  'investments',
  'limited_partners',
  'lp_capital_accounts',
  'lp_capital_calls',
  'lp_distribution_details',
  'lp_documents',
  'lp_fund_commitments',
  'lp_metric_runs',
  'lp_notifications',
  'lp_notification_preferences',
  'lp_payment_submissions',
  'lp_performance_snapshots',
  'lp_report_package_exports',
  'lp_report_packages',
  'lp_reports',
  'lp_vehicle_participation',
  'lp_vehicle_participation_history',
  'market_research',
  'narrative_runs',
  'pipeline_activities',
  'pipeline_stages',
  'portfolio_companies',
  'portfoliocompanies',
  'reallocation_audit',
  'reserve_allocations',
  'scenario_audit_logs',
  'scenario_cases',
  'scenarios',
  'scoring_models',
  'sensitivity_runs',
  'share_snapshots',
  'stage_normalization_log',
  'tasks',
  'users',
  'valuation_marks',
]);

export function readDrizzleJournal(rootDir: string, migrationsDir = 'migrations'): JournalFile {
  const journalPath = path.join(rootDir, migrationsDir, 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) {
    throw new Error(`Drizzle journal missing at ${journalPath}`);
  }

  const raw = fs.readFileSync(journalPath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  return parseJournalFile(parsed, journalPath);
}

export function readJournaledMigrationFiles(
  rootDir: string,
  migrationsDir = 'migrations'
): JournaledMigrationFile[] {
  const journal = readDrizzleJournal(rootDir, migrationsDir);
  return journal.entries.map((entry) => {
    const file = `${entry.tag}.sql`;
    const absPath = path.join(rootDir, migrationsDir, file);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Journal tag ${entry.tag} has no matching migration file at ${absPath}`);
    }

    return {
      tag: entry.tag,
      file,
      absPath,
      sql: fs.readFileSync(absPath, 'utf-8'),
    };
  });
}

export function findLooseMigrationSql(
  rootDir: string,
  migrationsDir = 'migrations'
): { file: string; absPath: string }[] {
  const journalTags = new Set(
    readDrizzleJournal(rootDir, migrationsDir).entries.map((entry) => entry.tag)
  );
  const migrationsPath = path.join(rootDir, migrationsDir);

  return fs
    .readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .filter((entry) => !journalTags.has(path.basename(entry.name, '.sql')))
    .map((entry) => ({ file: entry.name, absPath: path.join(migrationsPath, entry.name) }))
    .sort((left, right) => left.file.localeCompare(right.file));
}

export function classifyMigrationSqlFile(
  fileName: string,
  sql: string,
  journalTags: ReadonlySet<string>
): {
  file: string;
  class: MigrationClass;
  marker: '@generated' | '@drift-patch' | null;
  reasons: string[];
} {
  const tag = path.basename(fileName, '.sql');
  const marker = readMigrationMarker(sql);
  const reasons: string[] = [];

  if (journalTags.has(tag)) {
    if (marker === '@generated') {
      reasons.push('journal tag is present and SQL is marked generated');
      return { file: fileName, class: 'journaled-generated', marker, reasons };
    }

    if (marker === '@drift-patch') {
      reasons.push('journal tag is present and SQL is marked drift patch');
      return { file: fileName, class: 'journaled-drift-patch', marker, reasons };
    }

    reasons.push('journal tag is present with no marker');
    return { file: fileName, class: 'legacy-journaled-unmarked', marker, reasons };
  }

  const normalizedFileName = fileName.toLowerCase();
  const normalizedSql = sql.toLowerCase();
  const tableNames = extractSqlTableNames(sql);

  if (isRollbackLike(normalizedFileName, normalizedSql)) {
    reasons.push('filename or SQL content is rollback/drop dominant');
    return { file: fileName, class: 'loose-rollback', marker, reasons };
  }

  if (
    /\b(?:create|refresh)\s+materialized\s+view\b/i.test(sql) ||
    normalizedFileName.includes('materialized_view')
  ) {
    reasons.push('SQL creates or refreshes a materialized view');
    return { file: fileName, class: 'loose-materialized-view', marker, reasons };
  }

  if (
    /\benable\s+row\s+level\s+security\b/i.test(sql) ||
    /\bcreate\s+policy\b/i.test(sql) ||
    normalizedSql.includes('multi_tenant_rls')
  ) {
    reasons.push('SQL contains RLS setup');
    return { file: fileName, class: 'loose-rls', marker, reasons };
  }

  if (hasOverlap(tableNames, SHARED_LEDGER_TABLES)) {
    reasons.push('table names overlap shared/migrations');
    return { file: fileName, class: 'loose-shared-ledger-candidate', marker, reasons };
  }

  if (hasOverlap(tableNames, SERVER_LEDGER_TABLES)) {
    reasons.push('table names overlap server/migrations');
    return { file: fileName, class: 'loose-server-ledger-candidate', marker, reasons };
  }

  if (isLegacyDriftLike(normalizedFileName, normalizedSql)) {
    reasons.push('filename or SQL content indicates legacy manual drift');
    return { file: fileName, class: 'loose-legacy-drift', marker, reasons };
  }

  reasons.push('no ledger, rollback, materialized-view, RLS, or legacy drift signal detected');
  return { file: fileName, class: 'unknown-loose', marker, reasons };
}

export function sha256OfFile(absPath: string): string {
  const contents = fs.readFileSync(absPath, 'utf-8');
  return crypto.createHash('sha256').update(contents).digest('hex');
}

export function validateMigrationLedger(
  rootDir: string,
  migrationsDir = 'migrations'
): { ok: boolean; findings: LedgerFinding[] } {
  const findings: LedgerFinding[] = [];
  let journal: JournalFile;

  try {
    journal = readDrizzleJournal(rootDir, migrationsDir);
  } catch (error) {
    return {
      ok: false,
      findings: [
        {
          severity: 'error',
          code: 'drizzle-journal-missing',
          message: error instanceof Error ? error.message : 'Drizzle journal missing',
        },
      ],
    };
  }

  const journalTags = new Set(journal.entries.map((entry) => entry.tag));
  const allowlist = new Map(
    LEGACY_JOURNALED_UNMARKED_ALLOWLIST.map((entry) => [entry.tag, entry.sha256])
  );

  for (const entry of journal.entries) {
    const file = `${entry.tag}.sql`;
    const absPath = path.join(rootDir, migrationsDir, file);
    if (!fs.existsSync(absPath)) {
      findings.push({
        severity: 'error',
        code: 'journal-tag-missing-file',
        file,
        message: `Journal tag ${entry.tag} has no matching ${file} file.`,
      });
      continue;
    }

    const sql = fs.readFileSync(absPath, 'utf-8');
    const classification = classifyMigrationSqlFile(file, sql, journalTags);
    const currentHash = sha256OfFile(absPath);

    if (classification.class === 'legacy-journaled-unmarked') {
      const expectedHash = allowlist.get(entry.tag);
      if (expectedHash === currentHash) {
        findings.push({
          severity: 'info',
          code: 'legacy-journaled-unmarked-allowlisted',
          file,
          message: `Grandfathered journaled SQL ${entry.tag} matched allowlist hash ${currentHash}.`,
        });
      } else {
        findings.push({
          severity: 'error',
          code: 'journaled-sql-missing-marker',
          file,
          message: `Journaled SQL ${entry.tag} is unmarked; new/edited journaled SQL needs -- @generated or -- @drift-patch marker.`,
        });
      }
    }

    if (classification.class === 'journaled-drift-patch' && !hasDriftPatchReason(sql, entry.tag)) {
      findings.push({
        severity: 'error',
        code: 'drift-patch-missing-reason',
        file,
        message: `Journaled drift patch ${entry.tag} needs a -- Reason: line after the -- @drift-patch marker.`,
      });
    }

    if (
      classification.class === 'journaled-generated' &&
      !hasAnySnapshotFile(rootDir, migrationsDir)
    ) {
      findings.push({
        severity: 'error',
        code: 'generated-migration-missing-snapshot',
        file,
        message: `Generated journaled SQL ${entry.tag} lacks a sibling ${migrationsDir}/meta/*snapshot* file.`,
      });
    }
  }

  for (const loose of findLooseMigrationSql(rootDir, migrationsDir)) {
    const sql = fs.readFileSync(loose.absPath, 'utf-8');
    const classification = classifyMigrationSqlFile(loose.file, sql, journalTags);
    findings.push({
      severity: classification.class === 'unknown-loose' ? 'warning' : 'info',
      code: 'loose-migration-sql',
      file: loose.file,
      message: `Loose migration SQL ${loose.file} classified as ${classification.class}; report only, not deleted.`,
    });
  }

  return {
    ok: !findings.some((finding) => finding.severity === 'error'),
    findings,
  };
}

function parseJournalFile(value: unknown, journalPath: string): JournalFile {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    throw new Error(`Invalid Drizzle journal at ${journalPath}`);
  }

  return {
    version: typeof value.version === 'string' ? value.version : undefined,
    dialect: typeof value.dialect === 'string' ? value.dialect : undefined,
    entries: value.entries.map((entry, index) => parseJournalEntry(entry, index, journalPath)),
  };
}

function parseJournalEntry(
  value: unknown,
  index: number,
  journalPath: string
): JournalFile['entries'][number] {
  if (!isRecord(value)) {
    throw new Error(`Invalid Drizzle journal entry ${index} at ${journalPath}`);
  }

  if (
    typeof value.idx !== 'number' ||
    typeof value.when !== 'number' ||
    typeof value.tag !== 'string'
  ) {
    throw new Error(`Invalid Drizzle journal entry ${index} at ${journalPath}`);
  }

  return {
    idx: value.idx,
    when: value.when,
    tag: value.tag,
    breakpoints: typeof value.breakpoints === 'boolean' ? value.breakpoints : false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readMigrationMarker(sql: string): '@generated' | '@drift-patch' | null {
  const match = MIGRATION_MARKER_PATTERN.exec(sql);
  if (!match) return null;
  return match[1] === 'generated' ? '@generated' : '@drift-patch';
}

function isRollbackLike(fileName: string, sql: string): boolean {
  if (fileName.includes('rollback') || fileName.endsWith('.down.sql')) return true;
  const rollbackCount = countMatches(sql, /\brollback\b/g);
  const dropCount = countMatches(
    sql,
    /\bdrop\s+(?:table|view|materialized\s+view|policy|index|trigger|function)\b/g
  );
  const createCount = countMatches(
    sql,
    /\bcreate\s+(?:table|view|materialized\s+view|policy|index|trigger|function)\b/g
  );
  return dropCount > createCount || (rollbackCount > 1 && dropCount > 0);
}

function isLegacyDriftLike(fileName: string, sql: string): boolean {
  return (
    /(?:manual|legacy|drift|hardening|normalization|agent_memories|portfolio|lp_reporting|sprint3|fix)/.test(
      fileName
    ) || /(?:manual|legacy|drift|hardening|normalization|agent_memories|portfolio)/.test(sql)
  );
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function extractSqlTableNames(sql: string): Set<string> {
  const names = new Set<string>();
  const tablePattern =
    /\b(?:create\s+table(?:\s+if\s+not\s+exists)?|alter\s+table(?:\s+if\s+exists)?|drop\s+table(?:\s+if\s+exists)?)\s+(?:"(?:public)"\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;

  for (const match of sql.matchAll(tablePattern)) {
    const tableName = match[1];
    if (tableName) {
      names.add(tableName.toLowerCase());
    }
  }

  return names;
}

function hasOverlap(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true;
  }

  return false;
}

function hasDriftPatchReason(sql: string, tag: string): boolean {
  const lines = sql.split(/\r?\n/);
  const markerIndex = lines.findIndex((line) => /^\s*--\s*@drift-patch\b/.test(line));
  if (markerIndex === -1) return false;

  const hasReason = lines.slice(markerIndex + 1).some((line) => /^\s*--\s*Reason:\s*\S/.test(line));
  return hasReason || LEGACY_DRIFT_PATCH_REASON_ALLOWLIST.has(tag);
}

function hasAnySnapshotFile(rootDir: string, migrationsDir: string): boolean {
  const metaDir = path.join(rootDir, migrationsDir, 'meta');
  if (!fs.existsSync(metaDir)) return false;

  return fs
    .readdirSync(metaDir, { withFileTypes: true })
    .some((entry) => entry.isFile() && entry.name.includes('snapshot'));
}
