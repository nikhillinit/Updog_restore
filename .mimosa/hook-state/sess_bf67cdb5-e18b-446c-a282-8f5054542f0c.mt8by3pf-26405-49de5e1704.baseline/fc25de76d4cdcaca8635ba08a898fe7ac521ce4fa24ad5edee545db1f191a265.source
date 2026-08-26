/**
 * Scenario Comparison Table Component
 *
 * Side-by-side comparison of scenario results
 * - Gross MOIC, Net MOIC
 * - Gross IRR, Net IRR
 * - Loss Rate
 * - Average Exit Years
 *
 * Styling:
 * - Zebra-striped rows
 * - Right-aligned numbers
 * - Highlight best/worst values
 */

import React from 'react';
import { type ScenarioResult } from '@/lib/scenario-calculations';

export interface ScenarioComparisonTableProps {
  /** Scenario results to compare */
  results: ScenarioResult[];
}

export function ScenarioComparisonTable({ results }: ScenarioComparisonTableProps) {
  if (results.length === 0) {
    return (
      <div className="bg-charcoal-50 rounded-lg p-8 text-center">
        <p className="text-charcoal-500 font-poppins">
          No scenarios to compare. Add scenarios above.
        </p>
      </div>
    );
  }

  // Helper to format numbers
  const formatMOIC = (value: number) => `${value.toFixed(2)}x`;
  const formatIRR = (value: number) => `${value.toFixed(1)}%`;
  const formatPercent = (value: number) => `${value.toFixed(0)}%`;
  const formatYears = (value: number) => `${value.toFixed(1)} yrs`;

  // Helper to find min/max for highlighting
  const getMinMax = (metric: keyof ScenarioResult['metrics']) => {
    const values = results.map(r => r.metrics[metric]);
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  };

  const getCellClass = (value: number, metric: keyof ScenarioResult['metrics'], isHigherBetter: boolean) => {
    const { min, max } = getMinMax(metric);

    if (results.length === 1) return '';

    const isBest = isHigherBetter
      ? value === max
      : value === min;

    const isWorst = isHigherBetter
      ? value === min
      : value === max;

    if (isBest) return 'bg-success/10 font-semibold text-success';
    if (isWorst) return 'bg-error/10 font-semibold text-error';
    return '';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-pov-charcoal text-white">
            <th className="px-4 py-3 text-left font-inter font-semibold text-sm">
              Metric
            </th>
            {results.map((result) => (
              <th
                key={result.name}
                className="px-4 py-3 text-right font-inter font-semibold text-sm"
              >
                {result.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Gross MOIC */}
          <tr className="bg-white border-b border-charcoal-200">
            <td className="px-4 py-3 font-poppins text-charcoal-700">
              Gross MOIC
            </td>
            {results.map((result) => (
              <td
                key={result.name}
                className={`px-4 py-3 text-right font-inter ${getCellClass(result.metrics.grossMOIC, 'grossMOIC', true)}`}
              >
                {formatMOIC(result.metrics.grossMOIC)}
              </td>
            ))}
          </tr>

          {/* Net MOIC */}
          <tr className="bg-charcoal-50 border-b border-charcoal-200">
            <td className="px-4 py-3 font-poppins text-charcoal-700">
              Net MOIC
            </td>
            {results.map((result) => (
              <td
                key={result.name}
                className={`px-4 py-3 text-right font-inter ${getCellClass(result.metrics.netMOIC, 'netMOIC', true)}`}
              >
                {formatMOIC(result.metrics.netMOIC)}
              </td>
            ))}
          </tr>

          {/* Gross IRR */}
          <tr className="bg-white border-b border-charcoal-200">
            <td className="px-4 py-3 font-poppins text-charcoal-700">
              Gross IRR
            </td>
            {results.map((result) => (
              <td
                key={result.name}
                className={`px-4 py-3 text-right font-inter ${getCellClass(result.metrics.grossIRR, 'grossIRR', true)}`}
              >
                {formatIRR(result.metrics.grossIRR)}
              </td>
            ))}
          </tr>

          {/* Net IRR */}
          <tr className="bg-charcoal-50 border-b border-charcoal-200">
            <td className="px-4 py-3 font-poppins text-charcoal-700">
              Net IRR
            </td>
            {results.map((result) => (
              <td
                key={result.name}
                className={`px-4 py-3 text-right font-inter ${getCellClass(result.metrics.netIRR, 'netIRR', true)}`}
              >
                {formatIRR(result.metrics.netIRR)}
              </td>
            ))}
          </tr>

          {/* Loss Rate */}
          <tr className="bg-white border-b border-charcoal-200">
            <td className="px-4 py-3 font-poppins text-charcoal-700">
              Loss Rate
            </td>
            {results.map((result) => (
              <td
                key={result.name}
                className={`px-4 py-3 text-right font-inter ${getCellClass(result.metrics.lossRate, 'lossRate', false)}`}
              >
                {formatPercent(result.metrics.lossRate)}
              </td>
            ))}
          </tr>

          {/* Average Exit Years */}
          <tr className="bg-charcoal-50">
            <td className="px-4 py-3 font-poppins text-charcoal-700">
              Avg Exit Timeline
            </td>
            {results.map((result) => (
              <td
                key={result.name}
                className={`px-4 py-3 text-right font-inter ${getCellClass(result.metrics.avgExitYears, 'avgExitYears', false)}`}
              >
                {formatYears(result.metrics.avgExitYears)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* Legend */}
      {results.length > 1 && (
        <div className="mt-4 flex items-center gap-6 text-xs text-charcoal-600">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-success/20 border border-success"></div>
            <span>Best</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-error/20 border border-error"></div>
            <span>Worst</span>
          </div>
        </div>
      )}
    </div>
  );
}
