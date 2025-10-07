/**
 * EmptyFundHeader Component
 *
 * Header for funds with no investments (construction phase)
 * Displays construction forecast metrics with appropriate messaging
 */

import React from 'react';
import { SourceBadge } from '@/components/ui/SourceBadge';

interface EmptyFundHeaderProps {
  fundName: string;
  fundSize: number;
  targetTVPI: number;
  projectedTVPI?: number;
  className?: string;
}

/**
 * Header for empty funds (construction view)
 *
 * Shows:
 * - Fund name and size
 * - Construction forecast badge
 * - Target vs projected TVPI
 * - Informational messaging
 */
export function EmptyFundHeader({
  fundName,
  fundSize,
  targetTVPI,
  projectedTVPI,
  className = ''
}: EmptyFundHeaderProps) {
  return (
    <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{fundName}</h2>
          <p className="text-sm text-gray-600">
            ${(fundSize / 1_000_000).toFixed(0)}M Fund
          </p>
        </div>
        <SourceBadge source="construction_forecast" />
      </div>

      <div className="border-t border-gray-200 pt-4">
        <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">
            Construction View
          </h3>
          <p className="text-sm text-blue-700">
            This fund has no investments yet. Metrics shown are based on J-curve
            mathematical forecasting using industry-standard assumptions.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded p-3">
            <p className="text-xs text-gray-600 mb-1">Target TVPI</p>
            <p className="text-2xl font-bold text-gray-900">
              {targetTVPI.toFixed(2)}x
            </p>
          </div>

          {projectedTVPI !== undefined && (
            <div className="bg-gray-50 rounded p-3">
              <p className="text-xs text-gray-600 mb-1">Projected TVPI</p>
              <p className="text-2xl font-bold text-gray-900">
                {projectedTVPI.toFixed(2)}x
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
