/**
 * Fixed-template actuals pilot preview.
 *
 * Preview is deliberately read-only. It owns the stricter pilot grammar
 * because the legacy CSV tokenizer trims cells and drops empty lines, which
 * would change the bytes and lexical meaning of this contract.
 */
import { TextDecoder } from 'node:util';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../../db';
import { sha256Bytes } from '../../lib/sha256-bytes';
import { canonicalSha256 } from '@shared/lib/canonical-hash';
import {
  ACTUALS_COMBINED_MAX_BYTES,
  ACTUALS_LEDGER_MAX_BYTES,
  ACTUALS_MAX_ROWS,
  ACTUALS_PREVIEW_MAX_ISSUES,
  ACTUALS_VALUATION_MAX_BYTES,
  ActualsLedgerEventTypeSchema,
  ActualsPreviewRequestV1Schema,
  ActualsPreviewResponseV1Schema,
  ActualsPilotCentExactMoneySchema,
  ActualsPilotMoneySchema,
  ActualsDeploymentCategorySchema,
  ActualsDistributionTypeSchema,
  ActualsExternalRefSchema,
  ActualsValuationMethodSchema,
  ActualsCurrencySchema,
  canonicalLabel,
  isCentExactMoney,
  isFormulaLikeValue,
  isGregorianDate,
  type ActualsPreviewIssueCodeV1,
  type ActualsPreviewResponseV1,
  type ActualsPreviewRowV1,
  type ActualsPreviewTotalsV1,
  type ActualsPreviewRequestV1,
} from '@shared/contracts/lp-reporting/actuals-pilot.contract';
import {
  ACTUALS_LEDGER_TEMPLATE_VERSION,
  ACTUALS_VALUATION_TEMPLATE_VERSION,
} from '@shared/contracts/lp-reporting/actuals-pilot-templates';
import { cashFlowEvents, valuationMarks } from '@shared/schema/lp-reporting-evidence';
import { portfolioCompanies } from '@shared/schema/portfolio';
import { vehicles } from '@shared/schema/vehicles';

type PreviewDatabase = typeof db;

const PILOT_IMPORT_ORIGIN = 'actuals_pilot_v1';
const IDENTITY_QUERY_LIMIT = ACTUALS_MAX_ROWS + 1;
const NUMERIC_20_6_MAX_CENTS = 9_999_999_999_999_999n;

const LEDGER_COLUMNS = [
  'event_type',
  'effective_date',
  'amount',
  'currency',
  'company_name',
  'vehicle_slug',
  'deployment_category',
  'description',
  'expense_category',
  'distribution_type',
  'recallable',
  'external_ref',
] as const;

const VALUATION_COLUMNS = [
  'company_name',
  'vehicle_slug',
  'mark_date',
  'position_fair_value',
  'currency',
  'mark_source',
  'confidence_level',
  'valuation_method',
  'cost_basis',
  'external_ref',
] as const;

type TemplateKind = 'ledger' | 'valuation';
type PreviewStatus = ActualsPreviewRowV1['status'];

const ISSUE_MESSAGES: Record<ActualsPreviewIssueCodeV1, string> = {
  INVALID_HEADER: 'CSV header does not match the selected fixed template.',
  INVALID_ROW_WIDTH: 'CSV row does not contain the fixed template width.',
  INVALID_VALUE: 'CSV cell does not satisfy the fixed-template grammar.',
  AGGREGATE_OVERFLOW: 'Aggregate exceeds NUMERIC(20,6) capacity.',
  SUBCENT_USD_UNSUPPORTED: 'USD amount must be exactly representable in cents.',
  FORMULA_LIKE_VALUE: 'Formula-like cell values are not accepted.',
  DUPLICATE_EXTERNAL_REF: 'External reference occurs more than once in this file.',
  DUPLICATE_COMPANY_MARK: 'Company and vehicle mark occurs more than once in this file.',
  VALUATION_AS_OF_MISMATCH: 'Valuation mark date must equal the preview as-of date.',
  VALUATION_MARK_ALREADY_EXISTS: 'A valuation mark already exists for this position and date.',
  VALUATION_ROSTER_EMPTY: 'No admitted portfolio-investment roster exists for valuation coverage.',
  FUND_LEDGER_NOT_PILOT_OWNED: 'Fund contains evidence not owned by the actuals pilot lane.',
  COMPANY_NOT_FOUND: 'Company label did not resolve within the fund.',
  COMPANY_NAME_AMBIGUOUS: 'Company label resolved to multiple companies within the fund.',
  VEHICLE_NOT_FOUND: 'Vehicle slug did not resolve within the fund.',
  UNSUPPORTED_VEHICLE_SCOPE: 'Vehicle scope is not supported for this fund.',
  ALREADY_IMPORTED: 'Row was already imported with identical content.',
  EXTERNAL_REF_REUSE_CONFLICT: 'External reference is already bound to different content.',
  EXISTING_IMPORT_PROVENANCE_CONFLICT: 'External reference belongs to another import origin.',
  DATE_AFTER_CUTOFF: 'Ledger effective date is after the preview as-of date.',
};

const ERROR_ISSUE_CODES = new Set<ActualsPreviewIssueCodeV1>([
  'INVALID_HEADER',
  'INVALID_ROW_WIDTH',
  'INVALID_VALUE',
  'AGGREGATE_OVERFLOW',
  'SUBCENT_USD_UNSUPPORTED',
  'FORMULA_LIKE_VALUE',
  'DUPLICATE_EXTERNAL_REF',
  'DUPLICATE_COMPANY_MARK',
  'VALUATION_AS_OF_MISMATCH',
  'VALUATION_MARK_ALREADY_EXISTS',
  'FUND_LEDGER_NOT_PILOT_OWNED',
  'COMPANY_NOT_FOUND',
  'COMPANY_NAME_AMBIGUOUS',
  'VEHICLE_NOT_FOUND',
  'UNSUPPORTED_VEHICLE_SCOPE',
  'EXTERNAL_REF_REUSE_CONFLICT',
  'EXISTING_IMPORT_PROVENANCE_CONFLICT',
  'DATE_AFTER_CUTOFF',
]);

const LEDGER_EVENT_TYPES = new Set<string>(ActualsLedgerEventTypeSchema.options);
const DEPLOYMENT_CATEGORIES = new Set<string>(ActualsDeploymentCategorySchema.options);
const DISTRIBUTION_TYPES = new Set<string>(ActualsDistributionTypeSchema.options);
const MARK_SOURCES = new Set([
  'financing_round',
  'signed_loi',
  'revenue_milestone',
  'strategic_partnership',
  'audited_financials',
  'board_update',
  'gp_estimate',
  'third_party_priced',
  'secondary_transaction',
  'impairment',
]);
const CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low']);

const COLUMN_INDEX = new Map<string, number>([
  ...LEDGER_COLUMNS.map((column, index) => [column, index] as const),
  ...VALUATION_COLUMNS.map((column, index) => [column, index] as const),
]);

export class ActualsPilotPreviewError extends Error {
  readonly status: number;
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ActualsPilotPreviewError';
    this.status = status;
    this.statusCode = status;
    this.code = code;
    this.details = details;
  }
}

export interface ActualsPilotPreviewServiceOptions {
  database?: PreviewDatabase;
}

export type ActualsPilotPreviewInput =
  | { fundId: number; request: ActualsPreviewRequestV1 }
  | (ActualsPreviewRequestV1 & { fundId: number });

interface ParsedCsv {
  rows: string[][];
  headerMatches: boolean;
}

