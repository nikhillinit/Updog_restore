import { describe, expect, it } from 'vitest';
import {
  buildPacingVarianceResult,
  buildReserveVarianceResult,
  buildStructuredMetricChanges,
  coerceFiniteNumber,
} from '../../../../server/services/variance-tracking/variance-diff';

describe('variance-diff helpers', () => {
  describe('coerceFiniteNumber', () => {
    it('accepts finite numbers and numeric strings', () => {
      expect(coerceFiniteNumber(42)).toBe(42);
      expect(coerceFiniteNumber('42.5')).toBe(42.5);
      expect(coerceFiniteNumber(' 0.25 ')).toBe(0.25);
    });

    it('rejects empty strings, non-numeric strings, infinities, and nullish values', () => {
      expect(coerceFiniteNumber('')).toBeNull();
      expect(coerceFiniteNumber('not-a-number')).toBeNull();
      expect(coerceFiniteNumber(Number.POSITIVE_INFINITY)).toBeNull();
      expect(coerceFiniteNumber(null)).toBeNull();
      expect(coerceFiniteNumber(undefined)).toBeNull();
    });
  });

  describe('buildStructuredMetricChanges', () => {
    it('builds numeric deltas and omits unchanged keys', () => {
      const result = buildStructuredMetricChanges(
        { totalReserves: 600000, reserveRatio: 0.25, unchanged: 'same' },
        { totalReserves: 500000, reserveRatio: 0.2, unchanged: 'same' }
      );

      expect(result.metricDeltas.totalReserves).toEqual({
        current: 600000,
        baseline: 500000,
        delta: 100000,
        deltaPct: 0.2,
      });
      expect(result.metricDeltas.reserveRatio).toEqual({
        current: 0.25,
        baseline: 0.2,
        delta: 0.04999999999999999,
        deltaPct: 0.24999999999999994,
      });
      expect(result.changes).toEqual({});
    });

    it('captures keys present only on one side as non-numeric changes', () => {
      const result = buildStructuredMetricChanges(
        { deploymentRate: 0.9, newMetric: 42 },
        { deploymentRate: 0.8, removedMetric: 99 }
      );

      expect(result.metricDeltas).toEqual({
        deploymentRate: {
          current: 0.9,
          baseline: 0.8,
          delta: 0.09999999999999998,
          deltaPct: 0.12499999999999997,
        },
      });
      expect(result.changes.newMetric).toEqual({ current: 42, baseline: null });
      expect(result.changes.removedMetric).toEqual({
        current: null,
        baseline: 99,
      });
    });

    it('uses null deltaPct when baseline numeric value is zero', () => {
      const result = buildStructuredMetricChanges({ value: 10 }, { value: 0 });

      expect(result.metricDeltas.value).toEqual({
        current: 10,
        baseline: 0,
        delta: 10,
        deltaPct: null,
      });
    });
  });

  describe('buildReserveVarianceResult', () => {
    it('returns hasData false when either side is empty', () => {
      expect(buildReserveVarianceResult({}, { totalReserves: 500000 })).toEqual({
        hasData: false,
        currentReserves: {},
        baselineReserves: {},
        metricDeltas: {},
        changes: {},
      });

      expect(buildReserveVarianceResult({ totalReserves: 600000 }, {})).toEqual({
        hasData: false,
        currentReserves: {},
        baselineReserves: {},
        metricDeltas: {},
        changes: {},
      });
    });

    it('builds reserve deltas when both sides have data', () => {
      const result = buildReserveVarianceResult(
        { totalReserves: 600000, reserveRatio: 0.25 },
        { totalReserves: 500000, reserveRatio: 0.2 }
      );

      expect(result.hasData).toBe(true);
      expect(result.currentReserves).toEqual({
        totalReserves: 600000,
        reserveRatio: 0.25,
      });
      expect(result.baselineReserves).toEqual({
        totalReserves: 500000,
        reserveRatio: 0.2,
      });
      expect(result.metricDeltas.totalReserves.delta).toBe(100000);
      expect(result.changes).toEqual({});
    });
  });

  describe('buildPacingVarianceResult', () => {
    it('returns hasData false when either side is empty', () => {
      expect(buildPacingVarianceResult({}, { deploymentRate: 0.8 })).toEqual({
        hasData: false,
        currentPacing: {},
        baselinePacing: {},
        metricDeltas: {},
        changes: {},
      });

      expect(buildPacingVarianceResult({ deploymentRate: 0.9 }, {})).toEqual({
        hasData: false,
        currentPacing: {},
        baselinePacing: {},
        metricDeltas: {},
        changes: {},
      });
    });

    it('builds pacing deltas when both sides have data', () => {
      const result = buildPacingVarianceResult(
        { deploymentRate: 0.9, quarterlyTarget: 0.8 },
        { deploymentRate: 0.8, quarterlyTarget: 0.75 }
      );

      expect(result.hasData).toBe(true);
      expect(result.currentPacing).toEqual({
        deploymentRate: 0.9,
        quarterlyTarget: 0.8,
      });
      expect(result.baselinePacing).toEqual({
        deploymentRate: 0.8,
        quarterlyTarget: 0.75,
      });
      expect(result.metricDeltas.deploymentRate.deltaPct).toBe(0.12499999999999997);
      expect(result.changes).toEqual({});
    });
  });
});
