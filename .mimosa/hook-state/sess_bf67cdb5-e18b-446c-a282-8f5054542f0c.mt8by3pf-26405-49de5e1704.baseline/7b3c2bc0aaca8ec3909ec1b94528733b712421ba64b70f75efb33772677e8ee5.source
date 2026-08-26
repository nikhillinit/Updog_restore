import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { FundAccountingStateObservationV1_1 } from '../../../shared/contracts/internal-economics/fund-accounting-state-observation-v1.1.contract';
import { Decimal } from '../../../shared/lib/decimal-config';
import { computeDecimalWaterfallAllocationV1 } from '../../../shared/lib/internal-economics/decimal-waterfall-core-v1';

const MAX_SUPPORTED_MONEY_MICROS = 9_999_999_999_999_999n;

interface GeneratedCase {
  readonly openingMicros: bigint;
  readonly carryUnits: bigint;
  readonly contributions: readonly {
    readonly periodIndex: number;
    readonly amountMicros: bigint;
  }[];
  readonly distributions: readonly { readonly periodIndex: number; readonly grossMicros: bigint }[];
}

function fixedUnsigned(value: bigint, scale: number): string {
  const divisor = 10n ** BigInt(scale);
  const whole = value / divisor;
  const fraction = (value % divisor).toString().padStart(scale, '0');
  return `${whole}.${fraction}`;
}

function openingState(openingMicros: bigint): FundAccountingStateObservationV1_1 {
  const openingMoney = fixedUnsigned(openingMicros, 6);
  return {
    contractVersion: 'fund-accounting-state-observation/1.1.0',
    cutoverInstant: '2026-06-30T23:59:59.000Z',
    currency: 'USD',
    cashBalanceUsd: '0.000000',
    cumulativeLpPaidInUsd: openingMoney,
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
    methodologyVersion: 'opening-state-methodology/1.0.0',
    lpUnreturnedContributedCapitalUsd: openingMoney,
  };
}

const generatedCaseArbitrary: fc.Arbitrary<GeneratedCase> = fc.record({
  openingMicros: fc.bigInt({ min: 0n, max: MAX_SUPPORTED_MONEY_MICROS }),
  carryUnits: fc.bigInt({ min: 0n, max: 1_000_000_000_000n }),
  contributions: fc.array(
    fc.record({
      periodIndex: fc.integer({ min: 0, max: 12 }),
      amountMicros: fc.bigInt({ min: 0n, max: MAX_SUPPORTED_MONEY_MICROS }),
    }),
    { maxLength: 6 }
  ),
  distributions: fc.array(
    fc.record({
      periodIndex: fc.integer({ min: 0, max: 12 }),
      grossMicros: fc.bigInt({ min: 0n, max: MAX_SUPPORTED_MONEY_MICROS }),
    }),
    { maxLength: 6 }
  ),
});

const RETAINED_COUNTEREXAMPLES: readonly GeneratedCase[] = [
  {
    openingMicros: 0n,
    carryUnits: 200_000_000_000n,
    contributions: [
      { periodIndex: 1, amountMicros: 100_000_000n },
      { periodIndex: 3, amountMicros: 50_000_000n },
    ],
    distributions: [
      { periodIndex: 2, grossMicros: 200_000_000n },
      { periodIndex: 4, grossMicros: 50_000_000n },
    ],
  },
  {
    openingMicros: MAX_SUPPORTED_MONEY_MICROS,
    carryUnits: 1n,
    contributions: [{ periodIndex: 1, amountMicros: 1n }],
    distributions: [{ periodIndex: 1, grossMicros: MAX_SUPPORTED_MONEY_MICROS }],
  },
];

describe('Decimal waterfall V1 property certification', () => {
  it('conserves all generated money with pinned seed, domain, shrinking, and counterexamples', () => {
    const ReferenceDecimal = Decimal.clone({ precision: 100 });

    fc.assert(
      fc.property(generatedCaseArbitrary, (generated) => {
        const contributions = generated.contributions.map((event, index) => ({
          sourceId: `contribution-${index}`,
          periodIndex: event.periodIndex,
          amountUsd: fixedUnsigned(event.amountMicros, 6),
        }));
        const distributions = generated.distributions.map((event, index) => ({
          sourceId: `distribution-${index}`,
          periodIndex: event.periodIndex,
          grossUsd: fixedUnsigned(event.grossMicros, 6),
          isTerminal: false,
        }));
        const result = computeDecimalWaterfallAllocationV1({
          carryRatio: fixedUnsigned(generated.carryUnits, 12),
          hurdle: { basis: 'none' },
          openingState: openingState(generated.openingMicros),
          contributions,
          distributions,
        });

        for (const row of result.rows) {
          expect(row.roc.plus(row.lpProfit).plus(row.gpCarry).eq(row.gross)).toBe(true);
          expect(row.unreturnedCapitalAfter.gte(0)).toBe(true);
        }

        const totalContributions = contributions.reduce(
          (sum, event) => sum.plus(event.amountUsd),
          new Decimal(0)
        );
        const expectedDistributionIds = distributions
          .map(({ sourceId }) => sourceId)
          .sort((left, right) => left.localeCompare(right));
        const actualDistributionIds = result.rows
          .map(({ sourceId }) => sourceId)
          .sort((left, right) => left.localeCompare(right));
        const totalInputGross = distributions.reduce(
          (sum, event) => sum.plus(event.grossUsd),
          new ReferenceDecimal(0)
        );
        expect(actualDistributionIds).toEqual(expectedDistributionIds);
        expect(new ReferenceDecimal(result.totals.gross.toFixed()).eq(totalInputGross)).toBe(true);
        expect(
          new ReferenceDecimal(result.totals.roc.toFixed())
            .plus(result.totals.lpProfit.toFixed())
            .plus(result.totals.gpCarry.toFixed())
            .eq(result.totals.gross.toFixed())
        ).toBe(true);
        expect(
          result.totals.endingUnreturnedCapital.eq(
            result.totals.openingUnreturnedCapital.plus(totalContributions).minus(result.totals.roc)
          )
        ).toBe(true);
        expect(
          result.totals.paidIn.eq(
            new Decimal(fixedUnsigned(generated.openingMicros, 6)).plus(totalContributions)
          )
        ).toBe(true);
      }),
      {
        seed: 1263,
        numRuns: 500,
        endOnFailure: false,
        examples: RETAINED_COUNTEREXAMPLES.map((example) => [example]),
      }
    );
  });
});
