/**
 * CSV adapter (PLAN_61 Wave C, Task 5a).
 *
 * Turns a CSV buffer plus a mapping profile into per-row normalized
 * observations, using the shared CSV tokenizer (defect D10) and the shared
 * normalization service. Batch-level structural problems (profile/header
 * mismatch, embedded newline, row overflow) reject the whole batch; per-row
 * problems mark that row's candidate `rejected`.
 *
 * @module server/services/financial-observations/csv-adapter
 */

import {
  hasEmbeddedQuotedNewline,
  normalizeHeaderToken,
  parseCsvBufferRaw,
} from '../../lib/csv-tokenizer';

import type { FinancialObservationDomain } from '@shared/contracts/financial-observations/financial-observation.contract';
import type {
  ImportMappingProfileV1,
  MappingRuleV1,
} from '@shared/contracts/financial-observations/import-profile.contract';
import type {
  ManualEntryV2,
  MeasureKeyV2,
  NormalizationIssue,
  NormalizedCandidateV2,
  NormalizationResultV2,
} from '@shared/contracts/financial-observations/normalization.contract';
import { MAX_NORMALIZATION_ROWS } from '@shared/contracts/financial-observations/normalization.contract';

import { applyMappingTransforms, normalizeObservation } from './normalization-service';

export interface NormalizeCsvArgs {
  buffer: Buffer;
  profile: ImportMappingProfileV1;
  /** Target domain for this batch; must match the profile's domain. */
  domain: FinancialObservationDomain;
  /** Reserved for future cross-fund detection; not persisted here. */
  fundId: number;
}

function batchReject(code: NormalizationIssue['code'], message: string): NormalizationResultV2 {
  return { outcome: 'rejected', issues: [{ code, message }], candidates: [] };
}

/** Assign a transformed cell to its ManualEntryV2 target field. */
function assignTargetField(entry: MutableEntry, targetField: string, value: string): void {
  switch (targetField) {
    case 'measure_key':
      entry.measureKey = value as MeasureKeyV2;
      break;
    case 'effective_date':
      entry.effectiveDate = value;
      break;
    case 'currency':
      entry.currency = value;
      break;
    case 'fx_rate':
      entry.fxRate = value;
      break;
    case 'amount':
      entry.amount = value;
      break;
    case 'post_money_valuation':
      entry.postMoneyValuation = value;
      break;
    case 'valuation_basis':
      entry.valuationBasis = value;
      break;
    case 'ownership_pct':
      entry.ownershipPct = value;
      break;
    case 'external_ref':
      entry.externalRef = value;
      break;
    case 'company_name':
      entry.companyName = value;
      break;
    case 'company_external_system':
      entry.externalSystem = value;
      break;
    case 'company_external_value':
      entry.externalValue = value;
      break;
    case 'memo':
    case 'description':
    case 'note':
    case 'label':
    case 'source_label': {
      const key = targetField === 'source_label' ? 'sourceLabel' : targetField;
      entry.descriptor = { ...entry.descriptor, [key]: value };
      break;
    }
    default:
      // Unknown target fields are ignored (forward-compatible profiles).
      break;
  }
}

interface MutableEntry {
  measureKey?: MeasureKeyV2;
  companyName?: string;
  externalSystem?: string;
  externalValue?: string;
  effectiveDate?: string;
  currency?: string;
  fxRate?: string;
  amount?: string;
  postMoneyValuation?: string;
  valuationBasis?: string;
  ownershipPct?: string;
  externalRef?: string;
  descriptor?: Record<string, string>;
}

function toManualEntry(
  entry: MutableEntry,
  domain: FinancialObservationDomain,
  row: number
): ManualEntryV2 {
  const manual: ManualEntryV2 = {
    domain,
    measureKey: (entry.measureKey ?? 'initial_investment') as MeasureKeyV2,
    sourceLocator: `csv:row:${row}`,
  };
  if (entry.externalSystem !== undefined && entry.externalValue !== undefined) {
    manual.companyExternalId = { system: entry.externalSystem, value: entry.externalValue };
  }
  if (entry.companyName !== undefined) manual.companyName = entry.companyName;
  if (entry.effectiveDate !== undefined) manual.effectiveDate = entry.effectiveDate;
  if (entry.currency !== undefined) manual.currency = entry.currency;
  if (entry.fxRate !== undefined) manual.fxRate = entry.fxRate;
  if (entry.amount !== undefined) manual.amount = entry.amount;
  if (entry.postMoneyValuation !== undefined) manual.postMoneyValuation = entry.postMoneyValuation;
  if (entry.valuationBasis !== undefined) manual.valuationBasis = entry.valuationBasis;
  if (entry.ownershipPct !== undefined) manual.ownershipPct = entry.ownershipPct;
  if (entry.externalRef !== undefined) manual.externalRef = entry.externalRef;
  if (entry.descriptor !== undefined) manual.descriptor = entry.descriptor;
  return manual;
}

