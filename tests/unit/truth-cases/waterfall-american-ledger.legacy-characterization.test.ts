import { describe, expect, it } from 'vitest';

import { calculateAmericanWaterfallLedger } from '@shared/lib/waterfall/american-ledger';
import fixture from '../../../docs/waterfall-american-ledger.legacy-characterization.json';

interface LegacyCharacterizationCase {
  id: `LEGACY-${string}`;
  description: string;
  input: {
    config: {
      carryPct: number;
    };
    contributions: Array<{ quarter: number; amount: number }>;
    exits: Array<{ quarter: number; grossProceeds: number }>;
  };
  expected: {
    rows: Array<{
      quarter: number;
      grossProceeds: number;
      lpCapitalReturn: number;
      lpProfitShare: number;
      gpCarry: number;
      recycledAmount: number;
      running: {
        paidIn: number;
        distributed: number;
        recycled: number;
        unrealizedCapital: number;
        dpi: number;
        tvpi: number;
      };
    }>;
    totals: {
      paidIn: number;
      distributed: number;
      recycled: number;
      unrealizedCapital: number;
      dpi: number;
      tvpi: number;
      gpCarryTotal: number;
      gpCarryNet: number;
    };
    conservation?: {
      grossProceeds: number;
      lpDistributed: number;
      gpCarry: number;
    };
  };
}

interface LegacyCharacterizationFixture {
  header: string;
  classification: 'legacy_behavior';
  productTruth: false;
  cases: LegacyCharacterizationCase[];
}

const characterization = fixture as LegacyCharacterizationFixture;

describe('American waterfall ledger legacy characterization', () => {
  it('labels every fixture as legacy behavior rather than product truth', () => {
    expect(characterization.header).toBe(
      'LEGACY BEHAVIOR — CHARACTERIZATION ONLY — NOT PRODUCT TRUTH'
    );
    expect(characterization.classification).toBe('legacy_behavior');
    expect(characterization.productTruth).toBe(false);
    expect(characterization.cases.map(({ id }) => id)).toEqual([
      'LEGACY-01',
      'LEGACY-02',
      'LEGACY-03',
      'LEGACY-04',
      'LEGACY-05',
      'LEGACY-06',
    ]);
  });

  characterization.cases.forEach((testCase) => {
    it(`${testCase.id}: ${testCase.description}`, () => {
      const result = calculateAmericanWaterfallLedger(
        testCase.input.config,
        testCase.input.contributions,
        testCase.input.exits
      );

      expect(result.rows).toEqual(testCase.expected.rows);
      expect(result.totals).toEqual(testCase.expected.totals);

      if (testCase.expected.conservation) {
        const expected = testCase.expected.conservation;
        expect(result.rows.reduce((sum, row) => sum + row.grossProceeds, 0)).toBe(
          expected.grossProceeds
        );
        expect(result.totals.distributed).toBe(expected.lpDistributed);
        expect(result.totals.gpCarryTotal).toBe(expected.gpCarry);
        expect(result.totals.distributed + result.totals.gpCarryTotal).toBe(expected.grossProceeds);
      }
    });
  });
});
