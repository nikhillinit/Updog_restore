/**
 * Fixed-template actuals pilot contracts.
 *
 * The CSV parser owns structural parsing and row classification. This module
 * owns the strict wire and persisted-payload shapes used by that parser and
 * by the publication/readback boundary.
 */
import { z } from 'zod';

import {
  ACTUALS_LEDGER_TEMPLATE_VERSION,
  ACTUALS_VALUATION_TEMPLATE_VERSION,
} from './actuals-pilot-templates';
import {
  ActualsAvailabilityReasonV1Schema,
  AdmissionReceiptCoreV1Schema,
  FinancialFactsBasisRefSchema,
  GovernedMoneyV1Schema,
  GovernedRatioV1Schema,
} from '../financial-facts-snapshot-v1.contract';
import { MoneyDecimalStringSchema } from '../../lib/decimal-string';

const INT32_MAX = 2_147_483_647;

export const ACTUALS_LEDGER_MAX_BYTES = 122_880 as const;
export const ACTUALS_VALUATION_MAX_BYTES = 40_960 as const;
export const ACTUALS_COMBINED_MAX_BYTES = 163_840 as const;
export const ACTUALS_MAX_ROWS = 1_000 as const;
export const ACTUALS_PREVIEW_MAX_ISSUES = 2_000 as const;

export const ACTUALS_PILOT_MONEY_PATTERN = '^(?:0|[1-9][0-9]{0,13})(?:\\.[0-9]{1,6})?$' as const;
export const ACTUALS_PILOT_MONEY_REGEX = new RegExp(ACTUALS_PILOT_MONEY_PATTERN);

export const ACTUALS_PILOT_EXTERNAL_REF_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$' as const;
export const ACTUALS_PILOT_EXTERNAL_REF_REGEX = new RegExp(ACTUALS_PILOT_EXTERNAL_REF_PATTERN);

