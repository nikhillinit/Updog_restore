import type { FundAccountingStateObservationV1_1 } from '@shared/contracts/internal-economics/fund-accounting-state-observation-v1.1.contract';
import {
  computeDecimalWaterfallAllocationV1,
  DECIMAL_WATERFALL_CORE_ENGINE_VERSION,
  DECIMAL_WATERFALL_CORE_METHODOLOGY_VERSION,
  type CoreAllocationRowV1,
} from '@shared/lib/internal-economics/decimal-waterfall-core-v1';
import { Decimal } from '@shared/lib/decimal-config';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import correctedFixture from '../../../docs/waterfall-corrected-capital-account.truth-cases.json';
import coreFixture from '../../../docs/waterfall-decimal-core.truth-cases.json';

const moneySchema = z.string().regex(/^(0|[1-9]\d*)\.\d{6}$/);
const carryRatioSchema = z.string().regex(/^(0|1)\.\d{12}$/);

const rowSchema = z
  .object({
    quarter: z.number().int().positive(),
    openingUnreturnedCapital: moneySchema,
    capitalCalls: moneySchema,
    grossProceeds: moneySchema,
    returnOfCapital: moneySchema,
    lpResidual: moneySchema,
    gpCarry: moneySchema,
    endingUnreturnedCapital: moneySchema,
  })
  .strict();

const totalsSchema = z
  .object({
    openingUnreturnedCapital: moneySchema,
    paidIn: moneySchema,
    grossProceeds: moneySchema,
    returnOfCapital: moneySchema,
    lpResidual: moneySchema,
    gpCarry: moneySchema,
    endingUnreturnedCapital: moneySchema,
    lpDistributions: moneySchema,
  })
  .strict();

const coreCaseSchema = z
  .object({
    id: z.enum(['CORRECTED-LEGACY-04', 'CORRECTED-LEGACY-05']),
    sourceLegacyCaseId: z.enum(['LEGACY-04', 'LEGACY-05']),
    description: z.string().min(1),
    canonicalCarryRatio: carryRatioSchema,
    input: z
      .object({
        config: z.object({ carryPct: z.number().min(0).max(1) }).strict(),
        contributions: z.array(
          z.object({ quarter: z.number().int().positive(), amount: z.number().positive() }).strict()
        ),
        exits: z.array(
          z
            .object({
              quarter: z.number().int().positive(),
              grossProceeds: z.number().nonnegative(),
            })
            .strict()
        ),
      })
      .strict(),
    expected: z.object({ rows: z.array(rowSchema).min(1), totals: totalsSchema }).strict(),
  })
  .strict();

const fixtureSchema = z
  .object({
    header: z.literal('DECIMAL WATERFALL CORE V1 PRODUCT TRUTH'),
    classification: z.literal('decimal_waterfall_core_product_truth'),
    productTruth: z.literal(true),
    oracle: z.literal('decimal-waterfall-core-v1/1.0.0'),
    methodologyVersion: z.literal('correct-unreturned-capital/1.0.0'),
    sourceOracle: z.literal('waterfall-corrected-capital-account.truth-cases.json'),
    decimal: z
      .object({
        precision: z.literal(60),
        boundaryPrecision: z.literal(28),
        rounding: z.literal('ROUND_HALF_UP'),
        moneyScale: z.literal(6),
        carryRatioScale: z.literal(12),
      })
      .strict(),
    cases: z.array(coreCaseSchema).length(2),
  })
  .strict();

type CoreTruthCase = z.infer<typeof coreCaseSchema>;
type CoreTruthRow = z.infer<typeof rowSchema>;

function openingState(): FundAccountingStateObservationV1_1 {
  return {
    contractVersion: 'fund-accounting-state-observation/1.1.0',
    cutoverInstant: '2026-06-30T23:59:59.000Z',
    currency: 'USD',
    cashBalanceUsd: '0.000000',
    cumulativeLpPaidInUsd: '0.000000',
    cumulativeGpPaidInUsd: '0.000000',
    gpUnreturnedContributedCapitalUsd: '0.000000',
    lpDistributionsReturnOfCapitalUsd: '0.000000',
    lpDistributionsProfitUsd: '0.000000',
    actualLpDistributionsCumulativeUsd: '0.000000',
    gpInvestmentDistributionsPaidUsd: '0.000000',
    gpCarryPaidUsd: '0.000000',
    accruedPreferredReturnUsd: '0.000000',
    accruedPreferredReturnThroughInstant: '2026-06-30T23:59:59.000Z',
    recallableDistributionsCumulativeUsd: '0.000000',
    recallableDistributionsOutstandingUsd: '0.000000',
    recycledProceedsCumulativeUsd: '0.000000',
    realizedProceedsCumulativeUsd: '0.000000',
    methodologyVersion: 'fund-accounting-methodology/1.0.0',
    lpUnreturnedContributedCapitalUsd: '0.000000',
  };
}

