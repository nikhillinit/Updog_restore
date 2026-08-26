import { describe, expect, it } from 'vitest';

import {
  deriveFactsEventOrderKey,
  deriveForecastEventOrderKey,
  compareEventOrderKeys,
} from '../../../shared/contracts/internal-economics/event-ordering-v1.contract';
import {
  generatePermutations,
  buildOrderKeyPermutationFixtures,
} from '../../helpers/event-ordering-builders';

describe('event-ordering-builders', () => {
  describe('generatePermutations', () => {
    it('generates all permutations for an array of numbers', () => {
      const input = [1, 2, 3];
      const result = generatePermutations(input);
      expect(result).toHaveLength(6);
      expect(result).toEqual([
        [1, 2, 3],
        [1, 3, 2],
        [2, 1, 3],
        [2, 3, 1],
        [3, 1, 2],
        [3, 2, 1],
      ]);
    });

    it('returns a single array for a single element', () => {
      expect(generatePermutations([1])).toEqual([[1]]);
    });

    it('returns an empty array containing an empty array for empty input', () => {
      expect(generatePermutations([])).toEqual([[]]);
    });
  });

  describe('buildOrderKeyPermutationFixtures', () => {
    it('returns the canonical order, expected stable source IDs, and all permutations', () => {
      const key1 = deriveFactsEventOrderKey({
        factsSnapshotId: 1,
        eventId: 3,
        eventType: 'recallable_distribution',
        effectiveAt: '2027-01-01T00:00:00.000Z',
      });
      const key2 = deriveFactsEventOrderKey({
        factsSnapshotId: 1,
        eventId: 2,
        eventType: 'lp_capital_call',
        effectiveAt: '2027-01-01T00:00:00.000Z',
      });
      const key3 = deriveFactsEventOrderKey({
        factsSnapshotId: 1,
        eventId: 1,
        eventType: 'lp_distribution',
        effectiveAt: '2026-12-31T23:59:59.999Z',
      });

      const keys = [key1, key2, key3];
      const fixtures = buildOrderKeyPermutationFixtures(keys);

      expect(fixtures.expectedStableSourceIds).toEqual([
        'facts:1:cash_flow_event:1',
        'facts:1:cash_flow_event:2',
        'facts:1:cash_flow_event:3',
      ]);
      expect(fixtures.canonical.map((k) => k.stableSourceId)).toEqual(
        fixtures.expectedStableSourceIds
      );
      expect(fixtures.permutations).toHaveLength(6);

      // All permutations should sort to the canonical order
      for (const permutation of fixtures.permutations) {
        expect([...permutation].sort(compareEventOrderKeys).map((k) => k.stableSourceId)).toEqual(
          fixtures.expectedStableSourceIds
        );
      }
    });

    it('supports forecast event keys', () => {
      const key1 = deriveForecastEventOrderKey({
        forecastSnapshotId: 2,
        periodEnd: '2027-06-30',
        eventType: 'forecast_quarterly_distribution',
      });
      const key2 = deriveForecastEventOrderKey({
        forecastSnapshotId: 2,
        periodEnd: '2027-03-31',
        eventType: 'forecast_quarterly_distribution',
      });

      const fixtures = buildOrderKeyPermutationFixtures([key1, key2]);

      expect(fixtures.expectedStableSourceIds).toEqual([
        'forecast:2:quarter:2027-03-31:forecast_quarterly_distribution',
        'forecast:2:quarter:2027-06-30:forecast_quarterly_distribution',
      ]);
      expect(fixtures.permutations).toHaveLength(2);
    });
  });
});
