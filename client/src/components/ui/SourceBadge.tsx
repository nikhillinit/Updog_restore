/**
 * SourceBadge Component
 *
 * Displays metric data source with Press On branding colors
 */

import React from 'react';

export type MetricSource =
  | 'actual'               // Real portfolio data
  | 'model'                // Monte Carlo / projection
  | 'construction_forecast' // J-curve construction forecast
  | 'forecast'             // Generic forecast
  | 'N/A';                 // No data available

interface SourceBadgeProps {
  source: MetricSource;
  className?: string;
}

/**
 * Badge for metric data sources
 *
 * Color scheme (Press On branding):
 * - Actual: Green (high confidence)
 * - Model: Blue (projection)
 * - Forecast: Orange (construction/early)
 * - N/A: Gray (no data)
 */
export function SourceBadge({ source, className = '' }: SourceBadgeProps) {
  const styles = getSourceStyles(source);

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles} ${className}`}
      title={getSourceTooltip(source)}
    >
      {getSourceLabel(source)}
    </span>
  );
}

function getSourceStyles(source: MetricSource): string {
  switch (source) {
    case 'actual':
      return 'bg-green-100 text-green-800 border border-green-300';
    case 'model':
      return 'bg-blue-100 text-blue-800 border border-blue-300';
    case 'construction_forecast':
    case 'forecast':
      return 'bg-orange-100 text-orange-800 border border-orange-300';
    case 'N/A':
      return 'bg-gray-100 text-gray-600 border border-gray-300';
  }
}

function getSourceLabel(source: MetricSource): string {
  switch (source) {
    case 'actual':
      return 'Actual';
    case 'model':
      return 'Model';
    case 'construction_forecast':
      return 'Construction';
    case 'forecast':
      return 'Forecast';
    case 'N/A':
      return 'N/A';
  }
}

function getSourceTooltip(source: MetricSource): string {
  switch (source) {
    case 'actual':
      return 'Based on real portfolio data';
    case 'model':
      return 'Monte Carlo projection from current state';
    case 'construction_forecast':
      return 'J-curve forecast (no investments yet)';
    case 'forecast':
      return 'Forward-looking projection';
    case 'N/A':
      return 'Data not available';
  }
}
