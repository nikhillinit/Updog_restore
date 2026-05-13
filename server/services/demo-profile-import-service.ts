import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db';
import {
  backtestResults,
  dealOpportunities,
  demoProfileImportRows,
  fundBaselines,
  fundMetrics,
  funds,
  investmentLots,
  investments,
  pacingHistory,
  portfolioCompanies,
  users,
  varianceReports,
  type DemoProfileImportRowRecord,
} from '@shared/schema';
import { SYSTEM_ACTOR_ID, SYSTEM_ACTOR_USERNAME } from '@shared/constants/system-actor';
import {
  DemoProfileImportBundleSchema,
  DemoProfileSectionOrder,
  DemoProfileTargetTables,
  type DemoProfileBacktestResultRow,
  type DemoProfileDealOpportunityRow,
  type DemoProfileFundBaselineRow,
  type DemoProfileFundMetricRow,
  type DemoProfileImportBundle,
  type DemoProfileImportCommitSummary,
  type DemoProfileImportPreview,
  type DemoProfileImportPreviewRow,
  type DemoProfileInvestmentLotRow,
  type DemoProfileInvestmentRow,
  type DemoProfileJsonValue,
  type DemoProfilePacingHistoryRow,
  type DemoProfilePortfolioCompanyRow,
  type DemoProfileSectionName,
  type DemoProfileTargetPkType,
  type DemoProfileTargetTable,
  type DemoProfileVarianceReportRow,
} from '@shared/contracts/demo-profile-import.contract';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type InsertBacktestResult = typeof backtestResults.$inferInsert;

export class DemoProfileImportError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'DemoProfileImportError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface SectionMeta {
  section: DemoProfileSectionName;
  targetTable: DemoProfileTargetTable;
  targetPkType: DemoProfileTargetPkType;
}

const SECTION_META: Record<DemoProfileSectionName, SectionMeta> = {
  portfolioCompanies: {
    section: 'portfolioCompanies',
    targetTable: 'portfoliocompanies',
    targetPkType: 'integer',
  },
  investments: { section: 'investments', targetTable: 'investments', targetPkType: 'integer' },
  investmentLots: {
    section: 'investmentLots',
    targetTable: 'investment_lots',
    targetPkType: 'uuid',
  },
  dealOpportunities: {
    section: 'dealOpportunities',
    targetTable: 'deal_opportunities',
    targetPkType: 'integer',
  },
  fundMetrics: { section: 'fundMetrics', targetTable: 'fund_metrics', targetPkType: 'integer' },
  pacingHistory: {
    section: 'pacingHistory',
    targetTable: 'pacing_history',
    targetPkType: 'integer',
  },
  fundBaselines: { section: 'fundBaselines', targetTable: 'fund_baselines', targetPkType: 'uuid' },
  varianceReports: {
    section: 'varianceReports',
    targetTable: 'variance_reports',
    targetPkType: 'uuid',
  },
  backtestResults: {
    section: 'backtestResults',
    targetTable: 'backtest_results',
    targetPkType: 'uuid',
  },
};

const REVERSE_SECTION_ORDER = [...DemoProfileSectionOrder].reverse();
const SYSTEM_ACTOR_PASSWORD = 'SYSTEM_ACTOR_NO_LOGIN_00000000';
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const INTEGER_ID_REGEX = /^[1-9]\d*$/;
const DEFAULT_BASELINE_RESTORE_SOURCE_PREFIX = 'system:restore-default-baseline:';
const DEFAULT_BASELINE_UNIQUE_CONSTRAINT = 'fund_baselines_default_unique';

export interface DemoProfileImportEnv {
  DEMO_PROFILE_IMPORT?: string;
  ALLOW_PRODUCTION_DEMO_PROFILE_IMPORT?: string;
  NODE_ENV?: string;
}

export interface DemoProfileImportLedgerScope {
  fundId: number;
  datasetId: string;
  targetTable: DemoProfileTargetTable;
  sourceKey: string;
}

export interface DemoProfileImportLedgerRecord {
  fundId: number;
  datasetId: string;
  targetTable: DemoProfileTargetTable;
  sourceKey: string;
  sourceHash: string;
  targetIdText: string;
  targetPkType: DemoProfileTargetPkType;
}

export interface DemoProfileFundRecord {
  id: number;
  name: string;
}

export interface DemoProfileRollbackSummary {
  datasetId: string;
  deleted: Record<DemoProfileTargetTable, number>;
}

export interface DemoProfileImportStore {
  getFund(fundId: number): Promise<DemoProfileFundRecord | null>;
  ensureSystemActor(): Promise<void>;
  getLedgerRow(scope: DemoProfileImportLedgerScope): Promise<DemoProfileImportLedgerRecord | null>;
  listLedgerRows(fundId: number, datasetId: string): Promise<DemoProfileImportLedgerRecord[]>;
  insertLedgerRow(row: DemoProfileImportLedgerRecord): Promise<void>;
  deleteLedgerRowsForDataset(fundId: number, datasetId: string): Promise<void>;
  targetExists(row: DemoProfileImportLedgerRecord): Promise<boolean>;
  getActiveDefaultBaselineId(fundId: number): Promise<string | null>;
  deactivateActiveDefaultBaselines(fundId: number): Promise<void>;
  restoreDefaultBaseline(fundId: number, baselineId: string): Promise<void>;
  insertPortfolioCompany(fundId: number, row: DemoProfilePortfolioCompanyRow): Promise<number>;
  insertInvestment(
    fundId: number,
    row: DemoProfileInvestmentRow,
    companyId: number
  ): Promise<number>;
  insertInvestmentLot(row: DemoProfileInvestmentLotRow, investmentId: number): Promise<string>;
  insertDealOpportunity(fundId: number, row: DemoProfileDealOpportunityRow): Promise<number>;
  insertFundMetric(fundId: number, row: DemoProfileFundMetricRow): Promise<number>;
  insertPacingHistory(fundId: number, row: DemoProfilePacingHistoryRow): Promise<number>;
  insertFundBaseline(fundId: number, row: DemoProfileFundBaselineRow): Promise<string>;
  insertVarianceReport(
    fundId: number,
    row: DemoProfileVarianceReportRow,
    baselineId: string
  ): Promise<string>;
  insertBacktestResult(
    fundId: number,
    row: DemoProfileBacktestResultRow,
    baselineId: string | undefined
  ): Promise<string>;
  deleteTargets(
    fundId: number,
    targetTable: DemoProfileTargetTable,
    targetIdTexts: string[]
  ): Promise<number>;
}

