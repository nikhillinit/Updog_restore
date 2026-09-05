import { describe, expect, it } from 'vitest';

import {
  ACTUALS_LEDGER_MAX_BYTES,
  ACTUALS_PILOT_FORMULA_LIKE_FIRST_CHARACTER_REGEX,
  ACTUALS_PILOT_MONEY_REGEX,
  ACTUALS_VALUATION_MAX_BYTES,
  ActualMetricsETagSchema,
  ActualMetricsV2Schema,
  ActualsCategoryCoverageSchema,
  ActualsDeploymentCategorySchema,
  ActualsDistributionTypeSchema,
  ActualsExpenseCategorySchema,
  ActualsExternalRefSchema,
  ActualsPilotCashFlowPayloadSchema,
  ActualsPilotCentExactMoneySchema,
  ActualsPilotErrorBodySchema,
  ActualsPilotErrorDetailsSchema,
  ActualsPilotMoneySchema,
  ActualsPilotValuationMarkPayloadSchema,
  ActualsPreviewRequestV1Schema,
  ActualsPreviewResponseV1Schema,
  ActualsPreviewRowV1Schema,
  ActualsPreviewTotalsV1Schema,
  ActualsPublishReceiptV1Schema,
  ActualsPublishRequestV1Schema,
  CanonicalLabelSchema,
  ETagSchema,
  FinancialFactsLatestReferenceV1Schema,
  FinancialFactsETagSchema,
  GregorianDateSchema,
  IfMatchSchema,
  isCentExactMoney,
  isFormulaLikeValue,
  isGregorianDate,
  canonicalLabel,
} from '@shared/contracts/lp-reporting/actuals-pilot.contract';
import {
  ACTUALS_LEDGER_TEMPLATE_VERSION,
  ACTUALS_VALUATION_TEMPLATE_VERSION,
} from '@shared/contracts/lp-reporting/actuals-pilot-templates';

const hash = 'a'.repeat(64);
const zeroTotals = {
  settledPaidIn: '0.000000',
  deployed: '0.000000',
  initialDeployed: '0.000000',
  followOnDeployed: '0.000000',
  secondaryDeployed: '0.000000',
  otherDeployed: '0.000000',
  managementFees: '0.000000',
  otherExpenses: '0.000000',
  realizedFundProceeds: '0.000000',
  distributionsToPartners: '0.000000',
  positionFairValue: '0.000000',
  markedCompanyCount: 0,
};
const previewRow = {
  rowNumber: 1,
  sourceExternalRef: 'row-1',
  status: 'valid' as const,
  eventType: 'settled_contribution' as const,
  effectiveDate: '2026-01-31',
  companyLabel: null,
  vehicleLabel: null,
  canonicalAmount: '1.000000',
  rowSourceHash: hash,
  rowContentHash: hash,
  issues: [],
};
const previewBase = {
  contractVersion: 'actuals-preview-response/1.0.0' as const,
  asOfDate: '2026-01-31',
  sanitizedFileName: 'actuals.csv',
  byteCount: 128,
  payloadSha256: hash,
  canonicalRowsHash: hash,
  previewHash: hash,
  rowCounts: { total: 1, valid: 1, invalid: 0, duplicateInFile: 0, alreadyImported: 0 },
  fileTotals: zeroTotals,
  netNewEffectTotals: zeroTotals,
  categoryCoverage: 'not_applicable' as const,
  rows: [previewRow],
  issues: [],
  canPublish: true,
};

