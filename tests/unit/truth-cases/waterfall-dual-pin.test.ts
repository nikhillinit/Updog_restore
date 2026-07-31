import type { FundAccountingStateObservationV1_1 } from '@shared/contracts/internal-economics/fund-accounting-state-observation-v1.1.contract';
import { Decimal } from '@shared/lib/decimal-config';
import {
  computeDecimalWaterfallAllocationV1,
  type DecimalWaterfallCoreV1Result,
} from '@shared/lib/internal-economics/decimal-waterfall-core-v1';
import { computeLedgerAllocationV1 } from '@shared/lib/internal-economics/ledger-allocation-v1';
import { describe, expect, it } from 'vitest';

import legacyFixture from '../../../docs/waterfall-american-ledger.legacy-characterization.json';

/** Maximum money accepted by number-to-decimal dual-pin adapters: about $9,007,199,254.74. */
const DUAL_PIN_MONEY_CEILING_USD = Number.MAX_SAFE_INTEGER / 1e6;

type DualPinCaseId = 'LEGACY-01' | 'LEGACY-02' | 'LEGACY-04' | 'LEGACY-05';

interface DualPinInput {
  readonly config: { readonly carryPct: number };
  readonly contributions: readonly { readonly quarter: number; readonly amount: number }[];
  readonly exits: readonly { readonly quarter: number; readonly grossProceeds: number }[];
}

interface DualPinCase {
  readonly id: DualPinCaseId;
  readonly classification: 'parity' | 'expected-divergence';
  readonly input: DualPinInput;
}

interface CorePin {
  readonly rows: readonly {
    readonly sourceId: string;
    readonly roc: string;
    readonly lpProfit: string;
    readonly gpCarry: string;
  }[];
  readonly totals: {
    readonly paidIn: string;
    readonly gross: string;
    readonly roc: string;
    readonly lpProfit: string;
    readonly gpCarry: string;
    readonly endingUnreturnedCapital: string;
  };
}

function openingState(): FundAccountingStateObservationV1_1 {
  return {
    contractVersion: 'fund-accounting-state-observation/1.1.0',
    cutoverInstant: '2025-12-31T23:59:59.999Z',
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
    accruedPreferredReturnThroughInstant: '2025-12-31T23:59:59.999Z',
    recallableDistributionsCumulativeUsd: '0.000000',
    recallableDistributionsOutstandingUsd: '0.000000',
    recycledProceedsCumulativeUsd: '0.000000',
    realizedProceedsCumulativeUsd: '0.000000',
    methodologyVersion: 'opening-state-methodology/1.0.0',
    lpUnreturnedContributedCapitalUsd: '0.000000',
  };
}

function decimalMoneyFromFixture(value: number): string {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > DUAL_PIN_MONEY_CEILING_USD ||
    !Number.isSafeInteger(value * 10 ** 6)
  ) {
    throw new Error(`Dual-pin money must be a scaled safe integer, received ${String(value)}.`);
  }
  return new Decimal(value).toFixed(6);
}

function decimalRatioFromFixture(value: number): string {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1 ||
    !Number.isSafeInteger(value * 10 ** 12)
  ) {
    throw new Error(`Dual-pin ratio must be a scaled safe integer, received ${String(value)}.`);
  }
  return new Decimal(value).toFixed(12);
}

function runCore(input: DualPinInput): DecimalWaterfallCoreV1Result {
  return computeDecimalWaterfallAllocationV1({
    carryRatio: decimalRatioFromFixture(input.config.carryPct),
    hurdle: { basis: 'none' },
    openingState: openingState(),
    contributions: input.contributions.map((contribution, index) => ({
      sourceId: `call-${index + 1}`,
      periodIndex: contribution.quarter,
      amountUsd: decimalMoneyFromFixture(contribution.amount),
    })),
    distributions: input.exits.map((exit, index) => ({
      sourceId: `exit-${index + 1}`,
      periodIndex: exit.quarter,
      grossUsd: decimalMoneyFromFixture(exit.grossProceeds),
      isTerminal: false,
    })),
  });
}

function corePin(result: DecimalWaterfallCoreV1Result): CorePin {
  return {
    rows: result.rows.map((row) => ({
      sourceId: row.sourceId,
      roc: row.roc.toFixed(6),
      lpProfit: row.lpProfit.toFixed(6),
      gpCarry: row.gpCarry.toFixed(6),
    })),
    totals: {
      paidIn: result.totals.paidIn.toFixed(6),
      gross: result.totals.gross.toFixed(6),
      roc: result.totals.roc.toFixed(6),
      lpProfit: result.totals.lpProfit.toFixed(6),
      gpCarry: result.totals.gpCarry.toFixed(6),
      endingUnreturnedCapital: result.totals.endingUnreturnedCapital.toFixed(6),
    },
  };
}

const selectedCases = legacyFixture.cases.filter((testCase) =>
  ['LEGACY-01', 'LEGACY-02', 'LEGACY-04', 'LEGACY-05'].includes(testCase.id)
) as readonly (typeof legacyFixture.cases)[number][];

