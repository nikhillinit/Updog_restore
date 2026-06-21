/**
 * LP Reporting -- Import Reconciliation Service.
 *
 * Pure functions plus a thin orchestration layer for the dry-run path.
 * NO database writes, NO INSERT, NO UPDATE on cash_flow_events or
 * valuation_marks. The Phase 0.4 verifier asserts this via DB spy.
 *
 * Money math is performed via Decimal.js (shared/lib/decimal-utils);
 * money on the wire is a decimal string per ADR-011.
 *
 * @module server/services/lp-reporting/import-reconciliation-service
 * @see docs/adr/ADR-011-decimal-string-api-convention.md
 */

import { randomUUID } from 'node:crypto';

import { Decimal } from '@shared/lib/decimal-config';
import { canonicalSha256 } from '@shared/lib/canonical-hash';
import type {
  ImportDryRunResponse,
  ImportError,
  ImportPreviewRow,
  ImportWarning,
  ReconciliationSummary,
  SourceType,
} from '@shared/contracts/lp-reporting';

const DECIMAL_REGEX = /^-?\d+(\.\d{1,6})?$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const POSITIVE_INTEGER_REGEX = /^[1-9]\d*$/;
const SUPPORTED_CURRENCIES = new Set(['USD']);

const LEDGER_EVENT_TYPES = new Set([
  'lp_capital_call',
  'lp_distribution',
  'fund_expense',
  'portfolio_investment',
  'realized_proceeds',
  'recallable_distribution',
  'reversal',
]);

const MARK_SOURCES_LOW_CONFIDENCE = new Set(['gp_estimate', 'board_update']);

export interface ParsedLedgerRow {
  rowIndex: number;
  eventType: string;
  amount: string;
  currency: string;
  eventDate: string;
  perspective: string;
  companyId?: number;
  lpId?: number;
  vehicleId?: number;
  description?: string;
}

export interface ParsedValuationMarkRow {
  rowIndex: number;
  companyId: number;
  markDate: string;
  asOfDate: string;
  fairValue: string;
  currency: string;
  markSource: string;
  confidenceLevel: string;
  valuationMethod: string;
  vehicleId?: number;
  costBasis?: string;
}

export interface ParseResult<TRow> {
  rows: TRow[];
  parseErrors: ImportError[];
  parseWarnings: ImportWarning[];
}

export interface ExistingFundState {
  /** Total committed-and-called capital prior to this import. */
  calledCapitalExpected?: string;
  /** Latest known NAV before this import (for distribution sanity). */
  latestNavBeforeImport?: string;
}

export type ImportKind = 'ledger' | 'valuation-marks';

export function computeImportPreviewHash(input: {
  fundId: number;
  importKind: ImportKind;
  sourceType: SourceType;
  parsedRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  warnings: ImportWarning[];
  errors: ImportError[];
  reconciliation: ReconciliationSummary;
  preview: ImportPreviewRow[];
}): string {
  return canonicalSha256(input);
}

export function computeSourceRowHash(input: {
  fundId: number;
  importKind: ImportKind;
  sourceType: SourceType;
  row: unknown;
}): string {
  return canonicalSha256(input);
}

// ============================================================================
// CSV / NOTION PARSING
// ============================================================================

/**
 * Minimal CSV splitter. Handles double-quoted fields and escaped quotes.
 * Sufficient for fixture parsing in Phase 0; production import in Phase 1
 * may swap this for a hardened parser if necessary.
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

const BOM_CHAR = String.fromCharCode(0xfeff);

function parseCsvBuffer(buffer: Buffer): { header: string[]; rows: string[][] } {
  // Strip optional UTF-8 BOM at the start of the file.
  const raw = buffer.toString('utf8');
  const text = raw.startsWith(BOM_CHAR) ? raw.slice(1) : raw;
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { header: [], rows: [] };
  }
  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase().replace(/[\s-]/g, '_'));
  const rows = lines.slice(1).map((l) => splitCsvLine(l));
  return { header, rows };
}

/**
 * Notion CSV exports use Title Case headers with spaces. Normalize to
 * snake_case so we can hand them to the same parser path as native CSV.
 */