interface CompanyLookupRow {
  id: number;
  fundId: number | null;
  name: string;
}

interface VehicleLookupRow {
  id: number;
  fundId: number;
  vehicleSlug: string;
  vehicleType: string;
  status: string;
  currency: string;
}

interface IdentityMaps {
  companies: Map<string, number[]>;
  vehicles: Map<string, number[]>;
  defaultVehicleId: number | null;
}

interface WorkingRow {
  rowNumber: number;
  sourceExternalRef: string | null;
  status: PreviewStatus;
  eventType: ActualsPreviewRowV1['eventType'];
  effectiveDate: string | null;
  companyLabel: string | null;
  vehicleLabel: string | null;
  canonicalAmount: string | null;
  rowSourceHash: string | null;
  rowContentHash: string | null;
  issues: ActualsPreviewRowV1['issues'];
  companyId: number | null;
  vehicleId: number | null;
  amountCents: bigint | null;
  canonicalEconomicFields: Record<string, unknown> | null;
  duplicateInFile: boolean;
  duplicateCompanyMark: boolean;
}

interface TotalsCents {
  settledPaidIn: bigint;
  deployed: bigint;
  initialDeployed: bigint;
  followOnDeployed: bigint;
  secondaryDeployed: bigint;
  otherDeployed: bigint;
  managementFees: bigint;
  otherExpenses: bigint;
  realizedFundProceeds: bigint;
  distributionsToPartners: bigint;
  positionFairValue: bigint;
  markedCompanyCount: number;
}

interface ExistingRow {
  [key: string]: unknown;
}

function requestFromInput(input: ActualsPilotPreviewInput): ActualsPreviewRequestV1 {
  return 'request' in input ? input.request : input;
}

function templateKind(templateVersion: string): TemplateKind {
  return templateVersion === ACTUALS_LEDGER_TEMPLATE_VERSION ? 'ledger' : 'valuation';
}

function expectedColumns(kind: TemplateKind): readonly string[] {
  return kind === 'ledger' ? LEDGER_COLUMNS : VALUATION_COLUMNS;
}

function expectedHeader(kind: TemplateKind): string {
  return expectedColumns(kind).join(',');
}

function maxBytes(kind: TemplateKind): number {
  return kind === 'ledger' ? ACTUALS_LEDGER_MAX_BYTES : ACTUALS_VALUATION_MAX_BYTES;
}

function byteCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function compareIssues(
  left: ActualsPreviewRowV1['issues'][number],
  right: ActualsPreviewRowV1['issues'][number]
): number {
  if (left.rowNumber !== right.rowNumber) return left.rowNumber - right.rowNumber;
  const leftColumn =
    left.column === null ? -1 : (COLUMN_INDEX.get(left.column) ?? Number.MAX_SAFE_INTEGER);
  const rightColumn =
    right.column === null ? -1 : (COLUMN_INDEX.get(right.column) ?? Number.MAX_SAFE_INTEGER);
  if (leftColumn !== rightColumn) return leftColumn - rightColumn;
  const codeOrder = byteCompare(left.code, right.code);
  if (codeOrder !== 0) return codeOrder;
  return byteCompare(left.message, right.message);
}

function makeIssue(
  code: ActualsPreviewIssueCodeV1,
  rowNumber: number,
  column: string | null,
  severity: 'error' | 'warning' = ERROR_ISSUE_CODES.has(code) ? 'error' : 'warning'
): ActualsPreviewRowV1['issues'][number] {
  return {
    code,
    rowNumber,
    column,
    severity,
    message: ISSUE_MESSAGES[code],
  };
}

function addIssue(
  row: WorkingRow,
  code: ActualsPreviewIssueCodeV1,
  column: string | null,
  severity?: 'error' | 'warning'
): void {
  row.issues.push(makeIssue(code, row.rowNumber, column, severity));
}

function hasError(issues: readonly ActualsPreviewRowV1['issues'][number][]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

function isWhitespaceOnly(value: string): boolean {
  return value.length > 0 && /^\s+$/u.test(value);
}

function canonicalMoney(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  return `${whole}.${fraction.padEnd(6, '0')}`;
}

function moneyToCents(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
}

function centsToMoney(value: bigint): string {
  const whole = value / 100n;
  const cents = (value % 100n).toString().padStart(2, '0');
  return `${whole.toString()}.${cents}0000`;
}

function zeroTotals(): TotalsCents {
  return {
    settledPaidIn: 0n,
    deployed: 0n,
    initialDeployed: 0n,
    followOnDeployed: 0n,
    secondaryDeployed: 0n,
    otherDeployed: 0n,
    managementFees: 0n,
    otherExpenses: 0n,
    realizedFundProceeds: 0n,
    distributionsToPartners: 0n,
    positionFairValue: 0n,
    markedCompanyCount: 0,
  };
}

function totalsResponse(totals: TotalsCents): ActualsPreviewTotalsV1 {
  return {
    settledPaidIn: centsToMoney(totals.settledPaidIn),
    deployed: centsToMoney(totals.deployed),
    initialDeployed: centsToMoney(totals.initialDeployed),
    followOnDeployed: centsToMoney(totals.followOnDeployed),
    secondaryDeployed: centsToMoney(totals.secondaryDeployed),
    otherDeployed: centsToMoney(totals.otherDeployed),
    managementFees: centsToMoney(totals.managementFees),
    otherExpenses: centsToMoney(totals.otherExpenses),
    realizedFundProceeds: centsToMoney(totals.realizedFundProceeds),
    distributionsToPartners: centsToMoney(totals.distributionsToPartners),
    positionFairValue: centsToMoney(totals.positionFairValue),
    markedCompanyCount: totals.markedCompanyCount,
  };
}

function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/u).pop() ?? '';
  const sanitized = base.replace(/[^A-Za-z0-9._-]/gu, '_').replace(/^\.+/u, '');
  return sanitized || 'actuals.csv';
}

function decodePayload(payload: string): Buffer {
  return Buffer.from(payload, 'base64');
}

function structuralError(message: string): never {
  throw new ActualsPilotPreviewError(400, 'INVALID_CSV', message);
}

function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let afterQuote = false;
  let fieldTouched = false;
  let recordStart = true;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;

    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
        afterQuote = true;
      } else if (character === '\n' || character === '\r') {
        structuralError('CSV fields must remain on one physical line.');
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      if (cell.length > 0 || afterQuote) {
        structuralError('CSV quotes must start a field and close before the delimiter.');
      }
      inQuotes = true;
      fieldTouched = true;
      recordStart = false;
    } else if (character === ',') {
      if (afterQuote) afterQuote = false;
      row.push(cell);
      cell = '';
      fieldTouched = true;
      recordStart = false;
    } else if (character === '\r') {
      if (text[index + 1] !== '\n') structuralError('CSV contains a lone carriage return.');
    } else if (character === '\n') {
      if (afterQuote) afterQuote = false;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      fieldTouched = false;
      recordStart = true;
    } else {
      if (afterQuote) structuralError('CSV data follows a closed quoted field.');
      cell += character;
      fieldTouched = true;
      recordStart = false;
    }
  }

  if (inQuotes) structuralError('CSV contains an unmatched quote.');
  if (afterQuote) afterQuote = false;
  if (!recordStart && (row.length > 0 || cell.length > 0 || fieldTouched)) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function parseStrictCsv(buffer: Buffer, kind: TemplateKind): ParsedCsv {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    structuralError('CSV is not valid UTF-8.');
  }

  if (text.includes('\u0000')) structuralError('CSV contains a NUL byte.');
  if (text.startsWith('\uFEFF\uFEFF')) structuralError('CSV contains more than one BOM.');

  let sawBareLf = false;
  let sawCrlf = false;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\r') {
      if (text[index + 1] !== '\n') structuralError('CSV contains a lone carriage return.');
      sawCrlf = true;
    } else if (text[index] === '\n' && text[index - 1] !== '\r') {
      sawBareLf = true;
    }
  }
  if (sawBareLf && sawCrlf) structuralError('CSV mixes LF and CRLF line endings.');

  const withoutLeadingBom = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const firstNewline = withoutLeadingBom.indexOf('\n');
  const firstLine =
    firstNewline < 0
      ? withoutLeadingBom
      : withoutLeadingBom.slice(0, firstNewline).replace(/\r$/u, '');
  if (!firstLine.includes(',') && /[;\t]/u.test(firstLine)) {
    structuralError('CSV uses an unsupported delimiter.');
  }

  const parsedRows = parseCsvText(withoutLeadingBom);
  const header = parsedRows[0] ?? [];
  const dataRows = parsedRows.slice(1);
  return {
    rows: dataRows,
    headerMatches: firstLine === expectedHeader(kind) && header.join(',') === expectedHeader(kind),
  };
}