const dualPinCases: readonly DualPinCase[] = selectedCases.map((testCase) => ({
  id: testCase.id as DualPinCaseId,
  classification:
    testCase.id === 'LEGACY-04' || testCase.id === 'LEGACY-05' ? 'expected-divergence' : 'parity',
  input: testCase.input,
}));

const expectedCoreDivergencePins: Readonly<Record<'LEGACY-04' | 'LEGACY-05', CorePin>> = {
  'LEGACY-04': {
    rows: [
      { sourceId: 'exit-1', roc: '100.000000', lpProfit: '80.000000', gpCarry: '20.000000' },
      { sourceId: 'exit-2', roc: '100.000000', lpProfit: '0.000000', gpCarry: '0.000000' },
    ],
    totals: {
      paidIn: '200.000000',
      gross: '300.000000',
      roc: '200.000000',
      lpProfit: '80.000000',
      gpCarry: '20.000000',
      endingUnreturnedCapital: '0.000000',
    },
  },
  'LEGACY-05': {
    rows: [{ sourceId: 'exit-1', roc: '100.000000', lpProfit: '0.000000', gpCarry: '0.000000' }],
    totals: {
      paidIn: '150.000000',
      gross: '100.000000',
      roc: '100.000000',
      lpProfit: '0.000000',
      gpCarry: '0.000000',
      endingUnreturnedCapital: '50.000000',
    },
  },
};

describe('T3.9 legacy/core dual-pin fixture program', () => {
  it('labels parity and expected-divergence fixture classes explicitly', () => {
    expect(dualPinCases.map(({ id, classification }) => ({ id, classification }))).toEqual([
      { id: 'LEGACY-01', classification: 'parity' },
      { id: 'LEGACY-02', classification: 'parity' },
      { id: 'LEGACY-04', classification: 'expected-divergence' },
      { id: 'LEGACY-05', classification: 'expected-divergence' },
    ]);
    expect(DUAL_PIN_MONEY_CEILING_USD).toBe(Number.MAX_SAFE_INTEGER / 1e6);
  });

  for (const testCase of dualPinCases) {
    it(`${testCase.id} preserves frozen legacy bytes and pins ${testCase.classification}`, () => {
      const frozenCase = legacyFixture.cases.find(({ id }) => id === testCase.id)!;
      const legacy = computeLedgerAllocationV1(
        testCase.input.config,
        testCase.input.contributions,
        testCase.input.exits
      );
      const core = corePin(runCore(testCase.input));

      expect(legacy).toEqual({
        rows: frozenCase.expected.rows,
        totals: frozenCase.expected.totals,
      });
      if (frozenCase.expected.conservation !== undefined) {
        expect({
          grossProceeds: legacy.rows.reduce((total, row) => total + row.grossProceeds, 0),
          lpDistributed: legacy.totals.distributed,
          gpCarry: legacy.totals.gpCarryTotal,
        }).toEqual(frozenCase.expected.conservation);
      }

      if (testCase.classification === 'parity') {
        expect(core.rows).toEqual(
          legacy.rows.map((row, index) => ({
            sourceId: `exit-${index + 1}`,
            roc: decimalMoneyFromFixture(row.lpCapitalReturn),
            lpProfit: decimalMoneyFromFixture(row.lpProfitShare),
            gpCarry: decimalMoneyFromFixture(row.gpCarry),
          }))
        );
        expect(core.totals).toMatchObject({
          paidIn: decimalMoneyFromFixture(legacy.totals.paidIn),
          gross: decimalMoneyFromFixture(
            legacy.rows.reduce((total, row) => total + row.grossProceeds, 0)
          ),
          roc: decimalMoneyFromFixture(
            legacy.rows.reduce((total, row) => total + row.lpCapitalReturn, 0)
          ),
          lpProfit: decimalMoneyFromFixture(
            legacy.rows.reduce((total, row) => total + row.lpProfitShare, 0)
          ),
          gpCarry: decimalMoneyFromFixture(legacy.totals.gpCarryTotal),
          endingUnreturnedCapital: decimalMoneyFromFixture(legacy.totals.unrealizedCapital),
        });
        return;
      }

      const expected = expectedCoreDivergencePins[testCase.id];
      expect(core).toEqual(expected);

      if (testCase.id === 'LEGACY-04') {
        // SEMANTIC DISPOSITION: only ROC reduces basis, so Q3's call replenishes
        // unreturned capital and Q4 returns 100 instead of legacy's 20.
        expect(core.rows[1]!.roc).toBe('100.000000');
        expect(decimalMoneyFromFixture(legacy.rows[1]!.lpCapitalReturn)).toBe('20.000000');
      } else {
        // SEMANTIC DISPOSITION: every contribution enters paid-in and unreturned
        // capital even after the final exit; legacy omits Q3's 50 entirely.
        expect(core.totals.paidIn).toBe('150.000000');
        expect(decimalMoneyFromFixture(legacy.totals.paidIn)).toBe('100.000000');
        expect(core.totals.endingUnreturnedCapital).toBe('50.000000');
      }
    });
  }
});