export const ACTUALS_PILOT_GREGORIAN_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const ACTUALS_PILOT_FORMULA_LIKE_FIRST_CHARACTER_REGEX = /^\uFEFF?[\s\p{Cc}]*[=+\-@]/u;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isGregorianDate(value: string): boolean {
  if (!ACTUALS_PILOT_GREGORIAN_DATE_REGEX.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return (
    year >= 1 &&
    year <= 9_999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

export const GregorianDateSchema = z
  .string()
  .refine(isGregorianDate, 'Expected a real Gregorian YYYY-MM-DD date.');

export function isCentExactMoney(value: string): boolean {
  if (!ACTUALS_PILOT_MONEY_REGEX.test(value)) return false;
  const fraction = value.split('.')[1];
  return fraction === undefined || fraction.length <= 2 || /^0*$/.test(fraction.slice(2));
}

export const ActualsPilotMoneySchema = z.string().regex(ACTUALS_PILOT_MONEY_REGEX);
export const ActualsPilotCentExactMoneySchema = ActualsPilotMoneySchema.refine(
  isCentExactMoney,
  'USD amount must be exactly representable in cents.'
);

const NonnegativeMoneyDecimalStringSchema = MoneyDecimalStringSchema.refine(
  (value) => !value.startsWith('-'),
  'Expected a non-negative six-decimal money string.'
);

export const ActualsCurrencySchema = z.literal('USD');

export function isFormulaLikeValue(value: string): boolean {
  return ACTUALS_PILOT_FORMULA_LIKE_FIRST_CHARACTER_REGEX.test(value);
}

export const FormulaLikeValueSchema = z
  .string()
  .refine((value) => !isFormulaLikeValue(value), 'Formula-like values are not accepted.');

export function canonicalLabel(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

export const CanonicalLabelSchema = z
  .string()
  .transform(canonicalLabel)
  .pipe(
    z
      .string()
      .min(1)
      .refine((value) => !isFormulaLikeValue(value), 'Formula-like labels are not accepted.')
  );

export function isCanonicalBase64(value: string): boolean {
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

export const CanonicalBase64Schema = z
  .string()
  .min(1)
  .refine(isCanonicalBase64, 'Expected canonical base64 without whitespace.');

export const ActualsTemplateVersionSchema = z.enum([
  ACTUALS_LEDGER_TEMPLATE_VERSION,
  ACTUALS_VALUATION_TEMPLATE_VERSION,
]);
export type ActualsTemplateVersion = z.infer<typeof ActualsTemplateVersionSchema>;

export const ActualsLedgerEventTypeSchema = z.enum([
  'settled_contribution',
  'lp_distribution',
  'management_fee',
  'fund_expense',
  'portfolio_investment',
  'realized_proceeds',
]);
export const ActualsPreviewEventTypeSchema = z.enum([
  ...ActualsLedgerEventTypeSchema.options,
  'valuation_mark',
]);

export const ActualsDeploymentCategorySchema = z.enum([
  'initial',
  'follow_on',
  'secondary',
  'other',
]);
export const ActualsCsvDeploymentCategorySchema = z.union([
  z.literal(''),
  ActualsDeploymentCategorySchema,
]);

export const ActualsExpenseCategorySchema = z.enum([
  'management_fee',
  'legal',
  'audit',
  'admin',
  'other',
]);
export const ActualsCsvExpenseCategorySchema = z.union([
  z.literal(''),
  ActualsExpenseCategorySchema,
]);

export const ActualsDistributionTypeSchema = z.enum(['return_of_capital', 'gain', 'income']);
export const ActualsCsvDistributionTypeSchema = z.union([
  z.literal(''),
  ActualsDistributionTypeSchema,
]);
export const ActualsCsvRecallableSchema = z.enum(['', 'true', 'false']);

export const ActualsValuationMethodSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => !isFormulaLikeValue(value), 'Formula-like values are not accepted.');

export const ActualsExternalRefSchema = z.string().regex(ACTUALS_PILOT_EXTERNAL_REF_REGEX);

export const ActualsPreviewIssueCodeV1Schema = z.enum([
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
  'VALUATION_ROSTER_EMPTY',
  'FUND_LEDGER_NOT_PILOT_OWNED',
  'COMPANY_NOT_FOUND',
  'COMPANY_NAME_AMBIGUOUS',
  'VEHICLE_NOT_FOUND',
  'UNSUPPORTED_VEHICLE_SCOPE',
  'ALREADY_IMPORTED',
  'EXTERNAL_REF_REUSE_CONFLICT',
  'EXISTING_IMPORT_PROVENANCE_CONFLICT',
  'DATE_AFTER_CUTOFF',
]);
export type ActualsPreviewIssueCodeV1 = z.infer<typeof ActualsPreviewIssueCodeV1Schema>;

export const ActualsPreviewSeveritySchema = z.enum(['error', 'warning']);
export const ActualsPreviewStatusSchema = z.enum([
  'valid',
  'duplicate_in_file',
  'already_imported',
  'invalid',
]);
export const ActualsCategoryCoverageSchema = z.enum(['complete', 'partial', 'not_applicable']);

export const ActualsPreviewIssueV1Schema = z
  .object({
    code: ActualsPreviewIssueCodeV1Schema,
    rowNumber: z.number().int().nonnegative().max(ACTUALS_MAX_ROWS),
    column: z.string().min(1).max(64).nullable(),
    severity: ActualsPreviewSeveritySchema,
    message: z.string().min(1).max(500),
  })
  .strict();
export type ActualsPreviewIssueV1 = z.infer<typeof ActualsPreviewIssueV1Schema>;

export const ActualsPreviewTotalsV1Schema = z
  .object({
    settledPaidIn: NonnegativeMoneyDecimalStringSchema,
    deployed: NonnegativeMoneyDecimalStringSchema,
    initialDeployed: NonnegativeMoneyDecimalStringSchema,
    followOnDeployed: NonnegativeMoneyDecimalStringSchema,
    secondaryDeployed: NonnegativeMoneyDecimalStringSchema,
    otherDeployed: NonnegativeMoneyDecimalStringSchema,
    managementFees: NonnegativeMoneyDecimalStringSchema,
    otherExpenses: NonnegativeMoneyDecimalStringSchema,
    realizedFundProceeds: NonnegativeMoneyDecimalStringSchema,
    distributionsToPartners: NonnegativeMoneyDecimalStringSchema,
    positionFairValue: NonnegativeMoneyDecimalStringSchema,
    markedCompanyCount: z.number().int().nonnegative().max(ACTUALS_MAX_ROWS),
  })
  .strict();
export type ActualsPreviewTotalsV1 = z.infer<typeof ActualsPreviewTotalsV1Schema>;

export const ActualsPreviewRowV1Schema = z
  .object({
    rowNumber: z.number().int().positive().max(ACTUALS_MAX_ROWS),
    sourceExternalRef: ActualsExternalRefSchema.nullable(),
    status: ActualsPreviewStatusSchema,
    eventType: ActualsPreviewEventTypeSchema.nullable(),
    effectiveDate: GregorianDateSchema.nullable(),
    companyLabel: z.string().min(1).max(256).nullable(),
    vehicleLabel: z.string().min(1).max(256).nullable(),
    canonicalAmount: NonnegativeMoneyDecimalStringSchema.nullable(),
    rowSourceHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    rowContentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    issues: z.array(ActualsPreviewIssueV1Schema).max(100),
  })
  .strict();
export type ActualsPreviewRowV1 = z.infer<typeof ActualsPreviewRowV1Schema>;

const ActualsPreviewResponseShape = {
  contractVersion: z.literal('actuals-preview-response/1.0.0'),
  asOfDate: GregorianDateSchema,
  sanitizedFileName: z.string().min(1).max(255),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  canonicalRowsHash: z.string().regex(/^[a-f0-9]{64}$/),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  rowCounts: z
    .object({
      total: z.number().int().nonnegative().max(ACTUALS_MAX_ROWS),
      valid: z.number().int().nonnegative().max(ACTUALS_MAX_ROWS),
      invalid: z.number().int().nonnegative().max(ACTUALS_MAX_ROWS),
      duplicateInFile: z.number().int().nonnegative().max(ACTUALS_MAX_ROWS),
      alreadyImported: z.number().int().nonnegative().max(ACTUALS_MAX_ROWS),
    })
    .strict(),
  fileTotals: ActualsPreviewTotalsV1Schema,
  netNewEffectTotals: ActualsPreviewTotalsV1Schema,
  categoryCoverage: ActualsCategoryCoverageSchema,
  issues: z.array(ActualsPreviewIssueV1Schema).max(ACTUALS_PREVIEW_MAX_ISSUES),
  canPublish: z.boolean(),
};

const ActualsPreviewLedgerRowV1Schema = ActualsPreviewRowV1Schema.superRefine((row, ctx) => {
  if (row.eventType === 'valuation_mark') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['eventType'],
      message: 'Ledger previews cannot contain valuation_mark rows.',
    });
  }
});
const ActualsPreviewValuationRowV1Schema = ActualsPreviewRowV1Schema.superRefine((row, ctx) => {
  if (row.eventType !== null && row.eventType !== 'valuation_mark') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['eventType'],
      message: 'Valuation previews can only contain valuation_mark rows.',
    });
  }
});

