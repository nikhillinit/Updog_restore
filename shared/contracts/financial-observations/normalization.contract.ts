import { z } from 'zod';

import {
  FinancialObservationDomainSchema,
  Sha256HexSchema,
} from './financial-observation.contract';
import { MappingRuleV1Schema } from './import-profile.contract';

/**
 * V2 normalization contract (PLAN_61 Wave C, Task 5a).
 *
 * Deterministic normalization of CSV and manual financial inputs into a typed
 * `normalizedPayload` plus a two-key identity (`observationHash`,
 * `candidateFingerprint`). Pure reference layer: no route consumes it yet
 * (Tasks 6 and 9-11 wire against this frozen shape). Additive to the V1
 * `csv | notion` import contract, which is unchanged.
 */

export const IMPORT_V2_CONTRACT_VERSION = 'import-v2' as const;

/** Fingerprint preimage algorithm version. Bump when the economic subset changes. */
export const FINGERPRINT_VERSION = 1 as const;

/** normalizedPayload schema version. Bump when the payload shape changes. */
export const NORMALIZED_PAYLOAD_SCHEMA_VERSION = 1 as const;

/** Maximum rows a single CSV normalization batch will process. */
export const MAX_NORMALIZATION_ROWS = 5000;

/** Maximum length of any free-text field (descriptor / display name). */
export const MAX_TEXT_FIELD_LENGTH = 2000;

export const MEASURE_KEYS_V2 = [
  'initial_investment',
  'follow_on_investment',
  'capital_contribution',
  'ownership_stake',
  'post_money_valuation',
] as const;
export const MeasureKeyV2Schema = z.enum(MEASURE_KEYS_V2);
export type MeasureKeyV2 = z.infer<typeof MeasureKeyV2Schema>;

/**
 * Decimal precision by payload field. Precision is fixed per field here, never
 * inferred from a key-name regex, so future renames cannot silently change the
 * financial precision of a value.
 */
export const PAYLOAD_DECIMAL_POLICY = {
  amount: 6,
  postMoneyValuation: 6,
  fxRate: 12,
  ownershipPct: 12,
} as const;
export type PayloadDecimalField = keyof typeof PAYLOAD_DECIMAL_POLICY;

/**
 * Domain -> measure/value compatibility. Enforced in both directions so a
 * ledger row cannot carry a valuation measure and a valuation cannot carry a
 * ledger amount.
 */
export const DOMAIN_MEASURE_MATRIX = {
  ledger_event: {
    measures: ['initial_investment', 'follow_on_investment', 'capital_contribution'],
    requiredValue: 'amount',
    forbiddenValues: ['postMoneyValuation', 'valuationBasis', 'ownershipPct'],
  },
  valuation: {
    measures: ['post_money_valuation'],
    requiredValue: 'postMoneyValuation',
    forbiddenValues: ['amount', 'ownershipPct'],
  },
  ownership: {
    measures: ['ownership_stake'],
    requiredValue: 'ownershipPct',
    forbiddenValues: ['amount', 'postMoneyValuation', 'valuationBasis'],
  },
} as const;

export const NORMALIZATION_ISSUE_CODES = [
  // Row-level
  'MISSING_TRANSACTION_DATE',
  'MALFORMED_DATE',
  'MALFORMED_NUMBER',
  'PRECISION_EXCEEDED',
  'FORMULA_REJECTED',
  'CURRENCY_REQUIRED',
  'NON_USD_VALUE_UNSUPPORTED',
  'INFERRED_FX_REJECTED',
  'MISSING_ECONOMIC_VALUE',
  'MEASURE_DOMAIN_MISMATCH',
  'VALUE_DOMAIN_MISMATCH',
  'OWNERSHIP_OUT_OF_RANGE',
  'IDENTITY_REQUIRED',
  'TEXT_LENGTH_EXCEEDED',
  // Batch-level
  'ROW_LIMIT_EXCEEDED',
  'PROFILE_SOURCE_MISMATCH',
  'PROFILE_DOMAIN_MISMATCH',
  'PROFILE_DUPLICATE_TARGET',
  'DUPLICATE_HEADER',
  'UNMAPPED_REQUIRED_COLUMN',
  'EMBEDDED_LINE_BREAK_UNSUPPORTED',
] as const;
export const NormalizationIssueCodeSchema = z.enum(NORMALIZATION_ISSUE_CODES);
export type NormalizationIssueCode = z.infer<typeof NormalizationIssueCodeSchema>;