export interface DemoProfileCommitOptions {
  database?: typeof db;
  allowTestFundI?: boolean;
  allowDefaultBaselineReplace?: boolean;
  enforceImportGate?: boolean;
  env?: DemoProfileImportEnv;
}

export interface DemoProfileCommitWithStoreOptions {
  allowTestFundI?: boolean;
  allowDefaultBaselineReplace?: boolean;
}

export interface DemoProfileRollbackOptions {
  database?: typeof db;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  const record = value as Record<string, unknown>;
  const canonical: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const child = record[key];
    if (child !== undefined) {
      canonical[key] = canonicalize(child);
    }
  }
  return canonical;
}

function sha256Hex(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function emptyTableCounts(): Record<DemoProfileTargetTable, number> {
  return Object.fromEntries(DemoProfileTargetTables.map((table) => [table, 0])) as Record<
    DemoProfileTargetTable,
    number
  >;
}

function emptySectionCounts(): Record<DemoProfileSectionName, number> {
  return Object.fromEntries(DemoProfileSectionOrder.map((section) => [section, 0])) as Record<
    DemoProfileSectionName,
    number
  >;
}

function toDate(value: string | undefined): Date | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (ISO_DATE_REGEX.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  return new Date(value);
}

function toRequiredDate(value: string): Date {
  return toDate(value) ?? new Date(value);
}

function parseIntegerId(targetIdText: string): number {
  if (!INTEGER_ID_REGEX.test(targetIdText)) {
    throw new DemoProfileImportError(
      500,
      'INVALID_LEDGER_TARGET_ID',
      'Ledger target id is not a valid integer.'
    );
  }
  return Number.parseInt(targetIdText, 10);
}

function requireOne<T>(rows: T[], code: string, message: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new DemoProfileImportError(500, code, message);
  }
  return row;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined)) as T;
}

function redactZodIssues(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('issues' in error)) {
    return undefined;
  }
  const issues = (error as { issues: Array<{ code: string; path: Array<string | number> }> })
    .issues;
  return {
    issues: issues.map((issue) => ({
      code: issue.code,
      path: issue.path.join('.'),
    })),
  };
}

export function parseDemoProfileImportBundle(input: unknown): DemoProfileImportBundle {
  const parsed = DemoProfileImportBundleSchema.safeParse(input);
  if (!parsed.success) {
    throw new DemoProfileImportError(
      422,
      'INVALID_DEMO_PROFILE_BUNDLE',
      'Demo profile bundle failed validation.',
      redactZodIssues(parsed.error)
    );
  }
  return parsed.data;
}

export function computeDemoProfileSourceHash(input: {
  section: DemoProfileSectionName;
  targetTable: DemoProfileTargetTable;
  sourceKey: string;
  row: unknown;
}): string {
  return sha256Hex(input);
}

function flattenPreviewRows(bundle: DemoProfileImportBundle): DemoProfileImportPreviewRow[] {
  const rows: DemoProfileImportPreviewRow[] = [];
  for (const section of DemoProfileSectionOrder) {
    const meta = SECTION_META[section];
    for (const row of bundle.sections[section]) {
      rows.push({
        section,
        targetTable: meta.targetTable,
        sourceKey: row.sourceKey,
        sourceHash: computeDemoProfileSourceHash({
          section,
          targetTable: meta.targetTable,
          sourceKey: row.sourceKey,
          row,
        }),
        action: 'insert',
      });
    }
  }
  return rows;
}

function assertUniqueSourceKeys(bundle: DemoProfileImportBundle): void {
  for (const section of DemoProfileSectionOrder) {
    const seen = new Set<string>();
    for (const row of bundle.sections[section]) {
      if (seen.has(row.sourceKey)) {
        throw new DemoProfileImportError(
          422,
          'DUPLICATE_SOURCE_KEY',
          'Demo profile bundle contains a duplicate source key.',
          { section }
        );
      }
      seen.add(row.sourceKey);
    }
  }
}

function assertReferencesResolvable(bundle: DemoProfileImportBundle): void {
  const companyKeys = new Set(bundle.sections.portfolioCompanies.map((row) => row.sourceKey));
  for (const row of bundle.sections.investments) {
    if (!companyKeys.has(row.companySourceKey)) {
      throw new DemoProfileImportError(
        422,
        'MISSING_SOURCE_REFERENCE',
        'Investment references a company source key that is not in the bundle.',
        { section: 'investments' }
      );
    }
  }

  const investmentKeys = new Set(bundle.sections.investments.map((row) => row.sourceKey));
  for (const row of bundle.sections.investmentLots) {
    if (!investmentKeys.has(row.investmentSourceKey)) {
      throw new DemoProfileImportError(
        422,
        'MISSING_SOURCE_REFERENCE',
        'Investment lot references an investment source key that is not in the bundle.',
        { section: 'investmentLots' }
      );
    }
  }

  const baselineKeys = new Set(bundle.sections.fundBaselines.map((row) => row.sourceKey));
  for (const row of bundle.sections.varianceReports) {
    if (!baselineKeys.has(row.baselineSourceKey)) {
      throw new DemoProfileImportError(
        422,
        'MISSING_SOURCE_REFERENCE',
        'Variance report references a baseline source key that is not in the bundle.',
        { section: 'varianceReports' }
      );
    }
  }
  for (const row of bundle.sections.backtestResults) {
    if (row.baselineSourceKey !== undefined && !baselineKeys.has(row.baselineSourceKey)) {
      throw new DemoProfileImportError(
        422,
        'MISSING_SOURCE_REFERENCE',
        'Backtest result references a baseline source key that is not in the bundle.',
        { section: 'backtestResults' }
      );
    }
  }
}

export function runDemoProfileDryRun(input: unknown): DemoProfileImportPreview {
  const bundle = parseDemoProfileImportBundle(input);
  assertUniqueSourceKeys(bundle);
  assertReferencesResolvable(bundle);

  const rows = flattenPreviewRows(bundle);
  const counts = emptySectionCounts();
  for (const section of DemoProfileSectionOrder) {
    counts[section] = bundle.sections[section].length;
  }

  return {
    datasetId: bundle.datasetId,
    previewHash: sha256Hex({
      schemaVersion: bundle.schemaVersion,
      datasetId: bundle.datasetId,
      generatedAt: bundle.generatedAt,
      sourceSystemLabel: bundle.sourceSystemLabel,
      targetProfile: bundle.targetProfile,
      counts,
      rows,
    }),
    counts,
    rows,
  };
}

