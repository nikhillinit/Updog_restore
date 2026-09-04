import { describe, expect, it } from 'vitest';

import {
  ActualsPilotCashFlowPayloadSchema,
  type ActualsPilotCashFlowPayload,
} from '../../../../shared/contracts/lp-reporting/actuals-pilot.contract';
import {
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
  FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
  FinancialFactsPayloadV5Schema,
  VolatileStrippedFundCompanyActualsFactsResponseSchema,
  type AdmissionReceiptCoreV1,
  type FinancialFactsPayloadV5,
} from '../../../../shared/contracts/financial-facts-snapshot-v1.contract';
import {
  calculateActualsV1,
  type ActualsCalculatorInputV1,
} from '../../../../shared/lib/financial-facts/actuals-calculator';
import { canonicalSha256 } from '../../../../shared/lib/canonical-hash';
import {
  buildCashFlowSeries,
  buildMarksSeries,
} from '../../../../server/services/financial-facts-snapshot-service';
import {
  buildFinancialFactsPayloadV5,
  type FinancialFactsPayloadV5CashFlowRow,
  type FinancialFactsPayloadV5MarksRow,
} from '../../../../server/services/financial-facts/payload5-builder';

const AS_OF_DATE = '2026-06-30';
const KNOWLEDGE_CUTOFF = '2026-07-01T00:00:00.000Z';
const LEDGER_HASH = '1'.repeat(64);
const VALUATION_HASH = '2'.repeat(64);
const VEHICLE_ID = 11;
const COMPANY_ID = 101;

const vehicleRoster = [
  {
    vehicleId: VEHICLE_ID,
    vehicleType: 'main_fund' as const,
    vehicleSlug: 'main-fund',
    name: 'Main Fund',
    currency: 'USD',
  },
];

function cashPayload(overrides: Partial<ActualsPilotCashFlowPayload> = {}) {
  return ActualsPilotCashFlowPayloadSchema.parse({
    contractVersion: 'actuals-pilot-cash-flow/1.0.0',
    sourceExternalRef: 'fixture-row',
    rowContentHash: 'a'.repeat(64),
    templateVersion: 'actuals-ledger/1.0.0',
    settlementStatus: null,
    deploymentCategory: null,
    expenseCategory: null,
    distributionType: null,
    recallable: null,
    ...overrides,
  });
}

type FixtureCashRow = FinancialFactsPayloadV5CashFlowRow & {
  readonly payload: ActualsPilotCashFlowPayload;
};

function cashRow(
  id: number,
  eventType: string,
  amount: string,
  overrides: Partial<FixtureCashRow> = {},
  payloadOverrides: Partial<ActualsPilotCashFlowPayload> = {}
): FixtureCashRow {
  return {
    id,
    fundId: 10,
    vehicleId: eventType === 'portfolio_investment' ? VEHICLE_ID : null,
    companyId: eventType === 'portfolio_investment' ? COMPANY_ID : null,
    eventType,
    amount,
    currency: 'USD',
    eventDate: new Date(`2026-0${Math.min(id, 9)}-01T00:00:00.000Z`),
    perspective: eventType === 'portfolio_investment' ? 'vehicle' : 'fund_gross',
    status: 'approved',
    supersedesEventId: null,
    reversalOfEventId: null,
    importedFrom: 'actuals_pilot_v1',
    sourceHash: `${id}`.padStart(64, '0'),
    payload: cashPayload({ sourceExternalRef: `fixture-${id}`, ...payloadOverrides }),
    ...overrides,
  };
}

function markRow(id: number, fairValue: string): FinancialFactsPayloadV5MarksRow {
  return {
    id,
    fundId: 10,
    vehicleId: VEHICLE_ID,
    companyId: COMPANY_ID,
    markDate: AS_OF_DATE,
    asOfDate: AS_OF_DATE,
    fairValue,
    currency: 'USD',
    status: 'approved',
    confidenceLevel: 'high',
    markPurpose: 'planning_company_fmv',
    importedFrom: 'actuals_pilot_v1',
    sourceHash: `${id}`.padStart(64, '0'),
  };
}

function companyActuals() {
  return VolatileStrippedFundCompanyActualsFactsResponseSchema.parse({
    fundId: 10,
    asOfDate: AS_OF_DATE,
    facts: [
      {
        fundId: 10,
        companyId: COMPANY_ID,
        companyName: 'Fixture Company',
        investmentIds: [1001],
        activeRoundIds: [],
        approvedPlanningFmvMarkId: null,
        planningFmvStatus: 'none',
        initialInvestmentAmount: '100.000000',
        followOnInvestmentAmount: '0.000000',
        amountOnlyNonEquityAmount: '0.000000',
        latestRoundDate: null,
        latestRoundValuation: null,
        latestPlanningFmvDate: null,
        latestPlanningFmvValue: null,
        currency: 'USD',
        currencyStatus: 'base_currency',
        supersedeLineage: [],
        warnings: [],
        provenance: {
          trustState: 'LIVE',
          core: {
            sourceKind: 'computed',
            actionability: 'actionable',
            sourceEngine: 'payload5-builder-test',
            engineVersion: '1.0.0',
            inputHash: 'b'.repeat(64),
            assumptionsHash: 'c'.repeat(64),
            isFinanciallyActionable: true,
            warnings: [],
          },
          structuredWarnings: [],
        },
        inputHash: 'd'.repeat(64),
      },
    ],
    inputHash: 'e'.repeat(64),
  });
}