describe('actuals pilot contracts', () => {
  it('rejects unknown keys at every contract boundary', () => {
    expect(() =>
      ActualsPreviewRequestV1Schema.parse({
        contractVersion: 'actuals-preview-request/1.0.0',
        templateVersion: ACTUALS_LEDGER_TEMPLATE_VERSION,
        asOfDate: '2026-01-31',
        fileName: 'actuals.csv',
        payload: 'YQ==',
        extra: true,
      })
    ).toThrow();

    expect(() => ActualsPreviewRowV1Schema.parse({ ...previewRow, extra: true })).toThrow();
    expect(() => ActualsPreviewTotalsV1Schema.parse({ ...zeroTotals, extra: true })).toThrow();
    expect(() =>
      ActualsPilotCashFlowPayloadSchema.parse({
        contractVersion: 'actuals-pilot-cash-flow/1.0.0',
        sourceExternalRef: 'row-1',
        rowContentHash: hash,
        templateVersion: ACTUALS_LEDGER_TEMPLATE_VERSION,
        settlementStatus: 'settled',
        deploymentCategory: null,
        expenseCategory: null,
        distributionType: null,
        recallable: null,
        extra: true,
      })
    ).toThrow();
  });

  it('discriminates preview responses by template version', () => {
    expect(
      ActualsPreviewResponseV1Schema.parse({
        ...previewBase,
        templateVersion: ACTUALS_LEDGER_TEMPLATE_VERSION,
      }).templateVersion
    ).toBe(ACTUALS_LEDGER_TEMPLATE_VERSION);

    expect(
      ActualsPreviewResponseV1Schema.parse({
        ...previewBase,
        templateVersion: ACTUALS_VALUATION_TEMPLATE_VERSION,
        rows: [{ ...previewRow, eventType: 'valuation_mark' as const }],
        byteCount: ACTUALS_VALUATION_MAX_BYTES,
      }).templateVersion
    ).toBe(ACTUALS_VALUATION_TEMPLATE_VERSION);

    expect(() =>
      ActualsPreviewResponseV1Schema.parse({
        ...previewBase,
        templateVersion: 'actuals-unknown/1.0.0',
      })
    ).toThrow();
    expect(ACTUALS_LEDGER_MAX_BYTES).toBe(122_880);
  });

  it('accepts publish, receipt, latest-reference, and unavailable metrics shapes', () => {
    const file = {
      templateVersion: ACTUALS_LEDGER_TEMPLATE_VERSION,
      fileName: 'ledger.csv',
      payload: 'YQ==',
      expectedPayloadSha256: hash,
      expectedCanonicalRowsHash: hash,
      expectedPreviewHash: hash,
    };
    const request = ActualsPublishRequestV1Schema.parse({
      contractVersion: 'actuals-pilot-publish/1.0.0',
      asOfDate: '2026-01-31',
      ledger: file,
      valuation: null,
      coverage: {
        ledger: 'inception_to_date',
        priorFactsSnapshotId: null,
        evidenceNote: 'Initial actuals import',
      },
    });
    expect(request.coverage.evidenceNote).toBe('Initial actuals import');

    const basisRef = {
      schemaId: 'financial-facts-basis-ref/1.0.0' as const,
      fundId: 1,
      snapshotId: 2,
      snapshotInputHash: hash,
      sourceFactsInputHash: hash,
      policyVersion: 'financial-facts-policy/1.4.0' as const,
      asOfDate: '2026-01-31',
      knowledgeCutoff: '2026-02-01T00:00:00.000Z',
    };
    expect(
      ActualsPublishReceiptV1Schema.parse({
        contractVersion: 'actuals-pilot-publish-receipt/1.0.0',
        operationHash: hash,
        fundId: 1,
        asOfDate: '2026-01-31',
        coverage: { ledger: 'inception_to_date', priorFactsSnapshotId: null },
        admitted: {
          ledger: {
            sourceArtifactId: 3,
            payloadSha256: hash,
            canonicalRowsHash: hash,
            previewHash: hash,
            approvedRowIds: [4],
            approvedCount: 1,
          },
          valuation: null,
          importBatchId: '00000000-0000-4000-8000-000000000001',
        },
        facts: {
          snapshotId: 2,
          snapshotInputHash: hash,
          policyVersion: 'financial-facts-policy/1.4.0',
          payloadSchemaId: 'financial-facts-payload/5',
          supersedesSnapshotId: null,
          knowledgeCutoff: '2026-02-01T00:00:00.000Z',
          etag: `"financial-facts:2:${hash}"`,
        },
        basisRef,
      }).fundId
    ).toBe(1);

    expect(
      FinancialFactsLatestReferenceV1Schema.parse({
        contractVersion: 'financial-facts-latest-reference/1.0.0',
        head: null,
      }).head
    ).toBeNull();
    expect(
      ActualMetricsV2Schema.parse({
        contractVersion: 'actual-metrics/2.0.0',
        snapshotStatus: 'unavailable',
        fundId: 1,
        asOfDate: null,
        knowledgeCutoff: null,
        financialFactsSnapshotId: null,
        snapshotInputHash: null,
        reasonCodes: ['FACTS_NOT_FOUND'],
      }).snapshotStatus
    ).toBe('unavailable');
  });
});

