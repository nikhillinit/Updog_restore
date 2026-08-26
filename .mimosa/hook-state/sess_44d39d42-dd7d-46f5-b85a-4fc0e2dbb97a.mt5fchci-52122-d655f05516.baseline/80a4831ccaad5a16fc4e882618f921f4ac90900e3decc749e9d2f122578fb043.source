/**
 * Fixed-template KPI CSV import (issue #1300, ruling GR2-4a).
 *
 * v1 is CSV-first and internal-only: there is one frozen header, no mapping
 * profile, and no caller-supplied column mapping. Tokenizing reuses the shared
 * `server/lib/csv-tokenizer` primitives that `financial-observations/csv-adapter`
 * itself consumes -- there is exactly one CSV tokenizer in this repository and
 * this module adds no second parser.
 *
 * Batch-level structural problems (embedded newline, wrong header, row overflow)
 * reject the whole batch. Per-row problems reject only that row, so one bad cell
 * in a quarterly collection does not discard the other companies' numbers.
 *
 * @module server/services/kpi/kpi-observation-csv
 */

import {
  KPI_CSV_MAX_ROWS,
  KPI_CSV_TEMPLATE_HEADER,
  KPI_METRIC_VALUE_KIND,
  KpiObservationCreateRequestSchema,
  type KpiCsvRowRejection,
  type KpiMetric,
  type KpiObservationCreateRequest,
  type KpiObservationValue,
} from '@shared/contracts/kpi/kpi-observation-v1.contract';

import {
  hasEmbeddedQuotedNewline,
  normalizeHeaderToken,
  parseCsvBufferRaw,
} from '../../lib/csv-tokenizer';

const NUMERIC_SCALE = 6;

export class KpiCsvBatchError extends Error {
  readonly status = 400;

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'KpiCsvBatchError';
  }
}

export interface ParsedKpiCsvRow {
  /** 1-based data row number, excluding the header. */
  row: number;
  request: KpiObservationCreateRequest;
}

export interface ParsedKpiCsv {
  accepted: ParsedKpiCsvRow[];
  rejected: KpiCsvRowRejection[];
}

/**
 * Accepts the shapes a spreadsheet actually produces -- thousands separators, a
 * leading currency symbol, a parenthesised negative -- and rejects everything
 * else rather than guessing. More than six decimal places is a rejection, not a
 * silent truncation of someone's money.
 */
function toFixedDecimalCell(raw: string): string | null {
  let text = raw.trim().replace(/[\s,$]/g, '');
  if (text === '') return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  }
  if (text.endsWith('%')) return null;
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;

  const [whole = '0', fraction = ''] = text.split('.');
  if (fraction.length > NUMERIC_SCALE) return null;
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
  return `${negative && /[1-9]/.test(text) ? '-' : ''}${normalizedWhole}.${fraction.padEnd(NUMERIC_SCALE, '0')}`;
}

function toValue(metric: KpiMetric, raw: string): KpiObservationValue | null {
  const kind = KPI_METRIC_VALUE_KIND[metric];
  if (kind === 'money' || kind === 'number') {
    const decimal = toFixedDecimalCell(raw);
    if (decimal === null) return null;
    return kind === 'money'
      ? { valueKind: 'money', amountUsd: decimal }
      : { valueKind: 'number', number: decimal };
  }
  if (kind === 'date') {
    const text = raw.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? { valueKind: 'date', date: text } : null;
  }
  const text = raw.trim();
  return text === '' ? null : { valueKind: 'text', text };
}

