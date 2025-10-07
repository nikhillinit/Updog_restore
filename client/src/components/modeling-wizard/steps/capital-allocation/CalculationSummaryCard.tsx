/**
 * Calculation Summary Card
 *
 * Displays summary of capital allocation calculations with validation status.
 * Shows total capital allocated, remaining capital, and key metrics.
 */

import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type {
  CapitalAllocationCalculations,
  ValidationResult
} from '@/lib/capital-allocation-calculations';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface CalculationSummaryCardProps {
  calculations: CapitalAllocationCalculations;
  validation: ValidationResult;
  fundSize: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatMoney(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(2)}B`;
  }
  return `$${value.toFixed(1)}M`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CalculationSummaryCard({
  calculations,
  validation,
  fundSize
}: CalculationSummaryCardProps) {
  const deploymentPercentage =
    (calculations.totalCapitalAllocated / fundSize) * 100;

  const reserveUtilization =
    calculations.availableReserves > 0
      ? (calculations.totalFollowOnCapital / calculations.availableReserves) * 100
      : 0;

  return (
    <div className="space-y-4">
      {/* Validation Status */}
      {!validation.isValid && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              <p className="font-inter font-bold text-sm">Validation Errors:</p>
              <ul className="list-disc list-inside space-y-1 text-sm font-poppins">
                {validation.errors.map((error, index) => (
                  <li key={index}>{error.message}</li>
                ))}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Warnings */}
      {validation.warnings.length > 0 && validation.isValid && (
        <Alert >
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              <p className="font-inter font-bold text-sm">Recommendations:</p>
              <ul className="list-disc list-inside space-y-1 text-sm font-poppins">
                {validation.warnings.map((warning, index) => (
                  <li key={index}>{warning.message}</li>
                ))}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Success Status */}
      {validation.isValid && validation.warnings.length === 0 && (
        <Alert className="border-success bg-success/10">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <AlertDescription className="text-sm font-poppins text-success">
            Capital allocation is valid and well-balanced.
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Card */}
      <div className="bg-charcoal-50 rounded-lg p-6 border-2 border-charcoal-200">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal mb-4">
          Capital Allocation Summary
        </h3>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Capital Allocated */}
          <div className="bg-white rounded-lg p-4 border border-charcoal-200">
            <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
              Total Allocated
            </div>
            <div
              className={`font-inter font-bold text-2xl ${
                validation.isValid ? 'text-pov-charcoal' : 'text-error'
              }`}
            >
              {formatMoney(calculations.totalCapitalAllocated)}
            </div>
            <div className="text-xs text-charcoal-600 mt-1 font-poppins">
              {formatPercent(deploymentPercentage)} of fund
            </div>
          </div>

          {/* Initial Capital */}
          <div className="bg-white rounded-lg p-4 border border-charcoal-200">
            <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
              Initial Investments
            </div>
            <div className="font-inter font-bold text-2xl text-pov-charcoal">
              {formatMoney(calculations.initialCapitalAllocated)}
            </div>
            <div className="text-xs text-charcoal-600 mt-1 font-poppins">
              {calculations.estimatedDeals} deals
            </div>
          </div>

          {/* Follow-On Capital */}
          <div className="bg-white rounded-lg p-4 border border-charcoal-200">
            <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
              Follow-On Reserves
            </div>
            <div className="font-inter font-bold text-2xl text-pov-charcoal">
              {formatMoney(calculations.totalFollowOnCapital)}
            </div>
            <div className="text-xs text-charcoal-600 mt-1 font-poppins">
              {formatPercent(reserveUtilization)} utilized
            </div>
          </div>

          {/* Remaining Capital */}
          <div className="bg-white rounded-lg p-4 border border-charcoal-200">
            <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
              Remaining Capital
            </div>
            <div
              className={`font-inter font-bold text-2xl ${
                calculations.remainingCapital < 0
                  ? 'text-error'
                  : calculations.remainingCapital < fundSize * 0.05
                  ? 'text-amber-600'
                  : 'text-success'
              }`}
            >
              {formatMoney(calculations.remainingCapital)}
            </div>
            <div className="text-xs text-charcoal-600 mt-1 font-poppins">
              {formatPercent((calculations.remainingCapital / fundSize) * 100)} available
            </div>
          </div>
        </div>

        {/* Breakdown Table */}
        <div className="mt-6 border-t border-charcoal-200 pt-4">
          <table className="w-full">
            <tbody className="text-sm font-poppins">
              <tr className="border-b border-charcoal-200">
                <td className="py-2 text-charcoal-700">Fund Size:</td>
                <td className="py-2 text-right font-inter font-bold text-pov-charcoal">
                  {formatMoney(fundSize)}
                </td>
              </tr>
              <tr className="border-b border-charcoal-200">
                <td className="py-2 text-charcoal-700">
                  Initial Investments ({calculations.estimatedDeals} deals):
                </td>
                <td className="py-2 text-right font-inter text-pov-charcoal">
                  {formatMoney(calculations.initialCapitalAllocated)}
                </td>
              </tr>
              <tr className="border-b border-charcoal-200">
                <td className="py-2 text-charcoal-700">
                  Follow-On Investments:
                </td>
                <td className="py-2 text-right font-inter text-pov-charcoal">
                  {formatMoney(calculations.totalFollowOnCapital)}
                </td>
              </tr>
              <tr className="border-b-2 border-charcoal-300">
                <td className="py-2 font-inter font-bold text-pov-charcoal">
                  Total Allocated:
                </td>
                <td className="py-2 text-right font-inter font-bold text-pov-charcoal">
                  {formatMoney(calculations.totalCapitalAllocated)}
                </td>
              </tr>
              <tr>
                <td className="py-2 font-inter font-bold text-pov-charcoal">
                  Remaining:
                </td>
                <td
                  className={`py-2 text-right font-inter font-bold ${
                    calculations.remainingCapital < 0 ? 'text-error' : 'text-success'
                  }`}
                >
                  {formatMoney(calculations.remainingCapital)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Additional Metrics */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
              Avg Round Size
            </div>
            <div className="font-inter font-bold text-pov-charcoal">
              {formatMoney(calculations.avgRoundSize)}
            </div>
          </div>
          <div>
            <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
              Implied Ownership
            </div>
            <div className="font-inter font-bold text-pov-charcoal">
              {formatPercent(calculations.impliedOwnership)}
            </div>
          </div>
          <div>
            <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
              Reserve Ratio
            </div>
            <div className="font-inter font-bold text-pov-charcoal">
              {formatPercent(
                (calculations.totalFollowOnCapital / fundSize) * 100
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