const NOTION_HEADER_MAP: Record<string, string> = {
  event_type: 'event_type',
  amount: 'amount',
  currency: 'currency',
  date: 'event_date',
  event_date: 'event_date',
  perspective: 'perspective',
  company: 'company_id',
  company_id: 'company_id',
  lp: 'lp_id',
  lp_id: 'lp_id',
  vehicle: 'vehicle_id',
  vehicle_id: 'vehicle_id',
  description: 'description',
  notes: 'description',
};

function normalizeHeaders(header: string[], mapping: Record<string, string>): string[] {
  return header.map((h) => mapping[h] ?? h);
}

function parseOptionalPositiveInteger(
  raw: string | undefined,
  column: string,
  rowIndex: number,
  parseErrors: ImportError[]
): number | undefined {
  if (raw === undefined || raw === '') {
    return undefined;
  }

  if (!POSITIVE_INTEGER_REGEX.test(raw)) {
    parseErrors.push({
      row: rowIndex,
      column,
      code: 'MALFORMED_INTEGER_ID',
      message: `${column} "${raw}" must be a positive integer.`,
      severity: 'error',
    });
    return undefined;
  }

  return Number.parseInt(raw, 10);
}

// ============================================================================
// LEDGER PARSING
// ============================================================================

/**
 * Parse a CSV buffer into ledger rows + parse errors. Pure function.
 * fundId is reserved for future cross-fund duplicate detection but not
 * persisted on the row (rows attach to the calling fund at the route).
 */
export function parseLedgerCsv(
  buffer: Buffer,

  _fundId: number
): ParseResult<ParsedLedgerRow> {
  const { header, rows } = parseCsvBuffer(buffer);
  return parseLedgerRows(header, rows);
}

export function parseLedgerNotionExport(
  buffer: Buffer,

  _fundId: number
): ParseResult<ParsedLedgerRow> {
  const { header, rows } = parseCsvBuffer(buffer);
  return parseLedgerRows(normalizeHeaders(header, NOTION_HEADER_MAP), rows);
}

function parseLedgerRows(header: string[], rows: string[][]): ParseResult<ParsedLedgerRow> {
  const parsed: ParsedLedgerRow[] = [];
  const parseErrors: ImportError[] = [];
  const parseWarnings: ImportWarning[] = [];

  const idx = (col: string): number => header.indexOf(col);

  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r]!;
    const rowIndex = r + 1;
    const get = (col: string): string | undefined => {
      const i = idx(col);
      return i >= 0 ? cells[i] : undefined;
    };

    const eventType = get('event_type') ?? '';
    const amount = get('amount') ?? '';
    const currency = (get('currency') ?? 'USD').toUpperCase();
    const eventDate = get('event_date') ?? '';
    const perspective = get('perspective') ?? '';
    const companyIdRaw = get('company_id');
    const lpIdRaw = get('lp_id');
    const vehicleIdRaw = get('vehicle_id');
    const description = get('description');

    let isInvalid = false;

    if (!LEDGER_EVENT_TYPES.has(eventType)) {
      parseErrors.push({
        row: rowIndex,
        column: 'event_type',
        code: 'UNKNOWN_EVENT_TYPE',
        message: `event_type "${eventType}" is not one of the documented values.`,
        severity: 'error',
      });
      isInvalid = true;
    }
    if (!DECIMAL_REGEX.test(amount)) {
      parseErrors.push({
        row: rowIndex,
        column: 'amount',
        code: 'MALFORMED_AMOUNT',
        message: `amount "${amount}" must be a decimal string.`,
        severity: 'error',
      });
      isInvalid = true;
    }
    if (!ISO_DATETIME_REGEX.test(eventDate) && !ISO_DATE_REGEX.test(eventDate)) {
      parseErrors.push({
        row: rowIndex,
        column: 'event_date',
        code: 'MALFORMED_EVENT_DATE',
        message: `event_date "${eventDate}" must be ISO-8601.`,
        severity: 'error',
      });
      isInvalid = true;
    }
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      parseErrors.push({
        row: rowIndex,
        column: 'currency',
        code: 'UNSUPPORTED_CURRENCY',
        message: `currency "${currency}" is not in the supported set.`,
        severity: 'error',
      });
      isInvalid = true;
    }

    const companyId = parseOptionalPositiveInteger(
      companyIdRaw,
      'company_id',
      rowIndex,
      parseErrors
    );
    const lpId = parseOptionalPositiveInteger(lpIdRaw, 'lp_id', rowIndex, parseErrors);
    const vehicleId = parseOptionalPositiveInteger(
      vehicleIdRaw,
      'vehicle_id',
      rowIndex,
      parseErrors
    );
    if (
      (companyIdRaw && companyId === undefined) ||
      (lpIdRaw && lpId === undefined) ||
      (vehicleIdRaw && vehicleId === undefined)
    ) {
      isInvalid = true;
    }

    if (isInvalid) {
      continue;
    }

    parsed.push({
      rowIndex,
      eventType,
      amount,
      currency,
      eventDate,
      perspective: perspective || 'fund_gross',
      ...(companyId !== undefined && { companyId }),
      ...(lpId !== undefined && { lpId }),
      ...(vehicleId !== undefined && { vehicleId }),
      ...(description !== undefined && { description }),
    });
  }

  return { rows: parsed, parseErrors, parseWarnings };
}

