import type { z } from 'zod';

import {
  AdmissionReceiptCoreV1Schema,
  FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
  FinancialFactsPayloadV5Schema,
  VolatileStrippedFundCompanyActualsFactsResponseSchema,
  type AdmissionReceiptCoreV1,
  type FinancialFactsPayloadV1,
  type FinancialFactsPayloadV5,
  type GovernedMoneyV1,
} from '../../../shared/contracts/financial-facts-snapshot-v1.contract';
import type { ActualsCalculatorSuccessV1 } from '../../../shared/lib/financial-facts/actuals-calculator';
import { buildCashFlowSeries, buildMarksSeries } from '../financial-facts-snapshot-service';

export type FinancialFactsPayloadV5CashFlowRow = Parameters<typeof buildCashFlowSeries>[0][number];
export type FinancialFactsPayloadV5MarksRow = Parameters<typeof buildMarksSeries>[0][number];
type CompanyActuals = z.infer<typeof VolatileStrippedFundCompanyActualsFactsResponseSchema>;

export interface BuildFinancialFactsPayloadV5Input {
  readonly cashRows: readonly FinancialFactsPayloadV5CashFlowRow[];
  readonly markRows: readonly FinancialFactsPayloadV5MarksRow[];
  readonly vehicleRoster: readonly FinancialFactsPayloadV1['vehicleRoster'][number][];
  readonly calculatorResult: ActualsCalculatorSuccessV1;
  readonly companyActuals: CompanyActuals;
  readonly asOfDate: string;
  readonly knowledgeCutoff: string;
  readonly admissionReceiptCore: AdmissionReceiptCoreV1;
}

const PERIOD_NAV_WARNING_MESSAGE =
  'Period NAV is the sum of admitted position fair values; fund cash, other assets, and liabilities are not evidenced.';

function quarterEnd(asOfDate: string): string {
  const [yearText, monthText] = asOfDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const quarterEndMonth = Math.ceil(month / 3) * 3;
  return new Date(Date.UTC(year, quarterEndMonth, 0)).toISOString().slice(0, 10);
}

// Payload-5 totals come from the calculator only; the 1.3 series totals net
// recallable rows out of contributions, which contradicts S10.
function requireAvailable(name: string, money: GovernedMoneyV1): string {
  if (money.value === null) {
    throw new Error(`Payload 5 requires an available ${name}; got ${money.availability}.`);
  }
  return money.value;
}

export function buildFinancialFactsPayloadV5(
  input: BuildFinancialFactsPayloadV5Input
): FinancialFactsPayloadV5 {
  const companyActuals = VolatileStrippedFundCompanyActualsFactsResponseSchema.parse(
    input.companyActuals
  );
  const admissionReceiptCore = AdmissionReceiptCoreV1Schema.parse(input.admissionReceiptCore);
  const calculator = input.calculatorResult;
  const cashFlowRows = input.cashRows.filter((row) => row.eventType !== 'realized_proceeds');
  const cashFlow = buildCashFlowSeries(
    cashFlowRows,
    input.asOfDate,
    FINANCIAL_FACTS_POLICY_VERSION_1_4_0
  );
  const marks = buildMarksSeries(input.markRows, input.asOfDate);

  const sortedVehicleRoster = [...input.vehicleRoster].sort(
    (left, right) => left.vehicleId - right.vehicleId
  );
  const sortedValuationRoster = [...calculator.valuationActuals.roster].sort(
    (left, right) => left.vehicleId - right.vehicleId || left.companyId - right.companyId
  );
  const sortedValuationMarks = [...calculator.valuationActuals.marks].sort(
    (left, right) => left.companyId - right.companyId || left.markId - right.markId
  );
  const sortedMissingCompanyIds = [...new Set(calculator.valuationActuals.missingCompanyIds)].sort(
    (left, right) => left - right
  );

  const valuationActuals = {
    ...calculator.valuationActuals,
    roster: sortedValuationRoster,
    marks: sortedValuationMarks,
    missingCompanyIds: sortedMissingCompanyIds,
  };
  const periodNav =
    valuationActuals.coverage === 'complete' &&
    calculator.capitalActuals.portfolioFmv.value !== null
      ? [
          {
            periodEnd: quarterEnd(input.asOfDate),
            nav: calculator.capitalActuals.portfolioFmv.value,
            warnings: [
              {
                code: 'PERIOD_NAV_IS_POSITION_VALUE' as const,
                severity: 'warning' as const,
                message: PERIOD_NAV_WARNING_MESSAGE,
                source: `actuals-pilot:valuation:${admissionReceiptCore.admitted.valuation?.payloadSha256 ?? ''}`,
              },
            ],
          },
        ]
      : [];

  return FinancialFactsPayloadV5Schema.parse({
    companyActuals,
    sourceObservationIds: [],
    workingValueSelectionIds: [],
    participationTermRefs: [],
    cashFlowSeries: {
      series: cashFlow.series.series,
      totals: {
        contributions: requireAvailable('paidInCapital', calculator.capitalActuals.paidInCapital),
        distributions: requireAvailable(
          'distributionsToPartners',
          calculator.capitalActuals.distributionsToPartners
        ),
        recallableDistributions: requireAvailable(
          'recallableDistributions',
          calculator.capitalActuals.recallableDistributions
        ),
      },
      warnings: [],
    },
    marksSeries: {
      marks: marks.series.marks,
      periodNav,
      warnings: [],
    },
    vehicleRoster: sortedVehicleRoster,
    positionRefs: [],
    positionComponentRefs: [],
    ownershipRefs: [],
    valuationRefs: [],
    observationRefs: [],
    openingAccountingState: null,
    capitalActuals: calculator.capitalActuals,
    valuationActuals,
    admissionReceiptCore,
  });
}