function admissionReceiptCore(hasValuation: boolean): AdmissionReceiptCoreV1 {
  return {
    contractVersion: 'actuals-pilot-publish-receipt/1.0.0',
    operationHash: 'f'.repeat(64),
    fundId: 10,
    asOfDate: AS_OF_DATE,
    coverage: {
      ledger: 'inception_to_date',
      priorFactsSnapshotId: null,
      evidenceNote: 'Builder fixture.',
    },
    admitted: {
      ledger: {
        sourceArtifactId: 1,
        payloadSha256: LEDGER_HASH,
        canonicalRowsHash: '3'.repeat(64),
        previewHash: '4'.repeat(64),
        approvedRowIds: [1, 2, 3, 4, 5],
        approvedCount: 5,
      },
      valuation: hasValuation
        ? {
            sourceArtifactId: 2,
            payloadSha256: VALUATION_HASH,
            canonicalRowsHash: '5'.repeat(64),
            previewHash: '6'.repeat(64),
            approvedMarkIds: [9],
            approvedCount: 1,
          }
        : null,
      importBatchId: '11111111-2222-3333-4444-555555555555',
    },
    facts: {
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
      payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
      supersedesSnapshotId: null,
      knowledgeCutoff: KNOWLEDGE_CUTOFF,
    },
    actor: { userId: 7 },
  };
}

function calculator(
  rows: readonly FixtureCashRow[],
  marks: readonly FinancialFactsPayloadV5MarksRow[] = [],
  valuationPayloadSha256: string | null = null,
  ledgerCoverage: ActualsCalculatorInputV1['ledgerCoverage'] = 'complete'
) {
  const input: ActualsCalculatorInputV1 = {
    ledgerRows: rows.map((row) => {
      const payload = row.payload;
      return {
        ...payload,
        canonicalAmount: row.amount,
        eventType:
          row.eventType === 'lp_capital_call'
            ? 'settled_contribution'
            : row.eventType === 'fund_expense' && payload.expenseCategory === 'management_fee'
              ? 'management_fee'
              : row.eventType === 'fund_expense'
                ? 'fund_expense'
                : (row.eventType as
                    'lp_distribution' | 'portfolio_investment' | 'realized_proceeds'),
        effectiveDate: row.eventDate.toISOString().slice(0, 10),
        resolvedCompanyId: row.companyId,
        resolvedVehicleId: row.vehicleId,
      };
    }),
    vehicleCommitment: {
      vehicleId: VEHICLE_ID,
      amount: '1000000.000000',
      sourceHash: 'commitment-source',
    },
    roster: [{ vehicleId: VEHICLE_ID, companyId: COMPANY_ID }],
    valuationMarks: marks.map((row) => ({
      contractVersion: 'actuals-pilot-valuation-mark/1.0.0',
      sourceExternalRef: `mark-${row.id}`,
      rowContentHash: '7'.repeat(64),
      templateVersion: 'actuals-valuation/1.0.0',
      markId: row.id,
      markDate: row.markDate,
      positionFairValue: row.fairValue,
      markSource: 'board_update',
      confidenceLevel: 'high',
      resolvedCompanyId: row.companyId,
      resolvedVehicleId: row.vehicleId!,
      externalRefHash: '7'.repeat(64),
    })),
    ledgerCoverage,
    ledgerPayloadSha256: LEDGER_HASH,
    valuationPayloadSha256,
    predecessorSnapshotInputHash: null,
  };
  const result = calculateActualsV1(input);
  if (!result.ok) throw new Error(result.message);
  return result;
}

function build(
  rows: readonly FixtureCashRow[],
  marks: readonly FinancialFactsPayloadV5MarksRow[] = [],
  valuationPayloadSha256: string | null = null,
  ledgerCoverage: ActualsCalculatorInputV1['ledgerCoverage'] = 'complete'
): FinancialFactsPayloadV5 {
  return buildFinancialFactsPayloadV5({
    cashRows: rows,
    markRows: marks,
    vehicleRoster,
    calculatorResult: calculator(rows, marks, valuationPayloadSha256, ledgerCoverage),
    companyActuals: companyActuals(),
    asOfDate: AS_OF_DATE,
    knowledgeCutoff: KNOWLEDGE_CUTOFF,
    admissionReceiptCore: admissionReceiptCore(valuationPayloadSha256 !== null),
  });
}