export const NORMALIZATION_OUTCOMES = ['staged', 'rejected'] as const;
export const NormalizationOutcomeSchema = z.enum(NORMALIZATION_OUTCOMES);
export type NormalizationOutcome = z.infer<typeof NormalizationOutcomeSchema>;

export const NormalizationIssueSchema = z
  .object({
    code: NormalizationIssueCodeSchema,
    message: z.string().min(1),
    field: z.string().min(1).optional(),
    row: z.number().int().positive().optional(),
  })
  .strict();
export type NormalizationIssue = z.infer<typeof NormalizationIssueSchema>;

/** Structured company identity. Object-hashed; no delimiter collisions. */
export const CompanyIdentityDescriptorV2Schema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('external'),
      system: z.string().min(1),
      externalId: z.string().min(1),
    })
    .strict(),
  z.object({ kind: z.literal('name'), canonicalName: z.string().min(1) }).strict(),
]);
export type CompanyIdentityDescriptorV2 = z.infer<typeof CompanyIdentityDescriptorV2Schema>;

export const ObservationDescriptorV2Schema = z
  .object({
    memo: z.string().optional(),
    description: z.string().optional(),
    note: z.string().optional(),
    label: z.string().optional(),
    sourceLabel: z.string().optional(),
  })
  .strict();
export type ObservationDescriptorV2 = z.infer<typeof ObservationDescriptorV2Schema>;

/** Typed manual entry. The future direct-write seam synthesizes this shape. */
export const ManualEntryV2Schema = z
  .object({
    domain: FinancialObservationDomainSchema,
    measureKey: MeasureKeyV2Schema,
    companyName: z.string().optional(),
    companyExternalId: z
      .object({ system: z.string().min(1), value: z.string().min(1) })
      .strict()
      .optional(),
    effectiveDate: z.string().optional(),
    currency: z.string().optional(),
    fxRate: z.string().optional(),
    amount: z.string().optional(),
    postMoneyValuation: z.string().optional(),
    valuationBasis: z.string().optional(),
    ownershipPct: z.string().optional(),
    externalRef: z.string().nullable().optional(),
    descriptor: ObservationDescriptorV2Schema.optional(),
    sourceLocator: z.string().optional(),
  })
  .strict();
export type ManualEntryV2 = z.infer<typeof ManualEntryV2Schema>;

export const NormalizationCsvRequestV2Schema = z
  .object({
    contractVersion: z.literal(IMPORT_V2_CONTRACT_VERSION),
    mode: z.literal('csv'),
    fundId: z.number().int().positive(),
    domain: FinancialObservationDomainSchema,
    profile: z.object({ mappings: z.array(MappingRuleV1Schema) }).passthrough(),
    csv: z.string(),
  })
  .strict();

export const NormalizationManualRequestV2Schema = z
  .object({
    contractVersion: z.literal(IMPORT_V2_CONTRACT_VERSION),
    mode: z.literal('manual'),
    fundId: z.number().int().positive(),
    entry: ManualEntryV2Schema,
  })
  .strict();

export const NormalizationRequestV2Schema = z.discriminatedUnion('mode', [
  NormalizationCsvRequestV2Schema,
  NormalizationManualRequestV2Schema,
]);
export type NormalizationRequestV2 = z.infer<typeof NormalizationRequestV2Schema>;

export const NormalizedCandidateV2Schema = z
  .object({
    outcome: NormalizationOutcomeSchema,
    issues: z.array(NormalizationIssueSchema),
    normalizedPayload: z.record(z.string(), z.unknown()).optional(),
    observationHash: Sha256HexSchema.optional(),
    candidateFingerprint: Sha256HexSchema.optional(),
    effectiveDate: z.string().date().optional(),
    sourceLocator: z.string().optional(),
  })
  .strict();
export type NormalizedCandidateV2 = z.infer<typeof NormalizedCandidateV2Schema>;

/** Batch result: a fatal batch-level rejection carries issues and no candidates. */
export const NormalizationResultV2Schema = z
  .object({
    outcome: NormalizationOutcomeSchema,
    issues: z.array(NormalizationIssueSchema),
    candidates: z.array(NormalizedCandidateV2Schema),
  })
  .strict();
export type NormalizationResultV2 = z.infer<typeof NormalizationResultV2Schema>;