async function loadIdentityMaps(database: PreviewDatabase, fundId: number): Promise<IdentityMaps> {
  const companyRows = (await database
    .select({
      id: portfolioCompanies.id,
      fundId: portfolioCompanies.fundId,
      name: portfolioCompanies.name,
    })
    .from(portfolioCompanies)
    .where(eq(portfolioCompanies.fundId, fundId))
    .limit(IDENTITY_QUERY_LIMIT)) as CompanyLookupRow[];

  const vehicleRows = (await database
    .select({
      id: vehicles.id,
      fundId: vehicles.fundId,
      vehicleSlug: vehicles.vehicleSlug,
      vehicleType: vehicles.vehicleType,
      status: vehicles.status,
      currency: vehicles.currency,
    })
    .from(vehicles)
    .where(eq(vehicles.fundId, fundId))
    .limit(IDENTITY_QUERY_LIMIT)) as VehicleLookupRow[];

  const companies = new Map<string, number[]>();
  for (const row of companyRows) {
    if (row.fundId !== fundId) continue;
    const label = canonicalLabel(row.name);
    const ids = companies.get(label) ?? [];
    ids.push(row.id);
    companies.set(label, ids);
  }

  const vehiclesByLabel = new Map<string, number[]>();
  for (const row of vehicleRows) {
    if (row.fundId !== fundId) continue;
    const label = canonicalLabel(row.vehicleSlug);
    const ids = vehiclesByLabel.get(label) ?? [];
    ids.push(row.id);
    vehiclesByLabel.set(label, ids);
  }

  // Blank vehicle_slug resolves only when the fund has exactly one vehicle
  // and that vehicle is an active USD main fund.
  const fundVehicles = vehicleRows.filter((row) => row.fundId === fundId);
  const sole = fundVehicles.length === 1 ? fundVehicles[0]! : null;
  const defaultVehicleId =
    sole !== null &&
    sole.status === 'active' &&
    sole.currency === 'USD' &&
    sole.vehicleType === 'main_fund'
      ? sole.id
      : null;

  return { companies, vehicles: vehiclesByLabel, defaultVehicleId };
}

async function hasNonPilotCashFlowRows(
  database: PreviewDatabase,
  fundId: number
): Promise<boolean> {
  const rows = await database
    .select({ id: cashFlowEvents.id })
    .from(cashFlowEvents)
    .where(
      and(
        eq(cashFlowEvents.fundId, fundId),
        sql`${cashFlowEvents.importedFrom} IS DISTINCT FROM ${PILOT_IMPORT_ORIGIN}`
      )
    )
    .limit(1);
  return rows.length > 0;
}

async function hasNonPilotValuationRows(
  database: PreviewDatabase,
  fundId: number
): Promise<boolean> {
  const rows = await database
    .select({ id: valuationMarks.id })
    .from(valuationMarks)
    .where(
      and(
        eq(valuationMarks.fundId, fundId),
        sql`${valuationMarks.importedFrom} IS DISTINCT FROM ${PILOT_IMPORT_ORIGIN}`
      )
    )
    .limit(1);
  return rows.length > 0;
}

async function loadExistingRowsBySourceHash(
  database: PreviewDatabase,
  fundId: number,
  kind: TemplateKind,
  hashes: readonly string[]
): Promise<ExistingRow[]> {
  if (hashes.length === 0) return [];
  if (kind === 'ledger') {
    return (await database
      .select()
      .from(cashFlowEvents)
      .where(
        and(eq(cashFlowEvents.fundId, fundId), inArray(cashFlowEvents.sourceHash, hashes))
      )) as ExistingRow[];
  }
  return (await database
    .select()
    .from(valuationMarks)
    .where(
      and(eq(valuationMarks.fundId, fundId), inArray(valuationMarks.sourceHash, hashes))
    )) as ExistingRow[];
}

async function loadExistingValuationTuples(
  database: PreviewDatabase,
  fundId: number,
  asOfDate: string
): Promise<ExistingRow[]> {
  return (await database
    .select()
    .from(valuationMarks)
    .where(and(eq(valuationMarks.fundId, fundId), eq(valuationMarks.markDate, asOfDate)))
    .limit(IDENTITY_QUERY_LIMIT)) as ExistingRow[];
}

async function loadPilotRoster(database: PreviewDatabase, fundId: number): Promise<boolean> {
  const rows = await database
    .select({ id: cashFlowEvents.id })
    .from(cashFlowEvents)
    .where(
      and(
        eq(cashFlowEvents.fundId, fundId),
        eq(cashFlowEvents.eventType, 'portfolio_investment'),
        eq(cashFlowEvents.importedFrom, PILOT_IMPORT_ORIGIN),
        sql`${cashFlowEvents.status} IN ('approved', 'locked')`
      )
    )
    .limit(1);
  return rows.length > 0;
}

function valueOf(row: ExistingRow, camel: string, snake: string): unknown {
  return row[camel] ?? row[snake];
}

function stringValue(row: ExistingRow, camel: string, snake: string): string | null {
  const value = valueOf(row, camel, snake);
  return typeof value === 'string' ? value : value instanceof Date ? value.toISOString() : null;
}

function dayValue(value: unknown): string | null {
  if (typeof value === 'string') return value.slice(0, 10);
  return value instanceof Date ? value.toISOString().slice(0, 10) : null;
}

function existingSourceHash(row: ExistingRow): string | null {
  const value = valueOf(row, 'sourceHash', 'source_hash');
  return typeof value === 'string' ? value : null;
}

function existingImportOrigin(row: ExistingRow): string | null {
  const value = valueOf(row, 'importedFrom', 'imported_from');
  return typeof value === 'string' ? value : null;
}