const finV001Rows = [
  cashRow(1, 'lp_capital_call', '250000.000000', {}, { settlementStatus: 'settled' }),
  cashRow(2, 'portfolio_investment', '100000.000000', {}, { deploymentCategory: 'initial' }),
  cashRow(3, 'fund_expense', '10000.000000', {}, { expenseCategory: 'management_fee' }),
  cashRow(4, 'fund_expense', '5000.000000', {}, { expenseCategory: 'legal' }),
  cashRow(
    5,
    'lp_distribution',
    '50000.000000',
    {},
    { distributionType: 'gain', recallable: false }
  ),
];

const finV002Rows = [
  cashRow(1, 'lp_capital_call', '100000.000000', {}, { settlementStatus: 'settled' }),
  cashRow(2, 'realized_proceeds', '80000.000000', { companyId: COMPANY_ID, vehicleId: VEHICLE_ID }),
  cashRow(
    3,
    'lp_distribution',
    '30000.000000',
    {},
    { distributionType: 'gain', recallable: false }
  ),
];

describe('buildFinancialFactsPayloadV5', () => {
  it('builds and pins FIN-V001 payload bytes', () => {
    const payload = build(finV001Rows);

    expect(FinancialFactsPayloadV5Schema.parse(payload)).toEqual(payload);
    expect(payload.capitalActuals.paidInCapital.value).toBe('250000.000000');
    expect(payload.capitalActuals.realizedFundProceeds.value).toBe('0.000000');
    expect(payload.cashFlowSeries.totals).toEqual({
      contributions: '250000.000000',
      distributions: '50000.000000',
      recallableDistributions: '0.000000',
    });
    expect(
      payload.cashFlowSeries.series.some((series) => series.eventType === 'realized_proceeds')
    ).toBe(false);
    expect(canonicalSha256(payload)).toBe(
      '0f0ab3306e08edaa0d5cee012349834878bf9c5d0919f626bb04d8a5e65829b5'
    );
  });

  it('builds and pins FIN-V002 without serializing realized proceeds', () => {
    const payload = build(finV002Rows);

    expect(payload.capitalActuals.realizedFundProceeds.value).toBe('80000.000000');
    expect(payload.capitalActuals.distributionsToPartners.value).toBe('30000.000000');
    expect(payload.cashFlowSeries.totals.distributions).toBe('30000.000000');
    expect(
      payload.cashFlowSeries.series.some((series) => series.eventType === 'realized_proceeds')
    ).toBe(false);
    expect(canonicalSha256(payload)).toBe(
      'ae3e61d2830d6ce37823ded4f4f46cada06d889884b9c8fb5ba5e7b47938db7a'
    );
  });

  it('is stable for shuffled input and keeps 1.3 series order', () => {
    const marks = [markRow(9, '85000.000000')];
    const rows = [...finV001Rows].reverse();
    const payload = build(rows, marks, VALUATION_HASH);
    const expectedCash = buildCashFlowSeries(
      rows.filter((row) => row.eventType !== 'realized_proceeds'),
      AS_OF_DATE,
      FINANCIAL_FACTS_POLICY_VERSION_1_4_0
    ).series.series;
    const expectedMarks = buildMarksSeries(marks, AS_OF_DATE).series.marks;

    expect(payload.cashFlowSeries.series).toEqual(expectedCash);
    expect(payload.marksSeries.marks).toEqual(expectedMarks);
    expect(payload.marksSeries.periodNav).toEqual([
      {
        periodEnd: '2026-06-30',
        nav: '85000.000000',
        warnings: [
          {
            code: 'PERIOD_NAV_IS_POSITION_VALUE',
            severity: 'warning',
            message:
              'Period NAV is the sum of admitted position fair values; fund cash, other assets, and liabilities are not evidenced.',
            source: `actuals-pilot:valuation:${VALUATION_HASH}`,
          },
        ],
      },
    ]);
    expect(payload.marksSeries.warnings).toEqual([]);
    expect(build([...finV001Rows].reverse(), marks, VALUATION_HASH)).toEqual(payload);
  });

  it('uses recallable pilot distribution payloads without reducing paid-in', () => {
    const rows = [
      cashRow(1, 'lp_capital_call', '100000.000000', {}, { settlementStatus: 'settled' }),
      cashRow(2, 'lp_distribution', '25000.000000', {}, { recallable: true }),
    ];
    const payload = build(rows);

    expect(payload.cashFlowSeries.totals).toEqual({
      contributions: '100000.000000',
      distributions: '25000.000000',
      recallableDistributions: '25000.000000',
    });
    expect(payload.capitalActuals.paidInCapital.value).toBe('100000.000000');
  });

  it('refuses to substitute 1.3 series totals when the calculator withholds a value', () => {
    expect(() => build(finV001Rows, [], null, 'partial')).toThrow(
      'Payload 5 requires an available paidInCapital; got unavailable.'
    );
  });
});
