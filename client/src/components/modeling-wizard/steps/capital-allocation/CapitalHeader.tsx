/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
/**
 * Capital Header Component
 * Displays capital utilization progress bar and statistics
 */

import React from 'react';

export interface CapitalHeaderProps {
  fundSize: number;
  deployed: number;
  reserved: number;
  available: number;
}

export function CapitalHeader({
  fundSize,
  deployed,
  reserved,
  available
}: CapitalHeaderProps) {
  const deployedPct = fundSize > 0 ? (deployed / fundSize) * 100 : 0;
  const reservedPct = fundSize > 0 ? (reserved / fundSize) * 100 : 0;
  const availablePct = fundSize > 0 ? (available / fundSize) * 100 : 0;

  const formatCurrency = (value: number): string => {
    return `$${value.toFixed(1)}M`;
  };

  return (
    <div className="space-y-4 p-6 bg-white rounded-lg border border-[#E0D8D1]">
      <div className="flex items-center justify-between">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">
          Capital Utilization
        </h3>
        <div className="text-sm text-gray-600">
          Total Fund Size: <span className="font-semibold text-pov-charcoal">{formatCurrency(fundSize)}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="relative h-6 w-full overflow-hidden rounded-full bg-gray-200">
          {/* Deployed segment */}
          <div
            className="absolute h-full bg-green-500 transition-all"
            style={{ width: `${deployedPct}%` }}
          />
          {/* Reserved segment */}
          <div
            className="absolute h-full bg-blue-500 transition-all"
            style={{
              left: `${deployedPct}%`,
              width: `${reservedPct}%`
            }}
          />
          {/* Available segment */}
          <div
            className="absolute h-full bg-gray-400 transition-all"
            style={{
              left: `${deployedPct + reservedPct}%`,
              width: `${availablePct}%`
            }}
          />
        </div>

        {/* Legend */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-gray-700">
                Deployed: <span className="font-semibold text-pov-charcoal">{formatCurrency(deployed)}</span>
              </span>
              <span className="text-gray-500">({deployedPct.toFixed(1)}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-blue-500" />
              <span className="text-gray-700">
                Reserved: <span className="font-semibold text-pov-charcoal">{formatCurrency(reserved)}</span>
              </span>
              <span className="text-gray-500">({reservedPct.toFixed(1)}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-gray-400" />
              <span className="text-gray-700">
                Available: <span className="font-semibold text-pov-charcoal">{formatCurrency(available)}</span>
              </span>
              <span className="text-gray-500">({availablePct.toFixed(1)}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Warning if over-allocated */}
      {deployed + reserved > fundSize && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <svg
            className="h-4 w-4 text-red-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span className="font-medium">Warning: Capital allocation exceeds fund size</span>
        </div>
      )}
    </div>
  );
}
