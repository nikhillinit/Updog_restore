import { describe, expect, it } from 'vitest';
import type { MetricAvailabilityDetail } from '@shared/types/metrics';
import {
  formatCompactKpiDisplayValue,
  formatPerformanceMetric,
  formatUnavailableMetric,
} from '@/lib/fund-header-metric-formatters';

const availableCashflows: MetricAvailabilityDetail = {
  status: 'available',
  source: 'cashflows',
};

const unavailableDistributions: MetricAvailabilityDetail = {
  status: 'unavailable',
  source: 'distributions',
  reason: 'no_distributions_recorded',
  message: 'No distributions recorded',
};

const unavailableCashflows: MetricAvailabilityDetail = {
  status: 'unavailable',
  source: 'cashflows',
  reason: 'insufficient_dated_cashflows',
  message: 'Needs history',
};

describe('fund header metric formatters', () => {
  describe('formatUnavailableMetric', () => {
    it('uses N/A when no availability detail exists', () => {
      expect(formatUnavailableMetric(undefined)).toBe('N/A');
    });

    it('uses a stable dash for unavailable distribution metrics', () => {
      expect(formatUnavailableMetric(unavailableDistributions)).toBe('—');
    });

    it('uses a stable dash for unavailable cash-flow metrics', () => {
      expect(formatUnavailableMetric(unavailableCashflows)).toBe('—');
    });
  });

  describe('formatPerformanceMetric', () => {
    it('formats available values with the provided formatter', () => {
      expect(
        formatPerformanceMetric(1.5, availableCashflows, (value) => `${value.toFixed(2)}x`, false)
      ).toBe('1.50x');
    });

    it('uses a stable dash for per-metric unavailable values', () => {
      expect(
        formatPerformanceMetric(null, unavailableDistributions, (value) => String(value), false)
      ).toBe('—');
    });

    it('uses N/A when the whole header is unavailable', () => {
      expect(formatPerformanceMetric(1.5, availableCashflows, (value) => String(value), true)).toBe(
        'N/A'
      );
    });
  });

  describe('formatCompactKpiDisplayValue', () => {
    it('uses a stable dash when a compact KPI has availability detail but no value', () => {
      expect(formatCompactKpiDisplayValue(null, 'multiple', unavailableDistributions, false)).toBe(
        '—'
      );
    });

    it('formats zero multiple values instead of replacing them with a placeholder', () => {
      expect(formatCompactKpiDisplayValue(0, 'multiple', undefined, false)).toBe('0.00x');
    });
  });
});
