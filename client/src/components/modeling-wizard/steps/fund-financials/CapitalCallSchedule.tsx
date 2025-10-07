/**
 * Capital Call Schedule Component
 *
 * Visual selector for capital call deployment patterns with bar chart preview.
 * Supports even, front-loaded, back-loaded, and custom schedules.
 *
 * Features:
 * - Radio button selector for schedule types
 * - Visual bar chart showing deployment curve
 * - Custom schedule input (when selected)
 * - Real-time validation and feedback
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { getSchedulePattern, type CapitalCallScheduleType } from '@/lib/capital-calculations';

// ============================================================================
// TYPES
// ============================================================================

export interface CapitalCallScheduleProps {
  scheduleType: CapitalCallScheduleType;
  investmentPeriod: number;
  customSchedule?: Array<{ year: number; percentage: number }>;
  onChange: (type: CapitalCallScheduleType, customSchedule?: Array<{ year: number; percentage: number }>) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CapitalCallSchedule({
  scheduleType,
  investmentPeriod,
  customSchedule,
  onChange
}: CapitalCallScheduleProps) {
  // Get current schedule pattern for visualization
  const pattern = React.useMemo(() => {
    try {
      return getSchedulePattern(scheduleType, investmentPeriod, customSchedule);
    } catch {
      return new Array(investmentPeriod).fill(100 / investmentPeriod);
    }
  }, [scheduleType, investmentPeriod, customSchedule]);

  // Handle custom schedule input
  const updateCustomSchedule = (year: number, percentage: number) => {
    const newSchedule = [...(customSchedule || [])];
    const existingIndex = newSchedule.findIndex(item => item.year === year);

    if (existingIndex >= 0) {
      newSchedule[existingIndex] = { year, percentage };
    } else {
      newSchedule.push({ year, percentage });
    }

    onChange('custom', newSchedule);
  };

  // Calculate validation
  const customTotal = customSchedule?.reduce((sum, item) => sum + item.percentage, 0) || 0;
  const isCustomValid = Math.abs(customTotal - 100) < 0.01;

  return (
    <div className="space-y-6">
      {/* Schedule Type Selector */}
      <div>
        <Label className="font-poppins text-charcoal-700 mb-3 block">
          Capital Call Schedule Type
        </Label>
        <RadioGroup
          value={scheduleType}
          onValueChange={(value) => onChange(value as CapitalCallScheduleType)}
          className="grid grid-cols-2 gap-4"
        >
          <label
            htmlFor="even"
            className={`flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
              scheduleType === 'even'
                ? 'border-pov-teal bg-pov-teal/5'
                : 'border-charcoal-200 hover:border-charcoal-300'
            }`}
          >
            <RadioGroupItem value="even" id="even" />
            <div>
              <div className="font-inter font-bold text-sm text-pov-charcoal">Even</div>
              <div className="text-xs text-charcoal-600 font-poppins">Equal distribution</div>
            </div>
          </label>

          <label
            htmlFor="front-loaded"
            className={`flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
              scheduleType === 'front-loaded'
                ? 'border-pov-teal bg-pov-teal/5'
                : 'border-charcoal-200 hover:border-charcoal-300'
            }`}
          >
            <RadioGroupItem value="front-loaded" id="front-loaded" />
            <div>
              <div className="font-inter font-bold text-sm text-pov-charcoal">Front-Loaded</div>
              <div className="text-xs text-charcoal-600 font-poppins">Deploy faster early</div>
            </div>
          </label>

          <label
            htmlFor="back-loaded"
            className={`flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
              scheduleType === 'back-loaded'
                ? 'border-pov-teal bg-pov-teal/5'
                : 'border-charcoal-200 hover:border-charcoal-300'
            }`}
          >
            <RadioGroupItem value="back-loaded" id="back-loaded" />
            <div>
              <div className="font-inter font-bold text-sm text-pov-charcoal">Back-Loaded</div>
              <div className="text-xs text-charcoal-600 font-poppins">Deploy slower early</div>
            </div>
          </label>

          <label
            htmlFor="custom"
            className={`flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
              scheduleType === 'custom'
                ? 'border-pov-teal bg-pov-teal/5'
                : 'border-charcoal-200 hover:border-charcoal-300'
            }`}
          >
            <RadioGroupItem value="custom" id="custom" />
            <div>
              <div className="font-inter font-bold text-sm text-pov-charcoal">Custom</div>
              <div className="text-xs text-charcoal-600 font-poppins">Set your own pattern</div>
            </div>
          </label>
        </RadioGroup>
      </div>

      {/* Custom Schedule Input */}
      {scheduleType === 'custom' && (
        <div className="bg-charcoal-50 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="font-inter font-bold text-sm text-pov-charcoal">
              Custom Schedule (% per year)
            </Label>
            <span
              className={`text-sm font-poppins ${
                isCustomValid ? 'text-success' : 'text-error'
              }`}
            >
              Total: {customTotal.toFixed(1)}% {isCustomValid ? '✓' : '(must = 100%)'}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: investmentPeriod }, (_, i) => {
              const year = i + 1;
              const value = customSchedule?.find(item => item.year === year)?.percentage || 0;

              return (
                <div key={year}>
                  <Label className="text-xs font-poppins text-charcoal-600 mb-1">
                    Year {year}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={value || ''}
                    onChange={(e) => updateCustomSchedule(year, parseFloat(e.target.value) || 0)}
                    placeholder="0.0"
                    className="text-sm"
                  />
                </div>
              );
            })}
          </div>

          {!isCustomValid && (
            <p className="text-sm text-error font-poppins">
              Percentages must sum to 100%
            </p>
          )}
        </div>
      )}

      {/* Visual Bar Chart */}
      <div className="space-y-3">
        <Label className="font-inter font-bold text-sm text-pov-charcoal">
          Deployment Curve Preview
        </Label>
        <div className="bg-white rounded-lg border border-charcoal-200 p-4">
          <div className="flex items-end justify-between gap-2 h-40">
            {pattern.map((percentage, index) => {
              const height = (percentage / Math.max(...pattern)) * 100;
              const year = index + 1;

              return (
                <div key={year} className="flex-1 flex flex-col items-center gap-2">
                  {/* Bar */}
                  <div className="w-full flex flex-col justify-end h-32">
                    <div
                      className="w-full bg-pov-teal rounded-t transition-all duration-300"
                      style={{ height: `${height}%` }}
                    />
                  </div>

                  {/* Percentage Label */}
                  <div className="text-xs font-inter font-bold text-pov-charcoal">
                    {percentage.toFixed(1)}%
                  </div>

                  {/* Year Label */}
                  <div className="text-xs font-poppins text-charcoal-600">
                    Y{year}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="text-xs text-charcoal-600 font-poppins text-center">
          Capital deployment distribution over {investmentPeriod}-year investment period
        </div>
      </div>
    </div>
  );
}
