import { cn } from '@/lib/utils';

export interface LPCardProps {
  name: string;
  commitment: number;     // Total commitment in dollars
  called: number;         // Capital called in dollars
  distributed: number;    // Distributions received
  className?: string;
}

/**
 * LPCard - Display LP commitment and distribution metrics
 *
 * Features:
 * - Press On Ventures branding (charcoal, beige, lightGray)
 * - Progress bar showing capital called percentage
 * - DPI (Distributed to Paid-In) calculation
 * - Responsive layout with shadow-card
 *
 * @example
 * <LPCard
 *   name="Acme Ventures"
 *   commitment={10000000}
 *   called={7500000}
 *   distributed={12000000}
 * />
 */
export function LPCard({
  name,
  commitment,
  called,
  distributed,
  className,
}: LPCardProps) {
  // Calculate capital called percentage
  const calledPercent = commitment > 0 ? (called / commitment) * 100 : 0;

  // Calculate DPI (Distributed to Paid-In capital)
  const dpi = called > 0 ? distributed / called : 0;

  // Format currency with commas
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div
      className={cn(
        'rounded-md border border-charcoal/10 bg-white p-4 shadow-card',
        'transition-all duration-200 hover:shadow-elevated',
        className
      )}
    >
      {/* Header: LP name + commitment */}
      <div className="mb-3 flex items-start justify-between">
        <h3 className="font-heading text-base font-semibold text-charcoal">
          {name}
        </h3>
        <span className="font-mono text-sm tabular-nums text-charcoal/70">
          {formatCurrency(commitment)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-2 space-y-1.5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-lightGray">
          <div
            className="h-full rounded-full bg-charcoal transition-all duration-300"
            style={{ width: `${Math.min(calledPercent, 100)}%` }}
          />
        </div>

        {/* Progress label */}
        <p className="font-poppins text-xs text-charcoal/60">
          Capital called: {calledPercent.toFixed(1)}%
        </p>
      </div>

      {/* DPI metric */}
      <div className="mt-3 flex items-center justify-between border-t border-charcoal/5 pt-3">
        <span className="font-poppins text-xs font-medium text-charcoal/70">
          DPI
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-charcoal">
          {dpi.toFixed(2)}x
        </span>
      </div>
    </div>
  );
}
