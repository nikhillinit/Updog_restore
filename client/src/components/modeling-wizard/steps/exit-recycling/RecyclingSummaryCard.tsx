/**
 * Recycling Summary Card
 *
 * Displays summary of exit recycling calculations with validation status.
 * Shows recycling capacity, extended investment capacity, and impact metrics.
 */

import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type {
  ExitRecyclingCalculations,
  ValidationResult
} from '@/lib/exit-recycling-calculations';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface RecyclingSummaryCardProps {
  calculations: ExitRecyclingCalculations;
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

export function RecyclingSummaryCard({
  calculations,
  validation,
  fundSize
}: RecyclingSummaryCardProps) {
  // If recycling is disabled, show informational message
  if (!calculations.enabled) {
    return (
      <Alert className="border-charcoal-300 bg-charcoal-50">
        <Info className="h-4 w-4 text-charcoal-600" />
        <AlertDescription className="text-sm font-poppins text-charcoal-700">
          Exit recycling is currently disabled. Enable it to extend your fund's investment
          capacity by recycling exit proceeds back into new investments.
        </AlertDescription>
      </Alert>
    );
  }

  const capacityUtilization = calculations.schedule
    ? (calculations.schedule.totalRecycled / calculations.capacity.maxRecyclableCapital) * 100
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
        <Alert>
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
            Exit recycling configuration is valid and well-structured.
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Card */}
      <div className="bg-charcoal-50 rounded-lg p-6 border-2 border-charcoal-200">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal mb-4">
          Exit Recycling Summary
        </h3>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Max Recyclable Capital */}
          <div className="bg-white rounded-lg p-4 border border-charcoal-200">
            <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
              Recycling Cap
            </div>
            <div className="font-inter font-bold text-2xl text-pov-charcoal">
              {formatMoney(calculations.capacity.maxRecyclableCapital)}
            </div>
            <div className="text-xs text-charcoal-600 mt-1 font-poppins">
              {formatPercent(calculations.capacity.recyclingCapPercentage)} of fund
            </div>
          </div>

          {/* Recycling Period */}
          <div className="bg-white rounded-lg p-4 border border-charcoal-200">
            <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
              Recycling Period
            </div>
            <div className="font-inter font-bold text-2xl text-pov-charcoal">
              {calculations.capacity.recyclingPeriodYears} years
            </div>
            <div className="text-xs text-charcoal-600 mt-1 font-poppins">
              {formatMoney(calculations.capacity.annualRecyclingCapacity)}/year capacity
            </div>
          </div>

          {/* Extended Capacity */}
          <div className="bg-white rounded-lg p-4 border border-charcoal-200">
            <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
              Extended Capacity
            </div>
            <div className="font-inter font-bold text-2xl text-success">
              {formatMoney(calculations.extendedInvestmentCapacity)}
            </div>
            <div className="text-xs text-charcoal-600 mt-1 font-poppins">
              Additional investment capital
            </div>
          </div>

          {/* Effective Deployment */}
          <div className="bg-white rounded-lg p-4 border border-charcoal-200">
            <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
              Effective Deployment
            </div>
            <div className="font-inter font-bold text-2xl text-pov-charcoal">
              {formatPercent(calculations.effectiveDeploymentRate)}
            </div>
            <div className="text-xs text-charcoal-600 mt-1 font-poppins">
              Of committed capital
            </div>
          </div>
        </div>

        {/* Schedule Summary (if available) */}
        {calculations.schedule && (
          <div className="mt-6 border-t border-charcoal-200 pt-4">
            <h4 className="font-inter font-bold text-sm text-pov-charcoal mb-3">
              Recycling Schedule Summary
            </h4>
            <table className="w-full">
              <tbody className="text-sm font-poppins">
                <tr className="border-b border-charcoal-200">
                  <td className="py-2 text-charcoal-700">Total Exits Processed:</td>
                  <td className="py-2 text-right font-inter font-bold text-pov-charcoal">
                    {calculations.schedule.recyclingByExit.length}
                  </td>
                </tr>
                <tr className="border-b border-charcoal-200">
                  <td className="py-2 text-charcoal-700">Total Recycled Capital:</td>
                  <td className="py-2 text-right font-inter text-pov-charcoal">
                    {formatMoney(calculations.schedule.totalRecycled)}
                  </td>
                </tr>
                <tr className="border-b border-charcoal-200">
                  <td className="py-2 text-charcoal-700">Total Returned to LPs:</td>
                  <td className="py-2 text-right font-inter text-pov-charcoal">
                    {formatMoney(calculations.schedule.totalReturnedToLPs)}
                  </td>
                </tr>
                <tr className="border-b border-charcoal-200">
                  <td className="py-2 text-charcoal-700">Capacity Utilization:</td>
                  <td className="py-2 text-right font-inter text-pov-charcoal">
                    {formatPercent(capacityUtilization)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 font-inter font-bold text-pov-charcoal">
                    Remaining Capacity:
                  </td>
                  <td
                    className={`py-2 text-right font-inter font-bold ${
                      calculations.schedule.capReached ? 'text-amber-600' : 'text-success'
                    }`}
                  >
                    {formatMoney(calculations.schedule.remainingCapacity)}
                  </td>
                </tr>
              </tbody>
            </table>

            {calculations.schedule.capReached && (
              <div className="mt-3 text-xs text-amber-600 font-poppins">
                Recycling cap has been reached. Additional exit proceeds will be returned to LPs.
              </div>
            )}
          </div>
        )}

        {/* Impact Summary */}
        <div className="mt-6 pt-4 border-t border-charcoal-200">
          <h4 className="font-inter font-bold text-sm text-pov-charcoal mb-3">
            Impact on Fund Deployment
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
                Base Fund Size
              </div>
              <div className="font-inter font-bold text-pov-charcoal">
                {formatMoney(fundSize)}
              </div>
            </div>
            <div>
              <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
                + Recycling Capacity
              </div>
              <div className="font-inter font-bold text-success">
                +{formatMoney(calculations.extendedInvestmentCapacity)}
              </div>
            </div>
            <div>
              <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
                Effective Total Capital
              </div>
              <div className="font-inter font-bold text-pov-charcoal">
                {formatMoney(fundSize + calculations.extendedInvestmentCapacity)}
              </div>
            </div>
          </div>
        </div>

        {/* Informational Note */}
        <div className="mt-6 pt-4 border-t border-charcoal-200">
          <div className="flex gap-2 text-xs text-charcoal-600 font-poppins">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>
              Exit recycling allows you to reinvest proceeds from early exits back into new
              portfolio companies, extending your fund's deployment capacity within policy limits.
              Recycling is only available for exits within the specified recycling period.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