describe('actuals pilot lexical grammar', () => {
  it('enforces money grammar and cent exactness', () => {
    for (const value of ['0', '1', '1.2', '1.23', '1.230000', '99999999999999.123456']) {
      expect(ACTUALS_PILOT_MONEY_REGEX.test(value)).toBe(true);
      expect(ActualsPilotMoneySchema.safeParse(value).success).toBe(true);
    }
    for (const value of ['00', '01.00', '1e2', '1.2345678', '100000000000000']) {
      expect(ActualsPilotMoneySchema.safeParse(value).success).toBe(false);
    }
    expect(isCentExactMoney('1.230000')).toBe(true);
    expect(ActualsPilotCentExactMoneySchema.safeParse('1.230000').success).toBe(true);
    expect(isCentExactMoney('1.231')).toBe(false);
    expect(ActualsPilotCentExactMoneySchema.safeParse('1.231').success).toBe(false);
  });

  it('validates real Gregorian dates, external refs, and formula-like values', () => {
    for (const value of ['2024-02-29', '2000-02-29', '2100-02-28', '9999-12-31']) {
      expect(isGregorianDate(value)).toBe(true);
      expect(GregorianDateSchema.safeParse(value).success).toBe(true);
    }
    for (const value of ['2023-02-29', '2100-02-29', '2024-04-31', '2024-1-01', '0000-01-01']) {
      expect(isGregorianDate(value)).toBe(false);
    }

    expect(ActualsExternalRefSchema.safeParse('A_01:/source-1').success).toBe(true);
    expect(ActualsExternalRefSchema.safeParse('bad ref').success).toBe(false);
    expect(ActualsExternalRefSchema.safeParse('A'.repeat(129)).success).toBe(false);

    for (const value of [
      '=SUM(A1)',
      '+1',
      '-1',
      '@cmd',
      ' =x',
      '\u0001-x',
      '\uFEFF@cmd',
      '\uFEFF \t+1',
    ]) {
      expect(isFormulaLikeValue(value)).toBe(true);
      expect(ACTUALS_PILOT_FORMULA_LIKE_FIRST_CHARACTER_REGEX.test(value)).toBe(true);
    }
    // Leading space or control alone is not formula-like; only a formula character after them is.
    for (const value of ['safe text', ' text', '\u0001text', 'a=b']) {
      expect(isFormulaLikeValue(value)).toBe(false);
    }
  });

  it('normalizes canonical labels with NFKC and locale-independent casing', () => {
    expect(canonicalLabel('  Ａcme\tHoldings  ')).toBe('acme holdings');
    expect(CanonicalLabelSchema.parse('  Ａcme\tHoldings  ')).toBe('acme holdings');
    expect(CanonicalLabelSchema.safeParse('   ').success).toBe(false);
  });

  it('keeps event-dependent enum values closed', () => {
    expect(ActualsCategoryCoverageSchema.safeParse('complete').success).toBe(true);
    expect(ActualsDeploymentCategorySchema.safeParse('follow_on').success).toBe(true);
    expect(ActualsExpenseCategorySchema.safeParse('management_fee').success).toBe(true);
    expect(ActualsDistributionTypeSchema.safeParse('return_of_capital').success).toBe(true);
    expect(ActualsCategoryCoverageSchema.safeParse('all').success).toBe(false);
    expect(ActualsDeploymentCategorySchema.safeParse('growth').success).toBe(false);
    expect(ActualsExpenseCategorySchema.safeParse('travel').success).toBe(false);
    expect(ActualsDistributionTypeSchema.safeParse('recallable').success).toBe(false);
    expect(
      ActualsPilotValuationMarkPayloadSchema.safeParse({
        contractVersion: 'actuals-pilot-valuation-mark/1.0.0',
        sourceExternalRef: 'mark-1',
        rowContentHash: hash,
        templateVersion: ACTUALS_VALUATION_TEMPLATE_VERSION,
      }).success
    ).toBe(true);
  });
});