export const ActualsPreviewLedgerResponseV1Schema = z
  .object({
    ...ActualsPreviewResponseShape,
    templateVersion: z.literal(ACTUALS_LEDGER_TEMPLATE_VERSION),
    byteCount: z.number().int().nonnegative().max(ACTUALS_LEDGER_MAX_BYTES),
    rows: z.array(ActualsPreviewLedgerRowV1Schema).max(ACTUALS_MAX_ROWS),
  })
  .strict();

export const ActualsPreviewValuationResponseV1Schema = z
  .object({
    ...ActualsPreviewResponseShape,
    templateVersion: z.literal(ACTUALS_VALUATION_TEMPLATE_VERSION),
    byteCount: z.number().int().nonnegative().max(ACTUALS_VALUATION_MAX_BYTES),
    rows: z.array(ActualsPreviewValuationRowV1Schema).max(ACTUALS_MAX_ROWS),
  })
  .strict();

export const ActualsPreviewResponseV1Schema = z.discriminatedUnion('templateVersion', [
  ActualsPreviewLedgerResponseV1Schema,
  ActualsPreviewValuationResponseV1Schema,
]);
export type ActualsPreviewResponseV1 = z.infer<typeof ActualsPreviewResponseV1Schema>;

export const ActualsPreviewRequestV1Schema = z
  .object({
    contractVersion: z.literal('actuals-preview-request/1.0.0'),
    templateVersion: ActualsTemplateVersionSchema,
    asOfDate: GregorianDateSchema,
    fileName: z.string().min(1).max(255),
    payload: CanonicalBase64Schema,
  })
  .strict();
export type ActualsPreviewRequestV1 = z.infer<typeof ActualsPreviewRequestV1Schema>;