function existingRowContentHash(
  row: ExistingRow,
  kind: TemplateKind,
  sourceHash: string
): string | null {
  const direct = valueOf(row, 'rowContentHash', 'row_content_hash');
  if (typeof direct === 'string') return direct;
  const payload = valueOf(row, 'payload', 'payload');
  if (payload && typeof payload === 'object') {
    const payloadRecord = payload as Record<string, unknown>;
    const payloadHash = payloadRecord['rowContentHash'] ?? payloadRecord['row_content_hash'];
    if (typeof payloadHash === 'string') return payloadHash;
  }

  const companyIdValue = valueOf(row, 'companyId', 'company_id');
  const vehicleIdValue = valueOf(row, 'vehicleId', 'vehicle_id');
  const resolvedCompanyId = typeof companyIdValue === 'number' ? companyIdValue : null;
  const resolvedVehicleId = typeof vehicleIdValue === 'number' ? vehicleIdValue : null;
  if (kind === 'ledger') {
    const persistedEventType = stringValue(row, 'eventType', 'event_type');
    const effectiveDate = dayValue(valueOf(row, 'eventDate', 'event_date'));
    const amount = stringValue(row, 'amount', 'amount');
    const currency = stringValue(row, 'currency', 'currency');
    const payloadRecord =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const persistedExpenseCategory =
      payloadRecord['expenseCategory'] ?? payloadRecord['expense_category'];
    const eventType =
      persistedEventType === 'lp_capital_call'
        ? 'settled_contribution'
        : persistedEventType === 'lp_distribution'
          ? 'lp_distribution'
          : persistedEventType === 'fund_expense' && persistedExpenseCategory === 'management_fee'
            ? 'management_fee'
            : persistedEventType === 'fund_expense'
              ? 'fund_expense'
              : persistedEventType === 'portfolio_investment'
                ? 'portfolio_investment'
                : persistedEventType === 'realized_proceeds'
                  ? 'realized_proceeds'
                  : null;
    if (!eventType || !effectiveDate || !amount || !currency) return null;
    return computeActualsPilotRowContentHash({
      templateVersion: ACTUALS_LEDGER_TEMPLATE_VERSION,
      rowSourceHash: sourceHash,
      canonicalEconomicFields: {
        eventType,
        effectiveDate,
        amount: canonicalMoney(amount),
        currency,
        deploymentCategory:
          typeof (payloadRecord['deploymentCategory'] ?? payloadRecord['deployment_category']) ===
          'string'
            ? (payloadRecord['deploymentCategory'] ?? payloadRecord['deployment_category'])
            : null,
        description: stringValue(row, 'description', 'description'),
        expenseCategory:
          typeof persistedExpenseCategory === 'string' ? persistedExpenseCategory : null,
        distributionType:
          typeof (payloadRecord['distributionType'] ?? payloadRecord['distribution_type']) ===
          'string'
            ? (payloadRecord['distributionType'] ?? payloadRecord['distribution_type'])
            : null,
        recallable:
          typeof payloadRecord['recallable'] === 'boolean'
            ? payloadRecord['recallable']
            : typeof payloadRecord['recallable'] === 'string'
              ? payloadRecord['recallable'] === 'true'
              : null,
      },
      resolvedCompanyId,
      resolvedVehicleId,
    });
  }

  const markDate = dayValue(valueOf(row, 'markDate', 'mark_date'));
  const fairValue = stringValue(row, 'fairValue', 'fair_value');
  const currency = stringValue(row, 'currency', 'currency');
  const markSource = stringValue(row, 'markSource', 'mark_source');
  const confidenceLevel = stringValue(row, 'confidenceLevel', 'confidence_level');
  const valuationMethod = stringValue(row, 'valuationMethod', 'valuation_method');
  if (!markDate || !fairValue || !currency || !markSource || !confidenceLevel || !valuationMethod)
    return null;
  const costBasis = stringValue(row, 'costBasis', 'cost_basis');
  return computeActualsPilotRowContentHash({
    templateVersion: ACTUALS_VALUATION_TEMPLATE_VERSION,
    rowSourceHash: sourceHash,
    canonicalEconomicFields: {
      markDate,
      positionFairValue: canonicalMoney(fairValue),
      currency,
      markSource,
      confidenceLevel,
      valuationMethod,
      costBasis: costBasis === null ? null : canonicalMoney(costBasis),
    },
    resolvedCompanyId,
    resolvedVehicleId,
  });
}

export function computeActualsPilotRowSourceHash(fundId: number, externalRef: string): string {
  return canonicalSha256({ fundId, externalRef });
}

export function computeActualsPilotRowContentHash(input: {
  templateVersion: string;
  rowSourceHash: string;
  canonicalEconomicFields: Record<string, unknown>;
  resolvedCompanyId: number | null;
  resolvedVehicleId: number | null;
}): string {
  return canonicalSha256(input);
}

function makeWorkingRow(rowNumber: number): WorkingRow {
  return {
    rowNumber,
    sourceExternalRef: null,
    status: 'invalid',
    eventType: null,
    effectiveDate: null,
    companyLabel: null,
    vehicleLabel: null,
    canonicalAmount: null,
    rowSourceHash: null,
    rowContentHash: null,
    issues: [],
    companyId: null,
    vehicleId: null,
    amountCents: null,
    canonicalEconomicFields: null,
    duplicateInFile: false,
    duplicateCompanyMark: false,
  };
}

function validateCommonCell(row: WorkingRow, column: string, value: string): boolean {
  if (isFormulaLikeValue(value)) {
    addIssue(row, 'FORMULA_LIKE_VALUE', column);
    return false;
  }
  if (isWhitespaceOnly(value)) {
    addIssue(row, 'INVALID_VALUE', column);
    return false;
  }
  if ((column === 'company_name' || column === 'vehicle_slug') && value.length > 256) {
    addIssue(row, 'INVALID_VALUE', column);
    return false;
  }
  return true;
}

function validateMoney(
  row: WorkingRow,
  value: string,
  column: string,
  required: boolean,
  positive: boolean
): string | null {
  if (value === '') {
    if (required) addIssue(row, 'INVALID_VALUE', column);
    return null;
  }
  if (!ActualsPilotMoneySchema.safeParse(value).success) {
    addIssue(row, 'INVALID_VALUE', column);
    return null;
  }
  if (!isCentExactMoney(value) || !ActualsPilotCentExactMoneySchema.safeParse(value).success) {
    addIssue(row, 'SUBCENT_USD_UNSUPPORTED', column);
    return null;
  }
  const cents = moneyToCents(value);
  if (positive && cents <= 0n) {
    addIssue(row, 'INVALID_VALUE', column);
    return null;
  }
  return canonicalMoney(value);
}

function resolveCompany(
  row: WorkingRow,
  raw: string,
  required: boolean,
  maps: IdentityMaps
): number | null {
  if (raw === '') {
    if (required) addIssue(row, 'COMPANY_NOT_FOUND', 'company_name');
    return null;
  }
  const matches = maps.companies.get(canonicalLabel(raw)) ?? [];
  if (matches.length === 0) {
    addIssue(row, 'COMPANY_NOT_FOUND', 'company_name');
    return null;
  }
  if (matches.length !== 1) {
    addIssue(row, 'COMPANY_NAME_AMBIGUOUS', 'company_name');
    return null;
  }
  return matches[0]!;
}

function resolveVehicle(row: WorkingRow, raw: string, maps: IdentityMaps): number | null {
  if (raw === '') {
    if (maps.defaultVehicleId === null) addIssue(row, 'UNSUPPORTED_VEHICLE_SCOPE', 'vehicle_slug');
    return maps.defaultVehicleId;
  }
  const matches = maps.vehicles.get(canonicalLabel(raw)) ?? [];
  if (matches.length === 0) {
    addIssue(row, 'VEHICLE_NOT_FOUND', 'vehicle_slug');
    return null;
  }
  if (matches.length !== 1) {
    addIssue(row, 'UNSUPPORTED_VEHICLE_SCOPE', 'vehicle_slug');
    return null;
  }
  return matches[0]!;
}