export function assertDemoProfileImportEnabled(env: DemoProfileImportEnv = process.env): void {
  if (env.DEMO_PROFILE_IMPORT !== '1') {
    throw new DemoProfileImportError(
      403,
      'DEMO_PROFILE_IMPORT_DISABLED',
      'Demo profile import is disabled.'
    );
  }
  if (env.NODE_ENV === 'production' && env.ALLOW_PRODUCTION_DEMO_PROFILE_IMPORT !== '1') {
    throw new DemoProfileImportError(
      403,
      'PRODUCTION_DEMO_PROFILE_IMPORT_DISABLED',
      'Production demo profile import requires an explicit production override.'
    );
  }
}

export function loadDemoProfileBundleFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  variableName = 'DEMO_PROFILE_PAYLOAD_B64'
): DemoProfileImportBundle {
  const encoded = env[variableName];
  if (encoded === undefined || encoded.length === 0) {
    throw new DemoProfileImportError(
      400,
      'MISSING_ENV_PAYLOAD',
      'Demo profile env payload missing.'
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    throw new DemoProfileImportError(
      400,
      'INVALID_ENV_PAYLOAD',
      'Demo profile env payload is not valid base64 JSON.'
    );
  }
  return parseDemoProfileImportBundle(parsedJson);
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertRepoInternalInputIsIgnored(absPath: string, repoRoot: string): void {
  if (!isPathInside(repoRoot, absPath)) {
    return;
  }

  const relative = path.relative(repoRoot, absPath);
  try {
    execFileSync('git', ['check-ignore', '-q', '--', relative], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  } catch {
    throw new DemoProfileImportError(
      400,
      'PRIVATE_INPUT_NOT_GITIGNORED',
      'Repo-local demo profile input must be gitignored.'
    );
  }
}

export function loadDemoProfileBundleFromPath(
  inputPath: string,
  options: { repoRoot?: string } = {}
): DemoProfileImportBundle {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const absPath = path.resolve(inputPath);
  assertRepoInternalInputIsIgnored(absPath, repoRoot);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(absPath);
  } catch {
    throw new DemoProfileImportError(400, 'INPUT_NOT_FOUND', 'Demo profile input was not found.');
  }

  const payloadPath = stat.isDirectory() ? path.join(absPath, 'demo-profile.json') : absPath;
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  } catch {
    throw new DemoProfileImportError(
      400,
      'INVALID_INPUT_JSON',
      'Demo profile input is not valid JSON.'
    );
  }
  return parseDemoProfileImportBundle(parsedJson);
}

function assertTargetFundAllowed(
  fund: DemoProfileFundRecord | null,
  options: DemoProfileCommitWithStoreOptions
): DemoProfileFundRecord {
  if (fund === null) {
    throw new DemoProfileImportError(404, 'FUND_NOT_FOUND', 'Target fund was not found.');
  }
  if (!options.allowTestFundI && fund.name === 'Test Fund I') {
    throw new DemoProfileImportError(
      403,
      'TEST_FUND_I_IMPORT_BLOCKED',
      'Private demo profile import cannot target Test Fund I by default.'
    );
  }
  return fund;
}

function existingTargetId(
  ledgerRow: DemoProfileImportLedgerRecord,
  expectedPkType: DemoProfileTargetPkType
): string {
  if (ledgerRow.targetPkType !== expectedPkType) {
    throw new DemoProfileImportError(
      409,
      'LEDGER_TARGET_TYPE_MISMATCH',
      'Existing import ledger row has an unexpected target id type.'
    );
  }
  return ledgerRow.targetIdText;
}

function isUniqueConstraintViolation(error: unknown, constraintName: string): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string; constraint?: string; message?: string };
  return (
    candidate.code === '23505' &&
    (candidate.constraint === constraintName ||
      candidate.message?.includes(constraintName) === true)
  );
}

async function handleExistingLedgerRow(
  store: DemoProfileImportStore,
  ledgerRow: DemoProfileImportLedgerRecord,
  sourceHash: string
): Promise<string> {
  if (ledgerRow.sourceHash !== sourceHash) {
    throw new DemoProfileImportError(
      409,
      'SOURCE_HASH_MISMATCH',
      'Source key already imported with a different source hash.'
    );
  }
  if (!(await store.targetExists(ledgerRow))) {
    throw new DemoProfileImportError(
      409,
      'LEDGER_TARGET_MISSING',
      'Import ledger row points to a missing target record.'
    );
  }
  return ledgerRow.targetIdText;
}

async function commitInsert(
  store: DemoProfileImportStore,
  ledgerRow: DemoProfileImportLedgerRecord,
  insert: () => Promise<string>
): Promise<{ targetIdText: string; inserted: boolean }> {
  const existing = await store.getLedgerRow(ledgerRow);
  if (existing !== null) {
    const targetIdText = await handleExistingLedgerRow(store, existing, ledgerRow.sourceHash);
    return { targetIdText, inserted: false };
  }

  const targetIdText = await insert();
  await store.insertLedgerRow({ ...ledgerRow, targetIdText });
  return { targetIdText, inserted: true };
}

function ledgerRowFor(
  fundId: number,
  datasetId: string,
  section: DemoProfileSectionName,
  row: { sourceKey: string }
): Omit<DemoProfileImportLedgerRecord, 'targetIdText'> {
  const meta = SECTION_META[section];
  return {
    fundId,
    datasetId,
    targetTable: meta.targetTable,
    sourceKey: row.sourceKey,
    sourceHash: computeDemoProfileSourceHash({
      section,
      targetTable: meta.targetTable,
      sourceKey: row.sourceKey,
      row,
    }),
    targetPkType: meta.targetPkType,
  };
}

function defaultBaselineRestoreLedgerRow(input: {
  fundId: number;
  datasetId: string;
  importedBaselineSourceKey: string;
  previousDefaultBaselineId: string;
}): DemoProfileImportLedgerRecord {
  const sourceKey = `${DEFAULT_BASELINE_RESTORE_SOURCE_PREFIX}${input.importedBaselineSourceKey}`;
  return {
    fundId: input.fundId,
    datasetId: input.datasetId,
    targetTable: 'fund_baselines',
    sourceKey,
    sourceHash: sha256Hex({
      action: 'restore-default-baseline',
      sourceKey,
      targetIdText: input.previousDefaultBaselineId,
    }),
    targetIdText: input.previousDefaultBaselineId,
    targetPkType: 'uuid',
  };
}

