import {
  MetricPrecision,
  roundCurrency,
  roundIRR,
  roundMultiple,
  roundPercentage,
} from './decimal-money';

export function formatMetric(
  value: number | null | undefined,
  type: 'irr' | 'multiple' | 'currency' | 'percentage'
): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  if (!Number.isFinite(value)) {
    return '\u2014';
  }

  switch (type) {
    case 'irr':
      return `${roundIRR(value).mul(100).toFixed(MetricPrecision.IRR)}%`;

    case 'multiple':
      return `${roundMultiple(value).toFixed(MetricPrecision.MULTIPLE)}x`;

    case 'currency':
      return `$${roundCurrency(value).toNumber().toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

    case 'percentage':
      return `${roundPercentage(value).mul(100).toFixed(MetricPrecision.PERCENTAGE)}%`;
  }
}