// ============================================================================
// VALUATION MARK PARSING
// ============================================================================

export function parseValuationMarksCsv(
  buffer: Buffer,

  _fundId: number
): ParseResult<ParsedValuationMarkRow> {
  const { header, rows } = parseCsvBuffer(buffer);
  const parsed: ParsedValuationMarkRow[] = [];
  const parseErrors: ImportError[] = [];
  const parseWarnings: ImportWarning[] = [];

  const idx = (col: string): number => header.indexOf(col);

  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r]!;
    const rowIndex = r + 1;
    const get = (col: string): string | undefined => {
      const i = idx(col);
      return i >= 0 ? cells[i] : undefined;
    };

    const companyIdRaw = get('company_id') ?? '';
    const markDate = get('mark_date') ?? '';
    const asOfDate = get('as_of_date') ?? '';
    const fairValue = get('fair_value') ?? '';
    const currency = (get('currency') ?? 'USD').toUpperCase();
    const markSource = (get('mark_source') ?? '').trim();
    const valuationMethod = get('valuation_method') ?? 'unspecified';
    const costBasis = get('cost_basis');
    const vehicleIdRaw = get('vehicle_id');
    const importedConfidence = get('confidence_level');

    let isInvalid = false;

    if (!ISO_DATE_REGEX.test(markDate)) {
      parseErrors.push({
        row: rowIndex,
        column: 'mark_date',
        code: 'MALFORMED_MARK_DATE',
        message: `mark_date "${markDate}" must be ISO-8601 (YYYY-MM-DD).`,
        severity: 'error',
      });
      isInvalid = true;
    }
    if (!ISO_DATE_REGEX.test(asOfDate)) {
      parseErrors.push({
        row: rowIndex,
        column: 'as_of_date',
        code: 'MALFORMED_AS_OF_DATE',
        message: `as_of_date "${asOfDate}" must be ISO-8601 (YYYY-MM-DD).`,
        severity: 'error',
      });
      isInvalid = true;
    }
    if (!DECIMAL_REGEX.test(fairValue)) {
      parseErrors.push({
        row: rowIndex,
        column: 'fair_value',
        code: 'MALFORMED_FAIR_VALUE',
        message: `fair_value "${fairValue}" must be a decimal string.`,
        severity: 'error',
      });
      isInvalid = true;
    }
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      parseErrors.push({
        row: rowIndex,
        column: 'currency',
        code: 'UNSUPPORTED_CURRENCY',
        message: `currency "${currency}" is not in the supported set.`,
        severity: 'error',
      });
      isInvalid = true;
    }
    const companyId = parseOptionalPositiveInteger(
      companyIdRaw,
      'company_id',
      rowIndex,
      parseErrors
    );
    if (companyIdRaw === '') {
      parseErrors.push({
        row: rowIndex,
        column: 'company_id',
        code: 'MISSING_COMPANY_ID',
        message: 'company_id is required and must be a positive integer.',
        severity: 'error',
      });
      isInvalid = true;
    }
    if (companyIdRaw !== '' && companyId === undefined) {
      isInvalid = true;
    }
    const vehicleId = parseOptionalPositiveInteger(
      vehicleIdRaw,
      'vehicle_id',
      rowIndex,
      parseErrors
    );
    if (vehicleIdRaw && vehicleId === undefined) {
      isInvalid = true;
    }
    if (markSource === '') {
      parseErrors.push({
        row: rowIndex,
        column: 'mark_source',
        code: 'MISSING_MARK_SOURCE',
        message: 'mark_source is required.',
        severity: 'error',
      });
      isInvalid = true;
    }

    if (isInvalid) {
      continue;
    }

    // Imported marks default to low confidence unless reviewer pre-set
    // a value (and only "high"/"medium" can be promoted in via import).
    let confidenceLevel = 'low';
    if (importedConfidence === 'high' || importedConfidence === 'medium') {
      confidenceLevel = importedConfidence;
    }
    if (MARK_SOURCES_LOW_CONFIDENCE.has(markSource)) {
      confidenceLevel = 'low';
    }
    if (importedConfidence && importedConfidence !== confidenceLevel) {
      parseWarnings.push({
        row: rowIndex,
        column: 'confidence_level',
        code: 'CONFIDENCE_DOWNGRADED',
        message: `confidence_level "${importedConfidence}" downgraded to "${confidenceLevel}" per import policy.`,
      });
    }

    parsed.push({
      rowIndex,
      companyId: companyId!,
      markDate,
      asOfDate,
      fairValue,
      currency,
      markSource,
      confidenceLevel,
      valuationMethod,
      ...(vehicleId !== undefined && { vehicleId }),
      ...(costBasis !== undefined && { costBasis }),
    });
  }

  return { rows: parsed, parseErrors, parseWarnings };
}

