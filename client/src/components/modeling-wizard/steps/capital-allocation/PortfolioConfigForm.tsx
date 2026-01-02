 
 
 
 
 
/**
 * Portfolio Configuration Form Component
 * Reserve ratio configuration with slider and dollar display
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';

export interface PortfolioConfigFormProps {
  fundSize: number;
  reserveRatio: number;
  onReserveRatioChange: (ratio: number) => void;
}

export function PortfolioConfigForm({
  fundSize,
  reserveRatio,
  onReserveRatioChange
}: PortfolioConfigFormProps) {
  const reserveAmount = fundSize * reserveRatio;
  const deployedAmount = fundSize * (1 - reserveRatio);

  const formatCurrency = (value: number): string => {
    return `$${value.toFixed(1)}M`;
  };

  const handleSliderChange = (values: number[]) => {
    const newRatio = (values[0] ?? 0) / 100; // Convert from percentage to decimal
    onReserveRatioChange(newRatio);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0 && value <= 1) {
      onReserveRatioChange(value);
    }
  };

  return (
    <div className="space-y-6 p-6 bg-white rounded-lg border border-[#E0D8D1]">
      <div>
        <h3 className="font-inter font-bold text-lg text-pov-charcoal mb-4">
          Reserve Strategy Configuration
        </h3>
        <p className="text-sm text-gray-600">
          Configure the percentage of fund capital to reserve for follow-on investments.
        </p>
      </div>

      {/* Reserve Ratio Slider */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="reserveRatio" className="font-poppins font-medium text-pov-charcoal">
            Reserve Ratio
          </Label>
          <div className="flex items-center gap-3">
            <Input
              id="reserveRatioInput"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={reserveRatio.toFixed(2)}
              onChange={handleInputChange}
              className="w-20 text-right"
            />
            <span className="text-sm text-gray-600 min-w-[60px]">
              ({(reserveRatio * 100).toFixed(0)}%)
            </span>
          </div>
        </div>

        <Slider
          id="reserveRatio"
          min={0}
          max={100}
          step={1}
          value={[reserveRatio * 100]}
          onValueChange={handleSliderChange}
          className="w-full"
        />

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Capital Allocation Summary */}
      <div className="space-y-3 pt-4 border-t border-gray-200">
        <h4 className="font-poppins font-semibold text-sm text-pov-charcoal">
          Capital Allocation
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-green-50 border border-green-200 rounded">
            <div className="text-xs text-gray-600 mb-1">Initial Deployment</div>
            <div className="font-inter font-bold text-lg text-pov-charcoal">
              {formatCurrency(deployedAmount)}
            </div>
            <div className="text-xs text-gray-500">
              {((1 - reserveRatio) * 100).toFixed(1)}% of fund
            </div>
          </div>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded">
            <div className="text-xs text-gray-600 mb-1">Reserved Capital</div>
            <div className="font-inter font-bold text-lg text-pov-charcoal">
              {formatCurrency(reserveAmount)}
            </div>
            <div className="text-xs text-gray-500">
              {(reserveRatio * 100).toFixed(1)}% of fund
            </div>
          </div>
        </div>
      </div>

      {/* Guidance */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm">
        <div className="flex items-start gap-2">
          <svg
            className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <div className="text-blue-800">
            <span className="font-medium">Typical range: 30-70%.</span>
            {' '}
            Higher ratios support aggressive follow-on strategies, while lower ratios allow for more initial investments.
          </div>
        </div>
      </div>
    </div>
  );
}