/** A date-only submission cell means midnight UTC, not "whenever we imported it". */
function toSubmittedAt(raw: string): string | null {
  const text = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00.000Z`;
  const parsed = new Date(text);
  return text !== '' && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
}

function optional(raw: string | undefined): string | null {
  const text = (raw ?? '').trim();
  return text === '' ? null : text;
}

export function parseKpiObservationCsv(buffer: Buffer): ParsedKpiCsv {
  if (hasEmbeddedQuotedNewline(buffer)) {
    throw new KpiCsvBatchError(
      'EMBEDDED_LINE_BREAK_UNSUPPORTED',
      'A quoted field spans a newline; not supported.'
    );
  }

  const { header, rows } = parseCsvBufferRaw(buffer);
  if (rows.length > KPI_CSV_MAX_ROWS) {
    throw new KpiCsvBatchError(
      'ROW_LIMIT_EXCEEDED',
      `Row count ${rows.length} exceeds the limit of ${KPI_CSV_MAX_ROWS}.`
    );
  }

  const expected = new Set<string>(KPI_CSV_TEMPLATE_HEADER);
  const columnIndex = new Map<string, number>();
  for (const [index, token] of header.entries()) {
    const normalized = normalizeHeaderToken(token);
    if (columnIndex.has(normalized)) {
      throw new KpiCsvBatchError('DUPLICATE_HEADER', `Duplicate column "${normalized}".`);
    }
    columnIndex.set(normalized, index);
  }
  const missing = [...expected].filter((column) => !columnIndex.has(column));
  const extra = [...columnIndex.keys()].filter((column) => !expected.has(column));
  if (missing.length > 0 || extra.length > 0) {
    throw new KpiCsvBatchError(
      'TEMPLATE_HEADER_MISMATCH',
      `The KPI import template header is fixed. Missing [${missing.join(', ')}], unexpected [${extra.join(', ')}].`
    );
  }

  const accepted: ParsedKpiCsvRow[] = [];
  const rejected: KpiCsvRowRejection[] = [];

  for (const [index, cells] of rows.entries()) {
    const rowNumber = index + 1;
    const cell = (column: string): string => cells[columnIndex.get(column) as number] ?? '';

    const companyIdText = cell('portfolio_company_id').trim();
    if (!/^[1-9]\d*$/.test(companyIdText)) {
      rejected.push({
        row: rowNumber,
        code: 'INVALID_PORTFOLIO_COMPANY_ID',
        message: 'portfolio_company_id must be a positive integer.',
      });
      continue;
    }

    const metricText = cell('metric').trim() as KpiMetric;
    if (!(metricText in KPI_METRIC_VALUE_KIND)) {
      rejected.push({
        row: rowNumber,
        code: 'UNKNOWN_METRIC',
        message: `Metric "${metricText}" is not in the fixed v1 metric set.`,
      });
      continue;
    }

    const value = toValue(metricText, cell('value'));
    if (value === null) {
      rejected.push({
        row: rowNumber,
        code: 'INVALID_VALUE',
        message: `Value "${cell('value').trim()}" is not a valid ${KPI_METRIC_VALUE_KIND[metricText]} for metric "${metricText}".`,
      });
      continue;
    }

    const submittedAt = toSubmittedAt(cell('submitted_at'));
    if (submittedAt === null) {
      rejected.push({
        row: rowNumber,
        code: 'INVALID_SUBMITTED_AT',
        message: 'submitted_at must be a YYYY-MM-DD date or an ISO timestamp.',
      });
      continue;
    }

    const candidate = {
      portfolioCompanyId: Number.parseInt(companyIdText, 10),
      metric: metricText,
      periodStart: cell('period_start').trim(),
      periodEnd: cell('period_end').trim(),
      basis: cell('basis').trim(),
      value,
      companyKpiLabel: optional(cell('company_kpi_label')),
      sourceLabel: optional(cell('source_label')),
      comment: optional(cell('comment')),
      submittedAt,
    };

    const parsed = KpiObservationCreateRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      rejected.push({
        row: rowNumber,
        code: 'INVALID_ROW',
        message: parsed.error.issues.map((issue) => issue.message).join(' '),
      });
      continue;
    }

    accepted.push({ row: rowNumber, request: parsed.data });
  }

  return { accepted, rejected };
}