export const ActualsPublishFileV1Schema = z
  .object({
    templateVersion: ActualsTemplateVersionSchema,
    fileName: z.string().min(1).max(255),
    payload: CanonicalBase64Schema,
    expectedPayloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
    expectedCanonicalRowsHash: z.string().regex(/^[a-f0-9]{64}$/),
    expectedPreviewHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type ActualsPublishFileV1 = z.infer<typeof ActualsPublishFileV1Schema>;

const ActualsPublishCoverageSchema = z
  .object({
    ledger: z.enum(['inception_to_date', 'incremental_since_prior_head']),
    priorFactsSnapshotId: z.number().int().positive().max(INT32_MAX).nullable(),
    evidenceNote: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine((value) => !isFormulaLikeValue(value), 'Formula-like values are not accepted.'),
  })
  .strict();

export const ActualsPublishRequestV1Schema = z
  .object({
    contractVersion: z.literal('actuals-pilot-publish/1.0.0'),
    asOfDate: GregorianDateSchema,
    ledger: ActualsPublishFileV1Schema,
    valuation: ActualsPublishFileV1Schema.nullable(),
    coverage: ActualsPublishCoverageSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.ledger.templateVersion !== ACTUALS_LEDGER_TEMPLATE_VERSION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ledger', 'templateVersion'],
        message: 'ledger must use actuals-ledger/1.0.0.',
      });
    }
    if (
      value.valuation !== null &&
      value.valuation.templateVersion !== ACTUALS_VALUATION_TEMPLATE_VERSION
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['valuation', 'templateVersion'],
        message: 'valuation must use actuals-valuation/1.0.0.',
      });
    }
  });
export type ActualsPublishRequestV1 = z.infer<typeof ActualsPublishRequestV1Schema>;

export const FinancialFactsETagSchema = z
  .string()
  .regex(/^"financial-facts:[1-9][0-9]*:[a-f0-9]{64}"$/);
export const ActualMetricsETagSchema = z
  .string()
  .regex(/^"actual-metrics:[1-9][0-9]*:[a-f0-9]{64}:actual-metrics-2\.0\.0"$/);
export const ETagSchema = z.union([FinancialFactsETagSchema, ActualMetricsETagSchema]);

export const IfMatchSchema = z
  .string()
  .regex(/^"(?:financial-facts:(?:none|[1-9][0-9]*:[a-f0-9]{64}))"$/);

const ActualsReceiptFactsSchema = AdmissionReceiptCoreV1Schema.shape.facts
  .extend({
    snapshotId: z.number().int().positive().max(INT32_MAX),
    snapshotInputHash: z.string().regex(/^[a-f0-9]{64}$/),
    etag: FinancialFactsETagSchema,
  })
  .strict();

export const ActualsPublishReceiptV1Schema = z
  .object({
    contractVersion: z.literal('actuals-pilot-publish-receipt/1.0.0'),
    operationHash: z.string().regex(/^[a-f0-9]{64}$/),
    fundId: z.number().int().positive().max(INT32_MAX),
    asOfDate: GregorianDateSchema,
    coverage: z
      .object({
        ledger: z.enum(['inception_to_date', 'incremental_since_prior_head']),
        priorFactsSnapshotId: z.number().int().positive().max(INT32_MAX).nullable(),
      })
      .strict(),
    admitted: AdmissionReceiptCoreV1Schema.shape.admitted,
    facts: ActualsReceiptFactsSchema,
    basisRef: FinancialFactsBasisRefSchema,
  })
  .strict();
export type ActualsPublishReceiptV1 = z.infer<typeof ActualsPublishReceiptV1Schema>;

const FinancialFactsConsumerEvaluationSchema = z
  .object({
    consumer: z.string().min(1).max(64),
    status: z.enum(['accepted', 'blocked']),
    reasons: z.array(z.string().min(1).max(128)).max(32),
  })
  .strict();

