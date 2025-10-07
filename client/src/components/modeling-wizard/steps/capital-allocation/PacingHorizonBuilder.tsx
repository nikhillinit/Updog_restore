/**
 * Pacing Horizon Builder
 *
 * Dynamic period builder for investment pacing/deployment schedule.
 * Allows users to define time periods and capital allocation percentages.
 */

import React from 'react';
import { Plus, Trash2, Info, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import type {
  PacingPeriod,
  FundFinancialsOutput
} from '@/schemas/modeling-wizard.schemas';
import { generateDefaultPacingPeriods } from '@/lib/capital-allocation-calculations';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface PacingHorizonBuilderProps {
  periods: PacingPeriod[];
  fundFinancials: FundFinancialsOutput;
  onChange: (periods: PacingPeriod[]) => void;
  errors?: { message?: string };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatMonthToDate(vintageYear: number, monthOffset: number): string {
  const year = vintageYear + Math.floor(monthOffset / 12);
  const month = monthOffset % 12;

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  return `${monthNames[month]} ${year}`;
}

function generatePeriodId(): string {
  return `period-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PacingHorizonBuilder({
  periods,
  fundFinancials,
  onChange,
  errors
}: PacingHorizonBuilderProps) {
  const vintageYear = new Date().getFullYear();

  // Calculate total allocation
  const totalAllocation = periods.reduce(
    (sum, period) => sum + period.allocationPercent,
    0
  );
  const isAllocationValid = Math.abs(totalAllocation - 100) < 0.01;

  // Add new period
  const addPeriod = () => {
    const lastPeriod = periods[periods.length - 1];
    const startMonth = lastPeriod ? lastPeriod.endMonth : 0;
    const endMonth = startMonth + 12; // Default 12-month period

    const newPeriod: PacingPeriod = {
      id: generatePeriodId(),
      startMonth,
      endMonth,
      allocationPercent: 0
    };

    onChange([...periods, newPeriod]);
  };

  // Remove period
  const removePeriod = (id: string) => {
    onChange(periods.filter(period => period.id !== id));
  };

  // Update period
  const updatePeriod = (id: string, updates: Partial<PacingPeriod>) => {
    onChange(
      periods.map(period =>
        period.id === id ? { ...period, ...updates } : period
      )
    );
  };

  // Apply deployment curve from fund financials
  const applyDeploymentCurve = () => {
    const defaultPeriods = generateDefaultPacingPeriods(
      fundFinancials.investmentPeriod,
      'linear' // Could use fundFinancials.capitalCallSchedule.type
    );

    // Preserve period count but update allocations
    const updatedPeriods = periods.map((period, index) => ({
      ...period,
      allocationPercent: defaultPeriods[index]?.allocationPercent || 0
    }));

    onChange(updatedPeriods);
  };

  // Initialize with default periods if empty
  React.useEffect(() => {
    if (periods.length === 0) {
      const defaultPeriods = generateDefaultPacingPeriods(
        fundFinancials.investmentPeriod,
        'linear'
      );
      onChange(defaultPeriods);
    }
  }, [periods.length, fundFinancials.investmentPeriod, onChange]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">
          Investment Pacing / Horizon
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={applyDeploymentCurve}
          className="gap-2"
        >
          <Calendar className="w-4 h-4" />
          Apply Deployment Curve
        </Button>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm font-poppins">
          <strong>Investment Pacing</strong> defines when capital is deployed over time.
          Allocations must sum to 100%.
        </AlertDescription>
      </Alert>

      {errors?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.message}</AlertDescription>
        </Alert>
      )}

      {/* Allocation Progress Bar */}
      <div className="bg-white rounded-lg border border-charcoal-200 p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-poppins text-charcoal-700">
            Total Allocation:
          </span>
          <span
            className={`font-inter font-bold text-lg ${
              isAllocationValid ? 'text-success' : 'text-error'
            }`}
          >
            {totalAllocation.toFixed(1)}%
          </span>
        </div>
        <Progress
          value={Math.min(totalAllocation, 100)}
          className="h-3"
        />
        {!isAllocationValid && (
          <p className="text-xs text-error mt-1 font-poppins">
            {totalAllocation < 100
              ? `${(100 - totalAllocation).toFixed(1)}% remaining`
              : `${(totalAllocation - 100).toFixed(1)}% over 100%`}
          </p>
        )}
      </div>

      {/* Periods List */}
      <div className="space-y-4">
        {periods.map((period, index) => (
          <div
            key={period.id}
            className="bg-white rounded-lg border border-charcoal-200 p-4 space-y-4"
          >
            {/* Period Header */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-inter font-bold text-charcoal-600">
                Period {index + 1}
              </span>
              {periods.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removePeriod(period.id)}
                  className="text-error hover:text-error hover:bg-error/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Period Configuration */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Date Range Display */}
              <div>
                <Label className="font-poppins text-charcoal-700">Date Range</Label>
                <div className="mt-2 px-3 py-2 bg-charcoal-50 rounded-md border border-charcoal-200">
                  <div className="text-sm font-poppins text-pov-charcoal">
                    {formatMonthToDate(vintageYear, period.startMonth)}
                    {' → '}
                    {formatMonthToDate(vintageYear, period.endMonth)}
                  </div>
                </div>
              </div>

              {/* Duration (Months) */}
              <div>
                <Label htmlFor={`duration-${period.id}`} className="font-poppins text-charcoal-700">
                  Duration (Months)
                </Label>
                <Input
                  id={`duration-${period.id}`}
                  type="number"
                  min="1"
                  max="60"
                  value={period.endMonth - period.startMonth}
                  onChange={e => {
                    const duration = parseInt(e.target.value) || 1;
                    updatePeriod(period.id, {
                      endMonth: period.startMonth + duration
                    });
                  }}
                  className="mt-2"
                />
              </div>

              {/* Allocation Percentage */}
              <div>
                <Label htmlFor={`allocation-${period.id}`} className="font-poppins text-charcoal-700">
                  Allocation (%)
                </Label>
                <Input
                  id={`allocation-${period.id}`}
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={period.allocationPercent}
                  onChange={e =>
                    updatePeriod(period.id, {
                      allocationPercent: parseFloat(e.target.value) || 0
                    })
                  }
                  className="mt-2"
                />
              </div>
            </div>
          </div>
        ))}

        {/* Add Period Button */}
        {periods.length < 10 && (
          <Button
            type="button"
            variant="outline"
            onClick={addPeriod}
            className="w-full gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Period
          </Button>
        )}

        {periods.length >= 10 && (
          <p className="text-sm text-charcoal-600 font-poppins text-center">
            Maximum of 10 periods reached
          </p>
        )}
      </div>

      {/* Quick Reference */}
      <div className="bg-charcoal-50 rounded-lg p-4 border border-charcoal-200">
        <h4 className="font-inter font-bold text-sm text-pov-charcoal mb-2">
          Investment Period: {fundFinancials.investmentPeriod} Years
        </h4>
        <p className="text-sm font-poppins text-charcoal-700">
          Define how capital is deployed across your {fundFinancials.investmentPeriod}-year investment period.
          Typical patterns: front-loaded (deploy early), even (steady pace), or back-loaded (deploy later).
        </p>
      </div>
    </div>
  );
}