// ============================================================================
// DUPLICATE DETECTION
// ============================================================================

/**
 * Returns the set of row indices that are duplicates (i.e. NOT the
 * first occurrence). Hash key: eventType|eventDate|amount|companyId|lpId.
 */
export function detectLedgerDuplicates(rows: ParsedLedgerRow[]): Set<number> {
  const seen = new Set<string>();
  const duplicateIndices = new Set<number>();
  for (const row of rows) {
    const key = [
      row.eventType,
      row.eventDate,
      row.amount,
      row.companyId ?? '',
      row.lpId ?? '',
    ].join('|');
    if (seen.has(key)) {
      duplicateIndices.add(row.rowIndex);
    } else {
      seen.add(key);
    }
  }
  return duplicateIndices;
}

// ============================================================================
// RECONCILIATION
// ============================================================================

function sumAmountsByEventType(rows: ParsedLedgerRow[], eventType: string): Decimal {
  return rows
    .filter((r) => r.eventType === eventType)
    .reduce((acc, r) => acc.plus(new Decimal(r.amount).abs()), new Decimal(0));
}

export function reconcileLedgerImport(
  rows: ParsedLedgerRow[],
  existingFundState: ExistingFundState = {}
): ReconciliationSummary {
  const calledCapital = sumAmountsByEventType(rows, 'lp_capital_call');
  const distributions = sumAmountsByEventType(rows, 'lp_distribution');
  const explanations: string[] = [];

  let difference: string | undefined;
  if (existingFundState.calledCapitalExpected) {
    const expected = new Decimal(existingFundState.calledCapitalExpected);
    const diff = calledCapital.minus(expected);
    if (!diff.isZero()) {
      explanations.push(
        `Called capital differs from expected by ${diff.toFixed(6)} (expected ${expected.toFixed(6)}, imported ${calledCapital.toFixed(6)}).`
      );
    }
    difference = diff.toFixed(6);
  }

  return {
    calledCapitalImported: calledCapital.toFixed(6),
    ...(existingFundState.calledCapitalExpected !== undefined && {
      calledCapitalExpected: new Decimal(existingFundState.calledCapitalExpected).toFixed(6),
    }),
    distributionsImported: distributions.toFixed(6),
    latestNavImported: '0.000000',
    ...(difference !== undefined && { difference }),
    explanations,
  };
}