function parseLedgerRow(
  cells: string[],
  rowNumber: number,
  asOfDate: string,
  fundId: number,
  maps: IdentityMaps
): WorkingRow {
  const row = makeWorkingRow(rowNumber);
  if (cells.length !== LEDGER_COLUMNS.length) {
    addIssue(row, 'INVALID_ROW_WIDTH', null);
    return row;
  }

  const eventTypeRaw = cells[0]!;
  const effectiveDateRaw = cells[1]!;
  const amountRaw = cells[2]!;
  const currencyRaw = cells[3]!;
  const companyRaw = cells[4]!;
  const vehicleRaw = cells[5]!;
  const deploymentRaw = cells[6]!;
  const descriptionRaw = cells[7]!;
  const expenseRaw = cells[8]!;
  const distributionRaw = cells[9]!;
  const recallableRaw = cells[10]!;
  const externalRefRaw = cells[11]!;
  const cellValidity = new Map<string, boolean>();
  for (const [index, column] of LEDGER_COLUMNS.entries()) {
    cellValidity.set(column, validateCommonCell(row, column, cells[index]!));
  }

  row.companyLabel = companyRaw === '' || !cellValidity.get('company_name') ? null : companyRaw;
  row.vehicleLabel = vehicleRaw === '' || !cellValidity.get('vehicle_slug') ? null : vehicleRaw;

  if (
    cellValidity.get('external_ref') &&
    ActualsExternalRefSchema.safeParse(externalRefRaw).success
  ) {
    row.sourceExternalRef = externalRefRaw;
    row.rowSourceHash = computeActualsPilotRowSourceHash(fundId, externalRefRaw);
  } else if (cellValidity.get('external_ref')) {
    addIssue(row, 'INVALID_VALUE', 'external_ref');
  }

  if (cellValidity.get('event_type') && LEDGER_EVENT_TYPES.has(eventTypeRaw)) {
    row.eventType = eventTypeRaw as ActualsPreviewRowV1['eventType'];
  } else if (cellValidity.get('event_type')) {
    addIssue(row, 'INVALID_VALUE', 'event_type');
  }

  if (cellValidity.get('effective_date') && isGregorianDate(effectiveDateRaw)) {
    row.effectiveDate = effectiveDateRaw;
    if (effectiveDateRaw > asOfDate) addIssue(row, 'DATE_AFTER_CUTOFF', 'effective_date');
  } else if (cellValidity.get('effective_date')) {
    addIssue(row, 'INVALID_VALUE', 'effective_date');
  }

  if (cellValidity.get('amount')) {
    row.canonicalAmount = validateMoney(row, amountRaw, 'amount', true, true);
    if (row.canonicalAmount !== null) row.amountCents = moneyToCents(amountRaw);
  }

  if (
    cellValidity.get('currency') &&
    ActualsCurrencySchema.safeParse(currencyRaw).success === false
  ) {
    addIssue(row, 'INVALID_VALUE', 'currency');
  }

  const companyRequired =
    row.eventType === 'portfolio_investment' || row.eventType === 'realized_proceeds';
  if (cellValidity.get('company_name')) {
    if (!companyRequired && companyRaw !== '') addIssue(row, 'INVALID_VALUE', 'company_name');
    if (companyRequired || companyRaw === '')
      row.companyId = resolveCompany(row, companyRaw, companyRequired, maps);
  }
  if (cellValidity.get('vehicle_slug')) row.vehicleId = resolveVehicle(row, vehicleRaw, maps);

  if (cellValidity.get('deployment_category')) {
    if (row.eventType === 'portfolio_investment') {
      if (deploymentRaw !== '' && !DEPLOYMENT_CATEGORIES.has(deploymentRaw)) {
        addIssue(row, 'INVALID_VALUE', 'deployment_category');
      }
    } else if (deploymentRaw !== '') {
      addIssue(row, 'INVALID_VALUE', 'deployment_category');
    }
  }

  if (cellValidity.get('description') && descriptionRaw.length > 1_000) {
    addIssue(row, 'INVALID_VALUE', 'description');
  }

  if (cellValidity.get('expense_category')) {
    const validExpense =
      (row.eventType === 'management_fee' && expenseRaw === 'management_fee') ||
      (row.eventType === 'fund_expense' &&
        ['legal', 'audit', 'admin', 'other'].includes(expenseRaw));
    if (row.eventType === 'management_fee' || row.eventType === 'fund_expense') {
      if (!validExpense) addIssue(row, 'INVALID_VALUE', 'expense_category');
    } else if (expenseRaw !== '') {
      addIssue(row, 'INVALID_VALUE', 'expense_category');
    }
  }

  if (cellValidity.get('distribution_type')) {
    if (row.eventType === 'lp_distribution') {
      if (!DISTRIBUTION_TYPES.has(distributionRaw))
        addIssue(row, 'INVALID_VALUE', 'distribution_type');
    } else if (distributionRaw !== '') {
      addIssue(row, 'INVALID_VALUE', 'distribution_type');
    }
  }

  if (cellValidity.get('recallable')) {
    if (row.eventType === 'lp_distribution') {
      if (recallableRaw !== 'true' && recallableRaw !== 'false')
        addIssue(row, 'INVALID_VALUE', 'recallable');
    } else if (recallableRaw !== '') {
      addIssue(row, 'INVALID_VALUE', 'recallable');
    }
  }

  if (
    !hasError(row.issues) &&
    row.rowSourceHash &&
    row.canonicalAmount &&
    row.eventType &&
    row.effectiveDate
  ) {
    row.canonicalEconomicFields = {
      eventType: row.eventType,
      effectiveDate: row.effectiveDate,
      amount: row.canonicalAmount,
      currency: currencyRaw,
      deploymentCategory: deploymentRaw || null,
      description: descriptionRaw || null,
      expenseCategory: expenseRaw || null,
      distributionType: distributionRaw || null,
      recallable: recallableRaw === '' ? null : recallableRaw === 'true',
    };
  }
  return row;
}