function isDefaultBaselineRestoreRow(row: DemoProfileImportLedgerRecord): boolean {
  return (
    row.targetTable === 'fund_baselines' &&
    row.sourceKey.startsWith(DEFAULT_BASELINE_RESTORE_SOURCE_PREFIX)
  );
}

export async function commitDemoProfileImportWithStore(
  store: DemoProfileImportStore,
  input: { fundId: number; bundle: DemoProfileImportBundle; previewHash: string },
  options: DemoProfileCommitWithStoreOptions = {}
): Promise<DemoProfileImportCommitSummary> {
  const preview = runDemoProfileDryRun(input.bundle);
  if (preview.previewHash !== input.previewHash) {
    throw new DemoProfileImportError(
      409,
      'PREVIEW_HASH_MISMATCH',
      'Demo profile preview hash does not match the submitted bundle.'
    );
  }

  assertTargetFundAllowed(await store.getFund(input.fundId), options);
  await store.ensureSystemActor();

  const inserted = emptyTableCounts();
  const skipped = emptyTableCounts();
  const companyIds = new Map<string, number>();
  const investmentIds = new Map<string, number>();
  const baselineIds = new Map<string, string>();

  for (const row of input.bundle.sections.portfolioCompanies) {
    const ledgerBase = ledgerRowFor(
      input.fundId,
      input.bundle.datasetId,
      'portfolioCompanies',
      row
    );
    const result = await commitInsert(store, { ...ledgerBase, targetIdText: '' }, async () =>
      String(await store.insertPortfolioCompany(input.fundId, row))
    );
    companyIds.set(row.sourceKey, parseIntegerId(result.targetIdText));
    inserted[ledgerBase.targetTable] += result.inserted ? 1 : 0;
    skipped[ledgerBase.targetTable] += result.inserted ? 0 : 1;
  }

  for (const row of input.bundle.sections.investments) {
    const companyId = companyIds.get(row.companySourceKey);
    if (companyId === undefined) {
      throw new DemoProfileImportError(
        422,
        'MISSING_SOURCE_REFERENCE',
        'Investment company source key was not resolved.'
      );
    }
    const ledgerBase = ledgerRowFor(input.fundId, input.bundle.datasetId, 'investments', row);
    const result = await commitInsert(store, { ...ledgerBase, targetIdText: '' }, async () =>
      String(await store.insertInvestment(input.fundId, row, companyId))
    );
    investmentIds.set(row.sourceKey, parseIntegerId(result.targetIdText));
    inserted[ledgerBase.targetTable] += result.inserted ? 1 : 0;
    skipped[ledgerBase.targetTable] += result.inserted ? 0 : 1;
  }

  for (const row of input.bundle.sections.investmentLots) {
    const investmentId = investmentIds.get(row.investmentSourceKey);
    if (investmentId === undefined) {
      throw new DemoProfileImportError(
        422,
        'MISSING_SOURCE_REFERENCE',
        'Investment lot source key was not resolved.'
      );
    }
    const ledgerBase = ledgerRowFor(input.fundId, input.bundle.datasetId, 'investmentLots', row);
    const result = await commitInsert(store, { ...ledgerBase, targetIdText: '' }, () =>
      store.insertInvestmentLot(row, investmentId)
    );
    inserted[ledgerBase.targetTable] += result.inserted ? 1 : 0;
    skipped[ledgerBase.targetTable] += result.inserted ? 0 : 1;
  }

  for (const row of input.bundle.sections.dealOpportunities) {
    const ledgerBase = ledgerRowFor(input.fundId, input.bundle.datasetId, 'dealOpportunities', row);
    const result = await commitInsert(store, { ...ledgerBase, targetIdText: '' }, async () =>
      String(await store.insertDealOpportunity(input.fundId, row))
    );
    inserted[ledgerBase.targetTable] += result.inserted ? 1 : 0;
    skipped[ledgerBase.targetTable] += result.inserted ? 0 : 1;
  }

  for (const row of input.bundle.sections.fundMetrics) {
    const ledgerBase = ledgerRowFor(input.fundId, input.bundle.datasetId, 'fundMetrics', row);
    const result = await commitInsert(store, { ...ledgerBase, targetIdText: '' }, async () =>
      String(await store.insertFundMetric(input.fundId, row))
    );
    inserted[ledgerBase.targetTable] += result.inserted ? 1 : 0;
    skipped[ledgerBase.targetTable] += result.inserted ? 0 : 1;
  }

  for (const row of input.bundle.sections.pacingHistory) {
    const ledgerBase = ledgerRowFor(input.fundId, input.bundle.datasetId, 'pacingHistory', row);
    const result = await commitInsert(store, { ...ledgerBase, targetIdText: '' }, async () =>
      String(await store.insertPacingHistory(input.fundId, row))
    );
    inserted[ledgerBase.targetTable] += result.inserted ? 1 : 0;
    skipped[ledgerBase.targetTable] += result.inserted ? 0 : 1;
  }

  for (const row of input.bundle.sections.fundBaselines) {
    const ledgerBase = ledgerRowFor(input.fundId, input.bundle.datasetId, 'fundBaselines', row);
    const existing = await store.getLedgerRow(ledgerBase);
    if (existing !== null) {
      const targetIdText = await handleExistingLedgerRow(store, existing, ledgerBase.sourceHash);
      baselineIds.set(row.sourceKey, existingTargetId({ ...ledgerBase, targetIdText }, 'uuid'));
      skipped[ledgerBase.targetTable] += 1;
      continue;
    }

    if (row.isDefault) {
      const previousDefaultBaselineId = await store.getActiveDefaultBaselineId(input.fundId);
      if (previousDefaultBaselineId !== null) {
        if (!options.allowDefaultBaselineReplace) {
          throw new DemoProfileImportError(
            409,
            'DEFAULT_BASELINE_CONFLICT',
            'Target fund already has an active default baseline.'
          );
        }
        await store.insertLedgerRow(
          defaultBaselineRestoreLedgerRow({
            fundId: input.fundId,
            datasetId: input.bundle.datasetId,
            importedBaselineSourceKey: row.sourceKey,
            previousDefaultBaselineId,
          })
        );
        await store.deactivateActiveDefaultBaselines(input.fundId);
      }
    }
    let result: { targetIdText: string; inserted: boolean };
    try {
      result = await commitInsert(store, { ...ledgerBase, targetIdText: '' }, () =>
        store.insertFundBaseline(input.fundId, row)
      );
    } catch (error) {
      if (row.isDefault && isUniqueConstraintViolation(error, DEFAULT_BASELINE_UNIQUE_CONSTRAINT)) {
        throw new DemoProfileImportError(
          409,
          'DEFAULT_BASELINE_CONFLICT',
          'Target fund already has an active default baseline.'
        );
      }
      throw error;
    }
    baselineIds.set(
      row.sourceKey,
      existingTargetId({ ...ledgerBase, targetIdText: result.targetIdText }, 'uuid')
    );
    inserted[ledgerBase.targetTable] += result.inserted ? 1 : 0;
    skipped[ledgerBase.targetTable] += result.inserted ? 0 : 1;
  }

  for (const row of input.bundle.sections.varianceReports) {
    const baselineId = baselineIds.get(row.baselineSourceKey);
    if (baselineId === undefined) {
      throw new DemoProfileImportError(
        422,
        'MISSING_SOURCE_REFERENCE',
        'Variance report baseline source key was not resolved.'
      );
    }
    const ledgerBase = ledgerRowFor(input.fundId, input.bundle.datasetId, 'varianceReports', row);
    const result = await commitInsert(store, { ...ledgerBase, targetIdText: '' }, () =>
      store.insertVarianceReport(input.fundId, row, baselineId)
    );
    inserted[ledgerBase.targetTable] += result.inserted ? 1 : 0;
    skipped[ledgerBase.targetTable] += result.inserted ? 0 : 1;
  }

  for (const row of input.bundle.sections.backtestResults) {
    const baselineId =
      row.baselineSourceKey === undefined ? undefined : baselineIds.get(row.baselineSourceKey);
    if (row.baselineSourceKey !== undefined && baselineId === undefined) {
      throw new DemoProfileImportError(
        422,
        'MISSING_SOURCE_REFERENCE',
        'Backtest baseline source key was not resolved.'
      );
    }
    const ledgerBase = ledgerRowFor(input.fundId, input.bundle.datasetId, 'backtestResults', row);
    const result = await commitInsert(store, { ...ledgerBase, targetIdText: '' }, () =>
      store.insertBacktestResult(input.fundId, row, baselineId)
    );
    inserted[ledgerBase.targetTable] += result.inserted ? 1 : 0;
    skipped[ledgerBase.targetTable] += result.inserted ? 0 : 1;
  }

  return {
    datasetId: input.bundle.datasetId,
    previewHash: preview.previewHash,
    inserted,
    skipped,
  };
}

