/**
 * Waterfall Configuration Form
 * Sub-component for American waterfall configuration inputs
 */

import React from 'react';
import type { FieldErrors } from 'react-hook-form';
import { type Waterfall } from '@shared/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Info } from 'lucide-react';

interface WaterfallConfigProps {
  waterfall: Waterfall;
  errors: FieldErrors<Waterfall>;
  onFieldChange: (field: string, value: unknown) => void;
}

export function WaterfallConfig({ waterfall, errors, onFieldChange }: WaterfallConfigProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-inter text-xl">Waterfall Structure</CardTitle>
        <CardDescription className="font-poppins">
          Configure how carried interest is distributed
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Distribution Model Info */}
        <div className="flex items-start space-x-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-poppins font-medium text-blue-900">
              American (Deal-by-Deal) Waterfall
            </p>
            <p className="text-sm text-blue-700 mt-1">
              Carried interest is distributed on each individual exit as investments are realized.
              This model allows GPs to receive carry earlier but may require clawback provisions.
            </p>
          </div>
        </div>

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
                onChange={(e) =>
                  onFieldChange('carryVesting', {
                    ...waterfall.carryVesting,
                    cliffYears: parseInt(e.target.value) || 0,
                  })
                }
                placeholder="e.g., 0"
                className="mt-2"
              />
              <p className="text-xs text-charcoal-500 mt-1">Years before vesting begins (0-10)</p>
              {errors.carryVesting?.cliffYears && (
                <p className="text-sm text-error mt-1">{errors.carryVesting.cliffYears.message}</p>
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
                onChange={(e) =>
                  onFieldChange('carryVesting', {
                    ...waterfall.carryVesting,
                    vestingYears: parseInt(e.target.value) || 1,
                  })
                }
                placeholder="e.g., 4"
                className="mt-2"
              />
              <p className="text-xs text-charcoal-500 mt-1">Years over which carry vests (1-10)</p>
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