export const FinancialFactsLatestReferenceV1Schema = z
  .object({
    contractVersion: z.literal('financial-facts-latest-reference/1.0.0'),
    head: z
      .object({
        snapshotId: z.number().int().positive().max(INT32_MAX),
        asOfDate: GregorianDateSchema,
        knowledgeCutoff: z.string().datetime(),
        policyVersion: z.string().min(1).max(64),
        payloadSchemaId: z.string().min(1).max(64),
        snapshotInputHash: z.string().regex(/^[a-f0-9]{64}$/),
        supersedesSnapshotId: z.number().int().positive().max(INT32_MAX).nullable(),
        basisRef: FinancialFactsBasisRefSchema.nullable(),
        consumerEvaluations: z.array(FinancialFactsConsumerEvaluationSchema).max(32),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type FinancialFactsLatestReferenceV1 = z.infer<typeof FinancialFactsLatestReferenceV1Schema>;

const ActualMetricsCompanySchema = z
  .object({
    companyId: z.number().int().positive().max(INT32_MAX),
    companyLabel: z.string().min(1).max(256),
    positionFairValue: GovernedMoneyV1Schema,
  })
  .strict();

const ActualMetricsResolvedSchema = z
  .object({
    contractVersion: z.literal('actual-metrics/2.0.0'),
    snapshotStatus: z.literal('resolved'),
    fundId: z.number().int().positive().max(INT32_MAX),
    asOfDate: GregorianDateSchema,
    knowledgeCutoff: z.string().datetime(),
    financialFactsSnapshotId: z.number().int().positive().max(INT32_MAX),
    snapshotInputHash: z.string().regex(/^[a-f0-9]{64}$/),
    capitalScope: z.literal('aggregate_lp_and_gp'),
    performancePerspective: z.literal('fund_net_to_partners'),
    deploymentPerspective: z.literal('fund_gross'),
    currency: ActualsCurrencySchema,
    capital: z
      .object({
        committed: GovernedMoneyV1Schema,
        calledIssued: GovernedMoneyV1Schema,
        paidIn: GovernedMoneyV1Schema,
        deployed: GovernedMoneyV1Schema,
        initialDeployed: GovernedMoneyV1Schema,
        followOnDeployed: GovernedMoneyV1Schema,
        secondaryDeployed: GovernedMoneyV1Schema,
        otherDeployed: GovernedMoneyV1Schema,
        recallableDistributions: GovernedMoneyV1Schema,
        availableRecallCapacity: GovernedMoneyV1Schema,
        outstandingCalls: GovernedMoneyV1Schema,
        remainingCallable: GovernedMoneyV1Schema,
        unfunded: GovernedMoneyV1Schema,
      })
      .strict(),
    expenses: z
      .object({
        managementFeesPaid: GovernedMoneyV1Schema,
        otherExpensesPaid: GovernedMoneyV1Schema,
      })
      .strict(),
    value: z
      .object({
        portfolioFmv: GovernedMoneyV1Schema,
        nav: GovernedMoneyV1Schema,
        realizedFundProceeds: GovernedMoneyV1Schema,
        distributionsToPartners: GovernedMoneyV1Schema,
      })
      .strict(),
    valuation: z
      .object({
        valuationDate: GregorianDateSchema.nullable(),
        rosterCount: z.number().int().nonnegative().max(ACTUALS_MAX_ROWS),
        markedCount: z.number().int().nonnegative().max(ACTUALS_MAX_ROWS),
        companies: z.array(ActualMetricsCompanySchema).max(ACTUALS_MAX_ROWS),
      })
      .strict(),
    performance: z
      .object({
        dpi: GovernedRatioV1Schema,
        rvpi: GovernedRatioV1Schema,
        tvpi: GovernedRatioV1Schema,
      })
      .strict(),
    actionability: z
      .object({
        scope: z.literal('actuals_reporting'),
        status: z.enum(['actionable', 'blocked']),
        reasonCodes: z.array(ActualsAvailabilityReasonV1Schema).max(32),
      })
      .strict(),
  })
  .strict();

const ActualMetricsUnavailableSchema = z
  .object({
    contractVersion: z.literal('actual-metrics/2.0.0'),
    snapshotStatus: z.literal('unavailable'),
    fundId: z.number().int().positive().max(INT32_MAX),
    asOfDate: z.null(),
    knowledgeCutoff: z.null(),
    financialFactsSnapshotId: z.null(),
    snapshotInputHash: z.null(),
    reasonCodes: z.tuple([z.literal('FACTS_NOT_FOUND')]),
  })
  .strict();

export const ActualMetricsV2Schema = z.discriminatedUnion('snapshotStatus', [
  ActualMetricsResolvedSchema,
  ActualMetricsUnavailableSchema,
]);
export type ActualMetricsV2 = z.infer<typeof ActualMetricsV2Schema>;

export const ActualsPilotErrorCodeSchema = z.enum([
  'INVALID_BODY',
  'INVALID_CSV',
  'INVALID_IF_MATCH',
  'INVALID_IDEMPOTENCY_KEY',
  'INVALID_QUERY',
  'INSUFFICIENT_ROLE',
  'RESOURCE_NOT_FOUND',
  'IDEMPOTENCY_KEY_REUSED',
  'EXTERNAL_REF_REUSE_CONFLICT',
  'EXISTING_IMPORT_PROVENANCE_CONFLICT',
  'VALUATION_MARK_ALREADY_EXISTS',
  'FACTS_HEAD_AMBIGUOUS',
  'FACTS_LINEAGE_INVALID',
  'PILOT_FACTS_WRITER_ONLY',
  'FUND_LEDGER_NOT_PILOT_OWNED',
  'FACTS_HEAD_PRECONDITION_FAILED',
  'PAYLOAD_TOO_LARGE',
  'ROW_CAP_EXCEEDED',
  'SUBCENT_USD_UNSUPPORTED',
  'UNSUPPORTED_VEHICLE_SCOPE',
  'INCOMPLETE_COVERAGE',
  'HISTORICAL_AS_OF_NOT_HEAD_ELIGIBLE',
  'UNSUPPORTED_FACTS_POLICY',
  'NEGATIVE_UNCALLED_CAPITAL',
  'SOURCE_FACT_CONTRADICTION',
  'VALUATION_AS_OF_MISMATCH',
  'PRECONDITION_REQUIRED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'MUTATION_OUTCOME_UNKNOWN',
  'PUBLISH_RETRY_EXHAUSTED',
  'TRANSACTION_UNSUPPORTED',
]);
export type ActualsPilotErrorCode = z.infer<typeof ActualsPilotErrorCodeSchema>;

export const ActualsPilotErrorDetailColumnSchema = z.enum([
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
  'mark_date',
  'position_fair_value',
  'mark_source',
  'confidence_level',
  'valuation_method',
  'cost_basis',
  'asOfDate',
  'templateVersion',
  'fileName',
  'payload',
  'ledger',
  'valuation',
  'coverage',
  'priorFactsSnapshotId',
  'evidenceNote',
]);

const ActualsPilotRowErrorDetailsSchema = z
  .object({
    file: z.enum(['ledger', 'valuation']),
    column: ActualsPilotErrorDetailColumnSchema,
    rowNumber: z.number().int().nonnegative().max(ACTUALS_MAX_ROWS).optional(),
  })
  .strict();
export const ActualsPilotFactsHeadErrorDetailsSchema = z
  .object({
    currentFactsSnapshotId: z.number().int().positive().max(INT32_MAX),
  })
  .strict();
export const ActualsPilotRowCapErrorDetailsSchema = z
  .object({
    safeCounts: z
      .object({
        total: z.number().int().nonnegative(),
        accepted: z.number().int().nonnegative(),
        rejected: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

const actualsPilotRowErrorCodes = [
  'INVALID_BODY',
  'INVALID_CSV',
  'SUBCENT_USD_UNSUPPORTED',
  'UNSUPPORTED_VEHICLE_SCOPE',
  'EXTERNAL_REF_REUSE_CONFLICT',
  'EXISTING_IMPORT_PROVENANCE_CONFLICT',
  'VALUATION_MARK_ALREADY_EXISTS',
] as const;

export const ActualsPilotErrorDetailsSchema = z.union([
  z
    .object({
      code: z.literal('FACTS_HEAD_PRECONDITION_FAILED'),
      details: ActualsPilotFactsHeadErrorDetailsSchema,
    })
    .strict(),
  z
    .object({
      code: z.literal('ROW_CAP_EXCEEDED'),
      details: ActualsPilotRowCapErrorDetailsSchema,
    })
    .strict(),
  ...actualsPilotRowErrorCodes.map((code) =>
    z
      .object({
        code: z.literal(code),
        details: ActualsPilotRowErrorDetailsSchema.optional(),
      })
      .strict()
  ),
]);
export type ActualsPilotErrorDetails = z.infer<typeof ActualsPilotErrorDetailsSchema>;

const ActualsPilotErrorIssueSchema = z
  .object({
    path: z.array(z.union([z.string(), z.number().int().nonnegative()])).max(32),
    message: z.string().min(1).max(500),
  })
  .strict();
const actualsPilotErrorBaseShape = {
  error: z.string().min(1).max(500),
  requestId: z.string().min(1).max(128).optional(),
  retryAfter: z.number().int().nonnegative().optional(),
  issues: z.array(ActualsPilotErrorIssueSchema).max(1_000).optional(),
};

const ActualsPilotNoDetailsErrorCodeSchema = z.enum([
  'INVALID_IF_MATCH',
  'INVALID_IDEMPOTENCY_KEY',
  'INVALID_QUERY',
  'INSUFFICIENT_ROLE',
  'RESOURCE_NOT_FOUND',
  'IDEMPOTENCY_KEY_REUSED',
  'FACTS_HEAD_AMBIGUOUS',
  'FACTS_LINEAGE_INVALID',
  'PILOT_FACTS_WRITER_ONLY',
  'FUND_LEDGER_NOT_PILOT_OWNED',
  'PAYLOAD_TOO_LARGE',
  'INCOMPLETE_COVERAGE',
  'HISTORICAL_AS_OF_NOT_HEAD_ELIGIBLE',
  'UNSUPPORTED_FACTS_POLICY',
  'NEGATIVE_UNCALLED_CAPITAL',
  'SOURCE_FACT_CONTRADICTION',
  'VALUATION_AS_OF_MISMATCH',
  'PRECONDITION_REQUIRED',
  'MUTATION_OUTCOME_UNKNOWN',
  'PUBLISH_RETRY_EXHAUSTED',
  'TRANSACTION_UNSUPPORTED',
]);

const ActualsPilotErrorBodyRowSchemas = actualsPilotRowErrorCodes.map((code) =>
  z
    .object({
      ...actualsPilotErrorBaseShape,
      code: z.literal(code),
      details: ActualsPilotRowErrorDetailsSchema.optional(),
    })
    .strict()
);

export const ActualsPilotErrorBodySchema = z.union([
  z
    .object({
      ...actualsPilotErrorBaseShape,
      code: z.literal('FACTS_HEAD_PRECONDITION_FAILED'),
      details: ActualsPilotFactsHeadErrorDetailsSchema,
    })
    .strict(),
  z
    .object({
      ...actualsPilotErrorBaseShape,
      code: z.literal('ROW_CAP_EXCEEDED'),
      details: ActualsPilotRowCapErrorDetailsSchema,
    })
    .strict(),
  z
    .object({
      ...actualsPilotErrorBaseShape,
      code: z.literal('RATE_LIMITED'),
      retryAfter: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...actualsPilotErrorBaseShape,
      code: z.literal('INTERNAL_ERROR'),
      requestId: z.string().min(1).max(128),
    })
    .strict(),
  ...ActualsPilotErrorBodyRowSchemas,
  z
    .object({
      ...actualsPilotErrorBaseShape,
      code: ActualsPilotNoDetailsErrorCodeSchema,
    })
    .strict(),
]);
export type ActualsPilotErrorBody = z.infer<typeof ActualsPilotErrorBodySchema>;

export const ActualsPilotCashFlowPayloadSchema = z
  .object({
    contractVersion: z.literal('actuals-pilot-cash-flow/1.0.0'),
    sourceExternalRef: ActualsExternalRefSchema,
    rowContentHash: z.string().regex(/^[a-f0-9]{64}$/),
    templateVersion: z.literal(ACTUALS_LEDGER_TEMPLATE_VERSION),
    settlementStatus: z.literal('settled').nullable(),
    deploymentCategory: ActualsDeploymentCategorySchema.nullable(),
    expenseCategory: ActualsExpenseCategorySchema.nullable(),
    distributionType: ActualsDistributionTypeSchema.nullable(),
    recallable: z.boolean().nullable(),
  })
  .strict();
export type ActualsPilotCashFlowPayload = z.infer<typeof ActualsPilotCashFlowPayloadSchema>;

export const ActualsPilotValuationMarkPayloadSchema = z
  .object({
    contractVersion: z.literal('actuals-pilot-valuation-mark/1.0.0'),
    sourceExternalRef: ActualsExternalRefSchema,
    rowContentHash: z.string().regex(/^[a-f0-9]{64}$/),
    templateVersion: z.literal(ACTUALS_VALUATION_TEMPLATE_VERSION),
  })
  .strict();
export type ActualsPilotValuationMarkPayload = z.infer<
  typeof ActualsPilotValuationMarkPayloadSchema
>;