export function normalizeCsvObservations(args: NormalizeCsvArgs): NormalizationResultV2 {
  const { buffer, profile, domain } = args;

  // --- Batch-level structural gates ---------------------------------------
  if (profile.sourceType !== 'csv') {
    return batchReject(
      'PROFILE_SOURCE_MISMATCH',
      `Profile sourceType "${profile.sourceType}" is not "csv".`
    );
  }
  if (profile.domain !== domain) {
    return batchReject(
      'PROFILE_DOMAIN_MISMATCH',
      `Profile domain "${profile.domain}" does not match batch domain "${domain}".`
    );
  }

  const seenTargets = new Set<string>();
  for (const rule of profile.mappings) {
    if (seenTargets.has(rule.targetField)) {
      return batchReject(
        'PROFILE_DUPLICATE_TARGET',
        `Duplicate targetField "${rule.targetField}" in mapping profile.`
      );
    }
    seenTargets.add(rule.targetField);
  }

  if (hasEmbeddedQuotedNewline(buffer)) {
    return batchReject(
      'EMBEDDED_LINE_BREAK_UNSUPPORTED',
      'A quoted field spans a newline; not supported.'
    );
  }

  const { header, rows } = parseCsvBufferRaw(buffer);

  if (rows.length > MAX_NORMALIZATION_ROWS) {
    return batchReject(
      'ROW_LIMIT_EXCEEDED',
      `Row count ${rows.length} exceeds the limit of ${MAX_NORMALIZATION_ROWS}.`
    );
  }

  const dupHeader = firstDuplicate(header);
  if (dupHeader !== null) {
    return batchReject('DUPLICATE_HEADER', `Duplicate normalized header "${dupHeader}".`);
  }

  // --- Column resolution --------------------------------------------------
  const columnIndex = new Map<string, number>();
  for (const rule of profile.mappings) {
    const token = normalizeHeaderToken(rule.sourceColumn);
    const idx = header.indexOf(token);
    if (idx < 0) {
      return batchReject(
        'UNMAPPED_REQUIRED_COLUMN',
        `Mapped column "${rule.sourceColumn}" (${token}) is absent from the header.`
      );
    }
    columnIndex.set(rule.targetField, idx);
  }

  // --- Per-row normalization ----------------------------------------------
  const candidates: NormalizedCandidateV2[] = [];
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r]!;
    const rowNumber = r + 1;
    const rowIssues: NormalizationIssue[] = [];
    const entry: MutableEntry = {};

    for (const rule of profile.mappings) {
      const idx = columnIndex.get(rule.targetField)!;
      const raw = cells[idx] ?? '';
      const result = applyMappingTransforms(raw, rule.transforms as MappingRuleV1['transforms']);
      if (!result.ok) {
        rowIssues.push({
          code: result.code,
          message: `Column "${rule.sourceColumn}" row ${rowNumber}: ${result.code}.`,
          field: rule.targetField,
          row: rowNumber,
        });
      } else {
        assignTargetField(entry, rule.targetField, result.value);
      }
    }

    if (rowIssues.length > 0) {
      candidates.push({ outcome: 'rejected', issues: rowIssues });
      continue;
    }

    const candidate = normalizeObservation(toManualEntry(entry, domain, rowNumber));
    candidates.push(withRow(candidate, rowNumber));
  }

  return { outcome: 'staged', issues: [], candidates };
}

function withRow(candidate: NormalizedCandidateV2, row: number): NormalizedCandidateV2 {
  if (candidate.outcome === 'staged') {
    return candidate;
  }
  return { ...candidate, issues: candidate.issues.map((i) => ({ ...i, row })) };
}

function firstDuplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
  }
  return null;
}
