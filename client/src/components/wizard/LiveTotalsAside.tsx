/**
 * LiveTotalsAside - Sticky right rail showing live validation and totals
 *
 * Features:
 * - Allocation total with visual progress bar
 * - Reserves amount in dollars
 * - Estimated annual fees
 * - First error indicator with scroll-to-field
 * - Desktop-only (hidden on mobile)
 */

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatUSD, pctOfDollars } from '@/lib/formatting';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

interface LiveTotalsAsideProps {
  /** Total committed capital in whole dollars */
  committedCapitalUSD: number;

  /** Current allocation total percentage (0-100) */
  allocationTotalPct: number;

  /** Reserves allocation percentage (0-100) */
  reservesPct: number;

  /** Estimated annual fees in whole dollars */
  estimatedAnnualFeesUSD: number;

  /** First validation error label (e.g., "Allocation must sum to 100%") */
  firstErrorLabel?: string;

  /** Callback to fix first error (scroll + focus field) */
  onFixFirstError?: () => void;

  /** Additional class names */
  className?: string;
}

export function LiveTotalsAside({
  committedCapitalUSD,
  allocationTotalPct,
  reservesPct,
  estimatedAnnualFeesUSD,
  firstErrorLabel,
  onFixFirstError,
  className,
}: LiveTotalsAsideProps) {
  const reservesUSD = pctOfDollars(committedCapitalUSD, reservesPct);
  const allocationValid = Math.round(allocationTotalPct) === 100;

  return (
    <aside className={cn('hidden lg:block sticky top-6 h-fit', className)}>
      <Card className="shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Live Totals</CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Allocation Progress */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-sm text-gray-700">Allocation Total</span>
              <span
                className={cn(
                  'font-bold text-lg tabular-nums',
                  allocationValid ? 'text-green-700' : 'text-amber-700'
                )}
              >
                {allocationTotalPct.toFixed(0)}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300',
                  allocationValid ? 'bg-green-600' : 'bg-amber-500'
                )}
                style={{
                  width: `${Math.min(100, Math.max(0, allocationTotalPct))}%`,
                }}
              />
            </div>

            <p className="text-xs text-gray-500 mt-1.5">
              {allocationValid ? '✓ Ready to proceed' : `Target: 100%`}
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200" />

          {/* Reserves */}
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-gray-700">Reserves (est.)</span>
            <span className="font-bold text-lg tabular-nums text-purple-700">
              {formatUSD(reservesUSD)}
            </span>
          </div>

          {/* Estimated Annual Fees */}
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-gray-700">Est. Annual Fees</span>
            <span className="font-bold text-lg tabular-nums text-gray-900">
              {formatUSD(estimatedAnnualFeesUSD)}
            </span>
          </div>

          {/* First Error Alert */}
          {firstErrorLabel && (
            <>
              <div className="border-t border-red-200" />
              <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-red-900 mb-1">Validation Error</p>
                    <p className="text-xs text-red-700 leading-relaxed">{firstErrorLabel}</p>
                  </div>
                </div>

                {onFixFirstError && (
                  <button
                    onClick={onFixFirstError}
                    className="mt-3 w-full px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    Fix Error
                  </button>
                )}
              </div>
            </>
          )}

          {/* Summary Stats (when valid) */}
          {!firstErrorLabel && allocationValid && (
            <>
              <div className="border-t border-gray-200" />
              <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                <p className="text-xs font-semibold text-green-900 mb-2">✓ All validations passed</p>
                <div className="space-y-1.5 text-xs text-green-700">
                  <div className="flex justify-between">
                    <span>Committed Capital</span>
                    <span className="font-mono">{formatUSD(committedCapitalUSD)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Initial Investments</span>
                    <span className="font-mono">{formatUSD(committedCapitalUSD - reservesUSD)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Follow-on Capital</span>
                    <span className="font-mono">{formatUSD(reservesUSD)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </aside>
  );
}

export default LiveTotalsAside;
