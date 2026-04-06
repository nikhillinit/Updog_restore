import { describe, it, expect } from 'vitest';
import {
  formatRatio,
  formatPercent,
  formatDecimal,
  formatYears,
  formatMetricValue,
  formatVariableValue,
} from '@/components/sensitivity/_shared/formatters';
import type {
  SensitivityMetricDefinition,
  SensitivityVariableDefinition,
} from '@shared/contracts/sensitivity-variables-v1';

function metric(formatter: SensitivityMetricDefinition['formatter']): SensitivityMetricDefinition {
  return { formatter } as SensitivityMetricDefinition;
}

function variable(unit: SensitivityVariableDefinition['unit']): SensitivityVariableDefinition {
  return { unit } as SensitivityVariableDefinition;
}

describe('formatters (primitive)', () => {
  it('formatRatio renders three decimal places', () => {
    expect(formatRatio(0)).toBe('0.000');
    expect(formatRatio(1.2345)).toBe('1.234');
  });

  it('formatPercent scales by 100 and renders one decimal', () => {
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(0.123)).toBe('12.3%');
    expect(formatPercent(1)).toBe('100.0%');
  });

  it('formatDecimal renders two decimal places', () => {
    expect(formatDecimal(1.234)).toBe('1.23');
  });

  it('formatYears renders integer years with suffix', () => {
    expect(formatYears(5)).toBe('5 yrs');
    expect(formatYears(0)).toBe('0 yrs');
  });
});

describe('formatMetricValue', () => {
  it('renders percent formatter', () => {
    expect(formatMetricValue(0.5, metric('percent'))).toBe('50.0%');
  });

  it('renders ratio formatter as two-decimal', () => {
    expect(formatMetricValue(2.5, metric('ratio'))).toBe('2.50');
  });

  it('renders currency with locale grouping', () => {
    expect(formatMetricValue(1000, metric('currency'))).toBe('$1,000');
  });

  it('renders decimal formatter', () => {
    expect(formatMetricValue(1.5, metric('decimal'))).toBe('1.50');
  });
});

describe('formatVariableValue', () => {
  it('renders ratio unit as percent', () => {
    expect(formatVariableValue(0.25, variable('ratio'))).toBe('25.0%');
  });

  it('renders years unit with suffix', () => {
    expect(formatVariableValue(7, variable('years'))).toBe('7 yrs');
  });

  it('renders dollars unit with currency', () => {
    expect(formatVariableValue(2500, variable('dollars'))).toBe('$2,500');
  });

  it('renders count unit as three-decimal ratio', () => {
    expect(formatVariableValue(3.14, variable('count'))).toBe('3.140');
  });
});