function parseValuationRow(
  cells: string[],
  rowNumber: number,
  asOfDate: string,
  fundId: number,
  maps: IdentityMaps
): WorkingRow {
  const row = makeWorkingRow(rowNumber);
  if (cells.length !== VALUATION_COLUMNS.length) {
    addIssue(row, 'INVALID_ROW_WIDTH', null);
    return row;
  }

  const companyRaw = cells[0]!;
  const vehicleRaw = cells[1]!;
  const markDateRaw = cells[2]!;
  const fairValueRaw = cells[3]!;
  const currencyRaw = cells[4]!;
  const markSourceRaw = cells[5]!;
  const confidenceRaw = cells[6]!;
  const valuationMethodRaw = cells[7]!;
  const costBasisRaw = cells[8]!;
  const externalRefRaw = cells[9]!;
  const cellValidity = new Map<string, boolean>();
  for (const [index, column] of VALUATION_COLUMNS.entries()) {
    cellValidity.set(column, validateCommonCell(row, column, cells[index]!));
  }

  row.eventType = 'valuation_mark';
  row.companyLabel = companyRaw === '' || !cellValidity.get('company_name') ? null : companyRaw;
  row.vehicleLabel = vehicleRaw === '' || !cellValidity.get('vehicle_slug') ? null : vehicleRaw;

  if (
    cellValidity.get('external_ref') &&
    ActualsExternalRefSchema.safeParse(externalRefRaw).success
  ) {
    row.sourceExternalRef = externalRefRaw;
    row.rowSourceHash = computeActualsPilotRowSourceHash(fundId, externalRefRaw);
  } else if (cellValidity.get('external_ref')) {
    addIssue(row, 'INVALID_VALUE', 'external_ref');
  }

  if (cellValidity.get('company_name')) row.companyId = resolveCompany(row, companyRaw, true, maps);
  if (cellValidity.get('vehicle_slug')) row.vehicleId = resolveVehicle(row, vehicleRaw, maps);

  if (cellValidity.get('mark_date') && isGregorianDate(markDateRaw)) {
    row.effectiveDate = markDateRaw;
    if (markDateRaw !== asOfDate) addIssue(row, 'VALUATION_AS_OF_MISMATCH', 'mark_date');
  } else if (cellValidity.get('mark_date')) {
    addIssue(row, 'INVALID_VALUE', 'mark_date');
  }

  if (cellValidity.get('position_fair_value')) {
    row.canonicalAmount = validateMoney(row, fairValueRaw, 'position_fair_value', true, false);
    if (row.canonicalAmount !== null) row.amountCents = moneyToCents(fairValueRaw);
  }
  if (
    cellValidity.get('currency') &&
    ActualsCurrencySchema.safeParse(currencyRaw).success === false
  ) {
    addIssue(row, 'INVALID_VALUE', 'currency');
  }
  if (cellValidity.get('mark_source') && !MARK_SOURCES.has(markSourceRaw)) {
    addIssue(row, 'INVALID_VALUE', 'mark_source');
  }
  if (cellValidity.get('confidence_level') && !CONFIDENCE_LEVELS.has(confidenceRaw)) {
    addIssue(row, 'INVALID_VALUE', 'confidence_level');
  }
  if (cellValidity.get('valuation_method')) {
    if (!ActualsValuationMethodSchema.safeParse(valuationMethodRaw).success) {
      addIssue(row, 'INVALID_VALUE', 'valuation_method');
    }
  }
  let canonicalCostBasis: string | null = null;
  if (cellValidity.get('cost_basis')) {
    canonicalCostBasis = validateMoney(row, costBasisRaw, 'cost_basis', false, false);
  }

  if (
    !hasError(row.issues) &&
    row.rowSourceHash &&
    row.canonicalAmount &&
    row.effectiveDate &&
    row.companyId &&
    row.vehicleId
  ) {
    row.canonicalEconomicFields = {
      markDate: row.effectiveDate,
      positionFairValue: row.canonicalAmount,
      currency: currencyRaw,
      markSource: markSourceRaw,
      confidenceLevel: confidenceRaw,
      valuationMethod: valuationMethodRaw,
      costBasis: canonicalCostBasis,
    };
  }
  return row;
}

function assignContentHashes(rows: WorkingRow[], fundId: number, templateVersion: string): void {
  for (const row of rows) {
    if (!row.rowSourceHash || !row.canonicalEconomicFields) continue;
    row.rowSourceHash = computeActualsPilotRowSourceHash(fundId, row.sourceExternalRef!);
    row.rowContentHash = computeActualsPilotRowContentHash({
      templateVersion,
      rowSourceHash: row.rowSourceHash,
      canonicalEconomicFields: row.canonicalEconomicFields,
      resolvedCompanyId: row.companyId,
      resolvedVehicleId: row.vehicleId,
    });
  }
}

function markDuplicateRows(rows: WorkingRow[], kind: TemplateKind): void {
  const refs = new Map<string, WorkingRow[]>();
  for (const row of rows) {
    if (!row.sourceExternalRef) continue;
    const matching = refs.get(row.sourceExternalRef) ?? [];
    matching.push(row);
    refs.set(row.sourceExternalRef, matching);
  }
  for (const matching of refs.values()) {
    if (matching.length < 2) continue;
    for (const row of matching) {
      row.duplicateInFile = true;
      addIssue(row, 'DUPLICATE_EXTERNAL_REF', 'external_ref');
    }
  }

  if (kind !== 'valuation') return;
  const pairs = new Map<string, WorkingRow[]>();
  for (const row of rows) {
    if (row.companyId === null || row.vehicleId === null) continue;
    const key = `${row.vehicleId}:${row.companyId}`;
    const matching = pairs.get(key) ?? [];
    matching.push(row);
    pairs.set(key, matching);
  }
  for (const matching of pairs.values()) {
    if (matching.length < 2) continue;
    for (const row of matching) {
      row.duplicateCompanyMark = true;
      addIssue(row, 'DUPLICATE_COMPANY_MARK', 'company_name');
    }
  }
}

function existingContentHashForRow(
  row: ExistingRow,
  working: WorkingRow,
  kind: TemplateKind
): string | null {
  if (!working.rowSourceHash) return null;
  return existingRowContentHash(row, kind, working.rowSourceHash);
}

function applyExistingClassification(
  rows: WorkingRow[],
  existingRows: readonly ExistingRow[],
  valuationRows: readonly ExistingRow[],
  kind: TemplateKind,
  asOfDate: string
): void {
  const byHash = new Map<string, ExistingRow>();
  for (const existing of existingRows) {
    const hash = existingSourceHash(existing);
    if (hash && !byHash.has(hash)) byHash.set(hash, existing);
  }

  for (const row of rows) {
    if (hasError(row.issues) || !row.rowContentHash || !row.rowSourceHash) continue;
    const existing = byHash.get(row.rowSourceHash);
    if (existing) {
      if (existingImportOrigin(existing) !== PILOT_IMPORT_ORIGIN) {
        addIssue(row, 'EXISTING_IMPORT_PROVENANCE_CONFLICT', 'external_ref');
      } else if (existingContentHashForRow(existing, row, kind) === row.rowContentHash) {
        row.status = 'already_imported';
        addIssue(row, 'ALREADY_IMPORTED', 'external_ref', 'warning');
      } else {
        addIssue(row, 'EXTERNAL_REF_REUSE_CONFLICT', 'external_ref');
      }
    }

    if (
      kind !== 'valuation' ||
      hasError(row.issues) ||
      row.companyId === null ||
      row.vehicleId === null
    )
      continue;
    const existingMark = valuationRows.find((candidate) => {
      const candidateCompany = valueOf(candidate, 'companyId', 'company_id');
      const candidateVehicle = valueOf(candidate, 'vehicleId', 'vehicle_id');
      const candidateDate = dayValue(valueOf(candidate, 'markDate', 'mark_date'));
      return (
        candidateCompany === row.companyId &&
        candidateVehicle === row.vehicleId &&
        candidateDate === asOfDate &&
        existingSourceHash(candidate) !== row.rowSourceHash &&
        valueOf(candidate, 'status', 'status') !== 'superseded'
      );
    });
    if (existingMark) addIssue(row, 'VALUATION_MARK_ALREADY_EXISTS', 'mark_date');
  }
}