describe('actuals pilot precondition grammars', () => {
  it('accepts only strong facts and metrics ETags and the two If-Match forms', () => {
    const factsEtag = `"financial-facts:42:${hash}"`;
    const metricsEtag = `"actual-metrics:42:${hash}:actual-metrics-2.0.0"`;
    expect(FinancialFactsETagSchema.safeParse(factsEtag).success).toBe(true);
    expect(ActualMetricsETagSchema.safeParse(metricsEtag).success).toBe(true);
    expect(ETagSchema.safeParse(factsEtag).success).toBe(true);
    expect(ETagSchema.safeParse(metricsEtag).success).toBe(true);
    expect(IfMatchSchema.safeParse('"financial-facts:none"').success).toBe(true);
    expect(IfMatchSchema.safeParse(factsEtag).success).toBe(true);
    expect(IfMatchSchema.safeParse('*').success).toBe(false);
    expect(IfMatchSchema.safeParse(`W/${factsEtag}`).success).toBe(false);
    expect(ETagSchema.safeParse(`"financial-facts:042:${hash}"`).success).toBe(false);
  });
});

describe('actuals pilot error details', () => {
  it('binds bounded details to supported error codes', () => {
    expect(
      ActualsPilotErrorDetailsSchema.parse({
        code: 'FACTS_HEAD_PRECONDITION_FAILED',
        details: { currentFactsSnapshotId: 7 },
      }).details
    ).toEqual({ currentFactsSnapshotId: 7 });
    expect(
      ActualsPilotErrorDetailsSchema.parse({
        code: 'INVALID_CSV',
        details: { file: 'ledger', column: 'amount', rowNumber: 2 },
      }).details
    ).toEqual({ file: 'ledger', column: 'amount', rowNumber: 2 });
    expect(() =>
      ActualsPilotErrorDetailsSchema.parse({
        code: 'INVALID_CSV',
        details: { file: 'ledger', column: 'raw-value' },
      })
    ).toThrow();
    expect(() =>
      ActualsPilotErrorDetailsSchema.parse({
        code: 'ROW_CAP_EXCEEDED',
        details: { safeCounts: { total: 1, accepted: 1, rejected: 0 }, extra: true },
      })
    ).toThrow();
  });

  it('requires special top-level fields and rejects details for other codes', () => {
    expect(
      ActualsPilotErrorBodySchema.parse({
        error: 'Too many rows',
        code: 'ROW_CAP_EXCEEDED',
        details: { safeCounts: { total: 1001, accepted: 1000, rejected: 1 } },
      }).code
    ).toBe('ROW_CAP_EXCEEDED');
    expect(
      ActualsPilotErrorBodySchema.parse({
        error: 'Too many requests',
        code: 'RATE_LIMITED',
        retryAfter: 60,
      }).retryAfter
    ).toBe(60);
    expect(() =>
      ActualsPilotErrorBodySchema.parse({ error: 'Too many requests', code: 'RATE_LIMITED' })
    ).toThrow();
    expect(() =>
      ActualsPilotErrorBodySchema.parse({
        error: 'Bad query',
        code: 'INVALID_QUERY',
        details: { file: 'ledger', column: 'amount' },
      })
    ).toThrow();
    expect(() =>
      ActualsPilotErrorBodySchema.parse({ error: 'Internal', code: 'INTERNAL_ERROR' })
    ).toThrow();
    expect(
      ActualsPilotErrorBodySchema.parse({
        error: 'Internal',
        code: 'INTERNAL_ERROR',
        requestId: 'req-1',
      }).requestId
    ).toBe('req-1');
  });
});
