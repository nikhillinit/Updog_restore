/**
 * Financial-observations V2 normalization service (PLAN_61 Wave C, Task 5a).
 *
 * Pure, deterministic normalization of a single financial observation. Both the
 * CSV adapter and the manual-entry adapter converge on `normalizeObservation`,
 * so equivalent CSV and manual inputs produce equal typed `normalizedPayload`
 * and equal `candidateFingerprint` by construction.
 *
 * No database access, no route, no feature flag. No adapter may inject a
 * financial assumption: formulas, malformed numbers/dates, inferred FX,
 * defaulted currency, and out-of-range values are all rejected.
 *
 * @module server/services/financial-observations/normalization-service
 */

import { Decimal } from '@shared/lib/decimal-config';
import { canonicalSha256 } from '@shared/lib/canonical-hash';
import { assertDecimalStringLeaves, toFixedDecimalString } from '@shared/lib/decimal-string';

import type { AllowedMappingTransform } from '@shared/contracts/financial-observations/import-profile.contract';
import type {
  CompanyIdentityDescriptorV2,
  ManualEntryV2,
  NormalizationIssue,
  NormalizationIssueCode,
  NormalizedCandidateV2,
} from '@shared/contracts/financial-observations/normalization.contract';
import {
  DOMAIN_MEASURE_MATRIX,
  FINGERPRINT_VERSION,
  MAX_TEXT_FIELD_LENGTH,
  NORMALIZED_PAYLOAD_SCHEMA_VERSION,
  PAYLOAD_DECIMAL_POLICY,
} from '@shared/contracts/financial-observations/normalization.contract';

// ============================================================================
// Transform applier
// ============================================================================

export type TransformResult =
  { ok: true; value: string } | { ok: false; code: NormalizationIssueCode };

/** Grouping is either full 3-digit groups or no commas at all. */
const GROUPED_DECIMAL_REGEX = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
const PLAIN_DECIMAL_REGEX = /^-?\d+(?:\.\d+)?$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const US_DATE_REGEX = /^(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/\d{4}$/;
/** Formula-injection shapes: leading =, +, @, tab, CR, or a signed formula. */
const FORMULA_PREFIX_REGEX = /^[=+@\t\r]|^-[=+@]/;

function isRealYmd(year: number, month: number, day: number): boolean {
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE_REGEX.test(value)) {
    return false;
  }
  const [y, m, d] = value.split('-').map((part) => Number.parseInt(part, 10));
  return isRealYmd(y!, m!, d!);
}

/**
 * Apply the declared transform chain to a raw CSV cell, in order. A leading
 * formula-injection shape is rejected first, before any transform runs.
 */