function sum(values: readonly Decimal[]): Decimal {
  return values.reduce((total, value) => total.plus(value), new Decimal(0));
}

function sumRows(
  rows: readonly CoreAllocationRowV1[],
  select: (row: CoreAllocationRowV1) => Decimal
): Decimal {
  return sum(rows.map(select));
}

function replayThroughCore(testCase: CoreTruthCase): {
  rows: CoreTruthRow[];
  totals: z.infer<typeof totalsSchema>;
} {
  const result = computeDecimalWaterfallAllocationV1({
    carryRatio: testCase.canonicalCarryRatio,
    hurdle: { basis: 'none' },
    openingState: openingState(),
    contributions: testCase.input.contributions.map((contribution, index) => ({
      sourceId: `call-${index + 1}`,
      periodIndex: contribution.quarter,
      amountUsd: new Decimal(contribution.amount).toFixed(6),
    })),
    distributions: testCase.input.exits.map((exit, index) => ({
      sourceId: `exit-${index + 1}`,
      periodIndex: exit.quarter,
      grossUsd: new Decimal(exit.grossProceeds).toFixed(6),
      isTerminal: false,
    })),
  });
  const finalQuarter = Math.max(
    ...testCase.input.contributions.map(({ quarter }) => quarter),
    ...testCase.input.exits.map(({ quarter }) => quarter)
  );
  const rowsByQuarter = new Map<number, CoreAllocationRowV1[]>();
  result.rows.forEach((row) => {
    const quarterRows = rowsByQuarter.get(row.periodIndex) ?? [];
    quarterRows.push(row);
    rowsByQuarter.set(row.periodIndex, quarterRows);
  });

  let priorEnding = new Decimal(0);
  const rows: CoreTruthRow[] = [];
  for (let quarter = 1; quarter <= finalQuarter; quarter += 1) {
    const openingUnreturnedCapital = priorEnding;
    const capitalCalls = sum(
      testCase.input.contributions
        .filter((contribution) => contribution.quarter === quarter)
        .map((contribution) => new Decimal(contribution.amount))
    );
    const quarterRows = rowsByQuarter.get(quarter) ?? [];
    const grossProceeds = sumRows(quarterRows, (row) => row.gross);
    const returnOfCapital = sumRows(quarterRows, (row) => row.roc);
    const lpResidual = sumRows(quarterRows, (row) => row.lpProfit);
    const gpCarry = sumRows(quarterRows, (row) => row.gpCarry);
    priorEnding =
      quarterRows.length > 0
        ? quarterRows[quarterRows.length - 1].unreturnedCapitalAfter
        : openingUnreturnedCapital.plus(capitalCalls);
    rows.push({
      quarter,
      openingUnreturnedCapital: openingUnreturnedCapital.toFixed(6),
      capitalCalls: capitalCalls.toFixed(6),
      grossProceeds: grossProceeds.toFixed(6),
      returnOfCapital: returnOfCapital.toFixed(6),
      lpResidual: lpResidual.toFixed(6),
      gpCarry: gpCarry.toFixed(6),
      endingUnreturnedCapital: priorEnding.toFixed(6),
    });
  }

  return {
    rows,
    totals: {
      openingUnreturnedCapital: result.totals.openingUnreturnedCapital.toFixed(6),
      paidIn: result.totals.paidIn.toFixed(6),
      grossProceeds: result.totals.gross.toFixed(6),
      returnOfCapital: result.totals.roc.toFixed(6),
      lpResidual: result.totals.lpProfit.toFixed(6),
      gpCarry: result.totals.gpCarry.toFixed(6),
      endingUnreturnedCapital: result.totals.endingUnreturnedCapital.toFixed(6),
      lpDistributions: result.totals.roc.plus(result.totals.lpProfit).toFixed(6),
    },
  };
}

describe('decimal waterfall core truth cases', () => {
  const fixture = fixtureSchema.parse(coreFixture);
  const correctedCases = z.array(coreCaseSchema).length(2).parse(correctedFixture.cases);

  it('is seeded exactly from both corrected capital-account oracle cases', () => {
    expect(fixture.oracle).toBe(DECIMAL_WATERFALL_CORE_ENGINE_VERSION);
    expect(fixture.methodologyVersion).toBe(DECIMAL_WATERFALL_CORE_METHODOLOGY_VERSION);
    expect(fixture.cases).toEqual(correctedCases);
  });

  correctedCases.forEach((testCase) => {
    it(`${testCase.id}: real core matches exact quarter rows and totals`, () => {
      const replay = replayThroughCore(testCase);

      expect(replay.rows).toEqual(testCase.expected.rows);
      expect(replay.totals).toEqual(testCase.expected.totals);
    });
  });
});