export async function commitDemoProfileImport(
  input: { fundId: number; bundle: DemoProfileImportBundle; previewHash: string },
  options: DemoProfileCommitOptions = {}
): Promise<DemoProfileImportCommitSummary> {
  if (options.enforceImportGate !== false) {
    assertDemoProfileImportEnabled(options.env);
  }
  const database = options.database ?? db;
  return database.transaction(async (tx) =>
    commitDemoProfileImportWithStore(new DrizzleDemoProfileImportStore(tx), input, options)
  );
}

export async function rollbackDemoProfileImportWithStore(
  store: DemoProfileImportStore,
  input: { fundId: number; datasetId: string }
): Promise<DemoProfileRollbackSummary> {
  const rows = await store.listLedgerRows(input.fundId, input.datasetId);
  if (rows.length === 0) {
    throw new DemoProfileImportError(
      404,
      'IMPORT_LEDGER_SCOPE_NOT_FOUND',
      'No import ledger rows exist for the requested fund and dataset.'
    );
  }

  const deleted = emptyTableCounts();
  const restoreRows = rows.filter(isDefaultBaselineRestoreRow);
  const targetRows = rows.filter((row) => !isDefaultBaselineRestoreRow(row));
  for (const section of REVERSE_SECTION_ORDER) {
    const table = SECTION_META[section].targetTable;
    const ids = targetRows
      .filter((row) => row.targetTable === table)
      .map((row) => row.targetIdText);
    if (ids.length > 0) {
      deleted[table] = await store.deleteTargets(input.fundId, table, ids);
    }
  }
  for (const restoreRow of restoreRows) {
    await store.restoreDefaultBaseline(input.fundId, restoreRow.targetIdText);
  }
  await store.deleteLedgerRowsForDataset(input.fundId, input.datasetId);
  return { datasetId: input.datasetId, deleted };
}

export async function rollbackDemoProfileImport(
  input: { fundId: number; datasetId: string },
  options: DemoProfileRollbackOptions = {}
): Promise<DemoProfileRollbackSummary> {
  const database = options.database ?? db;
  return database.transaction(async (tx) =>
    rollbackDemoProfileImportWithStore(new DrizzleDemoProfileImportStore(tx), input)
  );
}

function asBacktestConfig(value: DemoProfileJsonValue): InsertBacktestResult['config'] {
  return value as InsertBacktestResult['config'];
}

function asSimulationSummary(
  value: DemoProfileJsonValue
): InsertBacktestResult['simulationSummary'] {
  return value as InsertBacktestResult['simulationSummary'];
}

function asActualPerformance(
  value: DemoProfileJsonValue
): InsertBacktestResult['actualPerformance'] {
  return value as InsertBacktestResult['actualPerformance'];
}

function asValidationMetrics(
  value: DemoProfileJsonValue
): InsertBacktestResult['validationMetrics'] {
  return value as InsertBacktestResult['validationMetrics'];
}

function asDataQuality(value: DemoProfileJsonValue): InsertBacktestResult['dataQuality'] {
  return value as InsertBacktestResult['dataQuality'];
}

function asScenarioComparisons(
  value: DemoProfileJsonValue | undefined
): InsertBacktestResult['scenarioComparisons'] {
  return value as InsertBacktestResult['scenarioComparisons'];
}

function asScenarioComparisonSummary(
  value: DemoProfileJsonValue | undefined
): InsertBacktestResult['scenarioComparisonSummary'] {
  return value as InsertBacktestResult['scenarioComparisonSummary'];
}

function toLedgerRecord(row: DemoProfileImportRowRecord): DemoProfileImportLedgerRecord {
  return {
    fundId: row.fundId,
    datasetId: row.datasetId,
    targetTable: row.targetTable as DemoProfileTargetTable,
    sourceKey: row.sourceKey,
    sourceHash: row.sourceHash,
    targetIdText: row.targetIdText,
    targetPkType: row.targetPkType,
  };
}

export class DrizzleDemoProfileImportStore implements DemoProfileImportStore {
  constructor(private readonly tx: DbTransaction) {}