export function applyMappingTransforms(
  raw: string,
  transforms: readonly AllowedMappingTransform[]
): TransformResult {
  if (FORMULA_PREFIX_REGEX.test(raw)) {
    return { ok: false, code: 'FORMULA_REJECTED' };
  }

  let value = raw;
  for (const transform of transforms) {
    switch (transform) {
      case 'trim':
        value = value.trim();
        break;
      case 'normalize_whitespace':
        value = value.replace(/\s+/g, ' ').trim();
        break;
      case 'parse_decimal': {
        let candidate = value.trim();
        if (candidate.startsWith('$')) {
          candidate = candidate.slice(1);
        }
        if (!GROUPED_DECIMAL_REGEX.test(candidate)) {
          return { ok: false, code: 'MALFORMED_NUMBER' };
        }
        value = candidate.replace(/,/g, '');
        break;
      }
      case 'parse_date_iso': {
        const candidate = value.trim();
        if (!isRealIsoDate(candidate)) {
          return { ok: false, code: 'MALFORMED_DATE' };
        }
        value = candidate;
        break;
      }
      case 'parse_date_us': {
        const candidate = value.trim();
        const match = US_DATE_REGEX.exec(candidate);
        if (!match) {
          return { ok: false, code: 'MALFORMED_DATE' };
        }
        const month = Number.parseInt(match[1]!, 10);
        const day = Number.parseInt(match[2]!, 10);
        const year = Number.parseInt(candidate.slice(-4), 10);
        if (!isRealYmd(year, month, day)) {
          return { ok: false, code: 'MALFORMED_DATE' };
        }
        value = `${year.toString().padStart(4, '0')}-${month
          .toString()
          .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        break;
      }
      case 'negate': {
        const candidate = value.trim();
        if (!PLAIN_DECIMAL_REGEX.test(candidate)) {
          return { ok: false, code: 'MALFORMED_NUMBER' };
        }
        value = candidate.startsWith('-') ? candidate.slice(1) : `-${candidate}`;
        break;
      }
      default: {
        // Exhaustiveness guard: the allowlist is closed, so this is unreachable.
        transform satisfies never;
        return { ok: false, code: 'MALFORMED_NUMBER' };
      }
    }
  }
  return { ok: true, value };
}

// ============================================================================
// Normalization
// ============================================================================

const USD_FX_RATE = toFixedDecimalString('1', PAYLOAD_DECIMAL_POLICY.fxRate);

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

function canonicalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

type FormatResult = { ok: true; value: string } | { ok: false; code: NormalizationIssueCode };

/** Format a plain decimal string to fixed places; excess non-zero precision is rejected. */
function formatDecimalField(raw: string, places: number): FormatResult {
  let decimal: Decimal;
  try {
    decimal = new Decimal(raw);
  } catch {
    return { ok: false, code: 'MALFORMED_NUMBER' };
  }
  if (!decimal.isFinite()) {
    return { ok: false, code: 'MALFORMED_NUMBER' };
  }
  const fixed = decimal.toFixed(places);
  if (!new Decimal(fixed).equals(decimal)) {
    return { ok: false, code: 'PRECISION_EXCEEDED' };
  }
  return { ok: true, value: fixed };
}

function issue(code: NormalizationIssueCode, message: string, field?: string): NormalizationIssue {
  return field === undefined ? { code, message } : { code, message, field };
}

/**
 * Normalize one typed observation. Returns a preview candidate: `staged` with a
 * payload and both hashes, or `rejected` with issues and no hashes.
 */
export function normalizeObservation(input: ManualEntryV2): NormalizedCandidateV2 {
  const issues: NormalizationIssue[] = [];
  const domainRule = DOMAIN_MEASURE_MATRIX[input.domain];

  // --- Identity -----------------------------------------------------------
  let companyIdentity: CompanyIdentityDescriptorV2 | null = null;
  if (input.companyExternalId) {
    companyIdentity = {
      kind: 'external',
      system: input.companyExternalId.system,
      externalId: input.companyExternalId.value,
    };
  } else if (!isBlank(input.companyName)) {
    companyIdentity = { kind: 'name', canonicalName: canonicalizeName(input.companyName!) };
  } else {
    issues.push(issue('IDENTITY_REQUIRED', 'A company name or external id is required.'));
  }

  // --- Transaction date ---------------------------------------------------
  if (isBlank(input.effectiveDate)) {
    issues.push(
      issue('MISSING_TRANSACTION_DATE', 'A transaction date is required.', 'effectiveDate')
    );
  } else if (!isRealIsoDate(input.effectiveDate!.trim())) {
    issues.push(
      issue(
        'MALFORMED_DATE',
        `effectiveDate "${input.effectiveDate}" is not a real YYYY-MM-DD date.`,
        'effectiveDate'
      )
    );
  }

  // --- Currency -----------------------------------------------------------
  if (isBlank(input.currency)) {
    issues.push(
      issue(
        'CURRENCY_REQUIRED',
        'Currency must be stated explicitly; it is never defaulted.',
        'currency'
      )
    );
  } else if (input.currency!.trim().toUpperCase() !== 'USD') {
    issues.push(
      issue(
        'NON_USD_VALUE_UNSUPPORTED',
        `Currency "${input.currency}" is not supported; only USD.`,
        'currency'
      )
    );
  }

  // --- FX rate ------------------------------------------------------------
  if (!isBlank(input.fxRate)) {
    if (isBlank(input.currency)) {
      issues.push(
        issue(
          'INFERRED_FX_REJECTED',
          'An FX rate without an explicit currency is rejected.',
          'fxRate'
        )
      );
    } else {
      try {
        if (!new Decimal(input.fxRate!).equals(1)) {
          issues.push(
            issue(
              'INFERRED_FX_REJECTED',
              'A non-unity FX rate is rejected; only USD at 1.0 is supported.',
              'fxRate'
            )
          );
        }
      } catch {
        issues.push(
          issue('MALFORMED_NUMBER', `fxRate "${input.fxRate}" is not a decimal.`, 'fxRate')
        );
      }
    }
  }

  // --- Domain / measure / value matrix ------------------------------------
  const measures = domainRule.measures as readonly string[];
  if (!measures.includes(input.measureKey)) {
    issues.push(
      issue(
        'MEASURE_DOMAIN_MISMATCH',
        `measureKey "${input.measureKey}" is not valid for domain "${input.domain}".`,
        'measureKey'
      )
    );
  }
  for (const forbidden of domainRule.forbiddenValues as readonly string[]) {
    if (!isBlank((input as Record<string, unknown>)[forbidden] as string | undefined)) {
      issues.push(
        issue(
          'VALUE_DOMAIN_MISMATCH',
          `Field "${forbidden}" is not allowed for domain "${input.domain}".`,
          forbidden
        )
      );
    }
  }

  // --- Economic value -----------------------------------------------------
  const requiredField = domainRule.requiredValue;
  const rawValue = (input as Record<string, unknown>)[requiredField] as string | undefined;
  let formattedValue: string | null = null;
  if (isBlank(rawValue)) {
    issues.push(
      issue(
        'MISSING_ECONOMIC_VALUE',
        `Field "${requiredField}" is required for domain "${input.domain}".`,
        requiredField
      )
    );
  } else {
    const places = PAYLOAD_DECIMAL_POLICY[requiredField as keyof typeof PAYLOAD_DECIMAL_POLICY];
    const formatted = formatDecimalField(rawValue!.trim(), places);
    if (!formatted.ok) {
      issues.push(
        issue(
          formatted.code,
          `Field "${requiredField}" value "${rawValue}" is invalid.`,
          requiredField
        )
      );
    } else {
      formattedValue = formatted.value;
      if (input.domain === 'ownership') {
        const pct = new Decimal(formatted.value);
        if (pct.lessThan(0) || pct.greaterThan(100)) {
          issues.push(
            issue(
              'OWNERSHIP_OUT_OF_RANGE',
              `ownershipPct "${rawValue}" must be within [0, 100].`,
              'ownershipPct'
            )
          );
        }
      }
    }
  }

  // --- Text length --------------------------------------------------------
  const textFields: Array<[string, string | undefined]> = [
    ['companyName', input.companyName],
    ['descriptor.memo', input.descriptor?.memo],
    ['descriptor.description', input.descriptor?.description],
    ['descriptor.note', input.descriptor?.note],
    ['descriptor.label', input.descriptor?.label],
    ['descriptor.sourceLabel', input.descriptor?.sourceLabel],
  ];
  for (const [field, text] of textFields) {
    if (text !== undefined && text.length > MAX_TEXT_FIELD_LENGTH) {
      issues.push(
        issue(
          'TEXT_LENGTH_EXCEEDED',
          `Field "${field}" exceeds ${MAX_TEXT_FIELD_LENGTH} characters.`,
          field
        )
      );
    }
  }

  if (issues.length > 0 || companyIdentity === null || formattedValue === null) {
    return { outcome: 'rejected', issues };
  }

  // --- Payload assembly (single canonical path) ---------------------------
  const effectiveDate = input.effectiveDate!.trim();
  const externalRef = isBlank(input.externalRef) ? null : input.externalRef!.trim();
  const descriptor = buildDescriptor(input.descriptor);

  const valuationBasis =
    input.domain === 'valuation' && !isBlank(input.valuationBasis)
      ? input.valuationBasis!.trim()
      : undefined;

  const economic: Record<string, unknown> = {};
  economic[requiredField] = formattedValue;
  if (valuationBasis !== undefined) {
    economic['valuationBasis'] = valuationBasis;
  }

  const normalizedPayload: Record<string, unknown> = {
    schemaVersion: NORMALIZED_PAYLOAD_SCHEMA_VERSION,
    domain: input.domain,
    measureKey: input.measureKey,
    companyIdentity,
    effectiveDate,
    currency: 'USD',
    fxRate: USD_FX_RATE,
    ...economic,
    externalRef,
    ...(descriptor !== undefined && { descriptor }),
  };

  // Decimal invariant: assert only the numeric projection (P2 — never assert
  // decimal-string shape over free text such as company names or memos).
  assertDecimalStringLeaves(numericProjection(normalizedPayload, requiredField));

  const fingerprintPreimage: Record<string, unknown> = {
    fingerprintVersion: FINGERPRINT_VERSION,
    domain: input.domain,
    measureKey: input.measureKey,
    companyIdentity,
    effectiveDate,
    currency: 'USD',
    fxRate: USD_FX_RATE,
    ...economic,
    externalRef,
  };

  const observationHash = canonicalSha256(normalizedPayload);
  const candidateFingerprint = canonicalSha256(fingerprintPreimage);

  return {
    outcome: 'staged',
    issues: [],
    normalizedPayload,
    observationHash,
    candidateFingerprint,
    effectiveDate,
    ...(input.sourceLocator !== undefined && { sourceLocator: input.sourceLocator }),
  };
}

function buildDescriptor(
  descriptor: ManualEntryV2['descriptor']
): Record<string, string> | undefined {
  if (!descriptor) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const key of ['memo', 'description', 'note', 'label', 'sourceLabel'] as const) {
    const value = descriptor[key];
    if (!isBlank(value)) {
      out[key] = value!.trim();
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function numericProjection(
  payload: Record<string, unknown>,
  requiredField: string
): Record<string, unknown> {
  const projection: Record<string, unknown> = { fxRate: payload['fxRate'] };
  projection[requiredField] = payload[requiredField];
  return projection;
}
