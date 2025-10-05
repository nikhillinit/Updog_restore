/**
 * VarianceBadge Component
 *
 * Displays variance between actual and target metrics with color-coded indicators.
 * Shows percentage deviation and direction (↑/↓) for quick visual assessment.
 *
 * @module client/components/metrics/VarianceBadge
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface VarianceBadgeProps {
  /** Actual value */
  actual: number;
  /** Target or expected value */
  target: number;
  /** Display format */
  format?: 'percentage' | 'currency' | 'number' | 'multiple';
  /** Show target value in tooltip/label */
  showTarget?: boolean;
  /** Custom className */
  className?: string;
  /** Invert colors (e.g., for expenses where lower is better) */
  invertColors?: boolean;
}

/**
 * Badge component showing variance with color-coded status
 */
export function VarianceBadge({
  actual,
  target,
  format = 'number',
  showTarget = false,
  className = '',
  invertColors = false,
}: VarianceBadgeProps) {
  // Calculate variance
  const variance = actual - target;
  const percentDeviation = target !== 0 ? (variance / target) * 100 : 0;
  const isPositive = variance >= 0;

  // Determine visual treatment
  const effectivelyPositive = invertColors ? !isPositive : isPositive;

  // Choose icon
  const Icon = variance === 0 ? Minus : effectivelyPositive ? TrendingUp : TrendingDown;

  // Choose color variant
  const variant = variance === 0 ? 'outline' : effectivelyPositive ? 'default' : 'destructive';

  // Format the deviation
  const formattedDeviation = Math.abs(percentDeviation).toFixed(1);

  // Format target value
  const formattedTarget = formatValue(target, format);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Badge variant={variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        <span>{formattedDeviation}%</span>
      </Badge>
      {showTarget && (
        <span className="text-xs text-gray-500">
          Target: {formattedTarget}
        </span>
      )}
    </div>
  );
}

/**
 * Format a value based on type
 */
function formatValue(value: number, format: VarianceBadgeProps['format']): string {
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);

    case 'percentage':
      return `${(value * 100).toFixed(1)}%`;

    case 'multiple':
      return `${value.toFixed(2)}x`;

    case 'number':
    default:
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
  }
}

/**
 * Compact variance indicator (just icon and percentage)
 */
export function CompactVarianceBadge({
  actual,
  target,
  invertColors = false,
}: Pick<VarianceBadgeProps, 'actual' | 'target' | 'invertColors'>) {
  const variance = actual - target;
  const percentDeviation = target !== 0 ? (variance / target) * 100 : 0;
  const isPositive = variance >= 0;
  const effectivelyPositive = invertColors ? !isPositive : isPositive;

  if (variance === 0) return null;

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${
      effectivelyPositive ? 'text-green-600' : 'text-red-600'
    }`}>
      {effectivelyPositive ? '↑' : '↓'}
      {Math.abs(percentDeviation).toFixed(1)}%
    </span>
  );
}

/**
 * Status badge (On Track / Ahead / Behind)
 */
interface StatusBadgeProps {
  status: 'ahead' | 'on-track' | 'behind' | 'above' | 'below';
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const getVariant = () => {
    if (status === 'ahead' || status === 'above' || status === 'on-track') {
      return 'default';
    }
    return 'destructive';
  };

  const getLabel = () => {
    switch (status) {
      case 'ahead':
        return 'Ahead of Plan';
      case 'on-track':
        return 'On Track';
      case 'behind':
        return 'Behind Plan';
      case 'above':
        return 'Above Target';
      case 'below':
        return 'Below Target';
      default:
        return status;
    }
  };

  return (
    <Badge variant={getVariant()} className={className}>
      {getLabel()}
    </Badge>
  );
}