function canAddTotals(totals: TotalsCents, row: WorkingRow, kind: TemplateKind): boolean {
  if (row.amountCents === null) return false;
  const amount = row.amountCents;
  const next = { ...totals };
  if (kind === 'valuation') {
    next.positionFairValue += amount;
    return next.positionFairValue <= NUMERIC_20_6_MAX_CENTS;
  }
  switch (row.eventType) {
    case 'settled_contribution':
      next.settledPaidIn += amount;
      break;
    case 'lp_distribution':
      next.distributionsToPartners += amount;
      break;
    case 'management_fee':
      next.managementFees += amount;
      break;
    case 'fund_expense':
      next.otherExpenses += amount;
      break;
    case 'portfolio_investment':
      next.deployed += amount;
      if (row.canonicalEconomicFields?.['deploymentCategory'] === 'initial')
        next.initialDeployed += amount;
      if (row.canonicalEconomicFields?.['deploymentCategory'] === 'follow_on')
        next.followOnDeployed += amount;
      if (row.canonicalEconomicFields?.['deploymentCategory'] === 'secondary')
        next.secondaryDeployed += amount;
      if (row.canonicalEconomicFields?.['deploymentCategory'] === 'other')
        next.otherDeployed += amount;
      break;
    case 'realized_proceeds':
      next.realizedFundProceeds += amount;
      break;
    default:
      return false;
  }
  return [
    next.settledPaidIn,
    next.deployed,
    next.initialDeployed,
    next.followOnDeployed,
    next.secondaryDeployed,
    next.otherDeployed,
    next.managementFees,
    next.otherExpenses,
    next.realizedFundProceeds,
    next.distributionsToPartners,
  ].every((value) => value <= NUMERIC_20_6_MAX_CENTS);
}

function addTotals(totals: TotalsCents, row: WorkingRow, kind: TemplateKind): void {
  const amount = row.amountCents;
  if (amount === null) return;
  if (kind === 'valuation') {
    totals.positionFairValue += amount;
    totals.markedCompanyCount += 1;
    return;
  }
  switch (row.eventType) {
    case 'settled_contribution':
      totals.settledPaidIn += amount;
      break;
    case 'lp_distribution':
      totals.distributionsToPartners += amount;
      break;
    case 'management_fee':
      totals.managementFees += amount;
      break;
    case 'fund_expense':
      totals.otherExpenses += amount;
      break;
    case 'portfolio_investment':
      totals.deployed += amount;
      switch (row.canonicalEconomicFields?.['deploymentCategory']) {
        case 'initial':
          totals.initialDeployed += amount;
          break;
        case 'follow_on':
          totals.followOnDeployed += amount;
          break;
        case 'secondary':
          totals.secondaryDeployed += amount;
          break;
        case 'other':
          totals.otherDeployed += amount;
          break;
        default:
          break;
      }
      break;
    case 'realized_proceeds':
      totals.realizedFundProceeds += amount;
      break;
    default:
      break;
  }
}

function classifyAndAggregate(
  rows: WorkingRow[],
  kind: TemplateKind
): { fileTotals: TotalsCents; netNewTotals: TotalsCents } {
  const fileTotals = zeroTotals();
  const netNewTotals = zeroTotals();
  for (const row of rows) {
    if (hasError(row.issues) || row.rowContentHash === null) {
      row.status =
        row.duplicateInFile || row.duplicateCompanyMark ? 'duplicate_in_file' : 'invalid';
      continue;
    }
    if (row.status === 'already_imported') {
      // Classification was assigned before aggregate validation.
    } else if (row.duplicateInFile || row.duplicateCompanyMark) {
      row.status = 'duplicate_in_file';
    } else {
      row.status = 'valid';
    }

    if (row.status !== 'valid' && row.status !== 'already_imported') continue;
    if (!canAddTotals(fileTotals, row, kind)) {
      addIssue(row, 'AGGREGATE_OVERFLOW', kind === 'ledger' ? 'amount' : 'position_fair_value');
      row.status = 'invalid';
      continue;
    }
    addTotals(fileTotals, row, kind);
    if (row.status === 'valid') addTotals(netNewTotals, row, kind);
  }
  return { fileTotals, netNewTotals };
}

function categoryCoverage(
  rows: readonly WorkingRow[],
  kind: TemplateKind
): ActualsPreviewResponseV1['categoryCoverage'] {
  if (kind === 'valuation') return 'not_applicable';
  const deploymentRows = rows.filter(
    (row) => row.eventType === 'portfolio_investment' && !hasError(row.issues)
  );
  if (deploymentRows.length === 0) return 'not_applicable';
  return deploymentRows.every(
    (row) =>
      row.canonicalEconomicFields?.['deploymentCategory'] !== null &&
      row.canonicalEconomicFields?.['deploymentCategory'] !== undefined
  )
    ? 'complete'
    : 'partial';
}

function rowResponse(row: WorkingRow): ActualsPreviewRowV1 {
  const issues = [...row.issues].sort(compareIssues);
  return {
    rowNumber: row.rowNumber,
    sourceExternalRef: row.sourceExternalRef,
    status: row.status,
    eventType: row.eventType,
    effectiveDate: row.effectiveDate,
    companyLabel: row.companyLabel,
    vehicleLabel: row.vehicleLabel,
    canonicalAmount: row.canonicalAmount,
    rowSourceHash: row.rowSourceHash,
    rowContentHash: row.rowContentHash,
    issues,
  };
}

function rowCounts(rows: readonly WorkingRow[]): ActualsPreviewResponseV1['rowCounts'] {
  return {
    total: rows.length,
    valid: rows.filter((row) => row.status === 'valid').length,
    invalid: rows.filter((row) => row.status === 'invalid').length,
    duplicateInFile: rows.filter((row) => row.status === 'duplicate_in_file').length,
    alreadyImported: rows.filter((row) => row.status === 'already_imported').length,
  };
}

function canonicalRowsHash(
  fundId: number,
  asOfDate: string,
  templateVersion: string,
  rows: readonly WorkingRow[]
): string {
  const canonicalRows = rows
    .filter((row) => row.rowSourceHash !== null && row.rowContentHash !== null)
    .map((row) => ({ rowSourceHash: row.rowSourceHash!, rowContentHash: row.rowContentHash! }))
    .sort((left, right) => {
      const sourceOrder = byteCompare(left.rowSourceHash, right.rowSourceHash);
      return sourceOrder === 0
        ? byteCompare(left.rowContentHash, right.rowContentHash)
        : sourceOrder;
    });
  return canonicalSha256({ templateVersion, fundId, asOfDate, rows: canonicalRows });
}

function previewHash(
  fundId: number,
  asOfDate: string,
  templateVersion: string,
  payloadSha256: string,
  rows: readonly WorkingRow[],
  globalIssues: Readonly<ActualsPreviewRowV1['issues']>,
  fileTotals: ActualsPreviewTotalsV1,
  rowsHash: string
): string {
  const rowStatusesAndIssueCoordinates = [
    ...rows.map((row) => ({
      rowNumber: row.rowNumber,
      status: row.status,
      issues: [...row.issues]
        .sort(compareIssues)
        .map(({ rowNumber, column, code }) => ({ rowNumber, column, code })),
    })),
    ...globalIssues.map(({ rowNumber, column, code }) => ({
      rowNumber,
      status: null,
      issues: [{ rowNumber, column, code }],
    })),
  ].sort((left, right) => {
    if (left.rowNumber !== right.rowNumber) return left.rowNumber - right.rowNumber;
    const leftIssue = left.issues[0] ?? null;
    const rightIssue = right.issues[0] ?? null;
    if (leftIssue === null && rightIssue === null) {
      return byteCompare(left.status ?? '', right.status ?? '');
    }
    if (leftIssue === null) return -1;
    if (rightIssue === null) return 1;
    const leftColumn =
      leftIssue.column === null
        ? -1
        : (COLUMN_INDEX.get(leftIssue.column) ?? Number.MAX_SAFE_INTEGER);
    const rightColumn =
      rightIssue.column === null
        ? -1
        : (COLUMN_INDEX.get(rightIssue.column) ?? Number.MAX_SAFE_INTEGER);
    if (leftColumn !== rightColumn) return leftColumn - rightColumn;
    return byteCompare(leftIssue.code, rightIssue.code);
  });
  const resolvedIdentityPairs = [...rows]
    .sort((left, right) => left.rowNumber - right.rowNumber)
    .map((row) => ({
      rowNumber: row.rowNumber,
      companyId: row.companyId,
      vehicleId: row.vehicleId,
    }));
  return canonicalSha256({
    templateVersion,
    fundId,
    asOfDate,
    payloadSha256,
    canonicalRowsHash: rowsHash,
    rowStatusesAndIssueCoordinates,
    resolvedIdentityPairs,
    fileTotals,
  });
}