  async getFund(fundId: number): Promise<DemoProfileFundRecord | null> {
    const rows = await this.tx
      .select({ id: funds.id, name: funds.name })
      .from(funds)
      .where(eq(funds.id, fundId))
      .limit(1);
    return rows[0] ?? null;
  }

  async ensureSystemActor(): Promise<void> {
    await this.tx
      .insert(users)
      .values({
        id: SYSTEM_ACTOR_ID,
        username: SYSTEM_ACTOR_USERNAME,
        password: SYSTEM_ACTOR_PASSWORD,
      })
      .onConflictDoNothing({ target: users.id });
  }

  async getLedgerRow(
    scope: DemoProfileImportLedgerScope
  ): Promise<DemoProfileImportLedgerRecord | null> {
    const rows = await this.tx
      .select()
      .from(demoProfileImportRows)
      .where(
        and(
          eq(demoProfileImportRows.fundId, scope.fundId),
          eq(demoProfileImportRows.datasetId, scope.datasetId),
          eq(demoProfileImportRows.targetTable, scope.targetTable),
          eq(demoProfileImportRows.sourceKey, scope.sourceKey)
        )
      )
      .limit(1);
    return rows[0] === undefined ? null : toLedgerRecord(rows[0]);
  }

  async listLedgerRows(
    fundId: number,
    datasetId: string
  ): Promise<DemoProfileImportLedgerRecord[]> {
    const rows = await this.tx
      .select()
      .from(demoProfileImportRows)
      .where(
        and(
          eq(demoProfileImportRows.fundId, fundId),
          eq(demoProfileImportRows.datasetId, datasetId)
        )
      );
    return rows.map(toLedgerRecord);
  }

  async insertLedgerRow(row: DemoProfileImportLedgerRecord): Promise<void> {
    await this.tx.insert(demoProfileImportRows).values(row);
  }

  async deleteLedgerRowsForDataset(fundId: number, datasetId: string): Promise<void> {
    await this.tx
      .delete(demoProfileImportRows)
      .where(
        and(
          eq(demoProfileImportRows.fundId, fundId),
          eq(demoProfileImportRows.datasetId, datasetId)
        )
      );
  }

  async targetExists(row: DemoProfileImportLedgerRecord): Promise<boolean> {
    switch (row.targetTable) {
      case 'portfoliocompanies':
        return (
          (
            await this.tx
              .select({ id: portfolioCompanies.id })
              .from(portfolioCompanies)
              .where(
                and(
                  eq(portfolioCompanies.id, parseIntegerId(row.targetIdText)),
                  eq(portfolioCompanies.fundId, row.fundId)
                )
              )
              .limit(1)
          )[0] !== undefined
        );
      case 'investments':
        return (
          (
            await this.tx
              .select({ id: investments.id })
              .from(investments)
              .where(
                and(
                  eq(investments.id, parseIntegerId(row.targetIdText)),
                  eq(investments.fundId, row.fundId)
                )
              )
              .limit(1)
          )[0] !== undefined
        );
      case 'investment_lots':
        return (
          (
            await this.tx
              .select({ id: investmentLots.id })
              .from(investmentLots)
              .innerJoin(investments, eq(investmentLots.investmentId, investments.id))
              .where(
                and(eq(investmentLots.id, row.targetIdText), eq(investments.fundId, row.fundId))
              )
              .limit(1)
          )[0] !== undefined
        );
      case 'deal_opportunities':
        return (
          (
            await this.tx
              .select({ id: dealOpportunities.id })
              .from(dealOpportunities)
              .where(
                and(
                  eq(dealOpportunities.id, parseIntegerId(row.targetIdText)),
                  eq(dealOpportunities.fundId, row.fundId)
                )
              )
              .limit(1)
          )[0] !== undefined
        );
      case 'fund_metrics':
        return (
          (
            await this.tx
              .select({ id: fundMetrics.id })
              .from(fundMetrics)
              .where(
                and(
                  eq(fundMetrics.id, parseIntegerId(row.targetIdText)),
                  eq(fundMetrics.fundId, row.fundId)
                )
              )
              .limit(1)
          )[0] !== undefined
        );
      case 'pacing_history':
        return (
          (
            await this.tx
              .select({ id: pacingHistory.id })
              .from(pacingHistory)
              .where(
                and(
                  eq(pacingHistory.id, parseIntegerId(row.targetIdText)),
                  eq(pacingHistory.fundId, row.fundId)
                )
              )
              .limit(1)
          )[0] !== undefined
        );
      case 'fund_baselines':
        return (
          (
            await this.tx
              .select({ id: fundBaselines.id })
              .from(fundBaselines)
              .where(
                and(eq(fundBaselines.id, row.targetIdText), eq(fundBaselines.fundId, row.fundId))
              )
              .limit(1)
          )[0] !== undefined
        );
      case 'variance_reports':
        return (
          (
            await this.tx
              .select({ id: varianceReports.id })
              .from(varianceReports)
              .where(
                and(
                  eq(varianceReports.id, row.targetIdText),
                  eq(varianceReports.fundId, row.fundId)
                )
              )
              .limit(1)
          )[0] !== undefined
        );
      case 'backtest_results':
        return (
          (
            await this.tx
              .select({ id: backtestResults.id })
              .from(backtestResults)
              .where(
                and(
                  eq(backtestResults.id, row.targetIdText),
                  eq(backtestResults.fundId, row.fundId)
                )
              )
              .limit(1)
          )[0] !== undefined
        );
    }
  }

  async getActiveDefaultBaselineId(fundId: number): Promise<string | null> {
    const rows = await this.tx
      .select({ id: fundBaselines.id })
      .from(fundBaselines)
      .where(
        and(
          eq(fundBaselines.fundId, fundId),
          eq(fundBaselines.isDefault, true),
          eq(fundBaselines.isActive, true)
        )
      )
      .for('update')
      .limit(1);
    return rows[0]?.id ?? null;
  }