export function reconcileValuationMarkImport(
  rows: ParsedValuationMarkRow[]
): ReconciliationSummary {
  const today = new Date().toISOString().slice(0, 10);
  const currentMarks = rows.filter((r) => r.asOfDate <= today);
  const latestNav = currentMarks.reduce(
    (acc, r) => acc.plus(new Decimal(r.fairValue)),
    new Decimal(0)
  );
  const futureCount = rows.length - currentMarks.length;
  const explanations: string[] = [];
  if (futureCount > 0) {
    explanations.push(
      `${futureCount} future-dated mark(s) excluded from current as-of NAV calculation.`
    );
  }
  return {
    calledCapitalImported: '0.000000',
    distributionsImported: '0.000000',
    latestNavImported: latestNav.toFixed(6),
    explanations,
  };
}

// ============================================================================
// ORCHESTRATION
// ============================================================================

function buildLedgerPreview(rows: ParsedLedgerRow[], duplicates: Set<number>): ImportPreviewRow[] {
  return rows.map((r) => ({
    rowIndex: r.rowIndex,
    eventType: r.eventType,
    ...(r.companyId !== undefined && { companyId: r.companyId }),
    ...(r.lpId !== undefined && { lpId: r.lpId }),
    amount: r.amount,
    eventDate: r.eventDate,
    duplicate: duplicates.has(r.rowIndex),
    excluded: false,
  }));
}

function buildValuationMarkPreview(rows: ParsedValuationMarkRow[]): ImportPreviewRow[] {
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => ({
    rowIndex: r.rowIndex,
    markSource: r.markSource,
    companyId: r.companyId,
    fairValue: r.fairValue,
    asOfDate: r.asOfDate,
    confidenceLevel: r.confidenceLevel,
    duplicate: false,
    excluded: r.asOfDate > today,
    ...(r.asOfDate > today && { excludedReason: 'Future-dated mark' }),
  }));
}

export function runLedgerDryRun(
  buffer: Buffer,
  sourceType: SourceType,
  fundId: number,
  existingFundState: ExistingFundState = {}
): ImportDryRunResponse {
  const parsed =
    sourceType === 'notion'
      ? parseLedgerNotionExport(buffer, fundId)
      : parseLedgerCsv(buffer, fundId);
  const duplicates = detectLedgerDuplicates(parsed.rows);
  const reconciliation = reconcileLedgerImport(parsed.rows, existingFundState);
  const preview = buildLedgerPreview(parsed.rows, duplicates);
  const base = {
    sourceType,
    parsedRows: parsed.rows.length + parsed.parseErrors.length,
    validRows: parsed.rows.length - duplicates.size,
    invalidRows: parsed.parseErrors.length,
    duplicateRows: duplicates.size,
    warnings: parsed.parseWarnings,
    errors: parsed.parseErrors,
    reconciliation,
    preview,
  };

  return {
    importId: randomUUID(),
    ...base,
    previewHash: computeImportPreviewHash({ fundId, importKind: 'ledger', ...base }),
  };
}

export function runValuationMarkDryRun(
  buffer: Buffer,
  sourceType: SourceType,
  fundId: number
): ImportDryRunResponse {
  const parsed = parseValuationMarksCsv(buffer, fundId);
  const reconciliation = reconcileValuationMarkImport(parsed.rows);
  const preview = buildValuationMarkPreview(parsed.rows);
  const base = {
    sourceType,
    parsedRows: parsed.rows.length + parsed.parseErrors.length,
    validRows: parsed.rows.length,
    invalidRows: parsed.parseErrors.length,
    duplicateRows: 0,
    warnings: parsed.parseWarnings,
    errors: parsed.parseErrors,
    reconciliation,
    preview,
  };

  return {
    importId: randomUUID(),
    ...base,
    previewHash: computeImportPreviewHash({ fundId, importKind: 'valuation-marks', ...base }),
  };
}