function invalidHeaderRows(count: number): WorkingRow[] {
  return Array.from({ length: count }, (_, index) => makeWorkingRow(index + 1));
}

function maxRowsError(kind: TemplateKind, count: number): never {
  throw new ActualsPilotPreviewError(
    413,
    'ROW_CAP_EXCEEDED',
    `${kind} CSV contains too many rows.`,
    {
      safeCounts: { total: count, accepted: 0, rejected: count },
    }
  );
}

function validateRequest(input: ActualsPilotPreviewInput): {
  fundId: number;
  request: ActualsPreviewRequestV1;
} {
  const fundId = input.fundId;
  const request = requestFromInput(input);
  const parsed = ActualsPreviewRequestV1Schema.safeParse(request);
  if (!parsed.success) {
    throw new ActualsPilotPreviewError(
      400,
      'INVALID_BODY',
      'Actuals preview request is invalid.',
      parsed.error.issues
    );
  }
  return { fundId, request: parsed.data };
}

export async function previewActualsPilot(
  input: ActualsPilotPreviewInput,
  options: ActualsPilotPreviewServiceOptions = {}
): Promise<ActualsPreviewResponseV1> {
  const { fundId, request } = validateRequest(input);
  const kind = templateKind(request.templateVersion);
  const payload = decodePayload(request.payload);
  if (payload.byteLength > maxBytes(kind) || payload.byteLength > ACTUALS_COMBINED_MAX_BYTES) {
    throw new ActualsPilotPreviewError(
      413,
      'PAYLOAD_TOO_LARGE',
      'CSV payload exceeds the fixed-template byte cap.'
    );
  }

  const parsed = parseStrictCsv(payload, kind);
  if (parsed.rows.length > ACTUALS_MAX_ROWS) maxRowsError(kind, parsed.rows.length);

  const payloadSha256 = sha256Bytes(payload);
  const globalIssues: ActualsPreviewRowV1['issues'] = [];
  const database = options.database ?? db;

  if (!parsed.headerMatches) {
    globalIssues.push(makeIssue('INVALID_HEADER', 1, null));
    const rows = invalidHeaderRows(parsed.rows.length);
    const rowsHash = canonicalRowsHash(fundId, request.asOfDate, request.templateVersion, rows);
    const zero = totalsResponse(zeroTotals());
    const response = {
      contractVersion: 'actuals-preview-response/1.0.0' as const,
      templateVersion: request.templateVersion,
      asOfDate: request.asOfDate,
      sanitizedFileName: sanitizeFileName(request.fileName),
      byteCount: payload.byteLength,
      payloadSha256,
      canonicalRowsHash: rowsHash,
      previewHash: previewHash(
        fundId,
        request.asOfDate,
        request.templateVersion,
        payloadSha256,
        rows,
        globalIssues,
        zero,
        rowsHash
      ),
      rowCounts: {
        total: rows.length,
        valid: 0,
        invalid: rows.length,
        duplicateInFile: 0,
        alreadyImported: 0,
      },
      fileTotals: zero,
      netNewEffectTotals: zero,
      categoryCoverage: 'not_applicable' as const,
      rows: rows.map(rowResponse),
      issues: [...globalIssues].sort(compareIssues),
      canPublish: false,
    };
    return ActualsPreviewResponseV1Schema.parse(response);
  }

  const maps = await loadIdentityMaps(database, fundId);
  const rows = parsed.rows.map((cells, index) =>
    kind === 'ledger'
      ? parseLedgerRow(cells, index + 1, request.asOfDate, fundId, maps)
      : parseValuationRow(cells, index + 1, request.asOfDate, fundId, maps)
  );
  assignContentHashes(rows, fundId, request.templateVersion);
  markDuplicateRows(rows, kind);

  const [nonPilotCash, nonPilotValuation] = await Promise.all([
    hasNonPilotCashFlowRows(database, fundId),
    hasNonPilotValuationRows(database, fundId),
  ]);
  if (nonPilotCash || nonPilotValuation)
    globalIssues.push(makeIssue('FUND_LEDGER_NOT_PILOT_OWNED', 0, null));

  const existingHashes = rows
    .map((row) => row.rowSourceHash)
    .filter((hash): hash is string => hash !== null);
  const [existingRows, existingValuationRows, rosterExists] = await Promise.all([
    loadExistingRowsBySourceHash(database, fundId, kind, Array.from(new Set(existingHashes))),
    kind === 'valuation'
      ? loadExistingValuationTuples(database, fundId, request.asOfDate)
      : Promise.resolve([]),
    kind === 'valuation' ? loadPilotRoster(database, fundId) : Promise.resolve(true),
  ]);
  if (kind === 'valuation' && !rosterExists)
    globalIssues.push(makeIssue('VALUATION_ROSTER_EMPTY', 0, null));

  applyExistingClassification(rows, existingRows, existingValuationRows, kind, request.asOfDate);
  const { fileTotals, netNewTotals } = classifyAndAggregate(rows, kind);
  const fileTotalsResponse = totalsResponse(fileTotals);
  const netNewTotalsResponse = totalsResponse(netNewTotals);
  const rowsHash = canonicalRowsHash(fundId, request.asOfDate, request.templateVersion, rows);
  const rowResponses = rows.map(rowResponse);
  const allIssues = [...globalIssues, ...rowResponses.flatMap((row) => row.issues)].sort(
    compareIssues
  );
  // The flat list is a bounded convenience view; every row keeps its own issues.
  const issues = allIssues.slice(0, ACTUALS_PREVIEW_MAX_ISSUES);
  const hasIdentityError = rows.some((row) =>
    row.issues.some((issue) =>
      [
        'COMPANY_NOT_FOUND',
        'COMPANY_NAME_AMBIGUOUS',
        'VEHICLE_NOT_FOUND',
        'UNSUPPORTED_VEHICLE_SCOPE',
      ].includes(issue.code)
    )
  );
  const hasErrorIssue = allIssues.some((issue) => issue.severity === 'error');
  const response = {
    contractVersion: 'actuals-preview-response/1.0.0' as const,
    templateVersion: request.templateVersion,
    asOfDate: request.asOfDate,
    sanitizedFileName: sanitizeFileName(request.fileName),
    byteCount: payload.byteLength,
    payloadSha256,
    canonicalRowsHash: rowsHash,
    previewHash: previewHash(
      fundId,
      request.asOfDate,
      request.templateVersion,
      payloadSha256,
      rows,
      globalIssues,
      fileTotalsResponse,
      rowsHash
    ),
    rowCounts: rowCounts(rows),
    fileTotals: fileTotalsResponse,
    netNewEffectTotals: netNewTotalsResponse,
    categoryCoverage: categoryCoverage(rows, kind),
    rows: rowResponses,
    issues,
    canPublish: rows.some((row) => row.status === 'valid') && !hasErrorIssue && !hasIdentityError,
  };
  return ActualsPreviewResponseV1Schema.parse(response);
}
