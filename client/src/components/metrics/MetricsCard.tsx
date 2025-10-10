/**
 * MetricsCard Component
 *
 * Displays a single metric with actual, projected, and target values.
 * Shows variance indicators and source attribution for transparency.
 *
 * @module client/components/metrics/MetricsCard
 */

import React from 'react';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { Badge } from '@/components/ui/badge';
import { VarianceBadge, CompactVarianceBadge, StatusBadge } from './VarianceBadge';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MetricsCardProps {
  /** Card title */
  title: string;
  /** Primary value (actual) */
  actual: number;
  /** Projected value (optional) */
  projected?: number;
  /** Target value (optional) */
  target?: number;
  /** Display format */
  format: 'currency' | 'percentage' | 'number' | 'multiple';
  /** Show variance badge */
  showVariance?: boolean;
  /** Status indicator (optional) */
  status?: 'ahead' | 'on-track' | 'behind' | 'above' | 'below';
  /** Additional description */
  description?: string;
  /** Custom icon */
  icon?: React.ReactNode;
  /** Timestamp for actual data */
  asOfDate?: string;
  /** Custom className */
  className?: string;
  /** Invert variance colors (for expenses) */
  invertColors?: boolean;
}

/**
 * Main metrics card component
 */
export function MetricsCard({
  title,
  actual,
  projected,
  target,
  format,
  showVariance = true,
  status,
  description,
  icon,
  asOfDate,
  className = '',
  invertColors = false,
}: MetricsCardProps) {
  const formattedActual = formatValue(actual, format);
  const formattedProjected = projected !== undefined ? formatValue(projected, format) : null;
  const formattedTarget = target !== undefined ? formatValue(target, format) : null;

  return (
    <PremiumCard className={`relative ${className}`}>
      {/* Header with icon and info tooltip */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && <div className="p-2 bg-pov-charcoal/10 rounded-lg">{icon}</div>}
          <div>
            <h3 className="font-poppins text-sm text-gray-600">{title}</h3>
            {description && (
              <p className="text-xs text-gray-500 mt-0.5">{description}</p>
            )}
          </div>
        </div>

        {asOfDate && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-gray-400" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  Source: Database
                  <br />
                  As of: {new Date(asOfDate).toLocaleDateString()}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Primary value (Actual) */}
      <div className="flex items-baseline gap-2 mb-2">
        <p className="font-inter font-bold text-3xl text-pov-charcoal">
          {formattedActual}
        </p>
        <Badge variant="outline" className="text-xs">
          Actual
        </Badge>
        {target !== undefined && showVariance && (
          <CompactVarianceBadge
            actual={actual}
            target={target}
            invertColors={invertColors}
          />
        )}
      </div>

      {/* Secondary values */}
      <div className="space-y-1">
        {formattedProjected && (
          <p className="text-sm text-gray-600">
            <span className="font-medium">Projected:</span> {formattedProjected}
          </p>
        )}
        {formattedTarget && (
          <p className="text-sm text-gray-600">
            <span className="font-medium">Target:</span> {formattedTarget}
          </p>
        )}
      </div>

      {/* Variance and status indicators */}
      {(showVariance || status) && (
        <div className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-2">
          {status && <StatusBadge status={status} />}
          {target !== undefined && showVariance && (
            <VarianceBadge
              actual={actual}
              target={target}
              format={format}
              invertColors={invertColors}
            />
          )}
        </div>
      )}
    </PremiumCard>
  );
}

/**
 * Compact metrics card (for grid layouts)
 */
export function CompactMetricsCard({
  title,
  actual,
  target,
  format,
  icon,
  className = '',
}: Pick<MetricsCardProps, 'title' | 'actual' | 'target' | 'format' | 'icon' | 'className'>) {
  const formattedActual = formatValue(actual, format);

  return (
    <PremiumCard className={`p-4 ${className}`}>
      <div className="flex items-center justify-between">
        {icon && <div className="p-2 bg-pov-charcoal/10 rounded-lg">{icon}</div>}
        <div className="flex-1 ml-3">
          <p className="text-xs text-gray-600">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-bold text-pov-charcoal">{formattedActual}</p>
            {target !== undefined && (
              <CompactVarianceBadge actual={actual} target={target} />
            )}
          </div>
        </div>
      </div>
    </PremiumCard>
  );
}

/**
 * Format a value based on type
 */
/**
 * Shared utility for formatting currency values with K/M/B suffixes.
 */
function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format a value based on type
 */
function formatValue(value: number, format: MetricsCardProps['format']): string {
  switch (format) {
    case 'currency':
      return formatCurrency(value);

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