  async deactivateActiveDefaultBaselines(fundId: number): Promise<void> {
    await this.tx
      .update(fundBaselines)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(fundBaselines.fundId, fundId),
          eq(fundBaselines.isDefault, true),
          eq(fundBaselines.isActive, true)
        )
      );
  }

  async restoreDefaultBaseline(fundId: number, baselineId: string): Promise<void> {
    await this.tx
      .update(fundBaselines)
      .set({ isDefault: true, isActive: true, updatedAt: new Date() })
      .where(and(eq(fundBaselines.id, baselineId), eq(fundBaselines.fundId, fundId)));
  }

  async insertPortfolioCompany(
    fundId: number,
    row: DemoProfilePortfolioCompanyRow
  ): Promise<number> {
    const created = await this.tx
      .insert(portfolioCompanies)
      .values(
        compact({
          fundId,
          name: row.name,
          sector: row.sector,
          stage: row.stage,
          currentStage: row.currentStage,
          investmentAmount: row.investmentAmount,
          investmentDate: toDate(row.investmentDate),
          currentValuation: row.currentValuation,
          foundedYear: row.foundedYear,
          status: row.status,
          description: row.description,
          dealTags: row.dealTags,
          deployedReservesCents: row.deployedReservesCents,
          plannedReservesCents: row.plannedReservesCents,
          exitMoicBps: row.exitMoicBps,
          ownershipCurrentPct: row.ownershipCurrentPct,
          allocationCapCents: row.allocationCapCents,
          allocationReason: row.allocationReason,
        })
      )
      .returning({ id: portfolioCompanies.id });
    return requireOne(
      created,
      'PORTFOLIO_COMPANY_INSERT_FAILED',
      'Portfolio company insert failed.'
    ).id;
  }

  async insertInvestment(
    fundId: number,
    row: DemoProfileInvestmentRow,
    companyId: number
  ): Promise<number> {
    const created = await this.tx
      .insert(investments)
      .values(
        compact({
          fundId,
          companyId,
          investmentDate: toRequiredDate(row.investmentDate),
          amount: row.amount,
          round: row.round,
          ownershipPercentage: row.ownershipPercentage,
          valuationAtInvestment: row.valuationAtInvestment,
          dealTags: row.dealTags,
          sharePriceCents:
            row.sharePriceCents === undefined ? undefined : BigInt(row.sharePriceCents),
          sharesAcquired: row.sharesAcquired,
          costBasisCents: row.costBasisCents === undefined ? undefined : BigInt(row.costBasisCents),
          pricingConfidence: row.pricingConfidence,
        })
      )
      .returning({ id: investments.id });
    return requireOne(created, 'INVESTMENT_INSERT_FAILED', 'Investment insert failed.').id;
  }

  async insertInvestmentLot(
    row: DemoProfileInvestmentLotRow,
    investmentId: number
  ): Promise<string> {
    const investment = await this.tx
      .select({ id: investments.id })
      .from(investments)
      .where(eq(investments.id, investmentId))
      .limit(1);
    if (investment[0] === undefined) {
      throw new DemoProfileImportError(
        403,
        'LOT_PARENT_INVESTMENT_MISSING',
        'Investment lot parent investment was not found.'
      );
    }

    const created = await this.tx
      .insert(investmentLots)
      .values({
        investmentId,
        lotType: row.lotType,
        sharePriceCents: BigInt(row.sharePriceCents),
        sharesAcquired: row.sharesAcquired,
        costBasisCents: BigInt(row.costBasisCents),
        idempotencyKey: row.sourceKey,
      })
      .returning({ id: investmentLots.id });
    return requireOne(created, 'INVESTMENT_LOT_INSERT_FAILED', 'Investment lot insert failed.').id;
  }

  async insertDealOpportunity(fundId: number, row: DemoProfileDealOpportunityRow): Promise<number> {
    const created = await this.tx
      .insert(dealOpportunities)
      .values(
        compact({
          fundId,
          companyName: row.companyName,
          sector: row.sector,
          stage: row.stage,
          sourceType: row.sourceType,
          dealSize: row.dealSize,
          valuation: row.valuation,
          status: row.status,
          priority: row.priority,
          foundedYear: row.foundedYear,
          employeeCount: row.employeeCount,
          revenue: row.revenue,
          description: row.description,
          sourceNotes: row.sourceNotes,
          nextAction: row.nextAction,
          nextActionDate: toDate(row.nextActionDate),
        })
      )
      .returning({ id: dealOpportunities.id });
    return requireOne(created, 'DEAL_OPPORTUNITY_INSERT_FAILED', 'Deal opportunity insert failed.')
      .id;
  }

  async insertFundMetric(fundId: number, row: DemoProfileFundMetricRow): Promise<number> {
    const created = await this.tx
      .insert(fundMetrics)
      .values(
        compact({
          fundId,
          metricDate: toRequiredDate(row.metricDate),
          asOfDate: toRequiredDate(row.asOfDate),
          totalValue: row.totalValue,
          irr: row.irr,
          multiple: row.multiple,
          dpi: row.dpi,
          tvpi: row.tvpi,
        })
      )
      .returning({ id: fundMetrics.id });
    return requireOne(created, 'FUND_METRIC_INSERT_FAILED', 'Fund metric insert failed.').id;
  }

  async insertPacingHistory(fundId: number, row: DemoProfilePacingHistoryRow): Promise<number> {
    const created = await this.tx
      .insert(pacingHistory)
      .values({
        fundId,
        quarter: row.quarter,
        deploymentAmount: row.deploymentAmount,
        marketCondition: row.marketCondition,
      })
      .returning({ id: pacingHistory.id });
    return requireOne(created, 'PACING_HISTORY_INSERT_FAILED', 'Pacing history insert failed.').id;
  }

  async insertFundBaseline(fundId: number, row: DemoProfileFundBaselineRow): Promise<string> {
    const created = await this.tx
      .insert(fundBaselines)
      .values(
        compact({
          fundId,
          name: row.name,
          description: row.description,
          baselineType: row.baselineType,
          periodStart: toRequiredDate(row.periodStart),
          periodEnd: toRequiredDate(row.periodEnd),
          snapshotDate: toRequiredDate(row.snapshotDate),
          totalValue: row.totalValue,
          deployedCapital: row.deployedCapital,
          irr: row.irr,
          multiple: row.multiple,
          dpi: row.dpi,
          tvpi: row.tvpi,
          portfolioCount: row.portfolioCount,
          averageInvestment: row.averageInvestment,
          topPerformers: row.topPerformers,
          companySnapshots: row.companySnapshots,
          sectorDistribution: row.sectorDistribution,
          stageDistribution: row.stageDistribution,
          reserveAllocation: row.reserveAllocation,
          pacingMetrics: row.pacingMetrics,
          isActive: row.isActive,
          isDefault: row.isDefault,
          confidence: row.confidence,
          version: row.version,
          tags: row.tags,
          createdBy: SYSTEM_ACTOR_ID,
        })
      )
      .returning({ id: fundBaselines.id });
    return requireOne(created, 'FUND_BASELINE_INSERT_FAILED', 'Fund baseline insert failed.').id;
  }

  async insertVarianceReport(
    fundId: number,
    row: DemoProfileVarianceReportRow,
    baselineId: string
  ): Promise<string> {
    const created = await this.tx
      .insert(varianceReports)
      .values(
        compact({
          fundId,
          baselineId,
          reportName: row.reportName,
          reportType: row.reportType,
          reportPeriod: row.reportPeriod,
          analysisStart: toRequiredDate(row.analysisStart),
          analysisEnd: toRequiredDate(row.analysisEnd),
          asOfDate: toRequiredDate(row.asOfDate),
          currentMetrics: row.currentMetrics,
          baselineMetrics: row.baselineMetrics,
          totalValueVariance: row.totalValueVariance,
          totalValueVariancePct: row.totalValueVariancePct,
          irrVariance: row.irrVariance,
          multipleVariance: row.multipleVariance,
          dpiVariance: row.dpiVariance,
          tvpiVariance: row.tvpiVariance,
          portfolioVariances: row.portfolioVariances,
          sectorVariances: row.sectorVariances,
          stageVariances: row.stageVariances,
          reserveVariances: row.reserveVariances,
          pacingVariances: row.pacingVariances,
          overallVarianceScore: row.overallVarianceScore,
          significantVariances: row.significantVariances,
          varianceFactors: row.varianceFactors,
          alertsTriggered: row.alertsTriggered,
          thresholdBreaches: row.thresholdBreaches,
          riskLevel: row.riskLevel,
          calculationEngine: row.calculationEngine,
          calculationDurationMs: row.calculationDurationMs,
          dataQualityScore: row.dataQualityScore,
          generatedBy: SYSTEM_ACTOR_ID,
          status: row.status,
          isPublic: row.isPublic,
          sharedWith: row.sharedWith,
        })
      )
      .returning({ id: varianceReports.id });
    return requireOne(created, 'VARIANCE_REPORT_INSERT_FAILED', 'Variance report insert failed.')
      .id;
  }

  async insertBacktestResult(
    fundId: number,
    row: DemoProfileBacktestResultRow,
    baselineId: string | undefined
  ): Promise<string> {
    const created = await this.tx
      .insert(backtestResults)
      .values(
        compact({
          fundId,
          config: asBacktestConfig(row.config),
          simulationSummary: asSimulationSummary(row.simulationSummary),
          actualPerformance: asActualPerformance(row.actualPerformance),
          validationMetrics: asValidationMetrics(row.validationMetrics),
          dataQuality: asDataQuality(row.dataQuality),
          scenarioComparisons: asScenarioComparisons(row.scenarioComparisons),
          scenarioComparisonSummary: asScenarioComparisonSummary(row.scenarioComparisonSummary),
          recommendations: row.recommendations,
          executionTimeMs: row.executionTimeMs,
          status: row.status,
          errorMessage: row.errorMessage,
          baselineId,
          snapshotId: row.snapshotId,
          createdBy: SYSTEM_ACTOR_ID,
          tags: row.tags,
          expiresAt: toDate(row.expiresAt),
        })
      )
      .returning({ id: backtestResults.id });
    return requireOne(created, 'BACKTEST_RESULT_INSERT_FAILED', 'Backtest result insert failed.')
      .id;
  }

  async deleteTargets(
    fundId: number,
    targetTable: DemoProfileTargetTable,
    targetIdTexts: string[]
  ): Promise<number> {
    switch (targetTable) {
      case 'portfoliocompanies':
        await this.tx
          .delete(portfolioCompanies)
          .where(
            and(
              inArray(portfolioCompanies.id, targetIdTexts.map(parseIntegerId)),
              eq(portfolioCompanies.fundId, fundId)
            )
          );
        return targetIdTexts.length;
      case 'investments':
        await this.tx
          .delete(investments)
          .where(
            and(
              inArray(investments.id, targetIdTexts.map(parseIntegerId)),
              eq(investments.fundId, fundId)
            )
          );
        return targetIdTexts.length;
      case 'investment_lots': {
        const scoped = await this.tx
          .select({ id: investmentLots.id })
          .from(investmentLots)
          .innerJoin(investments, eq(investmentLots.investmentId, investments.id))
          .where(and(inArray(investmentLots.id, targetIdTexts), eq(investments.fundId, fundId)));
        const scopedIds = scoped.map((row) => row.id);
        if (scopedIds.length > 0) {
          await this.tx.delete(investmentLots).where(inArray(investmentLots.id, scopedIds));
        }
        return scopedIds.length;
      }
      case 'deal_opportunities':
        await this.tx
          .delete(dealOpportunities)
          .where(
            and(
              inArray(dealOpportunities.id, targetIdTexts.map(parseIntegerId)),
              eq(dealOpportunities.fundId, fundId)
            )
          );
        return targetIdTexts.length;
      case 'fund_metrics':
        await this.tx
          .delete(fundMetrics)
          .where(
            and(
              inArray(fundMetrics.id, targetIdTexts.map(parseIntegerId)),
              eq(fundMetrics.fundId, fundId)
            )
          );
        return targetIdTexts.length;
      case 'pacing_history':
        await this.tx
          .delete(pacingHistory)
          .where(
            and(
              inArray(pacingHistory.id, targetIdTexts.map(parseIntegerId)),
              eq(pacingHistory.fundId, fundId)
            )
          );
        return targetIdTexts.length;
      case 'fund_baselines':
        await this.tx
          .delete(fundBaselines)
          .where(and(inArray(fundBaselines.id, targetIdTexts), eq(fundBaselines.fundId, fundId)));
        return targetIdTexts.length;
      case 'variance_reports':
        await this.tx
          .delete(varianceReports)
          .where(
            and(inArray(varianceReports.id, targetIdTexts), eq(varianceReports.fundId, fundId))
          );
        return targetIdTexts.length;
      case 'backtest_results':
        await this.tx
          .delete(backtestResults)
          .where(
            and(inArray(backtestResults.id, targetIdTexts), eq(backtestResults.fundId, fundId))
          );
        return targetIdTexts.length;
    }
  }
}

export function safeDemoProfileError(error: unknown): {
  code: string;
  status: number;
  message: string;
} {
  if (error instanceof DemoProfileImportError) {
    return { code: error.code, status: error.status, message: error.message };
  }
  return {
    code: 'DEMO_PROFILE_IMPORT_FAILED',
    status: 500,
    message: 'Demo profile import failed.',
  };
}
