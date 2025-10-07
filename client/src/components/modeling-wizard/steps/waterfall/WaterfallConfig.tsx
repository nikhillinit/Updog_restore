/**
 * Waterfall Configuration Form
 * Sub-component for waterfall configuration inputs
 */

import React from 'react';
import type { FieldErrors } from 'react-hook-form';
import { type Waterfall } from '@shared/types';
import { isEuropean } from '@/lib/waterfall';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

interface WaterfallConfigProps {
  waterfall: Waterfall;
  errors: FieldErrors<Waterfall>;
  onTypeChange: (type: Waterfall['type']) => void;
  onFieldChange: (field: string, value: unknown) => void;
}

export function WaterfallConfig({
  waterfall,
  errors,
  onTypeChange,
  onFieldChange
}: WaterfallConfigProps) {
  const isEuropeanWaterfall = isEuropean(waterfall);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-inter text-xl">Waterfall Structure</CardTitle>
        <CardDescription className="font-poppins">
          Configure how carried interest is distributed
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Waterfall Type Selection */}
        <div className="space-y-3">
          <Label className="font-poppins font-semibold">Distribution Model</Label>
          <RadioGroup
            value={waterfall.type}
            onValueChange={(value) => onTypeChange(value as Waterfall['type'])}
            className="grid grid-cols-2 gap-4"
          >
            <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-charcoal-50 cursor-pointer">
              <RadioGroupItem value="AMERICAN" id="american" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="american" className="font-poppins font-medium cursor-pointer">
                  American (Deal-by-Deal)
                </Label>
                <p className="text-sm text-charcoal-500 mt-1">
                  Carry distributed on each individual exit
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-charcoal-50 cursor-pointer">
              <RadioGroupItem value="EUROPEAN" id="european" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="european" className="font-poppins font-medium cursor-pointer">
                  European (Whole Fund)
                </Label>
                <p className="text-sm text-charcoal-500 mt-1">
                  Carry calculated at fund level after hurdle
                </p>
              </div>
            </div>
          </RadioGroup>
          {errors.type && (
            <p className="text-sm text-error flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors.type.message}
            </p>
          )}
        </div>

        {/* European-Specific Fields */}
        {isEuropeanWaterfall && (
          <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 text-blue-800">
              <AlertCircle className="h-4 w-4" />
              <span className="font-poppins text-sm font-medium">
                European waterfall requires hurdle and catch-up configuration
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="hurdle" className="font-poppins">
                  Hurdle Rate (Preferred Return) *
                </Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    id="hurdle"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={isEuropeanWaterfall && 'hurdle' in waterfall ? waterfall.hurdle * 100 : 8}
                    onChange={(e) => onFieldChange('hurdle', parseFloat(e.target.value) / 100)}
                    placeholder="e.g., 8"
                    className="flex-1"
                  />
                  <span className="text-charcoal-500 font-mono">%</span>
                </div>
                <p className="text-xs text-charcoal-500 mt-1">
                  Minimum return before carry kicks in (0-20%)
                </p>
                {('hurdle' in errors && errors.hurdle?.message) && (
                  <p className="text-sm text-error mt-1">{String(errors.hurdle.message)}</p>
                )}
              </div>

              <div>
                <Label htmlFor="catchUp" className="font-poppins">
                  Catch-Up Percentage *
                </Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    id="catchUp"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={isEuropeanWaterfall && 'catchUp' in waterfall ? waterfall.catchUp * 100 : 100}
                    onChange={(e) => onFieldChange('catchUp', parseFloat(e.target.value) / 100)}
                    placeholder="e.g., 100"
                    className="flex-1"
                  />
                  <span className="text-charcoal-500 font-mono">%</span>
                </div>
                <p className="text-xs text-charcoal-500 mt-1">
                  How fast GP catches up to carry rate (0/80/100%)
                </p>
                {('catchUp' in errors && errors.catchUp?.message) && (
                  <p className="text-sm text-error mt-1">{String(errors.catchUp.message)}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Carry Vesting Configuration */}
        <div className="space-y-4">
          <div>
            <Label className="font-poppins font-semibold">Carry Vesting Schedule</Label>
            <p className="text-sm text-charcoal-500 mt-1">
              Configure when GPs earn their carried interest
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cliffYears" className="font-poppins">
                Cliff Period (Years)
              </Label>
              <Input
                id="cliffYears"
                type="number"
                min="0"
                max="10"
                step="1"
                value={waterfall.carryVesting.cliffYears}
                onChange={(e) => onFieldChange('carryVesting', {
                  ...waterfall.carryVesting,
                  cliffYears: parseInt(e.target.value) || 0
                })}
                placeholder="e.g., 0"
                className="mt-2"
              />
              <p className="text-xs text-charcoal-500 mt-1">
                Years before vesting begins (0-10)
              </p>
              {errors.carryVesting?.cliffYears && (
                <p className="text-sm text-error mt-1">
                  {errors.carryVesting.cliffYears.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="vestingYears" className="font-poppins">
                Vesting Period (Years) *
              </Label>
              <Input
                id="vestingYears"
                type="number"
                min="1"
                max="10"
                step="1"
                value={waterfall.carryVesting.vestingYears}
                onChange={(e) => onFieldChange('carryVesting', {
                  ...waterfall.carryVesting,
                  vestingYears: parseInt(e.target.value) || 1
                })}
                placeholder="e.g., 4"
                className="mt-2"
              />
              <p className="text-xs text-charcoal-500 mt-1">
                Years over which carry vests (1-10)
              </p>
              {errors.carryVesting?.vestingYears && (
                <p className="text-sm text-error mt-1">
                  {errors.carryVesting.vestingYears.message}
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
